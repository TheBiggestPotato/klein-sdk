# Klein v0 Deployment Checklist

Last updated: 2026-07-14

Status legend:

- `[x]` done
- `[~]` in progress
- `[ ]` not done
- `[?]` needs product/owner decision

Current verdict: core v0 features and the local production-style stack are working, and the first external preview is approximately 85% deployment-ready. Phase 6 quality, coverage, observability, and runtime-image gates are implemented locally. Section 1 remains deliberately deferred. Before real classroom data reaches an internet-facing host, complete the remote-pipeline, target-host, HTTPS, staging-smoke, monitoring, and off-host-backup items in Sections 3, 5, 6, 7, and 8.

## 1. Clean And Review Dirty Worktrees

Status: `[~]` in progress.

Goal: split the current broad local implementation state into reviewable, testable slices before deploying. Do not deploy directly from dirty worktrees.

Audit status:

- [x] `klein-sdk` dirty state audited.
- [x] `klein-client` dirty state audited.
- [x] `klein-server` dirty state audited.
- [x] `klein-tests` dirty state audited.
- [ ] Decide whether to create review branches per repo or one deployment branch per repo.
- [x] Stage and commit only after each slice passes its matching checks. *(844 server, 364 client and 188 instrument tests green before each commit.)*
- [~] Confirm generated artifacts are either intentional release artifacts or ignored/removed.
- [x] End state: all four repos have clean `git status`. *(server, client and sdk committed; klein-tests had no changes.)*

Current dirty-state summary:

| Repo | Current branch | Dirty summary | Notes |
| --- | --- | --- | --- |
| `klein-sdk` | `main` | 19 tracked files changed, 17 untracked paths, 1 tracked roadmap deletion | Largest SDK/tool/runtime feature slice. Includes package artifact `klein-sdk-0.1.0.tgz`. |
| `klein-client` | `main` (ahead 2) | 34 tracked files changed, 20 untracked paths | Includes vendored SDK tarball, classroom/exam UI, ToolHost, Geometry Lab sessions/formula engine, health route, and CI gates. |
| `klein-server` | `main` (ahead 1) | 58 tracked files changed, 146 untracked paths | Includes backend Phases 1-6, relay hardening, deployment/operations tooling, tests, and dev seed data. |
| `klein-tests` | `master` | 7 tracked files changed, 5 untracked paths | Includes SDK tests, classroom/exam E2E, CI updates, and an ignore rule for generated SDK Playwright reports. |

Review slices to create:

1. `klein-sdk` slice A: v0 docs, CI, smoke scripts, package metadata, README updates.
2. `klein-sdk` slice B: shared runtime contracts, persistence, tool registry, collaboration/embed/classroom/exam contracts.
3. `klein-sdk` slice C: graphing, Geometry Lab 2D/3D equations, scientific, probability, whiteboard runtime work.
4. `klein-sdk` slice D: package artifact decision for `klein-sdk-0.1.0.tgz` and deleted `GEOMETRY_LAB_ROADMAP.md`.
5. `klein-client` slice A: SDK vendor/package/Docker/CI install path.
6. `klein-client` slice B: shared `ToolHost`, instrument navigation, Geometry Lab saves, graphing/3D redirects.
7. `klein-client` slice C: classroom, assignment, student-work, review, and exam pages/API client.
8. `klein-client` slice D: auth/profile/navbar/manual QA polish, including demo account quick-fill and classroom create validation.
9. `klein-client` slice E: content/tool-button/walkthrough updates.
10. `klein-server` slice A: classroom/exam schema, entities, repositories, services, controllers, integration tests, and dev seed.
11. `klein-server` slice B: generic collab websocket protocol, origin hardening, dirty-room persistence, and collab tests.
12. `klein-server` slice C: deployment proxy, Caddy config, backup runbook, env examples, CI updates.
13. `klein-tests` slice A: SDK contract tests and Playwright SDK config.
14. `klein-tests` slice B: classroom/exam mocked and live-backend E2E.
15. `klein-tests` slice C: existing smoke/problem E2E updates and CI topology.

Checks before marking blocker 1 done:

- [x] `git diff --check` passes in all four repos.
- [ ] Each slice has a matching verification note in this checklist.
- [x] No generated Playwright report/build/cache directory is left untracked.
- [x] No local-only seed or test flag is enabled in production config. *(Verified x-ray pass 0: `app.dev-seed.enabled` defaults false, and `ProductionConfigurationValidator` fails startup closed on any known placeholder secret, any secret under 32 chars, and the filesystem/stub artifact adapters. **Caveat:** the gate only runs when the `production` profile is active — activating it is itself a deployment step, tracked below.)*
- [x] Clean `git status --short` in all four repos.

