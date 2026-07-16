import {
  createClassroomPolicy,
  createClassroomRuntime,
  createDeltaMessage,
  createEmbedUrl,
  createEmptyGraphing3DSnapshot,
  createGeometryLabRuntime,
  createGraphing3DCalculator,
  createExamController,
  createKleinToolRuntime,
  createGraphing3DRuntime,
  createKleinStorageAdapter,
  createLocalStorageSessionAdapter,
  KLEIN_V0_TOOLS,
  applyWhiteboardDelta,
  compactWhiteboardDeltas,
  createCompactedWhiteboardDelta,
  createWhiteboardEmbeddedCardElement,
  createWhiteboardPresenceOverlay,
  exportWhiteboardFrameSvg,
  exportWhiteboardSvg,
  getWhiteboardToolDefinitions,
  normalizeKleinToolKey,
  createProbabilityRuntime,
  createScientificCalculatorRuntime,
  createWhiteboardRuntime,
  getKleinToolThemeCssVariables,
  resolveKleinToolTheme,
  validateWhiteboardSnapshot,
  parseEmbedSearchParams,
  verifyEmbeddedLaunchContext,
} from '../dist/index.js';

const customToolTheme = resolveKleinToolTheme({
  name: 'host-brand',
  primary: '#123456',
  accent: '#789abc',
});
const customToolVariables = getKleinToolThemeCssVariables(customToolTheme);
if (customToolTheme.primary !== '#123456' || customToolTheme.accent !== '#789abc' || customToolVariables['--klein-tool-primary'] !== '#123456') {
  throw new Error('Host tool theme resolution failed.');
}

const scientific = createScientificCalculatorRuntime();
const calculation = scientific.execute({ type: 'calculate', payload: '2 + 2' });
if (!calculation.ok || calculation.payload !== '4') {
  throw new Error(`Scientific calculator smoke failed: ${JSON.stringify(calculation)}`);
}

const probability = createProbabilityRuntime();
const probabilityDelta = {
  op: 'addDistribution',
  distribution: {
    id: 'normal-1',
    kind: 'normal',
    parameters: { mean: 0, sd: 1 },
  },
};
const probabilityResult = probability.applyDelta(probabilityDelta, {
  id: 'delta-probability',
  createdAt: 1,
  source: 'local',
});
if (!probabilityResult.ok || probability.getSnapshot().scene.order.length !== 1) {
  throw new Error('Probability runtime smoke failed.');
}

const whiteboard = createWhiteboardRuntime();
const classroom = createClassroomRuntime({
  context: {
    scope: { classId: 'class-a', assignmentId: 'assignment-a', studentId: 'student-a' },
    role: 'student',
    mode: 'student-work',
    actorId: 'student-a',
  },
  tool: whiteboard,
  policy: createClassroomPolicy({
    role: 'student',
    mode: 'student-work',
  }),
  storage: createKleinStorageAdapter(createLocalStorageSessionAdapter()),
});
const classroomDelta = {
  op: 'add',
  element: {
    id: 'shape-a',
    type: 'shape',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    strokeColor: '#172033',
    strokeWidth: 2,
  },
};
const classroomResult = await classroom.applyStudentDelta(classroomDelta, {
  id: 'delta-classroom',
  actorId: 'student-a',
  createdAt: 2,
  source: 'local',
});
if (!classroomResult.ok) throw new Error('Classroom runtime did not accept editable student delta.');
const saved = await classroom.saveDraft();
if (saved.revision !== 1) throw new Error(`Unexpected classroom draft revision: ${saved.revision}`);

