import { KleinSdkError } from '../core/index.js';
import type { Vector2, Vector3 } from '../core/index.js';
import type { GeometryPoint3D } from '../geometry-core/index.js';
import type { SolidEntity, SolidFace3D } from './types.js';

/**
 * Nets, and folding one back into the solid it came from.
 *
 * <p>What the instrument called a net was a row of faces: each face of the
 * solid projected flat on its own and laid out side by side with a gap between
 * them. That is a contact sheet. A net's faces are <b>joined along the edges
 * they share</b>, and the joins are the whole point - they are the hinges, and
 * the fold about them is the moment the flat shape and the solid become the
 * same object to a student. `GeometrySceneLink` had declared a `netToSolid`
 * kind since the beginning with nothing on either end of it.
 *
 * <p>So: the faces are arranged into a spanning tree over "shares an edge",
 * laid out by unfolding each one about the edge it hangs from, and folded by
 * rotating each about that same edge. The tree is what makes the fold a fold -
 * rotating a face carries everything hanging off it, which is why the shape
 * stays joined all the way through instead of coming apart into faces that
 * happen to arrive in the right places.
 */

/** A face in the flat net, and the edge it hangs from. */
export interface NetFacePlacement {
  readonly faceId: string;
  /** The face this one folds against; absent for the one everything hangs from. */
  readonly parentFaceId?: string;
  /** The shared edge, as two point ids - the hinge. */
  readonly hinge?: readonly [string, string];
  /** The face's corners in the flat net, in the solid's own vertex order. */
  readonly vertices: readonly Vector2[];
  /** The point ids those corners came from, so the fold can match them up. */
  readonly pointIds: readonly string[];
}

export interface UnfoldedNet {
  readonly faces: readonly NetFacePlacement[];
  /**
   * Faces that ended up on top of each other.
   *
   * <p>Reported rather than prevented. Whether every convex polyhedron even
   * *has* a non-overlapping unfolding is an open question in mathematics, so a
   * promise not to overlap is one this cannot keep; what it can do is say when
   * it happened, so a host can offer another arrangement or a warning instead
   * of printing something that will not cut out.
   */
  readonly overlaps: readonly (readonly [string, string])[];
}

/* -------------------------------------------------------------------------- */
/* Unfolding                                                                  */
/* -------------------------------------------------------------------------- */

/** Lays a solid's faces out flat, joined along the edges they share. */
export function unfoldSolidNet(
  solid: SolidEntity,
  points: Record<string, GeometryPoint3D>,
): UnfoldedNet {
  const faces = (solid.faces ?? []).filter((face) => face.pointIds.length >= 3);
  if (faces.length === 0) {
    throw new KleinSdkError('invalid_net', 'That solid has no faces to unfold.');
  }

  const corners = new Map<string, Vector3[]>();
  for (const face of faces) {
    const resolved: Vector3[] = [];
    for (const id of face.pointIds) {
      const point = points[id];
      if (!point || point.kind !== 'point3d') {
        throw new KleinSdkError('invalid_net', `Face "${face.id}" refers to a point that is not there.`);
      }
      resolved.push({ x: point.x, y: point.y, z: point.z });
    }
    corners.set(face.id, resolved);
  }

  const tree = spanningTree(faces);
  const placed = new Map<string, NetFacePlacement>();
  // Where each point id has been put in the flat layout. A hinge's two ends are
  // already placed by the parent, and reusing those positions rather than
  // recomputing them is what makes the two faces actually touch.
  const placedPoints = new Map<string, Vector2>();

  for (const node of tree) {
    const face = node.face;
    const solidCorners = corners.get(face.id) as Vector3[];
    const flat = node.parent === undefined
      ? placeRootFace(solidCorners)
      : placeChildFace(
        solidCorners,
        face.pointIds,
        node.hinge as readonly [string, string],
        placedPoints,
        placed.get(node.parent) as NetFacePlacement,
      );

    face.pointIds.forEach((id, index) => {
      if (!placedPoints.has(id)) placedPoints.set(id, flat[index] as Vector2);
    });
    const placement: NetFacePlacement = node.parent === undefined
      ? { faceId: face.id, vertices: flat, pointIds: [...face.pointIds] }
      : {
        faceId: face.id,
        parentFaceId: node.parent,
        hinge: node.hinge as readonly [string, string],
        vertices: flat,
        pointIds: [...face.pointIds],
      };
    placed.set(face.id, placement);
  }

  const laid = [...placed.values()];
  return { faces: laid, overlaps: findOverlaps(laid) };
}

