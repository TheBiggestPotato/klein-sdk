import {
  geometryConstructionSourceIds,
  geometryObjectDependencies,
  type GeometryConstraint,
  type GeometryConstruction,
  type GeometryEntity,
  type GeometryPoint2D,
  type GeometryPoint3D,
  type GeometryTransform2D,
} from '../geometry-core/index.js';
import type {
  GeometryEntity3D,
  GeometryLabSnapshot,
  GeometryScene2D,
  WorkPlane3D,
} from './types.js';

/**
 * How the figure was built, read back out of the figure.
 *
 * <p>A drawing shows what a student ended up with. A protocol shows what they
 * did, which is what a teacher is actually marking, and what makes a
 * construction a proof rather than a picture: "the midpoint of AB" is an
 * argument, "a point that happens to sit halfway along" is a coincidence.
 *
 * <p>Nothing here is stored. Every derived object already carries the rule that
 * made it - that is what makes the figure dynamic - so this is a reading of the
 * scene rather than a second copy of it. It costs no snapshot memory and
 * nothing at edit time.
 *
 * <p>It is therefore a protocol of the figure as it <b>stands</b>, not a log of
 * what was done to it. An object that was built and then deleted is not in it,
 * and two steps that do not depend on each other are ordered only as far as the
 * record happens to preserve. That is the honest limit of deriving rather than
 * recording, and it is the right trade: a log has to be kept correct through
 * undo, collaborative merges and reloads, and this cannot go stale because
 * there is nothing to go stale.
 */

export type GeometryProtocolStepKind =
  /** A point put somewhere, depending on nothing. */
  | 'place'
  /** An object joining objects that already exist, with no rule of its own. */
  | 'join'
  /** A derived object: the rule that made it is recorded, so it follows. */
  | 'construct'
  /** A rule imposed on the figure rather than an object added to it. */
  | 'constrain';

export interface GeometryProtocolStep {
  /** 1-based, in the order the steps must be carried out. */
  readonly number: number;
  readonly objectId: string;
  /** What to call it in prose: its label, or a name assigned in step order. */
  readonly name: string;
  readonly kind: GeometryProtocolStepKind;
  /** Construction, entity, constraint or plane kind, for a host that would rather word it itself. */
  readonly operation: string;
  /** What the step is built from. Every one of them is an earlier step. */
  readonly sourceIds: readonly string[];
  readonly summary: string;
  readonly view: '2d' | '3d';
}

export interface GeometryConstructionProtocol {
  readonly steps: readonly GeometryProtocolStep[];
  /**
   * True when every step's sources appear before it, which is what a replay
   * needs. False only for a figure whose provenance contains a cycle, which the
   * integrity check forbids - reported rather than thrown, because a protocol
   * of a broken figure is a diagnostic.
   */
  readonly replayable: boolean;
  /**
   * Hidden, locked objects left out: the helper point that gives a constructed
   * line its direction, the centre a circle through three points is drawn
   * about. A student never places one, so listing them would describe the
   * instrument's working rather than the child's.
   */
  readonly omitted: number;
}

/**
 * The work plane every scene is created with. It is scene furniture rather than
 * something a student added, so it is not a step - and a 2D figure would
 * otherwise end with a line about a plane it never used.
 */
const DEFAULT_WORK_PLANE_ID = 'xy';

/** Reads a figure's construction protocol out of the figure. */
export function geometryConstructionProtocol(
  snapshot: GeometryLabSnapshot,
): GeometryConstructionProtocol {
  const scene2d = snapshot.scene.scene2d;
  const scene3d = snapshot.scene.scene3d;
  const nodes: ProtocolNode[] = [];
  let omitted = 0;

  // Objects that use other objects come first, and the points they use are
  // pulled in by the ordering pass at the moment they are first needed. The
  // model has no timestamps, so no reading of it recovers the true order; this
  // is the stated rule instead, and it is the one that reads as a protocol -
  // "place A, place B, join them" rather than every point at the top.
  for (const entity of Object.values(scene2d.entities)) {
    nodes.push(node(entity.id, '2d', entity, geometryObjectDependencies(scene2d, entity.id)));
  }
  for (const constraint of Object.values(scene2d.constraints ?? {})) {
    nodes.push(node(constraint.id, '2d', constraint, geometryObjectDependencies(scene2d, constraint.id)));
  }
  for (const point of Object.values(scene2d.points)) {
    if (point.kind !== 'point2d') continue;
    if (isMachinery(point)) { omitted += 1; continue; }
    nodes.push(node(point.id, '2d', point, geometryObjectDependencies(scene2d, point.id)));
  }

  // The two views are ordered independently: nothing in the model records
  // whether a 3D object was added before or after a 2D one.
  for (const entity of Object.values(scene3d.entities)) {
    nodes.push(node(entity.id, '3d', entity, entity3DSources(entity)));
  }
  for (const plane of Object.values(scene3d.workPlanes)) {
    // The plane every scene starts with, which nobody added.
    if (plane.id === DEFAULT_WORK_PLANE_ID) continue;
    nodes.push(node(plane.id, '3d', plane, planeSources(plane)));
  }
  for (const point of Object.values(scene3d.points)) {
    if (isMachinery(point)) { omitted += 1; continue; }
    nodes.push(node(point.id, '3d', point, geometryConstructionSourceIds(point.construction)));
  }

  const ordered = topologicalOrder(nodes);
  const naming = new Naming(ordered.nodes);

  const steps = ordered.nodes.map((current, index) => {
    const described = describe(current, naming);
    return {
      number: index + 1,
      objectId: current.id,
      name: naming.nameOf(current.id),
      kind: described.kind,
      operation: described.operation,
      sourceIds: current.sources,
      summary: described.summary,
      view: current.view,
    };
  });

  return { steps, replayable: ordered.replayable, omitted };
}

