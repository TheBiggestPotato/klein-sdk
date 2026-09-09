import { KleinSdkError } from '../core/index.js';
import type { Vector2 } from '../core/index.js';
import { geometryConstructionProtocol } from './protocol.js';
import type { GeometryLabSnapshot, GeometryLabTool } from './types.js';

/**
 * Building a figure without a pointer.
 *
 * <p>The Lab declares two dozen tools and, until this, every one of them needed
 * a mouse: `mount()` writes static SVG and registers no listeners, so there was
 * no path to a construction that did not go through pointing at things. A
 * keyboard path is not a smaller version of that - it is a different model, and
 * the model is the part that belongs in an SDK.
 *
 * <p><b>No DOM.</b> A session takes key *names* - the strings a
 * `KeyboardEvent.key` carries - and returns what happened. Wiring one to an
 * element is a line in the host, and deliberately theirs: whether the SDK ships
 * an interaction layer at all is still an open question (task 5.5), and this
 * had no business answering it by growing event listeners.
 *
 * <p><b>A cursor and a focus, which is the whole trick.</b> Pointing does two
 * jobs at once - "somewhere" and "that one" - and a keyboard has to separate
 * them. Arrow keys move a cursor through the plane, so a point can be placed
 * anywhere; tab moves focus from object to object and brings the cursor with
 * it, so an existing object can be picked. Every construction is then "focus
 * the things it is made from, in order, pressing Enter on each".
 *
 * <p><b>Navigation is in construction order</b> - the order the figure's own
 * description reads in - and not the order the SVG paints in. A host wiring
 * this should give the figure <em>one</em> tab stop and let the session move
 * within it, which is how a composite widget works; `focusableObjects` on the
 * renderer is the fallback for a host that has no session, and the two should
 * not both be on.
 */

export interface GeometryKeyboardState {
  readonly tool: GeometryLabTool;
  /** Where a new point would go, in world coordinates. */
  readonly cursor: Vector2;
  /** The object the cursor is resting on, if any. */
  readonly focusedId: string | null;
  /** Objects chosen so far towards the current tool, in the order chosen. */
  readonly pending: readonly string[];
  /** What just happened, in words - a host announces this to a screen reader. */
  readonly status: string;
}

export interface GeometryKeyPress {
  /** Whether the session acted on the key, so a host knows to stop the event. */
  readonly handled: boolean;
  readonly state: GeometryKeyboardState;
  /** The object created, when the key completed a construction. */
  readonly createdId?: string;
}

export interface GeometryKeyModifiers {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
}

export interface GeometryKeyboardOptions {
  /** How far one arrow press moves the cursor, in world units. */
  readonly step?: number;
  /** The cursor's starting position. */
  readonly cursor?: Vector2;
}

/**
 * What a key does, so a host can render a legend instead of guessing.
 *
 * <p>Single letters, chosen to be the first letter of the tool wherever two
 * tools do not want the same one. Exported rather than buried because a
 * keyboard interface nobody can discover is not one.
 */
export const GEOMETRY_TOOL_KEYS: Readonly<Record<string, GeometryLabTool>> = Object.freeze({
  v: 'select',
  p: 'point',
  s: 'segment',
  g: 'polygon',
  a: 'angle',
  c: 'circle',
  m: 'midpoint',
  e: 'perpendicular',
  q: 'parallel',
  b: 'bisector',
  h: 'hide',
  d: 'remove',
});

/** How many objects each tool consumes before it builds something. */
const TOOL_ARITY: Partial<Record<GeometryLabTool, number>> = {
  segment: 2,
  circle: 2,
  midpoint: 2,
  angle: 3,
  bisector: 3,
  perpendicular: 2,
  parallel: 2,
};

/**
 * The tools a keystroke alone can finish.
 *
 * <p>Every declared tool that builds plane geometry from objects already in the
 * figure. What is missing from the list needs a value no key carries - which
 * solid, what colour, what equation, what text - so a session exposes those to
 * the host's own controls rather than pretending a keystroke could supply them;
 * and `pan` and `orbit` move a camera rather than build anything, which the
 * arrow keys already do here for the cursor.
 *
 * <p>`addRay2D`, `addLine2D` and `addVector2D` are not here because
 * `GeometryLabTool` declares no `ray`, `line` or `vector` tool - the API can
 * build all three and the tool vocabulary never named them. A gap in the
 * vocabulary rather than in the keyboard, and widening a persisted union is not
 * something an accessibility task should do quietly.
 */
export const KEYBOARD_COMPLETABLE_TOOLS: readonly GeometryLabTool[] = Object.freeze([
  'select', 'point', 'segment', 'polygon', 'angle', 'circle',
  'midpoint', 'perpendicular', 'parallel', 'bisector', 'hide', 'remove',
]);