## 2. SDK Packaging Strategy

Status: `[x]` v0 decision implemented.

Decision: use a committed `klein-client/vendor/klein-sdk-0.1.0.tgz` release artifact for v0 instead of requiring sibling SDK checkouts or a private npm registry during deploy builds. Deprecated `@kleinmath/*` package tarballs are no longer shipped.

- [x] Decide between committed `vendor/*.tgz` release artifacts and published npm packages.
- [x] Ensure `klein-client/package.json` and `klein-client/package-lock.json` point only to `file:vendor/klein-sdk-0.1.0.tgz`.
- [x] Ensure `klein-client/Dockerfile` copies `vendor/` before `npm ci`.
- [x] Keep `klein-client/scripts/refresh-vendor-sdk.mjs` as the local artifact refresh path from sibling SDK workspaces into `vendor/`.
- [x] Update `/Users/andrei/projects/klein_dev.sh` to refresh `vendor/` before installing client dependencies.
- [x] Remove `klein-tools-sdk` and `@kleinmath/*` from client package metadata, vendor artifacts, Next config, and the dev launcher.
- [x] Run package/install verification from the vendored tarballs.

Verification:

- [x] `klein-client`: `npm install --package-lock-only --ignore-scripts --cache /private/tmp/klein-npm-cache`
- [x] `klein-client`: `npm ci --ignore-scripts --cache /private/tmp/klein-npm-cache`
- [x] `klein-client`: `npm run typecheck`
- [x] `klein-client`: clean `npm ci --ignore-scripts --cache /private/tmp/klein-npm-cache` after removing `@kleinmath/*`
- [x] `klein-client`: final `npm run typecheck` after clean install without `@kleinmath/*`
- [x] `klein-client`: `git diff --check`
- [x] `klein-sdk`: `git diff --check`

## 3. Release Test Matrix And CI

Status: `[~]` local release gates and CI configuration are ready; remote release pipelines cannot be green until the deliberately uncommitted worktrees are reviewed and pushed.

- [x] `klein-sdk`: typecheck, v0 smoke, graphing smoke, package dry run.
- [x] `klein-client`: typecheck, lint, production build.
- [x] `klein-server`: unit tests and Docker-backed integration tests.
- [x] `klein-tests`: SDK suite, mocked classroom suite, live-backend classroom/exam/collab suite.
- [x] Change `klein-tests/.github/workflows/ci.yml` push/PR triggers from `main` to the repository's active `master` branch and add SDK TypeScript/mobile-E2E workflow coverage.
- [x] Enforce Java 21/Maven 3.9 and JaCoCo module floors in the backend `quality` profile.
- [x] Require backend shell/config validation, full PostgreSQL integration coverage, and fresh-database production-image health before deploy.
- [x] Require the client consolidated `test:ci` gate and `/healthz` production-image health before deploy.
- [x] Add a real PostgreSQL + Java API + relay `live-backend` job to the cross-repository tests workflow.
- [x] Make production deployment jobs manual, serialized, health-waiting, and post-deploy verified.
- [ ] Push reviewable release commits and require green SDK, client, server, and cross-repository pipelines before image deployment.