/** Renders a protocol as numbered lines, which is how one is read on paper. */
export function formatGeometryConstructionProtocol(
  protocol: GeometryConstructionProtocol,
): string {
  return protocol.steps.map((step) => `${step.number}. ${step.summary}`).join('\n');
}

/* -------------------------------------------------------------------------- */
/* Gathering                                                                  */
/* -------------------------------------------------------------------------- */

type ProtocolObject =
  | GeometryPoint2D
  | GeometryPoint3D
  | GeometryEntity
  | GeometryEntity3D
  | GeometryConstraint
  | WorkPlane3D;

interface ProtocolNode {
  readonly id: string;
  readonly view: '2d' | '3d';
  readonly object: ProtocolObject;
  readonly sources: readonly string[];
}

function node(
  id: string,
  view: '2d' | '3d',
  object: ProtocolObject,
  sources: readonly string[],
): ProtocolNode {
  return { id, view, object, sources };
}

/**
 * Hidden and locked together is the signature every builder gives an object it
 * creates on the caller's behalf. Hidden alone is a styling choice a student
 * made about their own point, and that point is still a step they took.
 */
function isMachinery(object: { hidden?: boolean; locked?: boolean }): boolean {
  return object.hidden === true && object.locked === true;
}

function planeSources(plane: WorkPlane3D): string[] {
  const source = plane.source;
  if (!source) return [];
  switch (source.kind) {
    case 'threePoints':
      return [...source.pointIds];
    case 'equation':
      return [];
    case 'parallelPlane':
    case 'perpendicularPlane':
      return present([source.sourcePlaneId, source.throughPointId]);
    case 'perpendicularLine':
      return present([source.sourceEntityId, source.throughPointId]);
    default:
      return [];
  }
}

function entity3DSources(entity: GeometryEntity3D): string[] {
  if (entity.kind === 'crossSection') return present([entity.solidId, entity.planeId]);
  // A solid's own mesh points are its machinery, not its sources: it was added
  // whole, and the points came with it.
  if (entity.kind === 'solid' || entity.kind === 'surface3d' || entity.kind === 'curve3d') return [];
  const construction = (entity as { construction?: GeometryConstruction }).construction;
  if (construction) return geometryConstructionSourceIds(construction);
  const pointIds = (entity as { pointIds?: string[] }).pointIds;
  return pointIds ? [...pointIds] : [];
}

function present(ids: readonly (string | undefined)[]): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id !== '');
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Depth-first post-order over the provenance edges.
 *
 * <p>Chosen over a queue-based sort because it is stable in the way that
 * matters: a figure whose records are already in build order - which is every
 * figure that was not reloaded or merged - comes back in exactly that order,
 * rather than in whatever order a ready-queue happened to drain. Linear in
 * objects and edges either way.
 */
