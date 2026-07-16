import {
  createGeometryCalculator,
  createGeometryLab,
  createLocalStorageSessionAdapter,
  loadInstrumentSession,
  migrateSnapshot,
  parseGeometryCalculatorSnapshotJson,
  parseGeometryLabSnapshotJson,
  saveInstrumentSession,
  validateInstrumentSnapshot,
} from '../dist/index.js';

const geometry = createGeometryCalculator({ showControls: false });
const firstPointId = geometry.addPoint({ x: 0, y: 0 });
const secondPointId = geometry.addPoint({ x: 3, y: 4 });
geometry.addLineByPoints(firstPointId, secondPointId);

const jsonExport = await geometry.export({ format: 'json', includeAppState: false });
const snapshotValidation = validateInstrumentSnapshot(geometry.getSnapshot());
if (!snapshotValidation.ok) throw new Error('Geometry snapshot validation failed.');

const parsedGeometry = parseGeometryCalculatorSnapshotJson(JSON.stringify(geometry.getSnapshot()));
const importedGeometry = createGeometryCalculator({ showControls: false });
importedGeometry.importJson(JSON.stringify(parsedGeometry));

const svgExport = await geometry.export({
  format: 'svg',
  width: 640,
  height: 480,
  background: 'white',
  includeGrid: true,
  includeMeasurements: true,
});
const transparentSvg = await geometry.export({
  format: 'svg',
  width: 320,
  height: 240,
  background: 'transparent',
  includeGrid: false,
  includeMeasurements: false,
});
const pdfExport = await geometry.export({ format: 'pdf', width: 640, height: 480 });
if (jsonExport.format !== 'json') throw new Error('JSON export failed.');
if (svgExport.format !== 'svg' || !svgExport.data.includes('<svg') || !svgExport.data.includes('#ffffff')) {
  throw new Error('SVG export failed.');
}
if (transparentSvg.data.includes('width="100%" height="100%" fill=')) {
  throw new Error('Transparent SVG export includes a background fill.');
}
if (pdfExport.format !== 'pdf' || pdfExport.data.type !== 'application/pdf' || pdfExport.data.size < 100) {
  throw new Error('PDF export failed.');
}

const lab = createGeometryLab();
const labPointA = lab.addPoint3D({ x: 0, y: 0, z: 0 });
const labPointB = lab.addPoint3D({ x: 1, y: 0, z: 0 });
const labPointC = lab.addPoint3D({ x: 0, y: 1, z: 0 });
lab.addWorkPlaneByThreePoints([labPointA, labPointB, labPointC]);
const labJsonExport = await lab.export({ format: 'json', includeAppState: false });
const parsedLab = parseGeometryLabSnapshotJson(JSON.stringify(lab.getSnapshot()));
lab.importJson(JSON.stringify(parsedLab));
if (labJsonExport.format !== 'json') throw new Error('Geometry Lab JSON export failed.');

const adapter = createLocalStorageSessionAdapter({ namespace: 'phase6-smoke' });
const savedRevisionOne = await saveInstrumentSession(geometry, adapter, { sessionId: 'session-1' });
const savedRevisionTwo = await saveInstrumentSession(geometry, adapter, {
  sessionId: 'session-1',
  expectedRevision: savedRevisionOne.revision,
});
let conflictDetected = false;
try {
  await saveInstrumentSession(geometry, adapter, {
    sessionId: 'session-1',
    expectedRevision: savedRevisionOne.revision,
  });
} catch (error) {
  conflictDetected = error?.code === 'revision_conflict';
}

const loadedSession = await loadInstrumentSession(importedGeometry, adapter, 'session-1');
const migratedSnapshot = migrateSnapshot(
  { version: 1, instrument: 'test', scene: {} },
  [{
    instrument: 'test',
    fromVersion: 1,
    toVersion: 2,
    migrate: snapshot => ({ ...snapshot, version: 2 }),
  }],
  2,
);

if (!loadedSession) throw new Error('Persisted session did not load.');
if (savedRevisionTwo.revision !== 2) throw new Error('Session revision did not increment.');
if (!conflictDetected) throw new Error('Revision conflict was not detected.');
if (migratedSnapshot.version !== 2) throw new Error('Snapshot migration failed.');

console.log(JSON.stringify({
  geometryImport: importedGeometry.getSnapshot().instrument,
  labImport: lab.getSnapshot().instrument,
  svgBytes: svgExport.data.length,
  pdfBytes: pdfExport.data.size,
  savedRevision: savedRevisionTwo.revision,
  conflict: conflictDetected,
  migrated: migratedSnapshot.version,
}));
