# Klein v0 Deployment Readiness

Scan date: 2026-07-05
Last updated: 2026-07-14

Scope:

- `/Users/andrei/projects/klein-sdk` on `main`
- `/Users/andrei/projects/klein-client` on `main`
- `/Users/andrei/projects/klein-server` on `main`
- `/Users/andrei/projects/klein-tests` on `master`

## Verdict

Klein is feature-close to v0 and approximately 85% ready for a first external preview. The release configuration corrections, Phase 6 quality/coverage gates, runtime image health, local upload persistence check, and isolated backup/restore drill are complete. It is not public-deploy ready until the deliberately deferred worktree review is pushed through remote CI, a target host/DNS/secrets are provisioned, and HTTPS/WSS staging verification succeeds.

The 2026-07-10 release audit found four concrete issues that were previously hidden by successful local tests. All four are now fixed locally:

- `klein-tests` now targets `master`, includes a TypeScript contract gate, and includes mobile E2E in the workflow summary; it becomes effective once the deferred review branch is pushed.
- The client now normalizes empty or whitespace `NEXT_PUBLIC_API_URL` values to `/api`, covered by a dedicated deployment-config regression script.
- `klein-server/deploy/README.md` now documents the committed `klein-sdk` vendor artifact and same-origin API flow.
- `backup.sh` and `restore-smoke.sh` now make backups and restore only into isolated disposable resources; the first local drill restored 23 public tables successfully.

The 2026-07-14 Phase 6 pass also added enforced Java/Maven and JaCoCo floors, service liveness/readiness, request correlation, Prometheus metrics, graceful shutdown, production-image health smoke, manual serialized deploys, an operations runbook, and a real PostgreSQL/API/relay CI contract job.

Final production-image browser verification also caught blank collaboration URL handling; one shared validator now covers every collaboration surface and release CI requires a non-empty `wss://` URL.

Recommended v0 scope:

- Ship the public content app, auth, profile, progress, resources, rooms, whiteboard, Geometry Lab 2D/3D with equation authoring, scientific calculator, and probability/statistics calculator as beta tools.
- Ship classroom and exam as beta surfaces: SDK contracts, reference backend, and client routes now pass local Docker browser smoke and live backend E2E, but keep them labeled beta until staging HTTPS/browser verification is complete.
- Do not market the whole GeoGebra-style SDK suite yet. `algebra`, `spreadsheet`, `workspace`, CAS, and classic workspace shells are outside the v0 deployment promise.
- Hide or clearly label legacy GeoGebra embed routes until licensing and replacement strategy are settled.

## What Is Already Good

- `klein-server` already has Dockerfiles for the REST API and collaboration WebSocket service.
- `klein-server/deploy/docker-compose.yml` models the real runtime shape: Postgres, API, collab relay, and client.
- `klein-server` uses Flyway migrations and env-driven production secrets.
- Auth is cookie based with HttpOnly cookies, short-lived access tokens, refresh rotation, and WebSocket tickets.
- The new SDK graphing calculator has a real runtime, parser/evaluator, sampling, roots/intersections, import/export, and collaboration smoke coverage.
- The SDK now has v0 runtime wrappers for graphing, graphing-3d, scientific, probability/statistics, and whiteboard.
- The SDK 3D calculator now has Geometry Lab-backed commands for solids, sampled surfaces, measurements, camera presets, JSON export/import, and no-dependency SVG rendering/export.
- The SDK now exposes `klein-sdk/tools` with `KLEIN_V0_TOOLS`, `createKleinToolRuntime()`, and alias normalization for current Klein client room types.
- `klein-client` now has a standalone `ToolHost` slice for graphing, 3D, scientific, and probability sessions, with CAS/classic/spreadsheet hidden from v0 navigation.
- `klein-client` now exposes 3D quick actions through `ToolHost`, and mocked browser tests verify 3D student-work rendering plus autosave.
- `klein-client` now has first-pass classroom and exam routes for class list/detail, assignment authoring, student work, review comments/return, exam integrity status, and exam submission.
- `klein-client` and `klein-server` now have a first classroom monitor pass: assignment work listing, review links, live-session create/list endpoints, and freeze/unfreeze controls.
- Local manual QA now has dev seed data for classroom/exam flows: `teacher@klein.test`, `student@klein.test`, `reviewer@klein.test`, and `admin@klein.test` all use `KleinDev123!`; the seed includes `demo-classroom`, a published graphing assignment, student work, and `demo-exam-graphing`.
- `klein-client` now has local auth quick-fill buttons for those demo accounts and a `/exam` launcher so manual testers can list and create exam sessions without calling the API directly.
- `klein-client` now vendors the SDK tarballs it installs from `vendor/`, so Docker and CI installs no longer require sibling checkout paths for SDK packages.
- `klein-client` `npm run lint` now runs the TypeScript gate and passes locally.
- `klein-tests` now has SDK smoke coverage for current SDK features and v0 contract coverage for the kept tool suite.
- `klein-tests` CI checks out `klein-client` and `klein-sdk` explicitly, includes an SDK contracts job, targets `master`, and treats mobile E2E as required; remote protection remains pending the deferred review/push.
- `klein-sdk` now has a GitHub Actions CI workflow for typecheck, v0 smoke, and package dry run.
- Docker context hygiene is mostly in place: client and server have `.dockerignore` files excluding env files, build output, and local secrets.
- `klein-server/deploy` includes a Caddy TLS overlay, production env validation, first-deploy/rollback/verification helpers, and a backup runbook with an isolated restore drill.
- Admin resource uploads now send HttpOnly auth cookies and retry once after a refresh.
- The collab relay now aligns Spring WebSocket origins with the configured allow-list and rejects origin-less handshakes unless explicitly enabled.
- The collab relay now marks whiteboard/GeoGebra rooms dirty and flushes snapshots periodically, with retry behavior when backend persistence fails.
- The server quality profile enforces API 70% line / 50% branch and relay 40% line / 25% branch floors; current measured coverage is above each floor.
- Client, API, and relay production images now carry real health checks, and backend image smoke starts from an empty PostgreSQL 16 database.
- API and relay HTTP requests propagate validated `X-Request-ID` values; liveness/readiness, Prometheus metrics, alert thresholds, and incident playbooks are documented.
- Cross-repository CI now has a real PostgreSQL + Java API + collaboration relay job for classroom, exam, and websocket contracts.