function topologicalOrder(nodes: readonly ProtocolNode[]): {
  nodes: readonly ProtocolNode[];
  replayable: boolean;
} {
  const byId = new Map(nodes.map((current) => [current.id, current]));
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  const ordered: ProtocolNode[] = [];
  let replayable = true;

  const visit = (current: ProtocolNode): void => {
    if (emitted.has(current.id)) return;
    if (visiting.has(current.id)) {
      // Provenance that points back at itself. The integrity check forbids it;
      // saying so beats stalling or throwing.
      replayable = false;
      return;
    }
    visiting.add(current.id);
    for (const sourceId of current.sources) {
      const source = byId.get(sourceId);
      // A source that is not a node is either machinery that was folded away or
      // a dangling reference, and neither is a step to wait for.
      if (source) visit(source);
    }
    visiting.delete(current.id);
    emitted.add(current.id);
    ordered.push(current);
  };

  for (const current of nodes) visit(current);
  return { nodes: ordered, replayable };
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What each object is called in the prose.
 *
 * <p>A label if the student gave one. Otherwise a name assigned in step order,
 * because an id reads as `p2_36a2falqxd35x_74df19_2` and a protocol that says
 * that is not one a teacher can read. An entity spanning two named points is
 * called after them - `AB` - which is what it would be called on paper, but
 * only when both ends are visible: a constructed line's second point is a
 * hidden helper, and naming the line after it would be naming it after
 * something that is not on the page.
 */
class Naming {
  readonly #names = new Map<string, string>();
  readonly #labelled = new Set<string>();

  constructor(nodes: readonly ProtocolNode[]) {
    const labelled = new Map<string, string>();
    for (const current of nodes) {
      const label = (current.object as { label?: string }).label;
      if (label && label.trim() !== '') labelled.set(current.id, label.trim());
    }

    let pointCount = 0;
    const kindCounts = new Map<string, number>();
    for (const current of nodes) {
      const label = labelled.get(current.id);
      if (label) { this.#names.set(current.id, label); this.#labelled.add(current.id); continue; }

      const kind = objectKind(current.object);
      if (kind === 'point2d' || kind === 'point3d') {
        pointCount += 1;
        this.#names.set(current.id, `P${pointCount}`);
        continue;
      }

      const ends = (current.object as { pointIds?: string[] }).pointIds;
      const spanned = ends?.length === 2
        ? ends.map((id) => labelled.get(id) ?? this.#names.get(id)).filter((name): name is string => name !== undefined)
        : [];
      if (spanned.length === 2) {
        this.#names.set(current.id, spanned.join(''));
        continue;
      }

      const word = displayKind(current.object, kind);
      const count = (kindCounts.get(word) ?? 0) + 1;
      kindCounts.set(word, count);
      this.#names.set(current.id, `${word} ${count}`);
    }
  }

  /** The display name, falling back to the id for an object that is not a step. */
  nameOf(id: string): string {
    return this.#names.get(id) ?? id;
  }

  /** True when the name is the student's own, rather than one assigned here. */
  isLabelled(id: string): boolean {
    return this.#labelled.has(id);
  }

  list(ids: readonly string[]): string {
    const names = ids.map((id) => this.nameOf(id));
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
}

/** What a generated name calls a thing: `cross-section 1`, not `crossSection 1`. */
function displayKind(object: ProtocolObject, kind: string): string {
  if (kind === 'solid') return (object as { solid?: string }).solid ?? 'solid';
  if (kind === 'crossSection') return 'cross-section';
  if (kind === 'surface3d') return 'surface';
  if (kind === 'curve3d') return 'curve';
  if (kind === 'relationMarker') return 'marker';
  if (kind === 'parametricCurve') return 'curve';
  return kind;
}

function objectKind(object: ProtocolObject): string {
  const kind = (object as { kind?: string }).kind;
  if (kind) return kind;
  // A work plane is the one stored object with no `kind` of its own.
  return 'plane';
}

/* -------------------------------------------------------------------------- */
/* Wording                                                                    */
/* -------------------------------------------------------------------------- */

interface Described {
  readonly kind: GeometryProtocolStepKind;
  readonly operation: string;
  readonly summary: string;
}

function describe(current: ProtocolNode, naming: Naming): Described {
  const object = current.object;
  const name = naming.nameOf(current.id);
  const kind = objectKind(object);

  if (kind === 'point2d' || kind === 'point3d') {
    const construction = (object as GeometryPoint2D | GeometryPoint3D).construction;
    if (construction) {
      return {
        kind: 'construct',
        operation: construction.kind,
        summary: describeConstruction(construction, name, naming),
      };
    }
    return { kind: 'place', operation: kind, summary: `Place ${name} at ${coordinates(object)}.` };
  }

  if (isConstraint(object)) {
    return {
      kind: 'constrain',
      operation: object.kind,
      summary: describeConstraint(object, naming),
    };
  }

  if (kind === 'plane') return { kind: describedPlaneKind(object as WorkPlane3D), operation: 'plane', summary: describePlane(object as WorkPlane3D, name, naming) };

  const construction = (object as { construction?: GeometryConstruction }).construction;
  if (construction) {
    return {
      kind: 'construct',
      operation: construction.kind,
      summary: describeConstruction(construction, name, naming),
    };
  }
  return { kind: 'join', operation: kind, summary: describeEntity(object, name, naming, naming.isLabelled(current.id)) };
}

function describeConstruction(
  construction: GeometryConstruction,
  name: string,
  naming: Naming,
): string {
  const at = (id: string) => naming.nameOf(id);
  switch (construction.kind) {
    case 'midpoint':
      return `Construct ${name}, the midpoint of ${at(construction.sourceIds[0])} and ${at(construction.sourceIds[1])}.`;
    case 'intersection': {
      const where = (construction.index ?? 0) === 0 ? '' : ` (crossing ${(construction.index ?? 0) + 1})`;
      return `Construct ${name} where ${at(construction.sourceIds[0])} meets ${at(construction.sourceIds[1])}${where}.`;
    }
    case 'lineThroughPoints':
      return `Draw ${name}, the line through ${at(construction.sourceIds[0])} and ${at(construction.sourceIds[1])}.`;
    case 'circleCenterPoint':
      return `Draw ${name}, the circle centred on ${at(construction.centerPointId)} through ${at(construction.radiusPointId)}.`;
    case 'circumcenter':
      return `Construct ${name}, the centre of the circle through ${naming.list(construction.pointIds)}.`;
    case 'circleThroughPoints':
      return `Draw ${name}, the circle through ${naming.list(construction.pointIds)}.`;
    case 'parallelLine':
      return `Draw ${name}, the line through ${at(construction.throughPointId)} parallel to ${at(construction.sourceLineId)}.`;
    case 'perpendicularLine':
      return `Draw ${name}, the line through ${at(construction.throughPointId)} perpendicular to ${at(construction.sourceLineId)}.`;
    case 'tangentLine':
      return `Draw ${name}, a tangent from ${at(construction.throughPointId)} to ${at(construction.circleId)}.`;
    case 'angleBisector':
      return `Draw ${name}, the bisector of angle ${construction.pointIds.map(at).join('')}.`;
    case 'angleFromLines':
      return `Mark ${name}, the angle between ${at(construction.sourceIds[0])} and ${at(construction.sourceIds[1])}.`;
    case 'transformedPoint':
      return `${describeTransform(construction.transform, at(construction.sourceId), naming)}, giving ${name}.`;
    case 'linePlaneIntersection':
      return `Construct ${name} where ${at(construction.lineEntityId)} meets ${at(construction.planeId)}.`;
    case 'planePlaneIntersection':
      return `Construct ${name}, ${construction.end === 0 ? 'one end' : 'the other end'} of the line where ${at(construction.firstPlaneId)} meets ${at(construction.secondPlaneId)}.`;
    case 'custom':
      return construction.label
        ? `${construction.label}, giving ${name}.`
        : `Construct ${name} from ${naming.list(construction.sourceIds)}.`;
    default:
      return `Construct ${name}.`;
  }
}

function describeTransform(
  transform: GeometryTransform2D,
  source: string,
  naming: Naming,
): string {
  switch (transform.kind) {
    case 'translate':
      return `Translate ${source} by ${naming.nameOf(transform.vectorEntityId)}`;
    case 'translateBy':
      return `Translate ${source} by (${round(transform.dx)}, ${round(transform.dy)})`;
    case 'rotate':
      return `Rotate ${source} about ${naming.nameOf(transform.centerPointId)} through ${round(transform.degrees)}°`;
    case 'reflectLine':
      return `Reflect ${source} in ${naming.nameOf(transform.lineEntityId)}`;
    case 'reflectPoint':
      return `Reflect ${source} in ${naming.nameOf(transform.centerPointId)}`;
    case 'dilate':
      return `Enlarge ${source} from ${naming.nameOf(transform.centerPointId)} by a factor of ${round(transform.factor)}`;
    default:
      return `Transform ${source}`;
  }
}

function describeEntity(object: ProtocolObject, name: string, naming: Naming, labelled: boolean): string {
  const kind = objectKind(object);
  const pointIds = (object as { pointIds?: string[] }).pointIds ?? [];
  switch (kind) {
    case 'segment':
      return `Join ${naming.list(pointIds)} with segment ${name}.`;
    case 'ray':
      return `Draw ray ${name} from ${naming.nameOf(pointIds[0] ?? '')} through ${naming.nameOf(pointIds[1] ?? '')}.`;
    case 'vector':
      return `Draw vector ${name} from ${naming.nameOf(pointIds[0] ?? '')} to ${naming.nameOf(pointIds[1] ?? '')}.`;
    case 'line':
      return `Draw line ${name} through ${naming.list(pointIds)}.`;
    case 'polygon':
      return `Draw polygon ${name} on ${naming.list(pointIds)}.`;
    case 'angle':
      return `Mark angle ${pointIds.map((id) => naming.nameOf(id)).join('')}.`;
    case 'circle': {
      const centre = (object as { centerId?: string }).centerId;
      const radius = (object as { radius?: number }).radius;
      return `Draw circle ${name} centred on ${naming.nameOf(centre ?? '')} with radius ${round(radius ?? 0)}.`;
    }
    case 'solid': {
      const solid = (object as { solid?: string }).solid ?? 'solid';
      // A generated name already says what it is - `cube 1` - so saying it
      // twice reads as a stutter.
      return labelled ? `Add ${name}, a ${solid}.` : `Add ${name}.`;
    }
    case 'crossSection': {
      const section = object as { solidId: string; planeId?: string };
      return section.planeId
        ? `Cut ${naming.nameOf(section.solidId)} with ${naming.nameOf(section.planeId)}, giving ${name}.`
        : `Take cross-section ${name} of ${naming.nameOf(section.solidId)}.`;
    }
    case 'surface3d':
      return `Plot surface ${name}.`;
    case 'curve3d':
      return `Plot curve ${name}.`;
    default:
      return `Add ${kind} ${name}.`;
  }
}

function describedPlaneKind(plane: WorkPlane3D): GeometryProtocolStepKind {
  const source = plane.source;
  if (!source || source.kind === 'equation') return 'place';
  return 'construct';
}

function describePlane(plane: WorkPlane3D, name: string, naming: Naming): string {
  const source = plane.source;
  if (!source) return `Add plane ${name}.`;
  switch (source.kind) {
    case 'threePoints':
      return `Add plane ${name} through ${naming.list(source.pointIds)}.`;
    case 'equation':
      return source.input
        ? `Add plane ${name}: ${source.input}.`
        : `Add plane ${name} from its equation.`;
    case 'parallelPlane':
      return `Add plane ${name} parallel to ${naming.nameOf(source.sourcePlaneId)}.`;
    case 'perpendicularPlane':
      return `Add plane ${name} perpendicular to ${naming.nameOf(source.sourcePlaneId)}.`;
    case 'perpendicularLine':
      return `Add plane ${name} perpendicular to ${naming.nameOf(source.sourceEntityId)}.`;
    default:
      return `Add plane ${name}.`;
  }
}

function describeConstraint(constraint: GeometryConstraint, naming: Naming): string {
  const disabled = constraint.enabled === false ? ' (switched off)' : '';
  const at = (id: string) => naming.nameOf(id);
  switch (constraint.kind) {
    case 'fixedLength':
      return `Fix ${constraint.pointIds.map(at).join('')} at ${round(constraint.length)}${disabled}.`;
    case 'fixedAngle':
      return `Fix angle ${constraint.pointIds.map(at).join('')} at ${round(constraint.degrees)}°${disabled}.`;
    case 'parallel':
      return `Keep ${at(constraint.entityIds[0])} parallel to ${at(constraint.entityIds[1])}${disabled}.`;
    case 'perpendicular':
      return `Keep ${at(constraint.entityIds[0])} perpendicular to ${at(constraint.entityIds[1])}${disabled}.`;
    case 'equalLength':
      return `Keep ${constraint.segments[0].map(at).join('')} and ${constraint.segments[1].map(at).join('')} the same length${disabled}.`;
    case 'equalRadius':
      return `Keep ${at(constraint.circleIds[0])} and ${at(constraint.circleIds[1])} the same size${disabled}.`;
    default:
      return `Add a constraint${disabled}.`;
  }
}

function isConstraint(object: ProtocolObject): object is GeometryConstraint {
  const kind = (object as { kind?: string }).kind;
  return kind === 'fixedLength'
    || kind === 'fixedAngle'
    || kind === 'parallel'
    || kind === 'perpendicular'
    || kind === 'equalLength'
    || kind === 'equalRadius';
}

function coordinates(object: ProtocolObject): string {
  const point = object as { x?: number; y?: number; z?: number };
  const parts = [point.x, point.y, point.z]
    .filter((value): value is number => typeof value === 'number')
    .map(round);
  return `(${parts.join(', ')})`;
}

/** Three decimals: enough to read a placement back, few enough to read at all. */
function round(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value * 1e3) / 1e3;
  return Object.is(rounded, -0) ? 0 : rounded;
}
