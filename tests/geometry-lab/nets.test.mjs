/**
 * Nets, and folding one back into its solid (plan task 6.5).
 *
 * <p>`GeometrySceneLink` declared a `netToSolid` kind from the beginning with
 * nothing on either end of it, and what the instrument called a net was a row
 * of faces: each one projected flat on its own and set out side by side with a
 * gap between them. That is a contact sheet. A net's faces are joined along the
 * edges they share, and those joins are the hinges - without them there is
 * nothing to fold, which is why nothing folded.
 *
 * <p>Two properties carry these tests. At `t = 1` the fold has to *be* the
 * solid, to the last decimal place a double holds - anything less and the shape
 * a student watches close does not quite close. And at every `t` in between the
 * hinges have to stay joined, which is what makes it a fold rather than six
 * faces animating separately into place.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab, unfoldSolidNet } from '../../dist/geometry-lab/index.js';

function netted(build) {
  const lab = createGeometryLab();
  const solidId = build(lab);
  const netId = lab.createUnfoldedNet(solidId);
  const scene = lab.peekSnapshot().scene.scene3d;
  return { lab, solidId, netId, solid: scene.entities[solidId], points: scene.points };
}

const cube = () => netted(lab => lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2));
const net = (lab, id) => lab.peekSnapshot().scene.scene3d.nets[id];

/** The largest distance between where the fold puts a corner and where the solid has it. */
function distanceFromSolid({ lab, netId, solid, points }, t = 1) {
  let worst = 0;
  for (const face of lab.foldNet(netId, t)) {
    const source = solid.faces.find(candidate => candidate.id === face.faceId);
    source.pointIds.forEach((pointId, index) => {
      const point = points[pointId];
      const at = face.vertices[index];
      worst = Math.max(worst, Math.hypot(at.x - point.x, at.y - point.y, at.z - point.z));
    });
  }
  return worst;
}

/** The largest gap along any hinge, which is what has to stay closed. */
function hingeGap({ lab, netId, solid, points }, t) {
  const unfolded = unfoldSolidNet(solid, points);
  const folded = new Map(lab.foldNet(netId, t).map(face => [face.faceId, face.vertices]));
  const faceOf = (id) => solid.faces.find(candidate => candidate.id === id);
  let worst = 0;
  for (const placement of unfolded.faces) {
    if (!placement.parentFaceId) continue;
    const child = folded.get(placement.faceId);
    const parent = folded.get(placement.parentFaceId);
    for (const pointId of placement.hinge) {
      const one = child[faceOf(placement.faceId).pointIds.indexOf(pointId)];
      const other = parent[faceOf(placement.parentFaceId).pointIds.indexOf(pointId)];
      worst = Math.max(worst, Math.hypot(one.x - other.x, one.y - other.y, one.z - other.z));
    }
  }
  return worst;
}

/* -------------------------------------------------------------------------- */
/* A net that is a net                                                        */
/* -------------------------------------------------------------------------- */

test('a cube unfolds into six squares that touch', () => {
  const { lab, netId } = cube();
  const faces = net(lab, netId).faces;
  assert.equal(faces.length, 6);
  assert.equal(net(lab, netId).totalArea, 24, 'six faces of a two-unit cube');

  // Every face after the first shares a whole edge with one already placed -
  // which is the difference between a net and a row of faces.
  const placed = [];
  for (const face of faces) {
    if (placed.length > 0) {
      const touches = placed.some(other => sharedEdge(other.vertices, face.vertices));
      assert.ok(touches, `${face.sourceFaceId} is not joined to anything`);
    }
    placed.push(face);
  }
});

test('the faces of a cube net do not overlap', () => {
  const { lab, netId } = cube();
  assert.deepEqual(lab.netOverlaps(netId), []);
});

test('a net covers exactly the area of the solid it came from', () => {
  for (const [name, build] of [
    ['cube', lab => lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2)],
    ['tetrahedron', lab => lab.addPolyhedron('tetrahedron', { x: 0, y: 0, z: 0 }, 2)],
    ['pyramid', lab => lab.addPyramid([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }], 2)],
  ]) {
    const figure = netted(build);
    const area = net(figure.lab, figure.netId).totalArea;
    const surface = figure.lab.measureSurfaceArea(figure.solidId);
    assert.ok(Math.abs(area - surface) < 1e-9, `${name}: net area ${area} against surface area ${surface}`);
  }
});

/* -------------------------------------------------------------------------- */
/* The fold                                                                   */
/* -------------------------------------------------------------------------- */

test('folded all the way, the net is the solid', () => {
  // To the last decimal place a double holds. Anything less and the shape a
  // student watches close does not quite close.
  for (const build of [
    lab => lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2),
    lab => lab.addPolyhedron('tetrahedron', { x: 0, y: 0, z: 0 }, 2),
    lab => lab.addPrism([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }], 2),
    lab => lab.addPyramid([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }], 2),
  ]) {
    assert.ok(distanceFromSolid(netted(build)) < 1e-9);
  }
});