## Hard Blockers Before v0

1. Clean and review the four dirty worktrees.
   - Every repo has modified/untracked release-relevant files.
   - Do not deploy from local, unreviewed state. Split into reviewable commits or branches.
   - Active cleanup checklist: [V0_DEPLOYMENT_CHECKLIST.md](V0_DEPLOYMENT_CHECKLIST.md).

2. Keep the client vendored SDK package policy under review through v0.
   - `klein-client/package.json` now installs only `klein-sdk` from committed `vendor/klein-sdk-0.1.0.tgz`.
   - Legacy `@kleinmath/*` package dependencies and tarballs were removed; temporary host-owned adapters live in `components/tool-adapters`.
   - Decision for v0: keep vendoring `klein-sdk`. Revisit published npm packages after the v0 deployment is stable.

3. Keep the client consolidated production gate required in CI.
   - `tsc --noEmit --incremental false` passed.
   - `npm run lint` passed and currently aliases the TypeScript gate.
   - `npm run build` passed locally after the standalone `ToolHost` and first-pass classroom/exam client slices.
   - `npm run test:ci` now covers typecheck, deployment configuration, formula, autosave, and production build checks.
   - CI verifies `/healthz` from the exact production image before publication.

4. Keep the complete server quality profile green as a required release gate.
   - Unit, Docker-backed PostgreSQL integration, and JaCoCo checks pass locally.
   - Run `./scripts/quality-gate.sh` on a Java/Docker-capable runner before every v0 release.
   - CI additionally validates scripts/Compose and starts the production API/relay images against fresh PostgreSQL before publication.

5. Align all public product surfaces with the narrowed SDK v0 promise.
   - SDK docs now separate supported v0 exports from post-v0/experimental exports.
   - Client v0 navigation now hides CAS, spreadsheet, classic workspace, and the legacy GeoGebra classic entry.
   - Product copy should say browser-only exam mode is an instrumentation layer, not secure device lockdown.

6. Replace host-owned compatibility adapters with native `klein-sdk` renderers over time.
   - `klein-tools-sdk` is fully removed as a package/deploy dependency.
   - The client no longer imports or installs `@kleinmath/*`.
   - v0 may ship the localized `components/tool-adapters` UI, but post-v0 should retire it in favor of native `klein-sdk` host renderers.

7. Run live-backend browser E2E before public deployment.
   - Mocked browser coverage exists for classroom/exam contracts.
   - Opt-in live API/collab coverage exists in `klein-tests`.
   - The live classroom/exam/collab smoke now passes locally against the real API and collab relay.
   - CI now starts PostgreSQL, the Java API, and the relay for the real backend contract suite.
   - v0 still needs the same live suite executed against HTTPS staging, then expanded to cross-browser real-service UI coverage.

