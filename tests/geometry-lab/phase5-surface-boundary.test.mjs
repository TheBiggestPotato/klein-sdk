import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

test('surface creation rejects a finite vertex cloud with no valid cells atomically', () => {
  const lab = createGeometryLab();
  const before = lab.getSnapshot();

  assert.throws(
    () => lab.addSurfaceZ({
      xRange: [-1, 1],
      yRange: [-1, 1],
      xSamples: 2,
      ySamples: 2,
      z(x, y) {
        if (Math.abs(x) === 1 && Math.abs(y) === 1) return 0;
        throw new Error('outside callback domain');
      },
    }),
    error => error?.code === 'invalid_surface',
  );
  assert.deepEqual(lab.getSnapshot(), before);
});
