import { KleinSdkError } from '../core/index.js';
import type {
  JsonValue,
  KleinToolKey,
  PolicyDecision,
  ToolCommand,
  Unsubscribe,
} from '../core/index.js';

export type ExamDisabledFeature =
  | 'import'
  | 'export'
  | 'external-links'
  | 'collaboration'
  | 'copy'
  | 'paste'
  | 'share'
  | 'print'
  | 'tool-switching';

export interface ExamProfile {
  id: string;
  allowedTools: KleinToolKey[];
  disabledFeatures: ExamDisabledFeature[];
  allowCollaboration: boolean;
  allowExport: boolean;
  allowImport: boolean;
  allowExternalLinks: boolean;
  requireFullscreen: boolean;
  requireSnapshotSigning: boolean;
}

export type ExamSessionStatus = 'idle' | 'active' | 'stopped';
export type ExamStopReason = 'submitted' | 'cancelled' | 'expired' | 'host-ended' | 'error';

export interface ExamSession {
  id: string;
  profileId: string;
  toolKey: KleinToolKey;
  actorId?: string;
  startedAt: number;
  stoppedAt?: number;
  stopReason?: ExamStopReason;
  status: ExamSessionStatus;
}

export type ExamIntegrityEventKind =
  | 'exam-started'
  | 'exam-stopped'
  | 'command-blocked'
  | 'fullscreen-entered'
  | 'fullscreen-exited'
  | 'visibility-hidden'
  | 'visibility-visible'
  | 'window-blurred'
  | 'window-focused'
  | 'network-offline'
  | 'network-online'
  | 'host-integrity-failure'
  | 'snapshot-signed'
  | 'snapshot-signature-missing';

export interface ExamIntegrityEvent {
  id: string;
  sessionId: string;
  profileId: string;
  toolKey: KleinToolKey;
  kind: ExamIntegrityEventKind;
  createdAt: number;
  actorId?: string;
  severity: 'info' | 'warning' | 'blocker';
  message?: string;
  metadata?: JsonValue;
}

export interface ExamController {
  readonly profile: ExamProfile;
  readonly toolKey: KleinToolKey;
  getSession(): ExamSession | null;
  start(): Promise<ExamSession>;
  stop(reason: ExamStopReason): Promise<void>;
  canExecute(command: ToolCommand): PolicyDecision;
  recordIntegrityEvent(event: Omit<ExamIntegrityEvent, 'id' | 'sessionId' | 'profileId' | 'toolKey' | 'createdAt' | 'actorId'> & {
    id?: string;
    createdAt?: number;
    actorId?: string;
  }): void;
  getEventLog(): ExamIntegrityEvent[];
  subscribe(listener: ExamEventListener): Unsubscribe;
}

export type ExamEventListener = (event: ExamIntegrityEvent) => void;

export interface CreateExamControllerOptions {
  profile: ExamProfile;
  toolKey: KleinToolKey;
  sessionId?: string;
  actorId?: string;
  now?: () => number;
  idFactory?: (prefix: string) => string;
  onEvent?: ExamEventListener;
}

export interface BrowserExamIntegrityWatcherOptions {
  window?: Window;
  document?: Document;
}

export const EXAM_API_ROUTES = {
  sessions: '/api/exam-sessions',
  session: (sessionId: string) => `/api/exam-sessions/${encodeURIComponent(sessionId)}`,
  events: (sessionId: string) => `/api/exam-sessions/${encodeURIComponent(sessionId)}/events`,
  submissions: (sessionId: string) => `/api/exam-sessions/${encodeURIComponent(sessionId)}/submissions`,
} as const;

