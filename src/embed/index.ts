import type { JsonValue } from '../core/index.js';

/** Host surface where an SDK tool is being embedded. */
export type EmbeddedPlatform = 'web' | 'microsoft-teams' | 'google-classroom';

/** Instrument identifiers that can be launched through embed URLs. */
export type EmbeddedToolKind =
  | 'whiteboard'
  | 'geometry-lab'
  | 'geometry'
  | 'graphing'
  | 'algebra'
  | 'calculator'
  | 'probability'
  | 'spreadsheet'
  | 'workspace';

/** High-level workflow mode for iframe and hosted app launches. */
export type EmbeddedMode =
  | 'standalone'
  | 'assignment-authoring'
  | 'assignment-student'
  | 'review'
  | 'readonly';

/** Normalized launch context passed from a host app into SDK instruments. */
export interface EmbeddedLaunchContext {
  platform: EmbeddedPlatform;
  tool: EmbeddedToolKind;
  mode: EmbeddedMode;
  roomId?: string;
  assignmentId?: string;
  courseId?: string;
  userId?: string;
  locale?: string;
  returnUrl?: string;
  platformContext?: Record<string, string>;
}

/** Inputs for building a stable iframe/deep-link URL for a hosted SDK activity. */
export interface EmbedUrlOptions {
  baseUrl: string | URL;
  path?: string;
  context: EmbeddedLaunchContext;
}

/** Serializes a normalized launch context into a URL that a host app can route. */
export function createEmbedUrl({ baseUrl, path = '/embed', context }: EmbedUrlOptions): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set('platform', context.platform);
  url.searchParams.set('tool', context.tool);
  url.searchParams.set('mode', context.mode);
  setOptionalParam(url, 'roomId', context.roomId);
  setOptionalParam(url, 'assignmentId', context.assignmentId);
  setOptionalParam(url, 'courseId', context.courseId);
  setOptionalParam(url, 'userId', context.userId);
  setOptionalParam(url, 'locale', context.locale);
  setOptionalParam(url, 'returnUrl', context.returnUrl);

  for (const [key, value] of Object.entries(context.platformContext ?? {})) {
    url.searchParams.set(`ctx.${key}`, value);
  }

  return url.toString();
}

/** Parses hosted-app query parameters back into a normalized launch context. */
export function parseEmbedSearchParams(search: string | URLSearchParams): EmbeddedLaunchContext {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const platform = parsePlatform(params.get('platform'));
  const tool = parseTool(params.get('tool'));
  const mode = parseMode(params.get('mode'));
  const platformContext: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    if (key.startsWith('ctx.')) {
      platformContext[key.slice(4)] = value;
    }
  }

  const context: EmbeddedLaunchContext = {
    platform,
    tool,
    mode,
  };
  setParsedParam(context, 'roomId', params.get('roomId'));
  setParsedParam(context, 'assignmentId', params.get('assignmentId'));
  setParsedParam(context, 'courseId', params.get('courseId'));
  setParsedParam(context, 'userId', params.get('userId'));
  setParsedParam(context, 'locale', params.get('locale'));
  setParsedParam(context, 'returnUrl', params.get('returnUrl'));
  if (Object.keys(platformContext).length > 0) {
    context.platformContext = platformContext;
  }

  return context;
}

/** Messages the embedded SDK app may send to its containing host frame. */
export type HostBridgeMessage =
  | { type: 'klein.ready'; context: EmbeddedLaunchContext }
  | { type: 'klein.resize'; height: number }
  | { type: 'klein.snapshot'; snapshot: JsonValue }
  | { type: 'klein.delta'; delta: JsonValue }
  | { type: 'klein.submit'; snapshot: JsonValue }
  | { type: 'klein.error'; code: string; message: string };

/** Minimal host bridge so iframe code can report readiness, resize, snapshots, deltas, and submit events. */
export interface HostBridge {
  post(message: HostBridgeMessage): void;
}

/** Configuration for safe parent-frame messaging. */
export interface HostBridgeOptions {
  targetOrigin: string;
  window?: Pick<Window, 'parent' | 'postMessage'>;
}

/** Creates a small postMessage wrapper for iframe integrations. */
export function createHostBridge(options: HostBridgeOptions): HostBridge {
  return {
    post(message) {
      const targetWindow = options.window?.parent ?? globalThis.parent;
      targetWindow.postMessage(message, options.targetOrigin);
    },
  };
}

/** Adds optional values to a URL without serializing `undefined` into query strings. */
function setOptionalParam(url: URL, key: string, value: string | undefined): void {
  if (value) {
    url.searchParams.set(key, value);
  }
}

/** Adds parsed query params onto the context while preserving exact optional property semantics. */
function setParsedParam(
  context: EmbeddedLaunchContext,
  key: 'roomId' | 'assignmentId' | 'courseId' | 'userId' | 'locale' | 'returnUrl',
  value: string | null,
): void {
  if (value) {
    context[key] = value;
  }
}

/** Parses a platform value defensively; unknown values fall back to the normal web host. */
function parsePlatform(value: string | null): EmbeddedPlatform {
  if (value === 'microsoft-teams' || value === 'google-classroom' || value === 'web') {
    return value;
  }
  return 'web';
}

/** Parses a tool id defensively; unknown values fall back to the workspace shell. */
function parseTool(value: string | null): EmbeddedToolKind {
  const tools: readonly EmbeddedToolKind[] = [
    'whiteboard',
    'geometry-lab',
    'geometry',
    'graphing',
    'algebra',
    'calculator',
    'probability',
    'spreadsheet',
    'workspace',
  ];
  return tools.includes(value as EmbeddedToolKind) ? (value as EmbeddedToolKind) : 'workspace';
}

/** Parses a workflow mode defensively; unknown values fall back to standalone mode. */
function parseMode(value: string | null): EmbeddedMode {
  const modes: readonly EmbeddedMode[] = [
    'standalone',
    'assignment-authoring',
    'assignment-student',
    'review',
    'readonly',
  ];
  return modes.includes(value as EmbeddedMode) ? (value as EmbeddedMode) : 'standalone';
}
