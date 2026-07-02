import { createEmbedUrl } from '../../embed/index.js';
import type { EmbeddedLaunchContext, EmbeddedMode, EmbeddedToolKind } from '../../embed/index.js';

/** Classroom add-on iframe surfaces supported by the hosted SDK app. */
export type ClassroomIframeKind =
  | 'attachment-discovery'
  | 'teacher-view'
  | 'student-view'
  | 'student-work-review'
  | 'link-upgrade';

/** Classroom role expected for a launch surface. */
export type ClassroomRole = 'teacher' | 'student';

/** Classroom-specific launch context after token and iframe metadata are normalized by the host. */
export interface ClassroomLaunchContext {
  platform: 'google-classroom';
  iframe: ClassroomIframeKind;
  role: ClassroomRole;
  tool: EmbeddedToolKind;
  mode: EmbeddedMode;
  addOnToken?: string;
  courseId?: string;
  itemId?: string;
  attachmentId?: string;
  submissionId?: string;
  locale?: string;
}

/** Inputs for creating a Classroom add-on iframe URL. */
export interface ClassroomUrlOptions {
  baseUrl: string | URL;
  iframe: ClassroomIframeKind;
  tool: EmbeddedToolKind;
  mode?: EmbeddedMode;
  addOnToken?: string;
  courseId?: string;
  itemId?: string;
  attachmentId?: string;
  submissionId?: string;
  locale?: string;
}

/** Builds one of the Google Classroom add-on iframe URLs for a specific SDK tool. */
export function createClassroomIframeUrl(options: ClassroomUrlOptions): string {
  const context: EmbeddedLaunchContext = {
    platform: 'google-classroom',
    tool: options.tool,
    mode: options.mode ?? modeForClassroomIframe(options.iframe),
  };
  if (options.courseId) {
    context.courseId = options.courseId;
  }
  if (options.itemId) {
    context.assignmentId = options.itemId;
  }
  if (options.locale) {
    context.locale = options.locale;
  }
  context.platformContext = compactRecord({
    iframe: options.iframe,
    addOnToken: options.addOnToken,
    itemId: options.itemId,
    attachmentId: options.attachmentId,
    submissionId: options.submissionId,
  });

  return createEmbedUrl({
    baseUrl: options.baseUrl,
    path: `/integrations/google-classroom/${options.iframe}`,
    context,
  });
}

/** SDK activity attachment descriptor that a host can map into Classroom API calls. */
export interface ClassroomAttachment {
  title: string;
  tool: EmbeddedToolKind;
  launchUrl: string;
  thumbnailUrl?: string;
  maxPoints?: number;
  studentWorkReviewUrl?: string;
}

/** Route set that must be configured for a Classroom add-on host app. */
export interface ClassroomAddonRouteConfig {
  attachmentDiscoveryUri: string;
  teacherViewUri: string;
  studentViewUri: string;
  studentWorkReviewUri: string;
  linkUpgradeUri: string;
}

/** Creates the canonical Classroom add-on route configuration for a deployed host origin. */
export function createClassroomAddonRouteConfig(baseUrl: string | URL): ClassroomAddonRouteConfig {
  const origin = new URL(baseUrl).origin;
  return {
    attachmentDiscoveryUri: `${origin}/integrations/google-classroom/attachment-discovery`,
    teacherViewUri: `${origin}/integrations/google-classroom/teacher-view`,
    studentViewUri: `${origin}/integrations/google-classroom/student-view`,
    studentWorkReviewUri: `${origin}/integrations/google-classroom/student-work-review`,
    linkUpgradeUri: `${origin}/integrations/google-classroom/link-upgrade`,
  };
}

/** Maps each Classroom iframe surface to the SDK's normalized workflow mode. */
export function modeForClassroomIframe(iframe: ClassroomIframeKind): EmbeddedMode {
  switch (iframe) {
    case 'attachment-discovery':
    case 'teacher-view':
    case 'link-upgrade':
      return 'assignment-authoring';
    case 'student-view':
      return 'assignment-student';
    case 'student-work-review':
      return 'review';
  }
}

/** Drops absent Classroom values before they are copied into generic platform context. */
function compactRecord(values: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      result[key] = value;
    }
  }
  return result;
}