export function createExamController(options: CreateExamControllerOptions): ExamController {
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? defaultIdFactory;
  const listeners = new Set<ExamEventListener>();
  const events: ExamIntegrityEvent[] = [];
  let session: ExamSession | null = null;

  if (options.onEvent) listeners.add(options.onEvent);

  const emit = (event: ExamIntegrityEvent): void => {
    events.push(event);
    for (const listener of listeners) listener(event);
  };

  const buildEvent = (
    event: Parameters<ExamController['recordIntegrityEvent']>[0],
  ): ExamIntegrityEvent => {
    const activeSession = session ?? createSession(options, now, idFactory, 'idle');
    const result: ExamIntegrityEvent = {
      id: event.id ?? idFactory('exam-event'),
      sessionId: activeSession.id,
      profileId: options.profile.id,
      toolKey: options.toolKey,
      kind: event.kind,
      createdAt: event.createdAt ?? now(),
      severity: event.severity,
    };
    const actorId = event.actorId ?? options.actorId;
    if (actorId !== undefined) result.actorId = actorId;
    if (event.message !== undefined) result.message = event.message;
    if (event.metadata !== undefined) result.metadata = event.metadata;
    return result;
  };

  return {
    profile: options.profile,
    toolKey: options.toolKey,
    getSession() {
      return session ? { ...session } : null;
    },
    async start() {
      if (!options.profile.allowedTools.includes(options.toolKey)) {
        throw new KleinSdkError('exam_tool_denied', 'This tool is not allowed by the exam profile.', {
          toolKey: options.toolKey,
          profileId: options.profile.id,
        });
      }
      if (session?.status === 'active') return { ...session };
      session = createSession(options, now, idFactory, 'active');
      emit(buildEvent({
        kind: 'exam-started',
        severity: 'info',
      }));
      return { ...session };
    },
    async stop(reason) {
      if (!session) return;
      const stoppedAt = now();
      session = {
        ...session,
        status: 'stopped',
        stoppedAt,
        stopReason: reason,
      };
      emit(buildEvent({
        kind: 'exam-stopped',
        severity: reason === 'submitted' ? 'info' : 'warning',
        message: reason,
        createdAt: stoppedAt,
      }));
    },
    canExecute(command) {
      return examPolicyDecision(options.profile, options.toolKey, command);
    },
    recordIntegrityEvent(event) {
      emit(buildEvent(event));
    },
    getEventLog() {
      return events.map(event => ({ ...event }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function assertExamCommandAllowed(controller: ExamController, command: ToolCommand): void {
  const decision = controller.canExecute(command);
  if (decision.allowed) return;
  controller.recordIntegrityEvent({
    kind: 'command-blocked',
    severity: 'blocker',
    message: decision.message,
  });
  throw new KleinSdkError(decision.code, decision.message, decision.details);
}

export function watchBrowserExamIntegrity(
  controller: ExamController,
  options: BrowserExamIntegrityWatcherOptions = {},
): Unsubscribe {
  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = options.document ?? (typeof document !== 'undefined' ? document : undefined);
  const cleanup: Unsubscribe[] = [];

  if (doc) {
    const onVisibility = (): void => {
      controller.recordIntegrityEvent({
        kind: doc.visibilityState === 'hidden' ? 'visibility-hidden' : 'visibility-visible',
        severity: doc.visibilityState === 'hidden' ? 'warning' : 'info',
      });
    };
    const onFullscreen = (): void => {
      controller.recordIntegrityEvent({
        kind: doc.fullscreenElement ? 'fullscreen-entered' : 'fullscreen-exited',
        severity: doc.fullscreenElement ? 'info' : 'warning',
      });
    };
    doc.addEventListener('visibilitychange', onVisibility);
    doc.addEventListener('fullscreenchange', onFullscreen);
    cleanup.push(() => doc.removeEventListener('visibilitychange', onVisibility));
    cleanup.push(() => doc.removeEventListener('fullscreenchange', onFullscreen));
  }

  if (win) {
    const onBlur = (): void => controller.recordIntegrityEvent({ kind: 'window-blurred', severity: 'warning' });
    const onFocus = (): void => controller.recordIntegrityEvent({ kind: 'window-focused', severity: 'info' });
    const onOffline = (): void => controller.recordIntegrityEvent({ kind: 'network-offline', severity: 'warning' });
    const onOnline = (): void => controller.recordIntegrityEvent({ kind: 'network-online', severity: 'info' });
    win.addEventListener('blur', onBlur);
    win.addEventListener('focus', onFocus);
    win.addEventListener('offline', onOffline);
    win.addEventListener('online', onOnline);
    cleanup.push(() => win.removeEventListener('blur', onBlur));
    cleanup.push(() => win.removeEventListener('focus', onFocus));
    cleanup.push(() => win.removeEventListener('offline', onOffline));
    cleanup.push(() => win.removeEventListener('online', onOnline));
  }

  return () => {
    for (const unsubscribe of cleanup) unsubscribe();
  };
}

export function examPolicyDecision(
  profile: ExamProfile,
  toolKey: KleinToolKey,
  command: ToolCommand,
): PolicyDecision {
  if (!profile.allowedTools.includes(toolKey)) {
    return {
      allowed: false,
      code: 'exam_tool_denied',
      message: 'This tool is not allowed by the exam profile.',
      details: { toolKey, profileId: profile.id },
    };
  }

  const feature = command.feature ?? command.type;
  if ((feature === 'collaboration' || command.type === 'sendDelta') && !profile.allowCollaboration) {
    return blocked('exam_collaboration_denied', 'Collaboration is disabled for this exam.', feature);
  }
  if ((feature === 'export' || command.type === 'export') && !profile.allowExport) {
    return blocked('exam_export_denied', 'Export is disabled for this exam.', feature);
  }
  if ((feature === 'import' || command.type === 'import' || command.type === 'loadSnapshot') && !profile.allowImport) {
    return blocked('exam_import_denied', 'Import is disabled for this exam.', feature);
  }
  if ((feature === 'external-links' || command.type === 'openExternalLink') && !profile.allowExternalLinks) {
    return blocked('exam_external_link_denied', 'External links are disabled for this exam.', feature);
  }
  if (profile.disabledFeatures.includes(feature as ExamDisabledFeature)) {
    return blocked('exam_feature_denied', `Feature "${feature}" is disabled for this exam.`, feature);
  }
  return { allowed: true };
}

function createSession(
  options: CreateExamControllerOptions,
  now: () => number,
  idFactory: (prefix: string) => string,
  status: ExamSessionStatus,
): ExamSession {
  const session: ExamSession = {
    id: options.sessionId ?? idFactory('exam-session'),
    profileId: options.profile.id,
    toolKey: options.toolKey,
    startedAt: now(),
    status,
  };
  if (options.actorId !== undefined) session.actorId = options.actorId;
  return session;
}

function blocked(code: string, message: string, feature: string): PolicyDecision {
  return {
    allowed: false,
    code,
    message,
    details: { feature },
  };
}

function defaultIdFactory(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return `${prefix}-${cryptoApi.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
