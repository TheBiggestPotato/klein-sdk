import { KleinSdkError } from '../core/index.js';
import type {
  ApplyResult,
  DeltaMeta,
  InstrumentSnapshot,
  JsonValue,
  KleinInstrument,
  KleinToolRuntime,
  Unsubscribe,
} from '../core/index.js';
import type {
  KleinStorageAdapter,
  KleinSessionStorageAdapter,
  ListSessionsOptions,
  PersistedSession,
  SavedSnapshot,
  SaveSessionInput,
} from '../persistence/index.js';
import {
  loadInstrumentSession,
  saveInstrumentSession,
} from '../persistence/index.js';
import type {
  CollaborativeCursor,
  CollaborationSelectionItem,
} from '../collab/index.js';

export type ClassroomWorkflowRole = 'teacher' | 'co-teacher' | 'student' | 'reviewer';
export type ClassroomWorkflowMode =
  | 'assignment-authoring'
  | 'assignment-student'
  | 'student-work'
  | 'review'
  | 'readonly'
  | 'readonly-share'
  | 'team'
  | 'team-session';
export type ClassroomSessionKind = 'template' | 'student-work' | 'team-session' | 'review' | 'readonly-share';
export type ClassroomWorkStatus = 'not-started' | 'in-progress' | 'submitted' | 'returned';

export interface ClassroomScope {
  courseId?: string;
  classId?: string;
  teamId?: string;
  channelId?: string;
  assignmentId?: string;
  studentId?: string;
  groupId?: string;
  roomId?: string;
  sessionId?: string;
}

export interface ClassroomAssignmentSettings {
  allowStudentEditStarterObjects?: boolean;
  allowLateSubmissions?: boolean;
  allowCollaboration?: boolean;
  requireSubmit?: boolean;
  maxPoints?: number;
  dueAt?: number;
}

export interface ClassroomModePolicy {
  readOnly: boolean;
  canEdit: boolean;
  canComment: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canManageTemplate: boolean;
  canManageFreeze: boolean;
  canCollaborate: boolean;
}

export interface ClassroomPolicy {
  role: ClassroomWorkflowRole;
  mode: 'assignment-authoring' | 'student-work' | 'team-session' | 'review' | 'readonly-share';
  canEditTemplate: boolean;
  canEditOwnWork: boolean;
  canEditSharedTeamWork: boolean;
  canReview: boolean;
  canComment: boolean;
  canFreeze: boolean;
  canSubmit: boolean;
  frozen: boolean;
  lockedObjectIds: string[];
}

export interface CreateClassroomPolicyInput {
  role: ClassroomWorkflowRole;
  mode: ClassroomWorkflowMode;
  freeze?: ClassroomFreezeState;
  settings?: ClassroomAssignmentSettings;
  lockedObjectIds?: string[];
}

export interface ClassroomContext {
  scope: ClassroomScope;
  role: ClassroomWorkflowRole;
  mode: ClassroomWorkflowMode;
  actorId?: string;
  sessionId?: string;
  assignmentId?: string;
  studentWorkId?: string;
}

export interface ClassroomTeacherTemplate<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id: string;
  title: string;
  tool: string;
  snapshot: TSnapshot;
  lockedObjectIds: string[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface CreateTeacherTemplateInput<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id?: string;
  title: string;
  tool: string;
  snapshot: TSnapshot;
  objectIdsToLock?: string[];
  lockAllStarterObjects?: boolean;
  createdBy?: string;
  createdAt?: number;
  description?: string;
  tags?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface ClassroomAssignment<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id: string;
  title: string;
  tool: string;
  mode: 'assignment';
  createdAt: number;
  updatedAt: number;
  templateId?: string;
  starterSnapshot?: TSnapshot;
  createdBy?: string;
  description?: string;
  settings?: ClassroomAssignmentSettings;
  metadata?: Record<string, JsonValue>;
}

export interface CreateClassroomAssignmentInput<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id?: string;
  title: string;
  tool?: string;
  template?: ClassroomTeacherTemplate<TSnapshot>;
  starterSnapshot?: TSnapshot;
  createdBy?: string;
  createdAt?: number;
  description?: string;
  settings?: ClassroomAssignmentSettings;
  metadata?: Record<string, JsonValue>;
}

export interface ClassroomStudentWork<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id: string;
  sessionId: string;
  assignmentId: string;
  studentId: string;
  snapshot: TSnapshot;
  revision: number;
  status: ClassroomWorkStatus;
  createdAt: number;
  updatedAt: number;
  submittedAt?: number;
  returnedAt?: number;
  sourceTemplateId?: string;
  score?: number;
  metadata?: Record<string, JsonValue>;
}

export interface CreateStudentCopyInput {
  assignmentId: string;
  studentId: string;
  sessionId?: string;
  revision?: number;
  createdAt?: number;
  unlockStarterObjects?: boolean;
  metadata?: Record<string, JsonValue>;
}

export interface ClassroomReviewSnapshot<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id: string;
  studentWorkId: string;
  assignmentId: string;
  studentId: string;
  snapshot: TSnapshot;
  revision: number;
  capturedAt: number;
  reviewerId?: string;
  comments?: ClassroomObjectComment[];
  score?: number;
}

export interface CreateReviewSnapshotInput {
  id?: string;
  reviewerId?: string;
  capturedAt?: number;
  comments?: ClassroomObjectComment[];
  score?: number;
}

export interface ClassroomObjectComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  objectId?: string;
  threadId?: string;
  authorName?: string;
  color?: string;
  resolvedAt?: number;
  resolvedBy?: string;
  metadata?: Record<string, JsonValue>;
}