/** The instrument surface a session drives; the Lab satisfies it. */
export interface GeometryKeyboardTarget {
  peekSnapshot(): Readonly<GeometryLabSnapshot>;
  setTool(tool: GeometryLabTool): void;
  addPoint2D(point: Vector2 & { label?: string }): string;
  addSegment2D(first: string, second: string): string;
  addPolygon2D(pointIds: string[]): string;
  addAngle2D(pointIds: [string, string, string]): string;
  addCircle2D(centre: string, through: string): string;
  addMidpoint2D(first: string, second: string): string;
  addPerpendicularLine2D(entityId: string, throughPointId: string): string;
  addParallelLine2D(entityId: string, throughPointId: string): string;
  addAngleBisector2D(pointIds: [string, string, string]): string;
  remove(ids: string | string[]): void;
  applyDelta(delta: unknown): void;
}

/** Opens a keyboard session over a Lab. */
export function createGeometryKeyboardSession(
  lab: GeometryKeyboardTarget,
  options: GeometryKeyboardOptions = {},
): GeometryKeyboardSession {
  return new GeometryKeyboardSession(lab, options);
}

export class GeometryKeyboardSession {
  readonly #lab: GeometryKeyboardTarget;
  readonly #step: number;
  #tool: GeometryLabTool = 'select';
  #cursor: Vector2;
  #focusedId: string | null = null;
  #pending: string[] = [];
  #status = 'Ready.';

  constructor(lab: GeometryKeyboardTarget, options: GeometryKeyboardOptions) {
    this.#lab = lab;
    this.#step = options.step && options.step > 0 ? options.step : 1;
    this.#cursor = { x: options.cursor?.x ?? 0, y: options.cursor?.y ?? 0 };
  }

  getState(): GeometryKeyboardState {
    return {
      tool: this.#tool,
      cursor: { ...this.#cursor },
      focusedId: this.#focusedId,
      pending: [...this.#pending],
      status: this.#status,
    };
  }

  /** Chooses a tool, abandoning anything half-built. */
  setTool(tool: GeometryLabTool): GeometryKeyboardState {
    this.#tool = tool;
    this.#pending = [];
    this.#lab.setTool(tool);
    this.#status = `${tool} tool. ${this.#prompt()}`;
    return this.getState();
  }

  /**
   * Puts the cursor on an object, as tabbing to it would.
   *
   * <p>Here so a pointer can drive the same tool machine a keyboard does. One
   * state machine and two input devices, rather than two that agree until they
   * do not - and the pointer gets the spoken prompts for free.
   */
  focusObject(id: string | null): GeometryKeyboardState {
    if (id === null) {
      this.#focusedId = null;
      this.#status = 'Nothing selected.';
      return this.getState();
    }
    this.#focusedId = id;
    const position = this.#positionOf(id);
    if (position) this.#cursor = { x: round(position.x), y: round(position.y) };
    this.#status = `${this.#describe(id)}. ${this.#prompt()}`;
    return this.getState();
  }

  /** Moves the cursor somewhere, as the arrow keys would. */
  moveCursorTo(at: Vector2): GeometryKeyboardState {
    this.#cursor = { x: round(at.x), y: round(at.y) };
    this.#focusedId = null;
    this.#status = `Cursor at (${this.#cursor.x}, ${this.#cursor.y}).`;
    return this.getState();
  }

  /** Acts on what is under the cursor, as Enter would. */
  commit(): GeometryKeyPress {
    return this.#commit();
  }

  /**
   * Acts on one key.
   *
   * <p>`key` is a `KeyboardEvent.key` value, so a host forwards the event
   * without translating it. An unhandled key is reported rather than swallowed,
   * because a session that ate every keystroke would take the host's own
   * shortcuts with it.
   */
  press(key: string, modifiers: GeometryKeyModifiers = {}): GeometryKeyPress {
    // Anything with a command modifier belongs to the host: undo, save, and the
    // browser's own shortcuts are not this session's to take.
    if (modifiers.ctrl === true || modifiers.meta === true) return this.#unhandled();

    if (key === 'Escape') return this.#cancel();
    if (key === 'Tab') return this.#moveFocus(modifiers.shift === true ? -1 : 1);
    if (key === 'Home') return this.#focusAt(0);
    if (key === 'End') return this.#focusAt(-1);
    if (key === 'Enter' || key === ' ') return this.#commit();
    if (key === 'Delete' || key === 'Backspace') return this.#removeFocused();

    const direction = ARROWS[key];
    if (direction) {
      // Shift moves the object under the cursor instead of the cursor: the
      // keyboard's version of dragging, and the only way to change a figure
      // once it is built.
      return modifiers.shift === true ? this.#nudgeFocused(direction) : this.#moveCursor(direction);
    }

    const tool = GEOMETRY_TOOL_KEYS[key.toLowerCase()];
    if (tool) {
      this.setTool(tool);
      return { handled: true, state: this.getState() };
    }
    return this.#unhandled();
  }

  /* ---------------------------------------------------------------------- */

  #unhandled(): GeometryKeyPress {
    return { handled: false, state: this.getState() };
  }

  #cancel(): GeometryKeyPress {
    if (this.#pending.length === 0) {
      this.#focusedId = null;
      this.#status = 'Nothing selected.';
    } else {
      this.#pending = [];
      this.#status = `Cancelled. ${this.#prompt()}`;
    }
    return { handled: true, state: this.getState() };
  }

