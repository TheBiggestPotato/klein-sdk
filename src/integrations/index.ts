export * from './linking.js';
export {
  createTeamsManifestTemplate,
  createTeamsTabUrl,
  TEAMS_MANIFEST_VERSION,
} from './teams/index.js';
export type {
  TeamsLaunchContext,
  TeamsManifestDeveloper,
  TeamsManifestOptions,
  TeamsManifestTemplate,
  TeamsSurface,
  TeamsTabUrlOptions,
} from './teams/index.js';

export {
  createClassroomAddonRouteConfig,
  createClassroomIframeUrl,
  modeForClassroomIframe,
} from './google-classroom/index.js';
export type {
  ClassroomAddonRouteConfig,
  ClassroomAttachment,
  ClassroomIframeKind,
  ClassroomLaunchContext,
  ClassroomRole,
  ClassroomUrlOptions,
} from './google-classroom/index.js';