test('unfolded all the way, the net is flat', () => {
  const figure = cube();
  const folded = figure.lab.foldNet(figure.netId, 0);
  const planes = new Set(folded.flatMap(face => face.vertices.map(vertex => Math.round(vertex.z * 1e9))));
  assert.equal(planes.size, 1, 'every corner in one plane');
});

test('the hinges stay joined the whole way through', () => {
  // What makes it a fold rather than six faces animating separately into
  // place: rotating a face carries everything hanging off it.
  const figure = cube();
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.ok(hingeGap(figure, t) < 1e-9, `at t=${t} a hinge came apart`);
  }
});

test('a face keeps its shape all the way through, because a fold is rigid', () => {
  const figure = cube();
  const sideLengths = (vertices) => vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return Math.round(Math.hypot(next.x - vertex.x, next.y - vertex.y, next.z - vertex.z) * 1e6) / 1e6;
  });
  const flat = new Map(figure.lab.foldNet(figure.netId, 0).map(face => [face.faceId, sideLengths(face.vertices)]));
  for (const t of [0.3, 0.6, 1]) {
    for (const face of figure.lab.foldNet(figure.netId, t)) {
      assert.deepEqual(sideLengths(face.vertices), flat.get(face.faceId), `${face.faceId} changed shape at t=${t}`);
    }
  }
});

test('the fold is clamped rather than extrapolated past its ends', () => {
  const figure = cube();
  const before = figure.lab.foldNet(figure.netId, 0);
  const after = figure.lab.foldNet(figure.netId, 1);
  assert.deepEqual(figure.lab.foldNet(figure.netId, -3), before);
  assert.deepEqual(figure.lab.foldNet(figure.netId, 7), after);
});

test('nothing about the fold is stored', () => {
  // A host animates a fold by asking for it sixty times a second; putting the
  // states in between into the document would send every frame of it through
  // undo and every collaborative message.
  const figure = cube();
  const before = JSON.stringify(figure.lab.getSnapshot());
  figure.lab.foldNet(figure.netId, 0.5);
  assert.equal(JSON.stringify(figure.lab.getSnapshot()), before);
});

test('a stale net is rebuilt from the solid rather than believed', () => {
  // The net is derived, like everything else derived here: a saved file whose
  // net no longer matches its solid is corrected on the way in, not shown.
  const figure = cube();
  const saved = JSON.parse(JSON.stringify(figure.lab.getSnapshot()));
  saved.scene.scene3d.nets[figure.netId].faces = [{
    id: 'nonsense',
    sourceFaceId: 'face-1',
    vertices: [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 99, y: 99 }],
    area: 4900.5,
  }];
  saved.scene.scene3d.nets[figure.netId].totalArea = 4900.5;

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  const rebuilt = net(reopened, figure.netId);
  assert.equal(rebuilt.faces.length, 6);
  assert.equal(rebuilt.totalArea, 24);
  assert.ok(distanceFromSolid({
    lab: reopened,
    netId: figure.netId,
    solid: reopened.peekSnapshot().scene.scene3d.entities[figure.solidId],
    points: reopened.peekSnapshot().scene.scene3d.points,
  }) < 1e-9, 'and it folds back into the solid it actually has');
});

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

test('folding a net that is not there is refused', () => {
  const lab = createGeometryLab();
  assert.throws(() => lab.foldNet('ghost', 0.5), error => error.code === 'missing_net');
  assert.throws(() => lab.netOverlaps('ghost'), error => error.code === 'missing_net');
});

test('a solid with no faces has no net', () => {
  assert.throws(
    () => unfoldSolidNet({ id: 's', kind: 'solid', solid: 'cube', pointIds: [], faceIds: [], faces: [] }, {}),
    error => error.code === 'invalid_net',
  );
});

test('overlaps are reported rather than promised away', () => {
  // Whether every convex polyhedron even has a non-overlapping unfolding is an
  // open question, so a promise not to overlap is one this cannot keep. What it
  // can do is say when it happened.
  const { lab, netId } = cube();
  assert.ok(Array.isArray(lab.netOverlaps(netId)));
});

/** Whether two flat faces share a whole edge, which is what being joined means. */
function sharedEdge(one, other) {
  const same = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
  for (let index = 0; index < one.length; index += 1) {
    const from = one[index];
    const to = one[(index + 1) % one.length];
    for (let other_ = 0; other_ < other.length; other_ += 1) {
      const start = other[other_];
      const end = other[(other_ + 1) % other.length];
      if ((same(from, start) && same(to, end)) || (same(from, end) && same(to, start))) return true;
    }
  }
  return false;
}