export interface CreateObjectCommentInput {
  id?: string;
  authorId: string;
  body: string;
  objectId?: string;
  threadId?: string;
  authorName?: string;
  color?: string;
  createdAt?: number;
  metadata?: Record<string, JsonValue>;
}

export interface ObjectCommentInput {
  body: string;
  objectId?: string;
  threadId?: string;
  authorName?: string;
  color?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SubmissionResult<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  workId?: string;
  sessionId: string;
  snapshot: TSnapshot;
  revision: number;
  status: 'submitted';
  submittedAt: number;
}

export type ClassroomRuntimeEvent<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot, TDelta = unknown> =
  | { type: 'delta-applied'; delta: TDelta; result: ApplyResult; context: ClassroomContext }
  | { type: 'draft-saved'; snapshot: TSnapshot; saved: SavedSnapshot; context: ClassroomContext }
  | { type: 'work-submitted'; result: SubmissionResult<TSnapshot>; context: ClassroomContext }
  | { type: 'comment-created'; comment: ClassroomObjectComment; context: ClassroomContext }
  | { type: 'freeze-changed'; freeze: ClassroomFreezeState; policy: ClassroomPolicy; context: ClassroomContext }
  | { type: 'error'; error: KleinSdkError; context: ClassroomContext };

export type ClassroomEventListener<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot, TDelta = unknown> = (
  event: ClassroomRuntimeEvent<TSnapshot, TDelta>,
) => void;

export interface ClassroomSaveDraftInput<TSnapshot extends InstrumentSnapshot> {
  context: ClassroomContext;
  snapshot: TSnapshot;
  expectedRevision?: number;
}

export interface ClassroomSubmitWorkInput<TSnapshot extends InstrumentSnapshot> {
  context: ClassroomContext;
  snapshot: TSnapshot;
  revision?: number;
}

export interface ClassroomSetFrozenInput {
  context: ClassroomContext;
  frozen: boolean;
  actorId?: string;
  reason?: string;
}

export interface ClassroomAppendReplayInput<TDelta> {
  context: ClassroomContext;
  delta: TDelta;
  meta: DeltaMeta;
}

export interface KleinClassroomBackendAdapter<
  TSnapshot extends InstrumentSnapshot = InstrumentSnapshot,
  TDelta = unknown,
> {
  saveDraft(input: ClassroomSaveDraftInput<TSnapshot>): Promise<SavedSnapshot>;
  submitWork(input: ClassroomSubmitWorkInput<TSnapshot>): Promise<SubmissionResult<TSnapshot>>;
  addObjectComment(input: CreateObjectCommentInput & { context: ClassroomContext }): Promise<ClassroomObjectComment>;
  setFrozen(input: ClassroomSetFrozenInput): Promise<ClassroomFreezeState>;
  appendReplayEvent?(input: ClassroomAppendReplayInput<TDelta>): Promise<void>;
}

export interface ClassroomRuntime<TSnapshot extends InstrumentSnapshot, TDelta> {
  readonly context: ClassroomContext;
  readonly policy: ClassroomPolicy;
  readonly tool: KleinToolRuntime<TSnapshot, TDelta, unknown>;
  applyStudentDelta(delta: TDelta, meta?: DeltaMeta): Promise<ApplyResult>;
  saveDraft(expectedRevision?: number): Promise<SavedSnapshot>;
  submitWork(revision?: number): Promise<SubmissionResult<TSnapshot>>;
  addObjectComment(input: ObjectCommentInput): Promise<ClassroomObjectComment>;
  setFrozen(frozen: boolean, reason?: string): Promise<void>;
  subscribe(listener: ClassroomEventListener<TSnapshot, TDelta>): Unsubscribe;
}

export interface CreateClassroomRuntimeInput<TSnapshot extends InstrumentSnapshot, TDelta> {
  context: ClassroomContext;
  tool: KleinToolRuntime<TSnapshot, TDelta, unknown>;
  policy?: ClassroomPolicy;
  backend?: KleinClassroomBackendAdapter<TSnapshot, TDelta>;
  storage?: KleinStorageAdapter<TSnapshot>;
  datasourceId?: string;
  revision?: number;
  clock?: () => number;
}

export interface ClassroomFreezeState {
  frozen: boolean;
  updatedAt: number;
  frozenBy?: string;
  unfrozenBy?: string;
  reason?: string;
}

export interface ClassroomOwnership {
  actorId: string;
  color: string;
  displayName?: string;
  objectIds?: string[];
}

export interface ConstructionReplayEvent<TDelta = unknown> {
  id: string;
  revision: number;
  delta: TDelta;
  meta: DeltaMeta;
  snapshotId?: string;
}

export interface ClassroomSessionState<
  TSnapshot extends InstrumentSnapshot = InstrumentSnapshot,
  TDelta = unknown,
> {
  scope: ClassroomScope;
  mode: ClassroomWorkflowMode;
  role: ClassroomWorkflowRole;
  snapshot: TSnapshot;
  comments: ClassroomObjectComment[];
  cursors: Record<string, CollaborativeCursor>;
  ownership: Record<string, ClassroomOwnership>;
  freeze: ClassroomFreezeState;
  replay: Array<ConstructionReplayEvent<TDelta>>;
}

export interface CreateClassroomSessionStateInput<
  TSnapshot extends InstrumentSnapshot = InstrumentSnapshot,
  TDelta = unknown,
> {
  scope: ClassroomScope;
  mode: ClassroomWorkflowMode;
  role: ClassroomWorkflowRole;
  snapshot: TSnapshot;
  comments?: ClassroomObjectComment[];
  cursors?: Record<string, CollaborativeCursor>;
  ownership?: Record<string, ClassroomOwnership>;
  freeze?: ClassroomFreezeState;
  replay?: Array<ConstructionReplayEvent<TDelta>>;
}

