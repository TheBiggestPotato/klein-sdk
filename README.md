# Klein SDK

Framework-independent TypeScript SDK for Klein classroom math tools.

This repo is scaffolded as one npm package with subpath exports. The core instrument APIs are DOM/imperative first, with optional custom-element helpers in `klein-sdk/dom`.

## Repository Status

`klein-sdk` is the active SDK.

`klein-tools-sdk` is deprecated. It may still be consulted for useful geometry/tooling code that should be replicated here, but new SDK work should land in `klein-sdk` and `klein-sdk` must not depend on `klein-tools-sdk`.

## Entry Points

- `klein-sdk/core`
- `klein-sdk/math`
- `klein-sdk/geometry-core`
- `klein-sdk/whiteboard`
- `klein-sdk/geometry`
- `klein-sdk/geometry-lab`
- `klein-sdk/graphing`
- `klein-sdk/algebra`
- `klein-sdk/calculator`
- `klein-sdk/probability`
- `klein-sdk/spreadsheet`
- `klein-sdk/workspace`
- `klein-sdk/collab`
- `klein-sdk/dom`
- `klein-sdk/embed`
- `klein-sdk/integrations`
- `klein-sdk/integrations/teams`
- `klein-sdk/integrations/google-classroom`

## Commands

```bash
npm run typecheck
npm run build
npm run test
npm run pack:local
```

## Example

```ts
import { createWhiteboard } from 'klein-sdk/whiteboard';

const board = createWhiteboard({
  container: document.getElementById('tool')!,
});

board.setTool('pen');
```

## Platform Embeds

Teams and Google Classroom should embed a hosted web app that uses this SDK. The SDK provides shared launch URL and context helpers, while the host app owns SSO/OAuth, persistence, and platform API calls.

```ts
import { createTeamsTabUrl } from 'klein-sdk/integrations/teams';

const contentUrl = createTeamsTabUrl({
  baseUrl: 'https://tools.example.com',
  tool: 'geometry-lab',
  roomId: 'room_123',
});
```

```ts
import { createClassroomIframeUrl } from 'klein-sdk/integrations/google-classroom';

const studentUrl = createClassroomIframeUrl({
  baseUrl: 'https://tools.example.com',
  iframe: 'student-view',
  tool: 'graphing',
  itemId: 'courseWork_123',
});
```

Scaffold folders:

- [apps/web-host](./apps/web-host) — expected hosted app routes.
- [integrations/teams](./integrations/teams) — Teams manifest template and notes.
- [integrations/google-classroom](./integrations/google-classroom) — Classroom add-on route template and notes.

See [KLEIN_SDK_PLAN.md](./KLEIN_SDK_PLAN.md) for the full technical roadmap.

See [GEOMETRY_LAB_ROADMAP.md](./GEOMETRY_LAB_ROADMAP.md) for the focused 2D/3D Geometry Lab feature checklist.