const whiteboardFrame = {
  id: 'frame-a',
  type: 'frame',
  title: 'Lesson frame',
  x: -20,
  y: -20,
  width: 260,
  height: 180,
  color: '#3157d5',
};
const whiteboardCard = createWhiteboardEmbeddedCardElement({
  id: 'card-a',
  toolKey: 'graphing',
  title: 'Graphing result',
  x: 24,
  y: 28,
  summary: 'y = x^2',
  snapshot: { version: 1, instrument: 'graphing' },
});
let whiteboardSnapshot = whiteboard.getSnapshot();
whiteboardSnapshot = applyWhiteboardDelta(whiteboardSnapshot, { op: 'add', element: whiteboardFrame, index: 0 });
whiteboardSnapshot = applyWhiteboardDelta(whiteboardSnapshot, { op: 'add', element: whiteboardCard });
if (!validateWhiteboardSnapshot(whiteboardSnapshot).ok) throw new Error('Whiteboard strengthened snapshot validation rejected a valid scene.');
const invalidWhiteboard = validateWhiteboardSnapshot({
  ...whiteboardSnapshot,
  scene: {
    elements: {
      bad: { id: 'bad', type: 'shape', shape: 'rectangle', x: 0, y: 0, width: -1, height: 20, strokeColor: '#000', strokeWidth: 1 },
    },
    order: ['bad'],
  },
});
if (invalidWhiteboard.ok) throw new Error('Whiteboard validation accepted an invalid shape.');
const frameSvg = exportWhiteboardFrameSvg(whiteboardSnapshot, 'frame-a', { includeGrid: false });
if (!frameSvg.includes('<svg') || !frameSvg.includes('Graphing result')) throw new Error('Whiteboard frame SVG export failed.');
const fullSvg = exportWhiteboardSvg(whiteboardSnapshot, { includeGrid: false });
if (!fullSvg.includes('Lesson frame')) throw new Error('Whiteboard full SVG export failed.');
const compactedWhiteboardDeltas = compactWhiteboardDeltas([
  { op: 'setView', view: { x: 0, y: 0, zoom: 1 } },
  { op: 'setView', view: { x: 10, y: 20, zoom: 2 } },
  { op: 'update', id: 'shape-a', changes: { x: 12 } },
  { op: 'update', id: 'shape-a', changes: { y: 18 } },
  { op: 'add', element: { id: 'temp-a', type: 'sticky', x: 0, y: 0, text: 'remove', color: '#fef08a', width: 80, height: 60 } },
  { op: 'delete', ids: ['temp-a'] },
]);
if (compactedWhiteboardDeltas.length !== 2 || compactedWhiteboardDeltas[0]?.op !== 'setView' || compactedWhiteboardDeltas[1]?.op !== 'update') {
  throw new Error(`Whiteboard delta compaction failed: ${JSON.stringify(compactedWhiteboardDeltas)}`);
}
const compactedBatch = createCompactedWhiteboardDelta(compactedWhiteboardDeltas);
if (compactedBatch.op !== 'batch') throw new Error('Whiteboard compacted batch helper failed.');
const overlay = createWhiteboardPresenceOverlay(whiteboardSnapshot, {
  actorId: 'teacher-a',
  displayName: 'Teacher',
  selection: [{ kind: 'whiteboard-element', id: 'shape-a' }],
});
if (overlay.selectionBounds.length !== 1) throw new Error('Whiteboard presence overlay did not resolve selected bounds.');
const whiteboardTools = getWhiteboardToolDefinitions();
if (!whiteboardTools.some(tool => tool.id === 'pen' && tool.shortcut === 'p')) throw new Error('Whiteboard tool definitions are missing pen metadata.');

let largeWhiteboard = whiteboardSnapshot;
const largeBoardDeltas = [];
for (let index = 0; index < 240; index += 1) {
  largeBoardDeltas.push({
    op: 'add',
    element: {
      id: `large-${index}`,
      type: 'shape',
      shape: 'rectangle',
      x: (index % 24) * 42,
      y: Math.floor(index / 24) * 34,
      width: 30,
      height: 22,
      strokeColor: '#5f6c7d',
      strokeWidth: 1,
    },
  });
}
largeWhiteboard = applyWhiteboardDelta(largeWhiteboard, { op: 'batch', deltas: largeBoardDeltas });
const largeStart = Date.now();
const largeSvg = exportWhiteboardSvg(largeWhiteboard, { includeGrid: false, width: 1200, height: 800 });
if (!largeSvg.includes('large-239') || Date.now() - largeStart > 2500) throw new Error('Whiteboard large-board SVG smoke exceeded the v0 budget.');

const exam = createExamController({
  profile: {
    id: 'exam-basic',
    allowedTools: ['graphing', 'scientific'],
    disabledFeatures: ['export'],
    allowCollaboration: false,
    allowExport: false,
    allowImport: false,
    allowExternalLinks: false,
    requireFullscreen: false,
    requireSnapshotSigning: false,
  },
  toolKey: 'graphing',
  sessionId: 'exam-session-a',
  actorId: 'student-a',
});
await exam.start();
const blocked = exam.canExecute({ type: 'export', feature: 'export' });
if (blocked.allowed) throw new Error('Exam policy failed to block export.');
exam.recordIntegrityEvent({ kind: 'window-blurred', severity: 'warning' });
if (exam.getEventLog().length < 2) throw new Error('Exam event log did not record expected events.');

const embedUrl = createEmbedUrl({
  baseUrl: 'https://example.test',
  context: {
    platform: 'web',
    tool: 'graphing',
    mode: 'exam',
    roomId: 'room-a',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: 'test-signature',
  },
});
const parsed = parseEmbedSearchParams(new URL(embedUrl).searchParams);
const verified = await verifyEmbeddedLaunchContext({
  context: parsed,
  verifySignature: context => context.signature === 'test-signature',
});
if (!verified.ok || parsed.mode !== 'exam') throw new Error('Embed exam launch verification failed.');

const collabMessage = createDeltaMessage({
  sessionId: 'room-a',
  toolKey: 'whiteboard',
  deltaId: 'delta-a',
  baseRevision: 1,
  delta: classroomDelta,
});
if (collabMessage.type !== 'delta' || collabMessage.toolKey !== 'whiteboard') {
  throw new Error('Collab message smoke failed.');
}

