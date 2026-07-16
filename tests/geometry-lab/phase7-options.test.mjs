import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
} from '../../dist/geometry-lab/index.js';

test('initialView initializes every supported host-facing view mode', () => {
  for (const initialView of ['2d', '3d', 'split']) {
    const lab = createGeometryLab({ initialView });
    assert.equal(lab.getSnapshot().appState.activeView, initialView);
  }
});

test('an initial snapshot remains authoritative over initialView', () => {
  const initialSnapshot = createEmptyGeometryLabSnapshot();
  initialSnapshot.appState.activeView = 'split';

  const lab = createGeometryLab({ initialSnapshot, initialView: '3d' });

  assert.equal(lab.getSnapshot().appState.activeView, 'split');
});

test('invalid initialView values are rejected at the JavaScript boundary', () => {
  assert.throws(
    () => createGeometryLab({ initialView: 'side-by-side' }),
    error => error?.code === 'invalid_geometry_lab_option',
  );
});

test('removed renderer and snapping options fail loudly instead of being ignored', () => {
  for (const options of [
    { renderer3d: 'svg' },
    { renderer3d: 'webgl' },
    { snapEnabled: true },
    { snapEnabled: false },
  ]) {
    assert.throws(
      () => createGeometryLab(options),
      error => error?.code === 'unsupported_geometry_lab_option',
    );
  }
});