8. Verify production compose on the target runtime.
   - `deploy/docker-compose.proxy.yml` and `deploy/caddy/Caddyfile` are checked in.
   - A local Docker test deploy now builds and runs the API, collab relay, client, and Postgres with production-like env values.
   - Before DNS cutover, run the full compose stack on the selected VM/provider and verify `/healthz`, API liveness/readiness, relay health, HTTPS, cookies, CORS, websocket upgrade, and uploads.

9. Keep the deployed client/API origin split covered by smoke tests.
   - The Docker client now proxies same-origin `/api/*` requests to the API service with `API_PROXY_TARGET`.
   - The client API fallback is `/api`, so missing public API env values do not silently send browser requests to `localhost:8080`.
   - Student-work autosave/submit now serializes saves against the latest server revision.
   - Exam submit now waits for the initial tool snapshot before enabling submission.
   - The temporary real-browser smoke now passes classroom create, assignment create, student autosave/submit, teacher review/comment/return, and exam integrity/submit against the Docker deploy.

10. Correct the release automation and production URL contract.
   - Local fixes are complete: the tests workflow targets `master`, empty API build arguments normalize to `/api`, and the deployment guide uses the vendored SDK flow.
   - Production deployment jobs are manual, serialized, wait for container health, and run post-deploy endpoint verification.
   - Push the deferred review branches, require the revised remote pipelines, and retain same-origin `/api` as the documented v0 topology.

## Important Non-Blockers / Post-v0

- Connect the implemented health/Prometheus/request-correlation contract to external uptime checks, dashboards, alert routing, centralized logs, and error tracking.
- Automate backup uploads and restore drills beyond the checked-in manual runbook.
- Add dependency vulnerability scanning.
- Add SDK fuzz tests for snapshots and formula input.
- Add browser visual tests for graphing, Geometry Lab, and whiteboard.
- Add multi-origin CORS/staging domain support without editing compose files.

## Test And Verification Status

Passed during this scan:

- 2026-07-14 `klein-server`: 79 unit tests, 164 full PostgreSQL-backed API tests, and 32 relay tests
- 2026-07-14 `klein-server`: JaCoCo API 74.47% line / 57.53% branch; relay 43.50% line / 26.89% branch
- 2026-07-14 backend production-image health smoke against fresh PostgreSQL 16
- 2026-07-14 `klein-client`: `npm run test:ci`, clean `npm ci` with 0 vulnerabilities, production image build, and `/healthz` Docker health
- 2026-07-14 `klein-client`: 12-case deployment URL suite and all 5 classroom/exam Chromium flows pass against the corrected production image
- 2026-07-14 `klein-sdk`: `npm run test:ci`, package dry run, and SDK/client artifact hash parity
- 2026-07-14 `klein-tests`: TypeScript check; strict CI YAML parsing passes across all four repositories
- 2026-07-14 `klein-tests`: all 3 live-backend contracts pass against disposable PostgreSQL and production API/relay images
- 2026-07-14 ShellCheck, Bash syntax, and production Compose/deployment configuration validation

- 2026-07-10 `klein-sdk`: `npm run typecheck`
- 2026-07-10 `klein-sdk`: `npm run test:v0`
- 2026-07-10 `klein-sdk`: `npm pack --dry-run --json --cache /private/tmp/klein-npm-cache`
- 2026-07-10 `klein-client`: formula engine smoke suite (25 checks), typecheck, and production build
- 2026-07-10 `klein-tests`: `npm run test:sdk` (6 tests) and direct TypeScript check
- 2026-07-10 SDK/client release artifact SHA-256 comparison: matching

- `klein-sdk`: `npm test`
- `klein-sdk`: `npm run test:v0`
- `klein-sdk`: `npm pack --cache /private/tmp/klein-npm-cache`
- `klein-sdk`: `npm run test:graphing`
- `klein-client`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit --incremental false`
- `klein-client`: `npm ci --cache /private/tmp/klein-npm-cache`
- `klein-client`: `npm run lint`
- `klein-client`: `npm run build`
- `klein-tests`: `npm run test:sdk`
- `klein-tests`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- `klein-tests`: `npm run test:classroom`
- `klein-tests`: `API_URL=http://localhost:8080/api COLLAB_URL=ws://localhost:4000 LIVE_ORIGIN=http://localhost:3000 npm run test:classroom:live`
- Docker test deploy: built `klein-local/klein-server:test`, `klein-local/klein-server/collab:test`, and `klein-local/klein-client:test`
- Docker test deploy: `docker compose --env-file /private/tmp/klein-test-deploy.env -f deploy/docker-compose.yml -f /private/tmp/klein-test-deploy.override.yml up -d`
- Docker test deploy: API health, collab health, production client `/classrooms`, real-browser classroom/exam smoke, mocked browser classroom suite, and live backend classroom/exam/collab suite
- `klein-client`: Docker build with vendored `klein-sdk-0.1.0.tgz` and corrected package-lock integrity
- `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw test`
- `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -Pintegration verify`
- `git diff --check` in `klein-sdk`, `klein-client`, `klein-server`, and `klein-tests`