const graphing3d = createGraphing3DRuntime();
const graphing3dValidation = graphing3d.validateSnapshot(createEmptyGraphing3DSnapshot());
if (!graphing3dValidation.ok) throw new Error('3D calculator runtime validation failed.');
const graphing3dCube = graphing3d.execute({ type: 'addCube', payload: { size: 2, label: 'Cube A', color: '#3157d5' } });
if (!graphing3dCube.ok) throw new Error(`3D cube command failed: ${graphing3dCube.error.message}`);
const graphing3dSurface = graphing3d.execute({ type: 'addSurfaceZ', payload: { preset: 'saddle', samples: 8, color: '#7754d8' } });
if (!graphing3dSurface.ok) throw new Error(`3D surface command failed: ${graphing3dSurface.error.message}`);
const graphing3dEquation = graphing3d.execute({ type: 'addEquationSurface3D', payload: { input: 'y = x^2 + z^2', samples: 10, color: '#16845f' } });
if (!graphing3dEquation.ok) throw new Error(`3D equation command failed: ${graphing3dEquation.error.message}`);
const graphing3dSnapshot = graphing3d.getSnapshot();
if (Object.keys(graphing3dSnapshot.scene.scene3d.entities).length < 3) {
  throw new Error('3D calculator did not persist command-created entities.');
}
const graphing3dInstrument = createGraphing3DCalculator({ initialSnapshot: graphing3dSnapshot });
const graphing3dSvg = await graphing3dInstrument.export({ format: 'svg', width: 420, height: 320 });
if (graphing3dSvg.format !== 'svg' || !graphing3dSvg.data.includes('<svg') || !graphing3dSvg.data.includes('polygon')) {
  throw new Error('3D calculator SVG export smoke failed.');
}

const geometryLab = createGeometryLabRuntime();
if (geometryLab.toolKey !== 'geometry-lab') throw new Error('Geometry Lab runtime key failed.');
const labEquation = geometryLab.execute({ type: 'addEquationSurface3D', payload: { input: 'y = x^2 + z^2', samples: 12, label: 'Parabolic cylinder' } });
if (!labEquation.ok) throw new Error(`Geometry Lab equation surface failed: ${labEquation.error.message}`);
const labSnapshot = geometryLab.getSnapshot();
const equationSurface = Object.values(labSnapshot.scene.scene3d.entities).find(entity => entity.kind === 'surface3d' && entity.surfaceKind === 'equation');
if (!equationSurface || equationSurface.dependentAxis !== 'y' || equationSurface.vertices.length !== 144) {
  throw new Error('Geometry Lab did not persist the sampled equation surface.');
}
const editedLabEquation = geometryLab.execute({
  type: 'updateEquationSurface3D',
  payload: { id: equationSurface.id, input: 'y = x + z', samples: 8 },
});
if (!editedLabEquation.ok) throw new Error(`Geometry Lab equation edit failed: ${editedLabEquation.error.message}`);
const editedEquationSurface = geometryLab.getSnapshot().scene.scene3d.entities[equationSurface.id];
if (!editedEquationSurface || editedEquationSurface.kind !== 'surface3d' || editedEquationSurface.input !== 'y = x + z' || editedEquationSurface.vertices.length !== 64) {
  throw new Error('Geometry Lab equation edit did not rebuild the existing surface.');
}
const deletedLabEquation = geometryLab.execute({ type: 'delete', payload: { id: equationSurface.id } });
if (!deletedLabEquation.ok || geometryLab.getSnapshot().scene.scene3d.entities[equationSurface.id]) {
  throw new Error('Geometry Lab equation delete command failed.');
}
geometryLab.execute({ type: 'undo' });
if (!geometryLab.getSnapshot().scene.scene3d.entities[equationSurface.id]) {
  throw new Error('Geometry Lab equation delete was not undoable.');
}

const registryTools = KLEIN_V0_TOOLS.map(tool => {
  const runtime = createKleinToolRuntime({ toolKey: tool.key });
  if (runtime.toolKey !== tool.key) throw new Error(`Registry created the wrong runtime for ${tool.key}.`);
  return runtime.toolKey;
});
if (normalizeKleinToolKey('geogebra-graphing') !== 'graphing') {
  throw new Error('Graphing alias normalization failed.');
}
if (normalizeKleinToolKey('geogebra-3d') !== 'geometry-lab') {
  throw new Error('3D alias normalization failed.');
}
if (normalizeKleinToolKey('calculator-cas') !== null) {
  throw new Error('Unsupported CAS tool should not normalize into the v0 registry.');
}

console.log(JSON.stringify({
  scientific: calculation.payload,
  probabilityDistributions: probability.getSnapshot().scene.order.length,
  classroomRevision: saved.revision,
  examEvents: exam.getEventLog().length,
  embedMode: parsed.mode,
  collabType: collabMessage.type,
  graphing3d: graphing3dValidation.value.instrument,
  graphing3dEntities: Object.keys(graphing3dSnapshot.scene.scene3d.entities).length,
  geometryLabEquationVertices: equationSurface.vertices.length,
  whiteboardCompactedDeltas: compactedWhiteboardDeltas.length,
  whiteboardToolDefinitions: whiteboardTools.length,
  toolTheme: customToolTheme.name,
  registryTools,
}));