  #moveCursor(direction: Vector2): GeometryKeyPress {
    this.#cursor = {
      x: round(this.#cursor.x + direction.x * this.#step),
      y: round(this.#cursor.y + direction.y * this.#step),
    };
    // Moving away from an object is leaving it: a focus that stayed behind
    // while the cursor walked off would make the next Enter act somewhere the
    // reader is not.
    this.#focusedId = null;
    this.#status = `Cursor at (${this.#cursor.x}, ${this.#cursor.y}).`;
    return { handled: true, state: this.getState() };
  }

  #moveFocus(step: number): GeometryKeyPress {
    const order = this.#order();
    if (order.length === 0) {
      this.#status = 'The figure is empty.';
      return { handled: true, state: this.getState() };
    }
    const current = this.#focusedId === null ? -1 : order.indexOf(this.#focusedId);
    const next = current < 0
      ? (step > 0 ? 0 : order.length - 1)
      : (current + step + order.length) % order.length;
    return this.#focusAt(next);
  }

  #focusAt(index: number): GeometryKeyPress {
    const order = this.#order();
    if (order.length === 0) {
      this.#status = 'The figure is empty.';
      return { handled: true, state: this.getState() };
    }
    const id = order[index < 0 ? order.length + index : index] as string;
    this.#focusedId = id;
    const position = this.#positionOf(id);
    if (position) this.#cursor = { x: round(position.x), y: round(position.y) };
    this.#status = `${this.#describe(id)}. ${this.#prompt()}`;
    return { handled: true, state: this.getState() };
  }

  #nudgeFocused(direction: Vector2): GeometryKeyPress {
    const id = this.#focusedId;
    if (id === null || !this.#scene().points[id]) {
      this.#status = 'Select a point first, then hold shift and use the arrow keys to move it.';
      return { handled: true, state: this.getState() };
    }
    const point = this.#scene().points[id];
    if (!point || point.kind !== 'point2d') return this.#unhandled();
    const next = {
      x: round(point.x + direction.x * this.#step),
      y: round(point.y + direction.y * this.#step),
    };
    this.#lab.applyDelta({ op: 'updatePoint', id, changes: next });
    this.#cursor = next;
    this.#status = `Moved ${this.#describe(id)} to (${next.x}, ${next.y}).`;
    return { handled: true, state: this.getState() };
  }

  #removeFocused(): GeometryKeyPress {
    const id = this.#focusedId;
    if (id === null) {
      this.#status = 'Nothing selected to remove.';
      return { handled: true, state: this.getState() };
    }
    const described = this.#describe(id);
    this.#lab.remove(id);
    this.#focusedId = null;
    this.#pending = this.#pending.filter(pendingId => pendingId !== id);
    this.#status = `Removed ${described}.`;
    return { handled: true, state: this.getState() };
  }

  #commit(): GeometryKeyPress {
    if (this.#tool === 'point') {
      const id = this.#lab.addPoint2D({ ...this.#cursor });
      this.#focusedId = id;
      this.#status = `Placed a point at (${this.#cursor.x}, ${this.#cursor.y}).`;
      return { handled: true, state: this.getState(), createdId: id };
    }
    if (this.#tool === 'hide') return this.#toggleHidden();
    if (this.#tool === 'remove') return this.#removeFocused();
    if (this.#tool === 'select') {
      this.#status = this.#focusedId === null
        ? 'Nothing under the cursor.'
        : `${this.#describe(this.#focusedId)} selected.`;
      return { handled: true, state: this.getState() };
    }

    const id = this.#focusedId;
    if (id === null) {
      this.#status = `Nothing under the cursor. ${this.#prompt()}`;
      return { handled: true, state: this.getState() };
    }
    // A polygon has no fixed number of corners, so it is closed by choosing its
    // first corner again - which is how it is drawn with a pointer too. Checked
    // before the duplicate rule below, because closing a polygon *is* choosing
    // a corner twice and the two rules would otherwise argue.
    if (this.#tool === 'polygon' && this.#pending.length >= 3 && id === this.#pending[0]) {
      return this.#build();
    }
    if (this.#pending.includes(id)) {
      this.#status = `${this.#describe(id)} is already chosen. ${this.#prompt()}`;
      return { handled: true, state: this.getState() };
    }
    this.#pending.push(id);
    const arity = TOOL_ARITY[this.#tool];
    if (arity !== undefined && this.#pending.length >= arity) return this.#build();
    this.#status = `${this.#describe(id)} chosen. ${this.#prompt()}`;
    return { handled: true, state: this.getState() };
  }

  #toggleHidden(): GeometryKeyPress {
    const id = this.#focusedId;
    if (id === null) {
      this.#status = 'Nothing selected to hide.';
      return { handled: true, state: this.getState() };
    }
    const scene = this.#scene();
    const point = scene.points[id];
    const hidden = point ? point.hidden !== true : scene.entities[id]?.hidden !== true;
    this.#lab.applyDelta(point
      ? { op: 'updatePoint', id, changes: { hidden } }
      : { op: 'updateEntity', id, changes: { hidden } });
    this.#status = `${hidden ? 'Hid' : 'Showed'} ${this.#describe(id)}.`;
    return { handled: true, state: this.getState() };
  }

  #build(): GeometryKeyPress {
    const chosen = this.#pending;
    this.#pending = [];
    let created: string;
    try {
      created = this.#construct(chosen);
    } catch (error) {
      // A refused construction is a message, not a thrown error: a student who
      // chose two coincident points should be told, not have their session
      // end.
      this.#status = error instanceof KleinSdkError
        ? `${error.message} ${this.#prompt()}`
        : `That construction is not possible. ${this.#prompt()}`;
      return { handled: true, state: this.getState() };
    }
    this.#focusedId = created;
    this.#status = `Built ${this.#describe(created)}. ${this.#prompt()}`;
    return { handled: true, state: this.getState(), createdId: created };
  }

  #construct(chosen: readonly string[]): string {
    const [first, second, third] = chosen as [string, string, string];
    switch (this.#tool) {
      case 'segment': return this.#lab.addSegment2D(first, second);
      case 'circle': return this.#lab.addCircle2D(first, second);
      case 'midpoint': return this.#lab.addMidpoint2D(first, second);
      case 'polygon': return this.#lab.addPolygon2D([...chosen]);
      case 'angle': return this.#lab.addAngle2D([first, second, third]);
      case 'bisector': return this.#lab.addAngleBisector2D([first, second, third]);
      // The entity comes first and the point second, which is the order the
      // prompt asks for them in.
      case 'perpendicular': return this.#lab.addPerpendicularLine2D(first, second);
      case 'parallel': return this.#lab.addParallelLine2D(first, second);
      default:
        throw new KleinSdkError('unsupported_tool', `The ${this.#tool} tool needs a value the keyboard cannot supply.`);
    }
  }

  /* ---------------------------------------------------------------------- */

  #scene() {
    return this.#lab.peekSnapshot().scene.scene2d;
  }

  /**
   * The objects to walk, in the order the figure's own description reads in.
   *
   * <p>Recomputed on each move rather than cached: the figure changes under the
   * session constantly, and a stale order would walk to something that is no
   * longer there. It is linear in the figure and a keypress is not a frame.
   */
  #order(): string[] {
    return geometryConstructionProtocol(this.#lab.peekSnapshot())
      .steps.filter(step => step.view === '2d')
      .map(step => step.objectId);
  }

  #positionOf(id: string): Vector2 | null {
    const point = this.#scene().points[id];
    return point && point.kind === 'point2d' ? { x: point.x, y: point.y } : null;
  }

  #describe(id: string): string {
    const step = geometryConstructionProtocol(this.#lab.peekSnapshot())
      .steps.find(entry => entry.objectId === id);
    return step ? `${step.name}` : id;
  }

  /** What to do next, which is the only thing a keyboard user cannot see. */
  #prompt(): string {
    const arity = TOOL_ARITY[this.#tool];
    if (this.#tool === 'point') return 'Move with the arrow keys and press Enter to place a point.';
    if (this.#tool === 'select') return 'Tab between objects.';
    if (this.#tool === 'polygon') {
      return this.#pending.length < 3
        ? `Choose corner ${this.#pending.length + 1}.`
        : 'Choose another corner, or the first one again to close the polygon.';
    }
    if (arity === undefined) return 'Tab between objects.';
    const remaining = arity - this.#pending.length;
    if (this.#tool === 'perpendicular' || this.#tool === 'parallel') {
      return this.#pending.length === 0 ? 'Choose the line to work from.' : 'Choose the point to draw through.';
    }
    return `Choose ${remaining} more object${remaining === 1 ? '' : 's'}.`;
  }
}

const ARROWS: Readonly<Record<string, Vector2>> = Object.freeze({
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
});

/** Three decimals, so a cursor read aloud is a number rather than a float. */
function round(value: number): number {
  const rounded = Math.round(value * 1e3) / 1e3;
  return Object.is(rounded, -0) ? 0 : rounded;
}