Verification:
- [x] `klein-sdk`: `npm run typecheck`
- [x] `klein-sdk`: `npm run test:v0`
- [x] `klein-sdk`: `npm run test:graphing`
- [x] `klein-sdk`: `npm pack --dry-run --json --cache /private/tmp/klein-npm-cache`
- [x] `klein-client`: `npm run typecheck`
- [x] `klein-client`: `npm run lint`
- [x] `klein-client`: `npm run build`
- [x] `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw test`
- [x] `klein-server`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -Pintegration verify`
- [x] `klein-server`: `./mvnw -B -ntp -Pintegration,quality clean verify`
- [x] `klein-server`: API coverage 74.47% line / 57.53% branch; relay coverage 43.50% line / 26.89% branch.
- [x] `klein-server`: `./deploy/scripts/check-deployment-config.sh` and ShellCheck pass.
- [x] `klein-server`: backend production images pass `./scripts/container-health-smoke.sh` against a fresh PostgreSQL 16 container.
- [x] `klein-client`: `npm run test:ci`
- [x] `klein-client`: clean `npm ci --ignore-scripts` reports 0 vulnerabilities.
- [x] `klein-client`: production image reaches Docker `healthy` and returns `{\"status\":\"ok\"}` from `/healthz`.
- [x] `klein-client`: deployment configuration suite passes 12 API/collaboration URL cases; release CI rejects blank or non-`wss://` collaboration URLs.
- [x] `klein-tests`: mocked classroom/exam suite passes all 5 flows against the corrected production client image.
- [x] `klein-sdk`: `npm run test:ci`
- [x] `klein-tests`: `npm run test:sdk`
- [x] `klein-tests`: `npm run test:classroom` against local `klein-client` on `http://localhost:3000`
- [x] `/Users/andrei/projects/klein_dev.sh --no-build --no-open` starts API, collab, and client locally after Java 21 auto-detection fix.
- [x] `klein-tests`: `API_URL=http://localhost:8080/api COLLAB_URL=ws://localhost:4000 LIVE_ORIGIN=http://localhost:3000 npm run test:classroom:live`
- [x] `klein-tests`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- [x] 2026-07-10: `klein-sdk` typecheck, `test:v0`, and package dry run.
- [x] 2026-07-10: `klein-client` Geometry Lab formula suite (25 checks), typecheck, and production build.
- [x] 2026-07-11: `klein-tests` CI now targets its actual `master` branch, runs the SDK TypeScript check, and treats the mobile E2E result as a required workflow outcome.
- [ ] Run the revised CI configuration from committed review branches and require green remote SDK, client, server, and tests pipelines. Deferred with Section 1.
- [x] 2026-07-10: `klein-tests` SDK contract suite (6 tests) and direct TypeScript check.
- [x] 2026-07-10: SDK and client vendored `klein-sdk-0.1.0.tgz` SHA-256 hashes match.
- [x] 2026-07-14: all 3 live-backend contracts pass against disposable PostgreSQL and the production API/relay images.

## 4. Live Classroom And Exam QA

Status: `[x]` local Docker test deploy browser QA is green.

- [x] Local dev seed creates demo users, classroom, assignment, student work, and exam session.
- [x] Local manual API smoke confirmed classroom and exam create/list paths.
- [x] `/Users/andrei/projects/klein_dev.sh` exports the local seed/demo-account flags and prints classroom/exam manual QA URLs.
- [x] Teacher creates classroom in browser against the Docker test deploy.
- [x] Teacher creates assignment in browser against the Docker test deploy.
- [x] Student opens, edits, autosaves, and submits work in browser against the Docker test deploy.
- [x] Teacher reviews, comments, and returns work in browser against the Docker test deploy.
- [x] Exam session records integrity events and submits snapshot in browser against the Docker test deploy.
- [x] Websocket presence works against the Docker test deploy direct websocket endpoint (`ws://localhost:4000`).

Verification:
- [x] Docker test deploy: `API_URL=http://localhost:8080/api COLLAB_URL=ws://localhost:4000 LIVE_ORIGIN=http://localhost:3000 npm run test:classroom:live`
- [x] Docker test deploy: `npm run test:classroom`
- [x] Docker test deploy: temporary real-browser smoke created classroom, assignment, student work, review feedback/return, exam integrity event, and exam submission through the deployed UI.
- [x] Fixed deployed-browser auth/API split by adding the Next same-origin `/api` proxy, setting `API_PROXY_TARGET=http://server:8080`, and making the client API fallback `/api`.
- [x] Fixed deployed student-work autosave/submit by serializing saves against the latest server revision.
- [x] Fixed deployed exam submit race by disabling submit until `ToolHost` emits the initial snapshot.

## 5. Production Environment

Status: `[~]` the production environment contract, same-origin API behavior, and host provisioning tooling are ready locally. Real secrets and domains still need installation on the selected host.

- [~] Production JWT secret set: verified with local test env; real host secret still pending.
- [~] Production collab internal secret set: verified with local test env; real host secret still pending.
- [~] Production database credentials set: verified with local test env; real host credentials still pending.
- [~] CORS origins set to production domains only: local test uses `http://localhost:3000`; real domain pending.
- [~] Websocket origins set to production domains only: local test uses `http://localhost:3000`; real domain pending.
- [x] Secure cookies enabled in production compose.
- [x] `APP_DEV_SEED_ENABLED=false` is explicit in production compose.
- [x] Upload storage path configured as `/app/uploads` with a Docker volume.
- [x] Normalize blank `NEXT_PUBLIC_API_URL` values to `/api`; `resolvePublicApiBaseUrl()` handles unset, blank, whitespace-only, and trailing-slash values, with a dedicated deployment-config regression script.
- [x] Normalize blank local collaboration URLs, validate the shared WebSocket base URL for every client collaboration surface, and require `wss://` for release images.
- [x] Standardize v0 on same-origin `/api` through the Next proxy. Docker and GitLab builds explicitly use `/api`; the server deployment guide documents the flow.
- [x] Add target-host tooling: `provision-ubuntu.sh`, `validate-env.sh`, `first-deploy.sh`, immutable image-tag updates, service-scoped rollback, and endpoint verification scripts.
- [ ] Choose the preview VM/provider and production domains, then create `/opt/klein/.env` with generated production secrets and immutable service tags.

Verification:
- [x] Compose env interpolation with `/private/tmp/klein-test-deploy.env`.
- [x] Production compose now explicitly sets `APP_DEV_SEED_ENABLED=false`.
- [x] Local test deploy uses `/private/tmp/klein-test-deploy.override.yml` to set `APP_COOKIE_SECURE=false` only because it runs without HTTPS.

## 6. Deployment Stack Verification

Status: `[~]` local Docker verification, service-specific liveness/readiness, same-origin API routing, immutable service deployments, and upload durability are verified. Target-host TLS/proxy and production-domain verification remain pending.

- [x] Next.js client starts from production build.
- [x] Spring API starts with production-like env.
- [x] Java collab websocket starts with production-like env.
- [x] Postgres migrations apply from empty database.
- [x] Client `/healthz`, API liveness/readiness, relay public health, and relay internal persistence-readiness contracts are implemented.
- [x] Production Dockerfiles carry health checks; Compose waits for healthy dependencies and uses graceful stop periods.
- [x] API and relay propagate validated `X-Request-ID` values and expose Prometheus metrics with an operator runbook.
- [ ] Reverse proxy serves HTTPS on the target domain.
- [~] Websocket upgrade works through the direct Docker endpoint; verify the Caddy TLS route on the target domain.
- [x] Auth cookies work through the same-origin deployed client/API proxy over local HTTP.
- [ ] Auth cookies work over production HTTPS.
- [x] Authenticated upload persisted across a local API restart and downloaded byte-for-byte unchanged on 2026-07-11.
- [x] `klein-server/deploy/README.md` now describes the committed `klein-sdk` vendor artifact flow and no longer requires retired `klein-whiteboard-sdk`/`NPM_TOKEN` setup.
- [x] Deploy scripts persist immutable `SERVER_TAG`, `COLLAB_TAG`, and `CLIENT_TAG` values, with a service-scoped rollback command.

Verification:
- [x] Built local images: `klein-local/klein-server:test`, `klein-local/klein-server/collab:test`, `klein-local/klein-client:test`.
- [x] Started Docker stack with `docker compose --env-file /private/tmp/klein-test-deploy.env -f deploy/docker-compose.yml -f /private/tmp/klein-test-deploy.override.yml up -d`.
- [x] `GET http://localhost:8080/actuator/health/liveness` and `/readiness` returned `UP`.
- [x] `GET http://localhost:4000/health` returned `{\"status\":\"ok\"}`; internal relay readiness passed on port `4001`.
- [x] `GET http://localhost:3000/healthz` returned `{\"status\":\"ok\"}` from the production image.
- [x] `GET http://localhost:3000/classrooms` returned the production client HTML.
- [x] Deployed browser smoke passed against `http://localhost:3000`, `http://localhost:8080/api`, and `ws://localhost:4000`.
- [x] 2026-07-14 corrected production client image passes all 5 mocked classroom/exam flows; fresh production API/relay images pass all 3 live backend contracts.
- [x] Deployed `klein-client` image rebuild passed with vendored `klein-sdk-0.1.0.tgz` and corrected package-lock integrity.
- [x] 2026-07-11: authenticated resource upload survived `docker compose restart server` and matched its downloaded SHA/content.
- [ ] On the target host, run `verify-deployment.sh` and `verify-upload-persistence.sh` through Caddy over HTTPS/WSS.

## 7. Backup And Restore

Status: `[~]` backup and isolated restore tooling is implemented and the local restore drill passed. Configure the schedule and execute the same drill against the selected host before storing real classroom data.

- [x] Postgres backup command verified through `deploy/scripts/backup.sh`.
- [x] Uploaded-resource backup archive and checksum manifest verified through `deploy/scripts/backup.sh`.
- [x] Restore drill completed in an isolated, uniquely named Compose project on 2026-07-11; the restored database contained 23 public tables and the disposable project was removed afterward.
- [ ] Configure an automated, encrypted off-host backup schedule and retention policy for the chosen host.
- [x] `deploy/BACKUPS.md` now uses `restore-smoke.sh`, which restores only into unique disposable database/storage resources and never runs `pg_restore --clean` through the production Compose project.

## 8. Public v0 Guardrails

Status: `[ ]` not done.

- [ ] Classroom and exam labeled beta until live E2E is green.
- [ ] Browser-only exam mode copy says soft instrumentation, not secure lockdown.
- [ ] Legacy GeoGebra embed routes hidden or labeled clearly.
- [x] Endpoint-specific in-memory rate limits use bounded registries and trusted-proxy-aware client identity resolution.
- [ ] Uptime/error monitoring configured or explicitly accepted as post-v0.
