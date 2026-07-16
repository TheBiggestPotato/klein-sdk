# Klein SDK

Framework-independent TypeScript SDK for Klein classroom math tools.

This repo is scaffolded as one npm package with subpath exports. The core instrument APIs are DOM/imperative first, with optional custom-element helpers in `klein-sdk/dom`.

## Repository Status

`klein-sdk` is the active SDK.

`klein-tools-sdk` is deprecated. It may still be consulted for useful geometry/tooling code that should be replicated here, but new SDK work should land in `klein-sdk` and `klein-sdk` must not depend on `klein-tools-sdk`.

## Entry Points

### v0 Deployment Surface

These exports are the supported v0 surface for the GeoGebra-style SDK work:

- `klein-sdk/tools` - tool registry, alias normalization, and `createKleinToolRuntime()`
- `klein-sdk/graphing` - graphing calculator runtime
- `klein-sdk/geometry-lab` - 2D/3D Geometry Lab runtime, including solids, sampled surfaces, and equation surfaces
- `klein-sdk/graphing-3d` - legacy compatibility facade backed by Geometry Lab
- `klein-sdk/scientific` and `klein-sdk/calculator` - scientific calculator runtime
- `klein-sdk/probability` - probability/statistics runtime
- `klein-sdk/whiteboard` - classroom whiteboard runtime
- `klein-sdk/classroom` - classroom policy/runtime/backend adapter contracts
- `klein-sdk/exam` - soft exam-mode policy and integrity-event hooks
- `klein-sdk/persistence` - storage adapter contracts and local adapter helpers
- `klein-sdk/collab` - collaboration transport contracts and generic message envelope
- `klein-sdk/embed` - embedded launch context and host bridge helpers
- `klein-sdk/integrations/teams`
- `klein-sdk/integrations/google-classroom`

Foundation exports that v0 tools use directly:

- `klein-sdk/core`
- `klein-sdk/math`
- `klein-sdk/geometry-core`
- `klein-sdk/dom`
- `klein-sdk/theme` - host-owned light/dark palette contracts for DOM tool renderers

Exports present for development but not part of the v0 deployment promise:

- `klein-sdk/algebra`
- `klein-sdk/spreadsheet`
- `klein-sdk/workspace`
- classic/legacy GeoGebra-compatible shells

## Commands

```bash
npm run typecheck
npm run build
npm run test
npm run pack:local
```

## Example

```ts
import { createKleinToolRuntime } from 'klein-sdk/tools';

const runtime = createKleinToolRuntime({
  toolKey: 'geogebra-graphing',
  container: document.getElementById('tool')!,
});

runtime.execute({ type: 'setTool', payload: 'expression' });
```

The same factory accepts the SDK keys (`graphing`, `geometry-lab`, `scientific`, `probability`, `whiteboard`) and the current Klein client room aliases (`geogebra-graphing`, `geogebra-3d`, `geometrie-3d`, `geogebra-scientific`, `geogebra-probability`, `tabla`). Legacy 3D aliases normalize to `geometry-lab`.

## Tool Theming

Tool palettes are host-owned and are never saved with snapshots or sent through collaboration deltas. The built-in light and dark presets match the Klein application palette; pass a partial theme to override only the tokens your host owns.

```ts
import { createWhiteboard, resolveKleinToolTheme } from 'klein-sdk';

const theme = resolveKleinToolTheme({
  name: 'school-brand',
  primary: '#0057b8',
  accent: '#00a38c',
});

createWhiteboard({
  container: document.getElementById('whiteboard')!,
  theme,
});
```

Use `getKleinToolThemeCssVariables(theme)` when rendering a framework-specific host UI, or `applyKleinToolTheme(element, theme)` for a DOM container. The React reference adapters accept the same `theme` prop and otherwise inherit the active Klein client palette.

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

See [docs/V0_API.md](./docs/V0_API.md) for the supported v0 subpath API reference.

See [GEOGEBRA_V0_SDK_IMPLEMENTATION_PLAN.md](./GEOGEBRA_V0_SDK_IMPLEMENTATION_PLAN.md) for the current reduced v0 implementation plan and progress ledger.

See [V0_DEPLOYMENT_READINESS.md](./V0_DEPLOYMENT_READINESS.md) for current deployment blockers and free/low-cost deployment strategies.
