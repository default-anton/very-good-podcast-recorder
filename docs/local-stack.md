# local stack

Related docs:

- `docs/architecture.md`
- `docs/feedback-loop.md`
- `docs/operator-cli.md`
- `docs/public-networking.md`
- `docs/repo-layout.md`
- `docs/testing.md`
- `docs/version-pins.md`
- `docs/releases.md`

## recommendation

Keep one boring **internal** local stack contract.

This is a contributor feedback loop, not a user-facing deployment story.

Rules:

- do **not** market local bring-up as a supported alpha product feature
- do **not** require a laptop-installed operator CLI for local dev
- do keep one repo-local command path that brings up the real stack for development and harness work

## purpose

The local stack exists to prove the recording path quickly on a developer machine.

It must support:

- app development
- Playwright-driven multi-browser harness runs
- deterministic failure injection
- artifact inspection without a remote deployment

## boot flow

The exact repo-local command may evolve, but the contract is fixed:

1. install the host toolchain from `docs/version-pins.md`
2. install Docker Engine or Docker Desktop with Compose v2
3. run one repo-local bring-up command
4. verify the stack is healthy
5. run the local harness against that same runtime

Do **not** create a second, different local runtime just for tests.

## local profiles

| Profile | Runs | Purpose |
| --- | --- | --- |
| `core` | control plane, sessiond, LiveKit, SQLite, local artifact disk, `web/control`, `web/session` | everyday dev and the default harness |
| `edge` | `core` plus Caddy and coturn | exercise the hosted public-hostname/TLS/TURN shape locally |

Rules:

- `core` is the default inner loop
- `edge` exists only when working on networking or TURN-sensitive flows
- do **not** require Caddy or TURN in the normal `core` loop

## env and config [done]

For repo-local boot, precedence is: flags > shell env > `.env.local` > built-in defaults.

| Surface | Path or vars |
| --- | --- |
| repo-local overrides | `.env.local` (not committed) |
| committed local stack assets | `deploy/local/` |
| generated local service config | `.vgpr/local/config/` |

`deploy/local/topology.json` is the committed source of truth for local hostnames and ports.

App and test code should import that contract through `web/shared/localRuntime.ts` instead of hard-coding new loopback literals.

Keep secrets out of committed files.

## port map [done]

Bind TCP listeners to `127.0.0.1` by default.

| Surface | Port |
| --- | --- |
| control web app | `5173` |
| session web app | `5174` |
| control-plane API | `8080` |
| sessiond API and upload | `8081` |
| LiveKit HTTP / WebSocket | `7880` |
| LiveKit UDP | `50000-50100/udp` |
| Caddy HTTP (`edge`) | `8088` |
| Caddy HTTPS (`edge`) | `8443` |
| coturn TCP/UDP (`edge`) | `3478` |
| coturn TLS (`edge`) | `5349` |

## development schema iteration

Local development may use the `down` side of goose migrations while iterating on SQLite schema changes, per `docs/releases.md` and `docs/database-schema.md`.

Rules:

- use `down` only against disposable local databases
- never treat `down` as the hosted rollback path
- if a migration gets messy, prefer resetting the local runtime over pretending a risky rollback is safe

## logs, state, and artifacts

All backend services emit structured JSON logs.

| Path | Purpose |
| --- | --- |
| `.vgpr/local/state/` | local SQLite files and runtime state |
| `.vgpr/local/logs/` | service logs and preserved failure logs |
| `.vgpr/local/artifacts/` | uploaded chunks, manifests, and assembled downloads |
| `.vgpr/local/e2e/` | harness summary JSON and preserved scenario outputs |

Do not delete failed artifacts or logs automatically.

## non-goals

- local deployment as a supported operator product path
- a polished local setup UX before the hosted alpha works
- a second mock-only runtime that diverges from the real local harness