/** The face everything else hangs from, put down in its own plane. */
function placeRootFace(corners: readonly Vector3[]): Vector2[] {
  const frame = faceFrame(corners);
  return corners.map((corner) => ({
    x: dot(subtract(corner, frame.origin), frame.e1),
    y: dot(subtract(corner, frame.origin), frame.e2),
  }));
}

/**
 * A face put down against its parent, hinged on the edge they share.
 *
 * <p>The hinge's two ends are wherever the parent already put them, so the
 * faces meet exactly rather than nearly. Which side of the hinge the face lands
 * on is decided by pushing it away from the parent's middle - both sides are
 * geometrically valid unfoldings and only one of them does not lie on top of
 * the face it came from.
 */
function placeChildFace(
  corners: readonly Vector3[],
  pointIds: readonly string[],
  hinge: readonly [string, string],
  placedPoints: Map<string, Vector2>,
  parent: NetFacePlacement,
): Vector2[] {
  const startIndex = pointIds.indexOf(hinge[0]);
  const endIndex = pointIds.indexOf(hinge[1]);
  const start = corners[startIndex] as Vector3;
  const end = corners[endIndex] as Vector3;

  const axis = normalize(subtract(end, start));
  // The in-plane direction from the hinge into the face, taken towards the
  // face's own middle. Deriving it from the face normal instead would depend on
  // which way round the corners are listed, and a solid whose faces wind the
  // other way would fold every child back on top of its parent.
  const middle = centroid3(corners);
  const offsetToMiddle = subtract(middle, start);
  const across = normalize(subtract(offsetToMiddle, scale(axis, dot(offsetToMiddle, axis))));

  const flatStart = placedPoints.get(hinge[0]) as Vector2;
  const flatEnd = placedPoints.get(hinge[1]) as Vector2;
  const hingeDirection = normalize2({ x: flatEnd.x - flatStart.x, y: flatEnd.y - flatStart.y });
  const perpendicular = { x: -hingeDirection.y, y: hingeDirection.x };

  const parentMiddle = centroid2(parent.vertices);
  const parentSide = Math.sign(
    (parentMiddle.x - flatStart.x) * perpendicular.x + (parentMiddle.y - flatStart.y) * perpendicular.y,
  );
  // Away from the parent: the same side would place the face back on top of it.
  const side = parentSide === 0 ? 1 : -parentSide;

  return corners.map((corner) => {
    const offset = subtract(corner, start);
    const along = dot(offset, axis);
    const out = dot(offset, across) * side;
    return {
      x: flatStart.x + hingeDirection.x * along + perpendicular.x * out,
      y: flatStart.y + hingeDirection.y * along + perpendicular.y * out,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Folding                                                                    */
/* -------------------------------------------------------------------------- */

/** Where a face's corners are, part-way through the fold. */
export interface FoldedFace3D {
  readonly faceId: string;
  readonly vertices: readonly Vector3[];
}

/**
 * The net part-way folded, at `t` from nought (flat) to one (the solid).
 *
 * <p><b>Every face's transform is its parent's, then a turn about its own
 * hinge.</b> That hierarchy is the whole thing: rotating a face carries
 * everything hanging off it, so the shape stays joined all the way through.
 * Interpolating each face independently from flat to folded would land them all
 * in the right places at one and nowhere near each other in between, which
 * looks like a shape exploding and reassembling rather than like folding.
 *
 * <p>The angle each hinge turns through is not measured off the solid with a
 * dot product. Each face has an exact rigid motion taking its flat copy to its
 * place in the solid, and a face's turn is its parent's motion undone and its
 * own applied - which necessarily fixes the edge they share, so it is a
 * rotation about the hinge, and its angle can be read straight out of it. That
 * removes the sign ambiguity a dihedral angle has, and it makes the fold exact
 * at `t = 1` by construction rather than by luck.
 */
export function foldSolidNet(
  net: UnfoldedNet,
  solid: SolidEntity,
  points: Record<string, GeometryPoint3D>,
  t: number,
): FoldedFace3D[] {
  const fraction = Math.min(1, Math.max(0, t));
  const byId = new Map(net.faces.map((face) => [face.faceId, face]));
  const solidFaces = new Map((solid.faces ?? []).map((face) => [face.id, face]));

  const transforms = new Map<string, Rigid>();
  const folded: FoldedFace3D[] = [];

  for (const placement of net.faces) {
    const face = solidFaces.get(placement.faceId);
    if (!face) continue;
    const solidCorners = face.pointIds.map((id) => {
      const point = points[id];
      return point ? { x: point.x, y: point.y, z: point.z } : null;
    });
    if (solidCorners.some((corner) => corner === null)) continue;
    const target = solidCorners as Vector3[];

    const flat = placement.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y, z: 0 }));
    const toSolid = rigidBetween(flat, target);

    let transform: Rigid;
    if (placement.parentFaceId === undefined) {
      // The root simply arrives where it is in the solid; at every `t` the rest
      // of the net is folded around it.
      transform = toSolid;
    } else {
      const parentPlacement = byId.get(placement.parentFaceId) as NetFacePlacement;
      const parentTransform = transforms.get(placement.parentFaceId) as Rigid;
      const parentFace = solidFaces.get(placement.parentFaceId) as SolidFace3D;
      const parentFlat = parentPlacement.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y, z: 0 }));
      const parentTarget = parentFace.pointIds.map((id) => {
        const point = points[id] as GeometryPoint3D;
        return { x: point.x, y: point.y, z: point.z };
      });
      const parentToSolid = rigidBetween(parentFlat, parentTarget);

      // The parent's motion undone, then this face's applied: a rotation, and
      // one that fixes the edge they share.
      const hingeTurn = compose(inverse(parentToSolid), toSolid);
      const hinge = hingeAxis(placement, parentPlacement);
      const angle = rotationAngleAbout(hingeTurn.rotation, hinge.direction);
      const partial = rotationAbout(hinge.point, hinge.direction, angle * fraction);
      transform = compose(parentTransform, partial);
    }

    transforms.set(placement.faceId, transform);
    folded.push({
      faceId: placement.faceId,
      vertices: flat.map((vertex) => apply(transform, vertex)),
    });
  }
  return folded;
}

