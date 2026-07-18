import {
  bindCollaboration,
  createGraphingCalculator,
  createInMemoryCollaborationHub,
  createInMemoryCollaborationTransport,
  parseGraphExpression,
  parseGraphingSnapshotJson,
  validateGraphingSnapshot,
} from '../dist/index.js';

const graphing = createGraphingCalculator({ samples: 160 });
const parabola = graphing.addExpression('y = x^2 - 4', { label: 'Parabola' });
const line = graphing.addExpression('y = x', { color: '#d43f4b' });
const slider = graphing.addSlider('a', { value: 2, min: -5, max: 5, step: 0.5 });
const shifted = graphing.addExpression('a * x + 1');
const point = graphing.addPoint(1, -3, { label: 'P' });

const parsed = parseGraphExpression('y = sin(x)');
if (parsed.kind !== 'explicit') throw new Error('Expression classification failed.');

const value = graphing.evaluateExpression(parabola, 3);
if (value !== 5) throw new Error(`Unexpected graph value: ${value}`);

const sliderValue = graphing.evaluateExpression(shifted, 2);
if (sliderValue !== 5) throw new Error(`Slider variable did not evaluate: ${sliderValue}`);

graphing.setSliderValue(slider, 3);
const updatedSliderValue = graphing.evaluateExpression(shifted, 2);
if (updatedSliderValue !== 7) throw new Error(`Slider update did not evaluate: ${updatedSliderValue}`);

const samples = graphing.sampleExpression(parabola);
if (samples.length === 0 || samples[0].points.length < 20) {
  throw new Error('Expression sampling failed.');
}

const roots = graphing.findRoots(parabola);
if (!roots.some(root => Math.abs(root.x - 2) < 0.01) || !roots.some(root => Math.abs(root.x + 2) < 0.01)) {
  throw new Error(`Root finding failed: ${JSON.stringify(roots)}`);
}

const intersections = graphing.findIntersections(parabola, line);
if (!intersections.some(hit => Math.abs(hit.x - 2.56155) < 0.01)) {
  throw new Error(`Intersection finding failed: ${JSON.stringify(intersections)}`);
}

if (!graphing.getSnapshot().scene.points[point]) throw new Error('Initial point was not created.');
const undoPoint = graphing.addPoint(2, 2, { label: 'Undo me' });
const beforeUndo = graphing.getSnapshot().scene.points[undoPoint];
graphing.undo();
if (graphing.getSnapshot().scene.points[undoPoint]) throw new Error('Undo did not remove point.');
graphing.redo();
if (!beforeUndo || !graphing.getSnapshot().scene.points[undoPoint]) throw new Error('Redo did not restore point.');

const json = await graphing.export({ format: 'json' });
const svg = await graphing.export({ format: 'svg', width: 500, height: 360, includeGrid: true });
const csv = await graphing.export({ format: 'csv' });
if (json.format !== 'json') throw new Error('JSON export failed.');
if (svg.format !== 'svg' || !svg.data.includes('<polyline')) throw new Error('SVG export failed.');
if (csv.format !== 'csv' || !csv.data.includes('expressionId,input,x,y')) throw new Error('CSV export failed.');

const parsedSnapshot = parseGraphingSnapshotJson(JSON.stringify(graphing.getSnapshot()));
const validation = validateGraphingSnapshot(parsedSnapshot);
if (!validation.ok) throw new Error('Graphing snapshot validation failed.');

const hub = createInMemoryCollaborationHub();
const leftTransport = createInMemoryCollaborationTransport({
  roomId: 'graphing-room',
  actorId: 'left',
  hub,
});
const rightTransport = createInMemoryCollaborationTransport({
  roomId: 'graphing-room',
  actorId: 'right',
  hub,
});
const left = createGraphingCalculator();
const right = createGraphingCalculator();
bindCollaboration({ instrument: left, transport: leftTransport });
bindCollaboration({ instrument: right, transport: rightTransport });
left.addExpression('y = x + 1');
if (Object.keys(right.getSnapshot().scene.expressions).length !== 1) {
  throw new Error('Collaborative graphing delta did not converge.');
}
leftTransport.disconnect();
rightTransport.disconnect();

console.log(JSON.stringify({
  expressions: Object.keys(graphing.getSnapshot().scene.expressions).length,
  roots: roots.length,
  intersections: intersections.length,
  samplePoints: samples[0].points.length,
  svgBytes: svg.data.length,
  csvBytes: csv.data.length,
}));
