/**
 * Cross-sections that change shape, and cascade through 3D constructions
 * (plan tasks 1.4 and 1.5).
 *
 * <p>A section's shape changes as its plane travels through the solid: a cube
 * cut flat gives a square, cut across the space diagonal a hexagon. Sliding the
 * plane to watch precisely that happen is the activity the tool exists for, and
 * it used to fail: each vertex carries a persistent point identity, and there
 * was no rule for matching four old identities to six new ones, so the edit was
 * rejected as `cross_section_topology_changed`.
 *
 * <p>The rule now is to keep the identities that still have a vertex, name new
 * ones deterministically from the section, and drop the surplus. Deterministic
 * matters more than it looks: canonicalization has to be a pure function of the
 * snapshot, because two collaborating peers replay the same delta and must
 * arrive at the same ids.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

/** A cube spanning -2..2 with a movable plane cutting it, flat at z = 0. */
function slicedCube() {
  const lab = createGeometryLab();
  const cube = lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 4);
  const corners = [
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 1, z: 0 }),
  ];
  const plane = lab.addWorkPlaneByThreePoints(corners);
  const section = lab.addCrossSection(cube, plane);
  return { lab, cube, plane, corners, section };
}

const sectionOf = (lab, id) => lab.peekSnapshot().scene.scene3d.entities[id];

/** Tilts the plane onto the cube's space diagonal, where the section is a hexagon. */
function tiltToDiagonal(lab, corners) {
  lab.applyDelta({ op: 'updatePoint', id: corners[1], changes: { x: 1, y: 0, z: 1 } });
  lab.applyDelta({ op: 'updatePoint', id: corners[2], changes: { x: 0, y: 1, z: 1 } });
}

/* -------------------------------------------------------------------------- */
/* Topology may change                                                        */
/* -------------------------------------------------------------------------- */

test('a flat cut of a cube is a square', () => {
  const { lab, section } = slicedCube();
  const cut = sectionOf(lab, section);
  assert.equal(cut.vertices.length, 4);
  assert.equal(Math.round(cut.area * 1e6) / 1e6, 16);
});

test('tilting the plane onto the space diagonal turns the square into a hexagon', () => {
  const { lab, corners, section } = slicedCube();
  assert.equal(sectionOf(lab, section).vertices.length, 4);

  tiltToDiagonal(lab, corners);

  const cut = sectionOf(lab, section);
  assert.equal(cut.vertices.length, 6, 'the section must be allowed to change shape');
  assert.equal(cut.pointIds.length, 6, 'and to own one point per vertex');
  assert.ok(cut.area > 0);
});

test('a section that grew shrinks back again', () => {
  const { lab, corners, section } = slicedCube();
  tiltToDiagonal(lab, corners);
  assert.equal(sectionOf(lab, section).vertices.length, 6);

  lab.applyDelta({ op: 'updatePoint', id: corners[1], changes: { x: 1, y: 0, z: 0 } });
  lab.applyDelta({ op: 'updatePoint', id: corners[2], changes: { x: 0, y: 1, z: 0 } });

  const cut = sectionOf(lab, section);
  assert.equal(cut.vertices.length, 4);
  assert.equal(cut.pointIds.length, 4, 'surplus vertex points are dropped, not left orphaned');
  assert.equal(Math.round(cut.area * 1e6) / 1e6, 16);
});

test('surplus vertex points are removed from the scene, not merely unlisted', () => {
  const { lab, corners, section } = slicedCube();
  tiltToDiagonal(lab, corners);
  const sixIds = sectionOf(lab, section).pointIds;

  lab.applyDelta({ op: 'updatePoint', id: corners[1], changes: { x: 1, y: 0, z: 0 } });
  lab.applyDelta({ op: 'updatePoint', id: corners[2], changes: { x: 0, y: 1, z: 0 } });

  const scene = lab.peekSnapshot().scene.scene3d;
  const remaining = sectionOf(lab, section).pointIds;
  for (const id of sixIds) {
    if (remaining.includes(id)) continue;
    assert.equal(scene.points[id], undefined, `dropped vertex ${id} must not linger in the scene`);
  }
});

test('identities survive a move that does not change the shape', () => {
  const { lab, corners, section } = slicedCube();
  const before = sectionOf(lab, section).pointIds;

  for (const id of corners) lab.applyDelta({ op: 'updatePoint', id, changes: { z: 1.5 } });

  const cut = sectionOf(lab, section);
  assert.deepEqual(cut.pointIds, before, 'a section that only slid keeps every vertex identity');
  assert.equal(Math.round(cut.area * 1e6) / 1e6, 16);
});

