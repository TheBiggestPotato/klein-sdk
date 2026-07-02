import { createEmbedUrl } from '../../embed/index.js';
import type { EmbeddedLaunchContext, EmbeddedMode, EmbeddedToolKind } from '../../embed/index.js';

/** Teams manifest schema version targeted by the scaffold. */
export const TEAMS_MANIFEST_VERSION = '1.29';

/** Teams surfaces where a hosted SDK app may be launched. */
export type TeamsSurface = 'personal' | 'team' | 'groupchat' | 'meeting';

/** Teams-specific launch context after the host app normalizes Teams SDK data. */
export interface TeamsLaunchContext extends EmbeddedLaunchContext {
  platform: 'microsoft-teams';
  teamsSurface?: TeamsSurface;
  tenantId?: string;
  teamId?: string;
  channelId?: string;
  chatId?: string;
  meetingId?: string;
}

/** Inputs for creating a Teams tab content URL for a specific SDK tool. */
export interface TeamsTabUrlOptions {
  baseUrl: string | URL;
  path?: string;
  tool: EmbeddedToolKind;
  mode?: EmbeddedMode;
  roomId?: string;
  assignmentId?: string;
  locale?: string;
  surface?: TeamsSurface;
}

/** Builds the iframe URL used by Teams personal or configurable tabs. */
export function createTeamsTabUrl(options: TeamsTabUrlOptions): string {
  const context: EmbeddedLaunchContext = {
    platform: 'microsoft-teams',
    tool: options.tool,
    mode: options.mode ?? 'standalone',
  };
  if (options.roomId) {
    context.roomId = options.roomId;
  }
  if (options.assignmentId) {
    context.assignmentId = options.assignmentId;
  }
  if (options.locale) {
    context.locale = options.locale;
  }
  if (options.surface) {
    context.platformContext = { surface: options.surface };
  }

  return createEmbedUrl({
    baseUrl: options.baseUrl,
    path: options.path ?? '/integrations/teams/tab',
    context,
  });
}

/** Required developer metadata for Teams app manifests. */
export interface TeamsManifestDeveloper {
  name: string;
  websiteUrl: string;
  privacyUrl: string;
  termsOfUseUrl: string;
}

/** Inputs for generating a starter Teams manifest. */
export interface TeamsManifestOptions {
  appId: string;
  hostOrigin: string;
  nameShort?: string;
  nameFull?: string;
  descriptionShort?: string;
  descriptionFull?: string;
  developer: TeamsManifestDeveloper;
  accentColor?: string;
}

/** Minimal Teams manifest shape produced by the SDK helper. */
export interface TeamsManifestTemplate {
  $schema: string;
  manifestVersion: string;
  version: string;
  id: string;
  developer: TeamsManifestDeveloper;
  name: {
    short: string;
    full: string;
  };
  description: {
    short: string;
    full: string;
  };
  icons: {
    outline: string;
    color: string;
  };
  accentColor: string;
  staticTabs: Array<{
    entityId: string;
    name: string;
    contentUrl: string;
    websiteUrl: string;
    scopes: Array<'personal'>;
  }>;
  configurableTabs: Array<{
    configurationUrl: string;
    canUpdateConfiguration: boolean;
    scopes: Array<'team' | 'groupchat'>;
  }>;
  validDomains: string[];
}

/** Creates a starter Teams manifest object for the hosted SDK app. */
export function createTeamsManifestTemplate(options: TeamsManifestOptions): TeamsManifestTemplate {
  const origin = new URL(options.hostOrigin);
  const hostOrigin = origin.origin;

  return {
    $schema: `https://developer.microsoft.com/json-schemas/teams/v${TEAMS_MANIFEST_VERSION}/MicrosoftTeams.schema.json`,
    manifestVersion: TEAMS_MANIFEST_VERSION,
    version: '0.1.0',
    id: options.appId,
    developer: options.developer,
    name: {
      short: options.nameShort ?? 'Klein Tools',
      full: options.nameFull ?? 'Klein Math Tools',
    },
    description: {
      short: options.descriptionShort ?? 'Interactive math tools for classrooms.',
      full:
        options.descriptionFull ??
        'Klein Math Tools provides embeddable whiteboard, geometry, graphing, algebra, and calculator activities.',
    },
    icons: {
      outline: 'outline.png',
      color: 'color.png',
    },
    accentColor: options.accentColor ?? '#2563eb',
    staticTabs: [
      {
        entityId: 'klein-tools-home',
        name: 'Klein Tools',
        contentUrl: `${hostOrigin}/integrations/teams/personal`,
        websiteUrl: hostOrigin,
        scopes: ['personal'],
      },
    ],
    configurableTabs: [
      {
        configurationUrl: `${hostOrigin}/integrations/teams/config`,
        canUpdateConfiguration: true,
        scopes: ['team', 'groupchat'],
      },
    ],
    validDomains: [origin.hostname],
  };
}
