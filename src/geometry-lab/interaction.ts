import { isFreeGeometryPoint2D } from '../geometry-core/index.js';
import type { Vector2 } from '../core/index.js';
import { DEFAULT_PICK_RADIUS, GeometryHitIndex, type GeometryHit } from './hit-test.js';
import { createGeometryKeyboardSession, type GeometryKeyboardSession, type GeometryKeyboardTarget } from './keyboard.js';
import { geometryLabFigureGeometry } from './renderers.js';
import type { GeometryLabDelta, GeometryLabSnapshot } from './types.js';

/**
 * Making a mounted figure usable with a pointer.
 *
 * <p>`mount()` used to write static SVG and register nothing, so the SDK could
 * be embedded but not *used*: the working Lab existed only inside the first-party
 * client. This is the missing half - hit testing, dragging, snapping - and it
 * drives the same tool machine the keyboard session does, so a figure built by
 * clicking and a figure built by typing go through one implementation and say
 * the same things while they are being built.
 *
 * <p><b>The index is rebuilt when the figure is, not when the pointer moves.</b>
 * That is the whole performance story: a pointer move is a lookup in a grid, and
 * costs the same on a five-hundred-object figure as on a five-object one. A
 * figure changing rebuilds it once, alongside the render that was happening
 * anyway.
 */

export interface GeometryPointerOptions {
  /** How near counts as over, in screen pixels. */
  readonly pickRadius?: number;
  /**
   * Snap a dragged point onto other points within the pick radius.
   *
   * <p>On by default: a construction where a vertex is one pixel away from the
   * line it was meant to be on is the commonest way a figure silently stops
   * being true, and it is exactly what a marker then reports as a coincidence.
   */
  readonly snapToPoints?: boolean;
  /** Snap a dragged point to multiples of this many world units. Off by default. */
  readonly snapToGrid?: number;
  /** Told what happened, in words - the same sentences the keyboard session uses. */
  readonly onStatus?: (status: string) => void;
}

/** What `attachGeometryLabPointer` hands back so a host can take it apart. */
export interface GeometryPointerAttachment {
  readonly session: GeometryKeyboardSession;
  /** Removes every listener. Safe to call more than once. */
  detach(): void;
}

/** The instrument surface the pointer layer drives. */
export interface GeometryPointerTarget extends GeometryKeyboardTarget {
  subscribeDelta(listener: (delta: GeometryLabDelta) => void): () => void;
}

/**
 * Wires pointer events on `element` to the Lab.
 *
 * <p>`element` is whatever the figure was rendered into - the container
 * `mount()` made, or a host's own. Coordinates are read from its bounding box,
 * so the figure can be scaled by CSS and the arithmetic still lands where the
 * drawing does.
 */