/** The hinge as a point and a direction, in the flat net's own coordinates. */
function hingeAxis(
  placement: NetFacePlacement,
  parent: NetFacePlacement,
): { point: Vector3; direction: Vector3 } {
  const hinge = placement.hinge as readonly [string, string];
  const start = flatPositionOf(placement, hinge[0]) ?? flatPositionOf(parent, hinge[0]);
  const end = flatPositionOf(placement, hinge[1]) ?? flatPositionOf(parent, hinge[1]);
  if (!start || !end) {
    throw new KleinSdkError('invalid_net', 'A net face has lost the edge it hangs from.');
  }
  return {
    point: { x: start.x, y: start.y, z: 0 },
    direction: normalize({ x: end.x - start.x, y: end.y - start.y, z: 0 }),
  };
}

function flatPositionOf(placement: NetFacePlacement, pointId: string): Vector2 | undefined {
  const index = placement.pointIds.indexOf(pointId);
  return index < 0 ? undefined : placement.vertices[index];
}

/* -------------------------------------------------------------------------- */
/* The tree                                                                   */
/* -------------------------------------------------------------------------- */

interface NetTreeNode {
  readonly face: SolidFace3D;
  readonly parent?: string;
  readonly hinge?: readonly [string, string];
}

/**
 * Faces arranged so each hangs off one already placed.
 *
 * <p>Breadth-first from the first face, which spreads the net outwards rather
 * than trailing it into a strip - a strip of six squares is a valid net of a
 * cube and a bad one to cut out, and it is what a depth-first walk produces.
 *
 * <p>A face that shares no edge with anything already placed is left out, and
 * its absence is what a caller sees: a solid whose faces are not all connected
 * has no single net, and quietly dropping half of one would be worse than
 * saying so.
 */
function spanningTree(faces: readonly SolidFace3D[]): NetTreeNode[] {
  const shared = new Map<string, { faceId: string; edge: readonly [string, string] }[]>();
  for (const face of faces) {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const from = face.pointIds[index] as string;
      const to = face.pointIds[(index + 1) % face.pointIds.length] as string;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      const list = shared.get(key) ?? [];
      list.push({ faceId: face.id, edge: [from, to] });
      shared.set(key, list);
    }
  }

  const byId = new Map(faces.map((face) => [face.id, face]));
  const root = faces[0] as SolidFace3D;
  const nodes: NetTreeNode[] = [{ face: root }];
  const seen = new Set([root.id]);

  for (let cursor = 0; cursor < nodes.length; cursor += 1) {
    const current = (nodes[cursor] as NetTreeNode).face;
    for (let index = 0; index < current.pointIds.length; index += 1) {
      const from = current.pointIds[index] as string;
      const to = current.pointIds[(index + 1) % current.pointIds.length] as string;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      for (const neighbour of shared.get(key) ?? []) {
        if (neighbour.faceId === current.id || seen.has(neighbour.faceId)) continue;
        const face = byId.get(neighbour.faceId);
        if (!face) continue;
        seen.add(face.id);
        nodes.push({ face, parent: current.id, hinge: [from, to] });
      }
    }
  }
  return nodes;
}

