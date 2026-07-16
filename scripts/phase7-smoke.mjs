import {
  appendReplayDelta,
  assignOwnershipColors,
  classroomModePolicy,
  collectSnapshotObjectIds,
  createClassroomAssignment,
  createClassroomSessionState,
  createGeometryCalculator,
  createInMemoryCollaborationHub,
  createInMemoryCollaborationTransport,
  createLocalStorageSessionAdapter,
  createObjectComment,
  createReadOnlyShareLink,
  createStudentCopy,
  createTeacherReviewSnapshot,
  createTeacherTemplate,
  createTeamEditableSession,
  freezeClassroomScene,
  listClassroomSessions,
  loadClassroomSession,
  replayConstructionHistory,
  resolveObjectComment,
  saveClassroomSession,
  sendCollaborativeCursor,
  submitStudentWork,
  updateCollaborativeCursor,
} from '../dist/index.js';

const geometry = createGeometryCalculator({ showControls: false });
const pointA = geometry.addPoint({ x: 0, y: 0 });
const pointB = geometry.addPoint({ x: 4, y: 0 });
geometry.addSegmentByPoints(pointA, pointB);

const template = createTeacherTemplate({
  id: 'template-1',
  title: 'Starter segment',
  tool: 'geometry',
  snapshot: geometry.getSnapshot(),
  lockAllStarterObjects: true,
  createdBy: 'teacher-1',
});
const lockedIds = collectSnapshotObjectIds(template.snapshot);
if (lockedIds.length < 3) throw new Error('Template did not collect starter objects.');
if (!template.snapshot.scene.points[pointA].locked) throw new Error('Starter point is not locked.');

const assignment = createClassroomAssignment({
  id: 'assignment-1',
  title: 'Segment task',
  template,
  settings: { allowCollaboration: true, requireSubmit: true },
});
const work = createStudentCopy(assignment, {
  assignmentId: assignment.id,
  studentId: 'student-1',
});
if (work.status !== 'not-started' || work.sourceTemplateId !== template.id) {
  throw new Error('Student copy was not created from the template.');
}

const submitted = submitStudentWork(work, work.snapshot, 10);
const comment = createObjectComment({
  id: 'comment-1',
  authorId: 'teacher-1',
  objectId: pointA,
  body: 'Check this construction.',
});
const resolved = resolveObjectComment(comment, 'teacher-1', 11);
const review = createTeacherReviewSnapshot(submitted, {
  reviewerId: 'teacher-1',
  comments: [resolved],
  score: 9,
  capturedAt: 12,
});
if (review.comments?.[0]?.resolvedAt !== 11 || review.score !== 9) {
  throw new Error('Review snapshot did not preserve comments and score.');
}

const freeze = freezeClassroomScene('teacher-1', 'Eyes front', 13);
const studentPolicy = classroomModePolicy('assignment-student', 'student', freeze, assignment.settings);
const teacherPolicy = classroomModePolicy('assignment-authoring', 'teacher', freeze, assignment.settings);
if (!studentPolicy.readOnly || !teacherPolicy.canManageFreeze) {
  throw new Error('Classroom mode policy failed.');
}

const ownership = assignOwnershipColors(['teacher-1', 'student-1']);
let cursors = {};
cursors = updateCollaborativeCursor(cursors, {
  actorId: 'student-1',
  color: ownership['student-1'].color,
  position: { x: 1, y: 2 },
});
const state = createClassroomSessionState({
  scope: { courseId: 'course-1', assignmentId: assignment.id, studentId: 'student-1' },
  mode: 'assignment-student',
  role: 'student',
  snapshot: work.snapshot,
  comments: [comment],
  cursors,
  ownership,
  freeze,
});
if (!state.cursors['student-1'] || state.comments.length !== 1) {
  throw new Error('Classroom session state failed.');
}

const link = createReadOnlyShareLink({
  baseUrl: 'https://example.test',
  scope: { courseId: 'course-1', assignmentId: assignment.id, studentId: 'student-1' },
  token: 'readonly-token',
});
if (!link.url.includes('mode=readonly') || !link.url.includes('readonly-token')) {
  throw new Error('Read-only share link failed.');
}

const teamSession = createTeamEditableSession({
  teamId: 'team-1',
  channelId: 'channel-1',
  assignmentId: assignment.id,
  snapshot: work.snapshot,
  memberIds: ['teacher-1', 'student-1'],
});
if (!teamSession.id.includes('team') || teamSession.memberIds.length !== 2) {
  throw new Error('Team editable session failed.');
}

const replay = appendReplayDelta([], { op: 'demo' }, {
  id: 'delta-1',
  source: 'local',
  createdAt: 14,
});
let replayed = false;
replayConstructionHistory({
  id: 'dummy',
  kind: 'dummy',
  mount() {},
  destroy() {},
  getSnapshot() { return {}; },
  loadSnapshot() {},
  applyDelta(delta, options) {
    replayed = delta.op === 'demo' && options?.meta?.source === 'history';
  },
  setTool() {},
  undo() {},
  redo() {},
  async export() { return { format: 'json', mimeType: 'application/json', data: {} }; },
}, replay);
if (!replayed) throw new Error('Construction replay failed.');

const hub = createInMemoryCollaborationHub();
const teacherTransport = createInMemoryCollaborationTransport({
  roomId: 'room-1',
  actorId: 'teacher-1',
  color: ownership['teacher-1'].color,
  hub,
});
const studentTransport = createInMemoryCollaborationTransport({
  roomId: 'room-1',
  actorId: 'student-1',
  color: ownership['student-1'].color,
  hub,
});
let receivedPresence = false;
let receivedDelta = false;
studentTransport.onPresence(presence => {
  receivedPresence ||= presence.actorId === 'teacher-1' && presence.cursor?.x === 2;
});
studentTransport.onDelta((delta, meta) => {
  receivedDelta ||= delta.op === 'remote-demo' && meta.actorId === 'teacher-1';
});
await teacherTransport.connect();
await studentTransport.connect();
sendCollaborativeCursor(teacherTransport, {
  actorId: 'teacher-1',
  color: ownership['teacher-1'].color,
  position: { x: 2, y: 3 },
  updatedAt: 15,
});
teacherTransport.sendDelta({ op: 'remote-demo' }, {
  id: 'delta-2',
  actorId: 'teacher-1',
  createdAt: 16,
  source: 'local',
});
if (!receivedPresence || !receivedDelta || hub.participantCount('room-1') !== 2) {
  throw new Error('In-memory collaboration room failed.');
}
teacherTransport.disconnect();
studentTransport.disconnect();

const adapter = createLocalStorageSessionAdapter({ namespace: 'phase7-smoke' });
const scope = { courseId: 'course-1', assignmentId: assignment.id, studentId: 'student-1' };
const saved = await saveClassroomSession(geometry, adapter, {
  scope,
  kind: 'student-work',
  userId: 'student-1',
});
const loaded = await loadClassroomSession(geometry, adapter, {
  scope,
  kind: 'student-work',
});
const listed = await listClassroomSessions(adapter, {
  scope,
  kind: 'student-work',
});
if (!loaded || saved.revision !== 1 || listed.length !== 1) {
  throw new Error('Classroom scoped persistence failed.');
}

console.log(JSON.stringify({
  templateObjects: lockedIds.length,
  workStatus: submitted.status,
  reviewScore: review.score,
  cursors: Object.keys(cursors).length,
  replay: replay.length,
  collaboration: receivedPresence && receivedDelta,
  savedRevision: saved.revision,
}));