export interface ClassroomShareLink {
  id: string;
  url: string;
  token: string;
  scope: ClassroomScope;
  createdAt: number;
  expiresAt?: number;
}

export interface CreateReadOnlyShareLinkInput {
  baseUrl: string | URL;
  path?: string;
  scope: ClassroomScope;
  token?: string;
  id?: string;
  createdAt?: number;
  expiresAt?: number;
}

export interface TeamEditableSession<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  id: string;
  teamId: string;
  roomId: string;
  snapshot: TSnapshot;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
  assignmentId?: string;
  channelId?: string;
  title?: string;
  metadata?: Record<string, JsonValue>;
}

export interface CreateTeamSessionInput<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  teamId: string;
  roomId?: string;
  snapshot: TSnapshot;
  memberIds?: string[];
  assignmentId?: string;
  channelId?: string;
  title?: string;
  createdAt?: number;
  metadata?: Record<string, JsonValue>;
}

export interface SaveClassroomSessionOptions {
  scope: ClassroomScope;
  kind: ClassroomSessionKind;
  sessionId?: string;
  expectedRevision?: number;
  userId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface LoadClassroomSessionOptions {
  scope: ClassroomScope;
  kind: ClassroomSessionKind;
  sessionId?: string;
}

export interface ListClassroomSessionOptions extends ListSessionsOptions {
  scope?: ClassroomScope;
  kind?: ClassroomSessionKind;
}

const DEFAULT_OWNERSHIP_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

export const CLASSROOM_API_ROUTES = {
  classrooms: '/api/classrooms',
  classroom: (classroomId: string) => `/api/classrooms/${encodeURIComponent(classroomId)}`,
  classroomMembers: (classroomId: string) => `/api/classrooms/${encodeURIComponent(classroomId)}/members`,
  classroomAssignments: (classroomId: string) => `/api/classrooms/${encodeURIComponent(classroomId)}/assignments`,
  assignmentStudentWork: (assignmentId: string) => `/api/assignments/${encodeURIComponent(assignmentId)}/student-work`,
  assignmentLiveSessions: (assignmentId: string) => `/api/assignments/${encodeURIComponent(assignmentId)}/live-sessions`,
  studentWork: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}`,
  studentWorkSnapshot: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}/snapshot`,
  studentWorkSubmit: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}/submit`,
  studentWorkReturn: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}/return`,
  studentWorkComments: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}/comments`,
  studentWorkReplayEvents: (workId: string) => `/api/student-work/${encodeURIComponent(workId)}/replay-events`,
  liveSessionFreeze: (sessionId: string) => `/api/live-sessions/${encodeURIComponent(sessionId)}/freeze`,
  liveSessionUnfreeze: (sessionId: string) => `/api/live-sessions/${encodeURIComponent(sessionId)}/unfreeze`,
} as const;

/** Creates a teacher-authored starter snapshot and locks the selected starter objects. */
export function createTeacherTemplate<TSnapshot extends InstrumentSnapshot>(
  input: CreateTeacherTemplateInput<TSnapshot>,
): ClassroomTeacherTemplate<TSnapshot> {
  const now = input.createdAt ?? Date.now();
  const objectIds = input.lockAllStarterObjects
    ? collectSnapshotObjectIds(input.snapshot)
    : input.objectIdsToLock ?? [];
  const template: ClassroomTeacherTemplate<TSnapshot> = {
    id: input.id ?? createWorkflowId('template'),
    title: input.title,
    tool: input.tool,
    snapshot: lockSnapshotObjects(input.snapshot, objectIds.length > 0 ? objectIds : undefined, true),
    lockedObjectIds: objectIds,
    createdAt: now,
    updatedAt: now,
  };
  if (input.createdBy !== undefined) template.createdBy = input.createdBy;
  if (input.description !== undefined) template.description = input.description;
  if (input.tags !== undefined) template.tags = [...input.tags];
  if (input.metadata !== undefined) template.metadata = cloneJsonObject(input.metadata);
  return template;
}

/** Creates an assignment descriptor from a template or explicit starter snapshot. */
export function createClassroomAssignment<TSnapshot extends InstrumentSnapshot>(
  input: CreateClassroomAssignmentInput<TSnapshot>,
): ClassroomAssignment<TSnapshot> {
  const now = input.createdAt ?? Date.now();
  const starterSnapshot = input.starterSnapshot ?? input.template?.snapshot;
  const tool = input.tool ?? input.template?.tool;
  if (!tool) throw new KleinSdkError('invalid_assignment', 'Assignment tool is required.');
  const assignment: ClassroomAssignment<TSnapshot> = {
    id: input.id ?? createWorkflowId('assignment'),
    title: input.title,
    tool,
    mode: 'assignment',
    createdAt: now,
    updatedAt: now,
  };
  if (input.template?.id !== undefined) assignment.templateId = input.template.id;
  if (starterSnapshot !== undefined) assignment.starterSnapshot = cloneSnapshot(starterSnapshot);
  if (input.createdBy !== undefined) assignment.createdBy = input.createdBy;
  if (input.description !== undefined) assignment.description = input.description;
  if (input.settings !== undefined) assignment.settings = { ...input.settings };
  if (input.metadata !== undefined) assignment.metadata = cloneJsonObject(input.metadata);
  return assignment;
}

/** Creates the per-student editable copy for an assignment. */
export function createStudentCopy<TSnapshot extends InstrumentSnapshot>(
  assignment: ClassroomAssignment<TSnapshot>,
  input: CreateStudentCopyInput,
): ClassroomStudentWork<TSnapshot> {
  if (!assignment.starterSnapshot) {
    throw new KleinSdkError('missing_starter_snapshot', 'Assignment does not include a starter snapshot.');
  }
  const now = input.createdAt ?? Date.now();
  const sessionId = input.sessionId ?? createClassroomSessionId({
    assignmentId: input.assignmentId,
    studentId: input.studentId,
  }, 'student-work');
  const snapshot = input.unlockStarterObjects || assignment.settings?.allowStudentEditStarterObjects
    ? lockSnapshotObjects(assignment.starterSnapshot, undefined, false)
    : cloneSnapshot(assignment.starterSnapshot);
  const work: ClassroomStudentWork<TSnapshot> = {
    id: createWorkflowId('work'),
    sessionId,
    assignmentId: input.assignmentId,
    studentId: input.studentId,
    snapshot,
    revision: input.revision ?? 1,
    status: 'not-started',
    createdAt: now,
    updatedAt: now,
  };
  if (assignment.templateId !== undefined) work.sourceTemplateId = assignment.templateId;
  if (input.metadata !== undefined) work.metadata = cloneJsonObject(input.metadata);
  return work;
}

/** Marks student work submitted while preserving the immutable snapshot shape. */
export function submitStudentWork<TSnapshot extends InstrumentSnapshot>(
  work: ClassroomStudentWork<TSnapshot>,
  snapshot: TSnapshot,
  submittedAt = Date.now(),
): ClassroomStudentWork<TSnapshot> {
  return {
    ...work,
    snapshot: cloneSnapshot(snapshot),
    revision: work.revision + 1,
    status: 'submitted',
    updatedAt: submittedAt,
    submittedAt,
  };
}

/** Captures a teacher review snapshot for grading, comments, or audit trails. */
export function createTeacherReviewSnapshot<TSnapshot extends InstrumentSnapshot>(
  work: ClassroomStudentWork<TSnapshot>,
  input: CreateReviewSnapshotInput = {},
): ClassroomReviewSnapshot<TSnapshot> {
  const review: ClassroomReviewSnapshot<TSnapshot> = {
    id: input.id ?? createWorkflowId('review'),
    studentWorkId: work.id,
    assignmentId: work.assignmentId,
    studentId: work.studentId,
    snapshot: cloneSnapshot(work.snapshot),
    revision: work.revision,
    capturedAt: input.capturedAt ?? Date.now(),
  };
  if (input.reviewerId !== undefined) review.reviewerId = input.reviewerId;
  if (input.comments !== undefined) review.comments = input.comments.map(comment => ({ ...comment }));
  if (input.score !== undefined) review.score = input.score;
  return review;
}

export function createObjectComment(input: CreateObjectCommentInput): ClassroomObjectComment {
  const comment: ClassroomObjectComment = {
    id: input.id ?? createWorkflowId('comment'),
    authorId: input.authorId,
    body: input.body,
    createdAt: input.createdAt ?? Date.now(),
  };
  if (input.objectId !== undefined) comment.objectId = input.objectId;
  if (input.threadId !== undefined) comment.threadId = input.threadId;
  if (input.authorName !== undefined) comment.authorName = input.authorName;
  if (input.color !== undefined) comment.color = input.color;
  if (input.metadata !== undefined) comment.metadata = cloneJsonObject(input.metadata);
  return comment;
}

export function resolveObjectComment(
  comment: ClassroomObjectComment,
  resolvedBy: string,
  resolvedAt = Date.now(),
): ClassroomObjectComment {
  return {
    ...comment,
    resolvedBy,
    resolvedAt,
  };
}

export function freezeClassroomScene(
  frozenBy: string,
  reason?: string,
  frozenAt = Date.now(),
): ClassroomFreezeState {
  const state: ClassroomFreezeState = {
    frozen: true,
    frozenBy,
    updatedAt: frozenAt,
  };
  if (reason !== undefined) state.reason = reason;
  return state;
}

export function unfreezeClassroomScene(
  unfrozenBy: string,
  unfrozenAt = Date.now(),
): ClassroomFreezeState {
  return {
    frozen: false,
    unfrozenBy,
    updatedAt: unfrozenAt,
  };
}

export function classroomModePolicy(
  mode: ClassroomWorkflowMode,
  role: ClassroomWorkflowRole,
  freeze: ClassroomFreezeState = { frozen: false, updatedAt: 0 },
  settings: ClassroomAssignmentSettings = {},
): ClassroomModePolicy {
  const teacher = role === 'teacher' || role === 'co-teacher';
  const reviewer = role === 'reviewer';
  const normalizedMode = normalizeClassroomRuntimeMode(mode);
  const readonlyMode = normalizedMode === 'readonly-share' || normalizedMode === 'review';
  const frozenForUser = freeze.frozen && !teacher;
  const canEdit = !readonlyMode && !frozenForUser && (
    teacher
    || normalizedMode === 'team-session'
    || normalizedMode === 'student-work'
  );
  return {
    readOnly: !canEdit,
    canEdit,
    canComment: teacher || reviewer || normalizedMode === 'team-session' || normalizedMode === 'student-work',
    canSubmit: role === 'student' && normalizedMode === 'student-work' && settings.requireSubmit !== false,
    canReview: teacher || reviewer || normalizedMode === 'review',
    canManageTemplate: teacher && normalizedMode === 'assignment-authoring',
    canManageFreeze: teacher,
    canCollaborate: settings.allowCollaboration === true || normalizedMode === 'team-session',
  };
}

export function createClassroomPolicy(input: CreateClassroomPolicyInput): ClassroomPolicy {
  const mode = normalizeClassroomRuntimeMode(input.mode);
  const oldPolicy = classroomModePolicy(input.mode, input.role, input.freeze, input.settings);
  const teacher = input.role === 'teacher' || input.role === 'co-teacher';
  const frozen = input.freeze?.frozen ?? false;
  return {
    role: input.role,
    mode,
    canEditTemplate: oldPolicy.canManageTemplate,
    canEditOwnWork: oldPolicy.canEdit && input.role === 'student' && mode === 'student-work',
    canEditSharedTeamWork: oldPolicy.canEdit && mode === 'team-session',
    canReview: oldPolicy.canReview,
    canComment: oldPolicy.canComment,
    canFreeze: teacher,
    canSubmit: oldPolicy.canSubmit,
    frozen,
    lockedObjectIds: [...(input.lockedObjectIds ?? [])],
  };
}

export function createClassroomRuntime<
  TSnapshot extends InstrumentSnapshot,
  TDelta,
>(
  input: CreateClassroomRuntimeInput<TSnapshot, TDelta>,
): ClassroomRuntime<TSnapshot, TDelta> {
  const listeners = new Set<ClassroomEventListener<TSnapshot, TDelta>>();
  const clock = input.clock ?? Date.now;
  let policy = input.policy ?? createClassroomPolicy({
    role: input.context.role,
    mode: input.context.mode,
  });
  let revision = input.revision ?? 0;

  const emit = (event: ClassroomRuntimeEvent<TSnapshot, TDelta>): void => {
    for (const listener of listeners) listener(event);
  };

  const emitError = (error: KleinSdkError): void => {
    emit({ type: 'error', error, context: input.context });
  };

  const sessionId = (): string => input.context.sessionId
    ?? input.context.scope.sessionId
    ?? createClassroomSessionId(input.context.scope, classroomSessionKindForMode(input.context.mode));

  return {
    context: input.context,
    get policy() {
      return policy;
    },
    tool: input.tool,
    async applyStudentDelta(delta, meta) {
      const decision = canApplyClassroomDelta(policy, delta);
      if (!decision.allowed) {
        const error = new KleinSdkError(decision.code, decision.message, decision.details);
        const result: ApplyResult = { ok: false, error };
        emit({ type: 'delta-applied', delta, result, context: input.context });
        return result;
      }
      const result = input.tool.applyDelta(delta, meta);
      if (result.ok) revision += 1;
      if (result.ok && input.backend?.appendReplayEvent && meta) {
        await input.backend.appendReplayEvent({ context: input.context, delta, meta });
      }
      emit({ type: 'delta-applied', delta, result, context: input.context });
      return result;
    },
    async saveDraft(expectedRevision) {
      const snapshot = input.tool.getSnapshot();
      const saved = input.backend
        ? await input.backend.saveDraft(classroomSaveDraftInput(input.context, snapshot, expectedRevision))
        : await saveDraftWithStorage(
          input.storage,
          snapshot,
          classroomStorageDraftOptions({
            sessionId: sessionId(),
            expectedRevision,
            actorId: input.context.actorId,
            datasourceId: input.datasourceId ?? classroomDatasourceId(input.context.scope),
            metadata: classroomSessionMetadata(input.context.scope, classroomSessionKindForMode(input.context.mode)),
            clock,
            revision,
          }),
        );
      revision = saved.revision;
      emit({ type: 'draft-saved', snapshot, saved, context: input.context });
      return saved;
    },
    async submitWork(nextRevision) {
      if (!policy.canSubmit && !(policy.role === 'teacher' || policy.role === 'co-teacher')) {
        const error = new KleinSdkError('classroom_submit_denied', 'Current classroom policy does not allow submitting this work.');
        emitError(error);
        throw error;
      }
      const snapshot = input.tool.getSnapshot();
      const submitted = input.backend
        ? await input.backend.submitWork({ context: input.context, snapshot, revision: nextRevision ?? revision })
        : {
          sessionId: sessionId(),
          snapshot,
          revision: nextRevision ?? revision + 1,
          status: 'submitted' as const,
          submittedAt: clock(),
        };
      revision = submitted.revision;
      emit({ type: 'work-submitted', result: submitted, context: input.context });
      return submitted;
    },
    async addObjectComment(commentInput) {
      if (!policy.canComment) {
        const error = new KleinSdkError('classroom_comment_denied', 'Current classroom policy does not allow comments.');
        emitError(error);
        throw error;
      }
      const authorId = input.context.actorId ?? input.context.scope.studentId ?? 'anonymous';
      const createInput: CreateObjectCommentInput = {
        authorId,
        body: commentInput.body,
      };
      if (commentInput.objectId !== undefined) createInput.objectId = commentInput.objectId;
      if (commentInput.threadId !== undefined) createInput.threadId = commentInput.threadId;
      if (commentInput.authorName !== undefined) createInput.authorName = commentInput.authorName;
      if (commentInput.color !== undefined) createInput.color = commentInput.color;
      if (commentInput.metadata !== undefined) createInput.metadata = commentInput.metadata;
      const comment = input.backend
        ? await input.backend.addObjectComment({ ...createInput, context: input.context })
        : createObjectComment(createInput);
      emit({ type: 'comment-created', comment, context: input.context });
      return comment;
    },
    async setFrozen(frozen, reason) {
      if (!policy.canFreeze) {
        const error = new KleinSdkError('classroom_freeze_denied', 'Current classroom policy does not allow freezing this session.');
        emitError(error);
        throw error;
      }
      const freeze = input.backend
        ? await input.backend.setFrozen(classroomSetFrozenInput(input.context, frozen, input.context.actorId, reason))
        : frozen
          ? freezeClassroomScene(input.context.actorId ?? 'teacher', reason, clock())
          : unfreezeClassroomScene(input.context.actorId ?? 'teacher', clock());
      policy = {
        ...policy,
        frozen: freeze.frozen,
      };
      emit({ type: 'freeze-changed', freeze, policy, context: input.context });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function assertClassroomEditable(
  mode: ClassroomWorkflowMode,
  role: ClassroomWorkflowRole,
  freeze?: ClassroomFreezeState,
): void {
  const policy = classroomModePolicy(mode, role, freeze);
  if (!policy.canEdit) {
    throw new KleinSdkError('scene_readonly', 'This classroom scene is read-only for the current user.');
  }
}

export function assignOwnershipColors(
  actorIds: string[],
  palette: string[] = DEFAULT_OWNERSHIP_COLORS,
): Record<string, ClassroomOwnership> {
  const ownership: Record<string, ClassroomOwnership> = {};
  actorIds.forEach((actorId, index) => {
    ownership[actorId] = {
      actorId,
      color: palette[index % palette.length] ?? DEFAULT_OWNERSHIP_COLORS[0] ?? '#2563eb',
    };
  });
  return ownership;
}

export function updateCollaborativeCursor(
  cursors: Record<string, CollaborativeCursor>,
  cursor: Omit<CollaborativeCursor, 'updatedAt'> & { updatedAt?: number },
): Record<string, CollaborativeCursor> {
  const next = { ...cursors };
  next[cursor.actorId] = {
    ...cursor,
    updatedAt: cursor.updatedAt ?? Date.now(),
  };
  return next;
}

export function removeCollaborativeCursor(
  cursors: Record<string, CollaborativeCursor>,
  actorId: string,
): Record<string, CollaborativeCursor> {
  const next = { ...cursors };
  delete next[actorId];
  return next;
}

export function createClassroomSessionState<
  TSnapshot extends InstrumentSnapshot,
  TDelta,
>(
  input: CreateClassroomSessionStateInput<TSnapshot, TDelta>,
): ClassroomSessionState<TSnapshot, TDelta> {
  return {
    scope: { ...input.scope },
    mode: input.mode,
    role: input.role,
    snapshot: cloneSnapshot(input.snapshot),
    comments: input.comments?.map(comment => ({ ...comment })) ?? [],
    cursors: { ...input.cursors },
    ownership: { ...input.ownership },
    freeze: input.freeze ?? { frozen: false, updatedAt: Date.now() },
    replay: input.replay?.map(event => ({ ...event })) ?? [],
  };
}

export function appendReplayDelta<TDelta>(
  replay: Array<ConstructionReplayEvent<TDelta>>,
  delta: TDelta,
  meta: DeltaMeta,
  snapshotId?: string,
): Array<ConstructionReplayEvent<TDelta>> {
  const event: ConstructionReplayEvent<TDelta> = {
    id: meta.id || createWorkflowId('replay'),
    revision: replay.length + 1,
    delta,
    meta: { ...meta },
  };
  if (snapshotId !== undefined) event.snapshotId = snapshotId;
  return [...replay, event];
}

export function replayConstructionHistory<TSnapshot, TDelta>(
  instrument: KleinInstrument<TSnapshot, TDelta>,
  replay: Array<ConstructionReplayEvent<TDelta>>,
): void {
  for (const event of replay) {
    instrument.applyDelta(event.delta, {
      emit: false,
      meta: {
        ...event.meta,
        source: 'history',
      },
    });
  }
}

export function createReadOnlyShareLink(input: CreateReadOnlyShareLinkInput): ClassroomShareLink {
  const token = input.token ?? createWorkflowId('share');
  const url = new URL(input.path ?? '/embed', input.baseUrl);
  url.searchParams.set('mode', 'readonly');
  url.searchParams.set('shareToken', token);
  applyScopeToUrl(url, input.scope);
  const link: ClassroomShareLink = {
    id: input.id ?? createWorkflowId('readonly'),
    url: url.toString(),
    token,
    scope: { ...input.scope },
    createdAt: input.createdAt ?? Date.now(),
  };
  if (input.expiresAt !== undefined) link.expiresAt = input.expiresAt;
  return link;
}

export function createTeamEditableSession<TSnapshot extends InstrumentSnapshot>(
  input: CreateTeamSessionInput<TSnapshot>,
): TeamEditableSession<TSnapshot> {
  const now = input.createdAt ?? Date.now();
  const scope: Pick<ClassroomScope, 'teamId' | 'channelId' | 'assignmentId' | 'roomId' | 'sessionId'> = {
    teamId: input.teamId,
  };
  if (input.channelId !== undefined) scope.channelId = input.channelId;
  if (input.assignmentId !== undefined) scope.assignmentId = input.assignmentId;
  if (input.roomId !== undefined) scope.roomId = input.roomId;
  const session: TeamEditableSession<TSnapshot> = {
    id: createTeamSessionId(scope),
    teamId: input.teamId,
    roomId: input.roomId ?? createWorkflowId('room'),
    snapshot: cloneSnapshot(input.snapshot),
    memberIds: [...(input.memberIds ?? [])],
    createdAt: now,
    updatedAt: now,
  };
  if (input.assignmentId !== undefined) session.assignmentId = input.assignmentId;
  if (input.channelId !== undefined) session.channelId = input.channelId;
  if (input.title !== undefined) session.title = input.title;
  if (input.metadata !== undefined) session.metadata = cloneJsonObject(input.metadata);
  return session;
}

export async function saveClassroomSession<TSnapshot, TDelta>(
  instrument: KleinInstrument<TSnapshot, TDelta>,
  adapter: KleinSessionStorageAdapter<TSnapshot>,
  options: SaveClassroomSessionOptions,
): Promise<PersistedSession<TSnapshot>> {
  const sessionId = options.sessionId ?? createClassroomSessionId(options.scope, options.kind);
  const saveOptions: Omit<SaveSessionInput<TSnapshot>, 'snapshot'> = {
    sessionId,
    datasourceId: classroomDatasourceId(options.scope),
    metadata: {
      ...classroomSessionMetadata(options.scope, options.kind),
      ...(options.metadata ?? {}),
    },
  };
  if (options.expectedRevision !== undefined) saveOptions.expectedRevision = options.expectedRevision;
  const userId = options.userId ?? options.scope.studentId;
  if (userId !== undefined) saveOptions.userId = userId;
  return saveInstrumentSession(instrument, adapter, saveOptions);
}

export async function loadClassroomSession<TSnapshot, TDelta>(
  instrument: KleinInstrument<TSnapshot, TDelta>,
  adapter: KleinSessionStorageAdapter<TSnapshot>,
  options: LoadClassroomSessionOptions,
): Promise<PersistedSession<TSnapshot> | null> {
  return loadInstrumentSession(
    instrument,
    adapter,
    options.sessionId ?? createClassroomSessionId(options.scope, options.kind),
  );
}

export async function listClassroomSessions<TSnapshot>(
  adapter: KleinSessionStorageAdapter<TSnapshot>,
  options: ListClassroomSessionOptions = {},
): Promise<Array<PersistedSession<TSnapshot>>> {
  if (!adapter.list) return [];
  const datasourceId = options.scope ? classroomDatasourceId(options.scope) : options.datasourceId;
  const listOptions: ListSessionsOptions = {};
  if (options.userId !== undefined) listOptions.userId = options.userId;
  if (datasourceId !== undefined) listOptions.datasourceId = datasourceId;
  if (options.limit !== undefined) listOptions.limit = options.limit;
  const sessions = await adapter.list(listOptions);
  return sessions.filter(session => {
    if (options.kind !== undefined && session.metadata?.kind !== options.kind) return false;
    if (options.scope !== undefined && !sessionMatchesScope(session, options.scope)) return false;
    return true;
  });
}

export function createClassroomSessionId(scope: ClassroomScope, kind: ClassroomSessionKind): string {
  return scopedId('classroom', kind, scope);
}

export function createTeamSessionId(scope: Pick<ClassroomScope, 'teamId' | 'channelId' | 'assignmentId' | 'roomId' | 'sessionId'>): string {
  return scopedId('team', 'team-session', scope);
}

export function classroomDatasourceId(scope: ClassroomScope): string {
  if (scope.courseId) return `course:${sanitizeId(scope.courseId)}`;
  if (scope.classId) return `class:${sanitizeId(scope.classId)}`;
  if (scope.teamId) return `team:${sanitizeId(scope.teamId)}`;
  if (scope.roomId) return `room:${sanitizeId(scope.roomId)}`;
  return 'classroom:default';
}

export function classroomSessionMetadata(
  scope: ClassroomScope,
  kind: ClassroomSessionKind,
): Record<string, JsonValue> {
  const metadata: Record<string, JsonValue> = { kind };
  for (const [key, value] of Object.entries(scope)) {
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

export function lockSnapshotObjects<TSnapshot extends InstrumentSnapshot>(
  snapshot: TSnapshot,
  objectIds?: string[],
  locked = true,
): TSnapshot {
  const clone = cloneSnapshot(snapshot) as Record<string, unknown>;
  const scene = clone.scene;
  if (!isRecord(scene)) return clone as TSnapshot;
  const selected = objectIds ? new Set(objectIds) : null;
  visitRecords(scene, value => {
    if (typeof value.id !== 'string') return;
    if (selected && !selected.has(value.id)) return;
    value.locked = locked;
  });
  return clone as TSnapshot;
}

export function collectSnapshotObjectIds(snapshot: InstrumentSnapshot): string[] {
  const ids = new Set<string>();
  if (!isRecord(snapshot.scene)) return [];
  visitRecords(snapshot.scene, value => {
    if (typeof value.id === 'string') ids.add(value.id);
  });
  return [...ids];
}

export function selectionToObjectIds(selection: CollaborationSelectionItem[]): string[] {
  return selection.map(item => item.id);
}

function normalizeClassroomRuntimeMode(
  mode: ClassroomWorkflowMode,
): ClassroomPolicy['mode'] {
  switch (mode) {
    case 'assignment-authoring':
      return 'assignment-authoring';
    case 'assignment-student':
    case 'student-work':
      return 'student-work';
    case 'team':
    case 'team-session':
      return 'team-session';
    case 'review':
      return 'review';
    case 'readonly':
    case 'readonly-share':
      return 'readonly-share';
  }
}

function classroomSessionKindForMode(mode: ClassroomWorkflowMode): ClassroomSessionKind {
  switch (normalizeClassroomRuntimeMode(mode)) {
    case 'assignment-authoring':
      return 'template';
    case 'student-work':
      return 'student-work';
    case 'team-session':
      return 'team-session';
    case 'review':
      return 'review';
    case 'readonly-share':
      return 'readonly-share';
  }
}

function classroomSaveDraftInput<TSnapshot extends InstrumentSnapshot>(
  context: ClassroomContext,
  snapshot: TSnapshot,
  expectedRevision: number | undefined,
): ClassroomSaveDraftInput<TSnapshot> {
  const input: ClassroomSaveDraftInput<TSnapshot> = { context, snapshot };
  if (expectedRevision !== undefined) input.expectedRevision = expectedRevision;
  return input;
}

function classroomSetFrozenInput(
  context: ClassroomContext,
  frozen: boolean,
  actorId: string | undefined,
  reason: string | undefined,
): ClassroomSetFrozenInput {
  const input: ClassroomSetFrozenInput = { context, frozen };
  if (actorId !== undefined) input.actorId = actorId;
  if (reason !== undefined) input.reason = reason;
  return input;
}

function classroomStorageDraftOptions(options: {
  sessionId: string;
  expectedRevision: number | undefined;
  actorId: string | undefined;
  datasourceId: string | undefined;
  metadata: Record<string, JsonValue> | undefined;
  clock: () => number;
  revision: number;
}): {
  sessionId: string;
  expectedRevision?: number;
  actorId?: string;
  datasourceId?: string;
  metadata?: Record<string, JsonValue>;
  clock: () => number;
  revision: number;
} {
  const result: {
    sessionId: string;
    expectedRevision?: number;
    actorId?: string;
    datasourceId?: string;
    metadata?: Record<string, JsonValue>;
    clock: () => number;
    revision: number;
  } = {
    sessionId: options.sessionId,
    clock: options.clock,
    revision: options.revision,
  };
  if (options.expectedRevision !== undefined) result.expectedRevision = options.expectedRevision;
  if (options.actorId !== undefined) result.actorId = options.actorId;
  if (options.datasourceId !== undefined) result.datasourceId = options.datasourceId;
  if (options.metadata !== undefined) result.metadata = options.metadata;
  return result;
}

function canApplyClassroomDelta<TDelta>(
  policy: ClassroomPolicy,
  delta: TDelta,
): { allowed: true } | { allowed: false; code: string; message: string; details?: JsonValue } {
  const editable = policy.canEditTemplate || policy.canEditOwnWork || policy.canEditSharedTeamWork;
  if (!editable) {
    return {
      allowed: false,
      code: 'classroom_edit_denied',
      message: 'Current classroom policy does not allow editing.',
    };
  }
  if (policy.frozen && !(policy.role === 'teacher' || policy.role === 'co-teacher')) {
    return {
      allowed: false,
      code: 'classroom_frozen',
      message: 'This classroom session is frozen.',
    };
  }
  const lockedObjectIds = deltaTouchesLockedObjects(delta, policy.lockedObjectIds);
  if (lockedObjectIds.length > 0) {
    return {
      allowed: false,
      code: 'classroom_locked_object',
      message: 'This delta modifies locked starter objects.',
      details: { lockedObjectIds },
    };
  }
  return { allowed: true };
}

async function saveDraftWithStorage<TSnapshot extends InstrumentSnapshot>(
  storage: KleinStorageAdapter<TSnapshot> | undefined,
  snapshot: TSnapshot,
  options: {
    sessionId: string;
    expectedRevision?: number;
    actorId?: string;
    datasourceId?: string;
    metadata?: Record<string, JsonValue>;
    clock: () => number;
    revision: number;
  },
): Promise<SavedSnapshot> {
  if (storage) {
    const saveInput: Parameters<KleinStorageAdapter<TSnapshot>['save']>[0] = {
      sessionId: options.sessionId,
      snapshot,
    };
    if (options.expectedRevision !== undefined) saveInput.expectedRevision = options.expectedRevision;
    if (options.actorId !== undefined) saveInput.actorId = options.actorId;
    if (options.datasourceId !== undefined) saveInput.datasourceId = options.datasourceId;
    if (options.metadata !== undefined) saveInput.metadata = options.metadata;
    return storage.save(saveInput);
  }
  const now = options.clock();
  const saved: SavedSnapshot = {
    sessionId: options.sessionId,
    revision: options.revision + 1,
    createdAt: now,
    updatedAt: now,
  };
  if (options.datasourceId !== undefined) saved.datasourceId = options.datasourceId;
  if (options.metadata !== undefined) saved.metadata = options.metadata;
  return saved;
}

function deltaTouchesLockedObjects(delta: unknown, lockedObjectIds: string[]): string[] {
  if (lockedObjectIds.length === 0) return [];
  const locked = new Set(lockedObjectIds);
  const touched = new Set<string>();
  visitRecords(delta, record => {
    const op = record.op;
    const id = record.id;
    const objectId = record.objectId;
    const ids = record.ids;
    if ((op === 'update' || op === 'updateExpression' || op === 'updatePoint' || op === 'updateSlider' || op === 'delete') && typeof id === 'string' && locked.has(id)) {
      touched.add(id);
    }
    if (typeof objectId === 'string' && locked.has(objectId)) {
      touched.add(objectId);
    }
    if (Array.isArray(ids)) {
      for (const candidate of ids) {
        if (typeof candidate === 'string' && locked.has(candidate)) touched.add(candidate);
      }
    }
  });
  return [...touched];
}

function sessionMatchesScope<TSnapshot>(
  session: PersistedSession<TSnapshot>,
  scope: ClassroomScope,
): boolean {
  const metadata = session.metadata ?? {};
  for (const [key, value] of Object.entries(scope)) {
    if (value !== undefined && metadata[key] !== value) return false;
  }
  return true;
}

function applyScopeToUrl(url: URL, scope: ClassroomScope): void {
  for (const [key, value] of Object.entries(scope)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
}

function scopedId(prefix: string, kind: ClassroomSessionKind, scope: ClassroomScope): string {
  const parts = [
    prefix,
    kind,
    scope.courseId,
    scope.classId,
    scope.teamId,
    scope.channelId,
    scope.assignmentId,
    scope.studentId,
    scope.groupId,
    scope.roomId,
    scope.sessionId,
  ].filter((part): part is string => Boolean(part));
  if (parts.length <= 2) parts.push(createWorkflowId('session'));
  return parts.map(sanitizeId).join(':');
}

function sanitizeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'id';
}

function createWorkflowId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return `${prefix}-${cryptoApi.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function cloneSnapshot<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as TSnapshot;
}

function cloneJsonObject(value: Record<string, JsonValue>): Record<string, JsonValue> {
  return cloneSnapshot(value);
}

function visitRecords(value: unknown, visitor: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    value.forEach(item => visitRecords(item, visitor));
    return;
  }
  if (!isRecord(value)) return;
  visitor(value);
  for (const child of Object.values(value)) visitRecords(child, visitor);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