/** Faces of the flat net that lie on top of one another. */
function findOverlaps(faces: readonly NetFacePlacement[]): (readonly [string, string])[] {
  const overlaps: (readonly [string, string])[] = [];
  for (let left = 0; left < faces.length; left += 1) {
    for (let right = left + 1; right < faces.length; right += 1) {
      const one = faces[left] as NetFacePlacement;
      const other = faces[right] as NetFacePlacement;
      if (polygonsOverlap(one.vertices, other.vertices)) overlaps.push([one.faceId, other.faceId]);
    }
  }
  return overlaps;
}

/**
 * Whether two flat faces share any area.
 *
 * <p>By the separating axis theorem, and only meaningful for convex faces -
 * which the faces of the solids this instrument builds are. Faces that merely
 * touch along the hinge they share are not overlapping, so the test is shrunk
 * slightly towards each centre before it is made.
 */
function polygonsOverlap(one: readonly Vector2[], other: readonly Vector2[]): boolean {
  const shrunk = [shrink(one), shrink(other)];
  for (const polygon of shrunk) {
    for (let index = 0; index < polygon.length; index += 1) {
      const from = polygon[index] as Vector2;
      const to = polygon[(index + 1) % polygon.length] as Vector2;
      const axis = { x: -(to.y - from.y), y: to.x - from.x };
      const first = project(shrunk[0] as Vector2[], axis);
      const second = project(shrunk[1] as Vector2[], axis);
      if (first.max <= second.min || second.max <= first.min) return false;
    }
  }
  return true;
}

function shrink(polygon: readonly Vector2[]): Vector2[] {
  const middle = centroid2(polygon);
  return polygon.map((point) => ({
    x: middle.x + (point.x - middle.x) * 0.999,
    y: middle.y + (point.y - middle.y) * 0.999,
  }));
}

function project(polygon: readonly Vector2[], axis: Vector2): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/* -------------------------------------------------------------------------- */
/* Rigid motions                                                              */
/* -------------------------------------------------------------------------- */

/** A rotation and a translation: `x -> R x + t`. */
interface Rigid {
  /** Row-major three by three. */
  readonly rotation: readonly number[];
  readonly translation: Vector3;
}

const IDENTITY: Rigid = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: { x: 0, y: 0, z: 0 } };

/**
 * The motion taking one copy of a face onto another.
 *
 * <p>Built from a frame on three corners rather than by a least-squares fit,
 * because the two copies are the same shape exactly - unfolding does not
 * stretch anything - so three corners determine it and a fit would only add
 * arithmetic and rounding.
 */
function rigidBetween(from: readonly Vector3[], to: readonly Vector3[]): Rigid {
  const source = faceFrame(from);
  const target = faceFrame(to);
  // R takes the source frame to the target frame, which for orthonormal frames
  // is the target's columns times the source's rows.
  const rotation = multiply(columns(target.e1, target.e2, target.e3), rows(source.e1, source.e2, source.e3));
  return {
    rotation,
    translation: subtract(target.origin, transform(rotation, source.origin)),
  };
}

interface Frame {
  origin: Vector3;
  e1: Vector3;
  e2: Vector3;
  e3: Vector3;
}

/** An orthonormal frame on a face, from its first three distinct corners. */
function faceFrame(corners: readonly Vector3[]): Frame {
  const origin = corners[0] as Vector3;
  let e1: Vector3 | null = null;
  let e2: Vector3 | null = null;
  for (let index = 1; index < corners.length; index += 1) {
    const offset = subtract(corners[index] as Vector3, origin);
    if (!e1) {
      if (length(offset) > 1e-9) e1 = normalize(offset);
      continue;
    }
    const perpendicular = subtract(offset, scale(e1, dot(offset, e1)));
    if (length(perpendicular) > 1e-9) { e2 = normalize(perpendicular); break; }
  }
  if (!e1 || !e2) {
    throw new KleinSdkError('invalid_net', 'A face has no area, so it has no net.');
  }
  return { origin, e1, e2, e3: cross(e1, e2) };
}

function centroid3(polygon: readonly Vector3[]): Vector3 {
  let total = { x: 0, y: 0, z: 0 };
  for (const point of polygon) total = add(total, point);
  return scale(total, 1 / polygon.length);
}

