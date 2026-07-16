import {
  createGeometryCalculator,
} from '../dist/index.js';

const geometry = createGeometryCalculator({ showControls: false });
const pointA = geometry.addPoint({ x: 0, y: 0 });
const pointB = geometry.addPoint({ x: 2, y: 0 });
const segment = geometry.addSegmentByPoints(pointA, pointB);

geometry.editObject(pointA, {
  label: 'A renamed',
  hidden: true,
  locked: true,
});
const hiddenRows = geometry.getObjectPanelRows({ includeHidden: true });
const renamed = hiddenRows.find(row => row.id === pointA);
if (!renamed || renamed.label !== 'A renamed' || !renamed.hidden || !renamed.locked) {
  throw new Error('Inline rename or object toggles failed.');
}

const visibleRows = geometry.getObjectPanelRows();
if (visibleRows.some(row => row.id === pointA)) {
  throw new Error('Hidden object leaked into default object panel rows.');
}

const checkpointId = geometry.createCheckpoint('Starter checkpoint');
const checkpoints = geometry.getCheckpoints();
if (checkpoints.length !== 1 || checkpoints[0].id !== checkpointId) {
  throw new Error('Checkpoint creation failed.');
}

geometry.editObject(segment, { label: 'base segment' });
const segmentRow = geometry.getObjectPanelRows({ includeHidden: true }).find(row => row.id === segment);
if (!segmentRow || segmentRow.label !== 'base segment') {
  throw new Error('Entity inline rename failed.');
}

const pointC = geometry.addPoint({ x: 1, y: 1 });
geometry.undo();
if (geometry.getObjectPanelRows({ includeHidden: true }).some(row => row.id === pointC)) {
  throw new Error('Undo did not restore previous version.');
}
geometry.redo();
if (!geometry.getObjectPanelRows({ includeHidden: true }).some(row => row.id === pointC)) {
  throw new Error('Redo did not restore next version.');
}

geometry.restoreCheckpoint(checkpointId);
const restoredRows = geometry.getObjectPanelRows({ includeHidden: true });
if (restoredRows.some(row => row.id === pointC)) {
  throw new Error('Checkpoint restore did not remove later objects.');
}
if (restoredRows.find(row => row.id === segment)?.label === 'base segment') {
  throw new Error('Checkpoint restore did not restore earlier labels.');
}

const history = geometry.getHistoryEntries();
if (!history.some(entry => entry.kind === 'checkpoint') || !history.some(entry => entry.kind === 'undo')) {
  throw new Error('History entries did not expose checkpoints and previous versions.');
}

console.log(JSON.stringify({
  renamed: renamed.label,
  checkpoints: checkpoints.length,
  history: history.length,
  restoredObjects: restoredRows.length,
}));