Passed earlier in this session:

- `klein-tests`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- `klein-tests`: SDK Playwright smoke with output redirected to `/private/tmp`
- `klein-sdk`: graphing and typecheck smoke tests

Passed on 2026-07-08 deployment blocker pass:

- `klein-client`: `npm run typecheck`
- `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -pl collab-websocket test`
- `klein-server`: `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml config` with placeholder production env
- `klein-sdk`, `klein-client`, `klein-server`: `git diff --check`

Passed on 2026-07-08 classroom/exam hardening pass:

- `klein-client`: `npm run typecheck`
- `klein-tests`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- `klein-tests`: `./node_modules/.bin/playwright test tests/e2e/classroom-exam-live.spec.ts --project=chromium` with `LIVE_BACKEND` unset; 3 tests skipped as expected
- `klein-tests`: `npm run test:classroom` with local `klein-client` dev server running; 5 tests passed
- `klein-client`, `klein-tests`: `git diff --check`

Passed on 2026-07-08 manual classroom/exam QA pass:

- `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -pl server-app test -DskipTests`
- `klein-client`: `npm run typecheck`
- Local services were verified listening on `http://localhost:3000`, `http://localhost:8080`, and `ws://localhost:4000`.
- Seeded teacher login returned 200 and `GET /api/classrooms` returned `demo-classroom`.
- Seeded student login returned 200 and `GET /api/exam-sessions` returned `demo-exam-graphing`.
- Manual create smoke checks returned 201 for `POST /api/classrooms` and `POST /api/exam-sessions`, and both created records appeared in subsequent list calls.

Still pending external verification:

- Remote CI has not verified the current broad local implementation state because all four repositories remain dirty and the user deliberately deferred the review/commit/push task.
- The new deployment-config regression script and revised CI workflow must run from the pushed review branches.
- Full cross-browser `klein-tests` browser E2E was not run. The classroom/exam Chromium spec passed with mocked API contracts, including live-session freeze/unfreeze and 3D student-work rendering/autosave. The opt-in live backend classroom/exam/collab spec now passes locally and against the Docker test deploy with `LIVE_BACKEND=1`; it still needs a real staging run with `API_URL=... COLLAB_URL=... LIVE_ORIGIN=...`.
- HTTPS reverse proxy, production-domain auth cookies, proxied websocket upgrade, and the local persistence/restore checks still need verification on a target host. Local upload restart persistence and isolated restore have passed.

## Deployment Shape The App Needs

Runtime services:

1. Next.js client
2. Spring REST API
3. Java WebSocket collab relay
4. Postgres
5. Persistent upload storage
6. TLS/reverse proxy

Key implication: the Java API and Java WebSocket relay need long-running compute. Static hosting alone is not enough.

## Free / Low-Cost Deployment Strategies

### Strategy A - Closest to free and closest to current deploy docs

Use one Oracle Cloud Always Free VM and the existing Docker Compose layout.

- Run Postgres, server, collab, client, and Caddy/Traefik on one VM.
- Keep `pgdata` and `uploads` as VM volumes.
- Add automated encrypted backups to R2/S3.
- Lowest architecture churn because it matches `klein-server/deploy/docker-compose.yml`.

Pros:

- Potentially $0 long term.
- Supports Java, WebSocket, Postgres, uploads, and Docker Compose.
- One deploy target.

Cons:

- Requires ops work: firewall, OS updates, Docker, reverse proxy, backups, monitoring.
- Oracle requires signup checks and credit card; free capacity can be region dependent.
- Single VM is a single point of failure.

Source: [Oracle Cloud Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)

### Strategy B - Mostly free preview, split services

Use:

- Vercel Hobby for the Next.js client, or Render Static Site if the app can be made static.
- Render free web services for `server` and `collab`, or Railway free/trial for a short preview.
- Neon Free for Postgres.
- Cloudflare R2 free tier for resource uploads if local disk is not durable.

