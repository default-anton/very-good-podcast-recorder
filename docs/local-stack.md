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

Use one boring local stack contract.

`vgpr setup local` is the only supported bring-up path.
The local harness from `docs/testing.md` uses the same stack.

## boot flow

1. install the host toolchain from `docs/version-pins.md`
2. install Docker Engine or Docker Desktop with Compose v2
3. run `vgpr setup local`
4. verify with `vgpr doctor`
5. run the local harness against the same runtime

## prerequisites

Cross-runtime version pins live in `docs/version-pins.md`.
The local `edge` profile uses the same Caddy/coturn shape described in `docs/public-networking.md`.

## local profiles

| Profile | Runs | Purpose |
| --- | --- | --- |
| `core` | control plane, session-runner, sessiond, LiveKit, SQLite, local artifact disk, `web/control`, `web/session` | everyday dev and the default harness |
| `edge` | `core` plus Caddy and coturn | exercise the public edge/TURN shape locally |

Select a profile with `vgpr setup local --profile <core|edge>`.

Do **not** require Caddy or TURN in the `core` inner loop.

## env and config

For repo-local boot, precedence is: flags > shell env > `.env.local` > built-in defaults.
CLI-wide config and output precedence still follows `docs/operator-cli.md`.

| Surface | Path or vars |
| --- | --- |
| CLI env vars | `VGPR_DEPLOYMENT`, `VGPR_CONFIG`, `VGPR_NO_BROWSER`, `VGPR_OUTPUT`, `VGPR_RELEASE_BASE_URL` |
| repo-local overrides | `.env.local` (not committed) |
| committed local stack assets | `deploy/local/` |
| generated local service config | `.vgpr/local/config/` |
| local deployment profile | `~/.local/state/vgpr/deployments/local.json` |

Keep secrets out of committed files.

## port map

Bind TCP listeners to `127.0.0.1` by default.

| Surface | Port |
| --- | --- |
| control web app | `5173` |
| session web app | `5174` |
| control-plane API | `8080` |
| session-runner | no host port; internal only |
| sessiond API and upload | `8081` |
| LiveKit HTTP / WebSocket | `7880` |
| LiveKit UDP | `50000-50100/udp` |
| Caddy HTTP (`edge`) | `8088` |
| Caddy HTTPS (`edge`) | `8443` |
| coturn TCP/UDP (`edge`) | `3478` |
| coturn TLS (`edge`) | `5349` |

## development schema iteration

Local and mock development may use the `down` side of goose migrations while iterating on SQLite schema changes, per `docs/releases.md` and `docs/database-schema.md`.

Rules:

- use `down` only against disposable local or mock databases
- never treat `down` as the production rollback path
- if a migration gets messy, prefer resetting the local deployment over pretending a risky rollback is safe

## logs, state, and artifacts

All backend services emit structured JSON logs.

| Path | Purpose |
| --- | --- |
| `.vgpr/local/state/` | local SQLite files and runtime state |
| `.vgpr/local/logs/` | service logs and preserved failure logs |
| `.vgpr/local/artifacts/` | uploaded chunks, manifests, and assembled downloads |
| `.vgpr/local/e2e/` | harness summary JSON and preserved scenario outputs |

Reset the local deployment with `vgpr destroy` in TTY mode, or `vgpr destroy --force --confirm-name local` non-interactively.
Do not delete failed artifacts or logs automatically.