/** A rotation of `angle` about the line through `point` along `direction`. */
function rotationAbout(point: Vector3, direction: Vector3, angle: number): Rigid {
  const { x, y, z } = direction;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = 1 - c;
  // Rodrigues, written out: the alternative is building three matrices and
  // multiplying them, for the same nine numbers.
  const rotation = [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
  return { rotation, translation: subtract(point, transform(rotation, point)) };
}

/** The angle a rotation turns through about a known axis, with its sign. */
function rotationAngleAbout(rotation: readonly number[], axis: Vector3): number {
  const trace = (rotation[0] as number) + (rotation[4] as number) + (rotation[8] as number);
  const cosine = Math.min(1, Math.max(-1, (trace - 1) / 2));
  // The antisymmetric part is `sin(angle)` times the axis, so projecting it
  // back onto the axis recovers the sign a bare arccosine cannot.
  const sine = dot({
    x: ((rotation[7] as number) - (rotation[5] as number)) / 2,
    y: ((rotation[2] as number) - (rotation[6] as number)) / 2,
    z: ((rotation[3] as number) - (rotation[1] as number)) / 2,
  }, axis);
  return Math.atan2(sine, cosine);
}

function compose(outer: Rigid, inner: Rigid): Rigid {
  return {
    rotation: multiply(outer.rotation, inner.rotation),
    translation: add(transform(outer.rotation, inner.translation), outer.translation),
  };
}

function inverse(rigid: Rigid): Rigid {
  const rotation = transpose(rigid.rotation);
  return { rotation, translation: scale(transform(rotation, rigid.translation), -1) };
}

function apply(rigid: Rigid, point: Vector3): Vector3 {
  return add(transform(rigid.rotation, point), rigid.translation);
}

void IDENTITY;

/* -------------------------------------------------------------------------- */

function transform(rotation: readonly number[], point: Vector3): Vector3 {
  return {
    x: (rotation[0] as number) * point.x + (rotation[1] as number) * point.y + (rotation[2] as number) * point.z,
    y: (rotation[3] as number) * point.x + (rotation[4] as number) * point.y + (rotation[5] as number) * point.z,
    z: (rotation[6] as number) * point.x + (rotation[7] as number) * point.y + (rotation[8] as number) * point.z,
  };
}

function multiply(left: readonly number[], right: readonly number[]): number[] {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let total = 0;
      for (let index = 0; index < 3; index += 1) {
        total += (left[row * 3 + index] as number) * (right[index * 3 + column] as number);
      }
      out[row * 3 + column] = total;
    }
  }
  return out;
}

function transpose(matrix: readonly number[]): number[] {
  return [
    matrix[0] as number, matrix[3] as number, matrix[6] as number,
    matrix[1] as number, matrix[4] as number, matrix[7] as number,
    matrix[2] as number, matrix[5] as number, matrix[8] as number,
  ];
}

/** A matrix whose columns are the given vectors. */
function columns(one: Vector3, two: Vector3, three: Vector3): number[] {
  return [one.x, two.x, three.x, one.y, two.y, three.y, one.z, two.z, three.z];
}

/** A matrix whose rows are the given vectors. */
function rows(one: Vector3, two: Vector3, three: Vector3): number[] {
  return [one.x, one.y, one.z, two.x, two.y, two.z, three.x, three.y, three.z];
}

const add = (one: Vector3, other: Vector3): Vector3 =>
  ({ x: one.x + other.x, y: one.y + other.y, z: one.z + other.z });
const subtract = (one: Vector3, other: Vector3): Vector3 =>
  ({ x: one.x - other.x, y: one.y - other.y, z: one.z - other.z });
const scale = (one: Vector3, by: number): Vector3 => ({ x: one.x * by, y: one.y * by, z: one.z * by });
const dot = (one: Vector3, other: Vector3): number => one.x * other.x + one.y * other.y + one.z * other.z;
const cross = (one: Vector3, other: Vector3): Vector3 => ({
  x: one.y * other.z - one.z * other.y,
  y: one.z * other.x - one.x * other.z,
  z: one.x * other.y - one.y * other.x,
});
const length = (one: Vector3): number => Math.hypot(one.x, one.y, one.z);

function normalize(one: Vector3): Vector3 {
  const size = length(one);
  if (size < 1e-12) throw new KleinSdkError('invalid_net', 'A net edge has no length.');
  return scale(one, 1 / size);
}

function normalize2(one: Vector2): Vector2 {
  const size = Math.hypot(one.x, one.y);
  if (size < 1e-12) throw new KleinSdkError('invalid_net', 'A net edge has no length.');
  return { x: one.x / size, y: one.y / size };
}

function centroid2(polygon: readonly Vector2[]): Vector2 {
  let x = 0;
  let y = 0;
  for (const point of polygon) { x += point.x; y += point.y; }
  return { x: x / polygon.length, y: y / polygon.length };
}