Pros:

- Fastest preview path with managed TLS and Git deploys.
- Minimal VM maintenance.
- Neon and R2 give clean managed data/storage primitives.

Cons:

- Java Spring plus WebSocket may be tight on free service memory.
- Free services may sleep or have limits; not a reliable production SLA.
- Railway's current pricing page presents the free path as a 30-day $5 credit trial followed by a low monthly amount, so treat it as preview/near-free, not guaranteed forever-free.

Sources:

- [Vercel pricing](https://vercel.com/pricing)
- [Render pricing](https://render.com/pricing)
- [Railway pricing](https://railway.com/pricing)
- [Neon pricing](https://neon.com/pricing)
- [Cloudflare R2 pricing](https://www.cloudflare.com/products/r2/)

### Strategy C - Low-cost sane v0

Use:

- Vercel Hobby for the frontend.
- Fly.io, Render Starter, or Railway Hobby for the Java API and collab relay.
- Neon Free/Launch for Postgres.
- Cloudflare R2 for uploads.

Pros:

- Still cheap, but less fragile than free-only compute.
- Separates frontend, DB, object storage, API, and collab cleanly.
- Easier to scale one component at a time.

Cons:

- Not $0.
- More moving parts and env/secrets to wire.
- Need CORS/cookie/domain testing across `klein.app`, `api.klein.app`, and `collab.klein.app`.

Sources:

- [Fly.io resource pricing](https://fly.io/docs/about/pricing/)
- [Render pricing](https://render.com/pricing)
- [Neon pricing](https://neon.com/pricing)

### Strategy D - Existing GitLab registry plus paid/free VM

Keep the current GitLab CI model:

- `klein-server` builds and deploys server/collab images.
- `klein-client` builds and deploys client image.
- VM pulls from GitLab Container Registry and runs Docker Compose.

Pros:

- Best match to the checked-in CI/deploy docs.
- Easy rollback via image tags if `TAG=<short-sha>` is used.
- Works with any small VM provider, including Oracle Always Free or a low-cost VPS.

Cons:

- Requires keeping vendored SDK tarballs refreshed or moving to private npm packages.
- Requires VM operations.
- Current client pipeline lint is broken.

## Recommended v0 Deployment Path

1. Fix packaging first.
   - Current v0 path vendors SDK tarballs in `klein-client/vendor`.
   - Longer-term path can publish private npm packages and remove the vendored tarballs.

2. Fix CI gates.
   - Client lint/build must pass.
   - Server unit and integration tests must pass.
   - SDK smoke tests must run in CI.
   - Tests repo now checks out all repos it references.

3. Choose deployment target.
   - If zero-cost is the priority: Oracle Always Free single VM with Docker Compose.
   - If low-ops preview is the priority: Vercel/Render + Neon + R2.
   - If stable v0 is the priority: Vercel + paid small backend compute + Neon + R2.

4. Add production deployment config.
   - Caddy or Nginx reverse proxy config.
   - Health checks for server and collab.
   - Backup job for Postgres and uploads.
   - `.env.production.example` for each runtime repo.

5. Limit public feature flags.
   - Enable graphing, 3D calculator, scientific calculator, probability/statistics, and whiteboard.
   - Keep classroom and exam client surfaces behind beta/staff flags until E2E coverage exists.
   - Hide CAS, spreadsheet, classic workspace, and unfinished legacy GeoGebra embeds from first navigation.

## Source Notes

Deployment/pricing data was checked against current official pages on 2026-07-05:

- Vercel Hobby shows `$0/mo` for web apps/personal projects: <https://vercel.com/pricing>
- Cloudflare Pages Free limits include 500 builds/month, 100 custom domains/project, and 20,000 files/site: <https://developers.cloudflare.com/pages/platform/limits/>
- Neon Free shows `$0`, no time limit/no credit card, 0.5 GB storage/project, and 100 CU-hours/month/project: <https://neon.com/pricing>
- Render lists static sites at `$0`, services from `$0`, and free web service instance sizing: <https://render.com/pricing>
- Railway lists a free/getting-started plan with trial credits and low resource limits: <https://railway.com/pricing>
- Oracle Free Tier documents Free Trial plus Always Free resources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm>
- Fly.io is low-cost rather than free for shared CPU machines: <https://fly.io/docs/about/pricing/>
- GitHub Actions free quotas are documented here: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>
- Cloudflare R2 free storage/request allowances are documented here: <https://www.cloudflare.com/products/r2/>