test('generated vertex ids are deterministic, so peers replaying an edit agree', () => {
  const build = () => {
    const { lab, corners, section } = slicedCube();
    tiltToDiagonal(lab, corners);
    return sectionOf(lab, section).pointIds.filter(id => id.includes('~v'));
  };
  const first = build();
  assert.ok(first.length > 0, 'the hexagon needed new vertices');
  // Ids embed the section id, which differs per instrument, so compare shapes.
  assert.deepEqual(
    build().map(id => id.slice(id.indexOf('~v'))),
    first.map(id => id.slice(id.indexOf('~v'))),
    'the same edit must generate the same vertex names',
  );
});

test('a plane slid off the solid is rejected rather than leaving an empty section', () => {
  const { lab, corners, section } = slicedCube();
  const before = sectionOf(lab, section).vertices.length;
  assert.throws(
    () => { for (const id of corners) lab.applyDelta({ op: 'updatePoint', id, changes: { z: 9 } }); },
    error => error.code === 'invalid_delta_result',
    'a section with nothing to cut is not a section',
  );
  assert.equal(sectionOf(lab, section).vertices.length, before);
});

test('a section still refuses duplicate vertex identities', () => {
  const { lab, section } = slicedCube();
  const cut = sectionOf(lab, section);
  assert.throws(
    () => lab.applyDelta({
      op: 'updateEntity',
      id: section,
      changes: { pointIds: [cut.pointIds[0], cut.pointIds[0], cut.pointIds[1], cut.pointIds[2]] },
    }),
    error => error.code === 'invalid_delta_result',
  );
});

/* -------------------------------------------------------------------------- */
/* Cascade through the 3D construction edges (task 1.5)                       */
/* -------------------------------------------------------------------------- */

test('deleting the plane takes the section, and leaves the solid', () => {
  const { lab, cube, plane, section } = slicedCube();
  lab.remove(plane);
  const scene = lab.peekSnapshot().scene.scene3d;
  assert.equal(scene.entities[section], undefined, 'a section cannot outlive the plane that cuts it');
  assert.ok(scene.entities[cube], 'but the solid is not derived from the plane and stays');
});

test('deleting a grown section removes every vertex point it acquired', () => {
  const { lab, corners, section } = slicedCube();
  tiltToDiagonal(lab, corners);
  const owned = sectionOf(lab, section).pointIds;
  assert.equal(owned.length, 6);

  lab.remove(section);

  const scene = lab.peekSnapshot().scene.scene3d;
  for (const id of owned) {
    assert.equal(scene.points[id], undefined, `vertex ${id} outlived its section`);
  }
});

test('deleting the source line removes the intersection derived from it', () => {
  const lab = createGeometryLab();
  const line = lab.addLine3D(lab.addPoint3D({ x: 2, y: 3, z: -5 }), lab.addPoint3D({ x: 2, y: 3, z: 5 }));
  const hit = lab.addLinePlaneIntersection(line, 'xy');
  lab.remove(line);
  assert.equal(lab.peekSnapshot().scene.scene3d.points[hit], undefined);
});

test('deleting either plane removes the whole plane-plane intersection', () => {
  for (const which of [0, 1]) {
    const lab = createGeometryLab();
    const planes = [
      lab.addWorkPlaneByEquation({ a: 0, b: 1, c: 0, d: 0 }),
      lab.addWorkPlaneByEquation({ a: 1, b: 0, c: 0, d: 0 }),
    ];
    const line = lab.addPlanePlaneIntersection(planes[0], planes[1]);
    const ends = lab.peekSnapshot().scene.scene3d.entities[line].pointIds;

    lab.remove(planes[which]);

    const scene = lab.peekSnapshot().scene.scene3d;
    assert.equal(scene.entities[line], undefined, `deleting plane ${which} must remove the line`);
    for (const id of ends) {
      assert.equal(scene.points[id], undefined, `endpoint ${id} outlived plane ${which}`);
    }
  }
});

test('deleting a source point cascades through the plane to the section', () => {
  const { lab, corners, section, plane } = slicedCube();
  lab.remove(corners[0]);
  const scene = lab.peekSnapshot().scene.scene3d;
  assert.equal(scene.workPlanes[plane], undefined, 'the plane lost a defining point');
  assert.equal(scene.entities[section], undefined, 'and the section lost its plane');
});