export function attachGeometryLabPointer(
  lab: GeometryPointerTarget,
  element: HTMLElement,
  options: GeometryPointerOptions = {},
): GeometryPointerAttachment {
  const pickRadius = options.pickRadius ?? DEFAULT_PICK_RADIUS;
  const snapToPoints = options.snapToPoints !== false;
  const session = createGeometryKeyboardSession(lab);

  let index: GeometryHitIndex | null = null;
  let indexedFrom: GeometryLabSnapshot | null = null;
  let figureWidth = 0;
  let figureHeight = 0;
  let dragging: string | null = null;
  let pointerId: number | null = null;

  const say = (status: string): void => options.onStatus?.(status);

  /**
   * The index for the figure as it stands.
   *
   * <p>Keyed on the snapshot's identity, which is exact rather than a guess:
   * the model is copy-on-write, so a changed figure is a different object and
   * an unchanged one is the same object however many times it is read.
   */
  const currentIndex = (): GeometryHitIndex => {
    const snapshot = lab.peekSnapshot() as GeometryLabSnapshot;
    if (index && indexedFrom === snapshot) return index;
    const rect = element.getBoundingClientRect();
    const geometry = geometryLabFigureGeometry(snapshot, {
      format: 'svg',
      ...(rect.width > 0 ? { width: Math.round(rect.width) } : {}),
      ...(rect.height > 0 ? { height: Math.round(rect.height) } : {}),
    });
    figureWidth = geometry.width;
    figureHeight = geometry.height;
    index = GeometryHitIndex.build(geometry);
    indexedFrom = snapshot;
    return index;
  };

  /**
   * Client coordinates to the figure's own, through however CSS scaled it.
   *
   * <p>Asks for the index first, and not as an afterthought: the figure's size
   * is settled while it is built, and converting a coordinate before that has
   * happened divides by a width of zero and lands the pointer somewhere else
   * entirely.
   */
  const toFigure = (event: { clientX: number; clientY: number }): Vector2 => {
    currentIndex();
    const rect = element.getBoundingClientRect();
    const scaleX = rect.width > 0 ? figureWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? figureHeight / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };

  /** Figure coordinates to world ones, undoing what the renderer did. */
  const toWorld = (at: Vector2): Vector2 => {
    const view = (lab.peekSnapshot() as GeometryLabSnapshot).appState.view2d;
    const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;
    return {
      x: view.x + (at.x - figureWidth / 2) / zoom,
      // y grows upward in the scene and downward on screen.
      y: view.y - (at.y - figureHeight / 2) / zoom,
    };
  };

  const snap = (world: Vector2, ignoreId: string): Vector2 => {
    if (snapToPoints) {
      const scene = (lab.peekSnapshot() as GeometryLabSnapshot).scene.scene2d;
      const figure = worldToFigure(world);
      for (const hit of currentIndex().hitAll(figure, pickRadius)) {
        if (hit.kind !== 'point' || hit.id === ignoreId) continue;
        const point = scene.points[hit.id];
        if (point && point.kind === 'point2d') return { x: point.x, y: point.y };
      }
    }
    if (options.snapToGrid !== undefined && options.snapToGrid > 0) {
      const step = options.snapToGrid;
      return { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step };
    }
    return world;
  };

  const worldToFigure = (world: Vector2): Vector2 => {
    const view = (lab.peekSnapshot() as GeometryLabSnapshot).appState.view2d;
    const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;
    return {
      x: figureWidth / 2 + (world.x - view.x) * zoom,
      y: figureHeight / 2 - (world.y - view.y) * zoom,
    };
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const at = toFigure(event);
    const hit: GeometryHit | null = currentIndex().hit(at, pickRadius);

    // With the select tool a click on a point that can move begins a drag;
    // everything else is a choice handed to whatever tool is active.
    if (session.getState().tool === 'select' && hit?.kind === 'point') {
      const point = (lab.peekSnapshot() as GeometryLabSnapshot).scene.scene2d.points[hit.id];
      if (isFreeGeometryPoint2D(point)) {
        dragging = hit.id;
        pointerId = event.pointerId;
        element.setPointerCapture?.(event.pointerId);
        say(session.focusObject(hit.id).status);
        event.preventDefault();
        return;
      }
    }

    if (hit) session.focusObject(hit.id);
    else session.moveCursorTo(toWorld(at));
    say(session.commit().state.status);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (dragging === null) {
      // Hovering still moves the focus, so a host can highlight what a click
      // would take and a screen reader hears it before the click happens.
      const hit = currentIndex().hit(toFigure(event), pickRadius);
      if (hit) say(session.focusObject(hit.id).status);
      return;
    }
    if (pointerId !== null && event.pointerId !== pointerId) return;
    const world = snap(toWorld(toFigure(event)), dragging);
    lab.applyDelta({ op: 'updatePoint', id: dragging, changes: { x: world.x, y: world.y } });
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent): void => {
    if (dragging === null) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;
    element.releasePointerCapture?.(event.pointerId);
    say(session.focusObject(dragging).status);
    dragging = null;
    pointerId = null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const result = session.press(event.key, {
      shift: event.shiftKey,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
    });
    if (!result.handled) return;
    say(result.state.status);
    event.preventDefault();
  };

  // A changed figure is a different snapshot, so the index is dropped rather
  // than patched: rebuilding is linear and patching a spatial index correctly
  // for an arbitrary delta is not.
  const unsubscribe = lab.subscribeDelta(() => {
    index = null;
    indexedFrom = null;
  });

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('keydown', onKeyDown);
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');

  let detached = false;
  return {
    session,
    detach(): void {
      if (detached) return;
      detached = true;
      unsubscribe();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('keydown', onKeyDown);
    },
  };
}
