# version pins

Related docs:

- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`

## recommendation

Keep one cross-runtime version pins doc.

This doc owns the pinned versions for:

- host toolchain versions
- target third-party runtime components

Do **not** duplicate those pins in local-only or remote-only docs.

Use latest stable versions unless a source-of-truth doc says otherwise.
Exact implementation pins still live in lockfiles, image tags, and release manifests.

Versions below were verified from upstream registries/releases on 2026-03-22.

## host toolchain [done]

| Tool                                | Version                |
| ----------------------------------- | ---------------------- |
| Go                                  | `1.26.1`               |
| Node.js LTS                         | `24.14.0`              |
| pnpm                                | `10.32.1`              |
| fd                                  | `10.4.2`               |
| Playwright                          | `1.58.2`               |
| tsgo (`@typescript/native-preview`) | `7.0.0-dev.20260322.1` |
| oxlint                              | `1.56.0`               |
| oxfmt                               | `0.41.0`               |
| prek                                | `0.3.6`                |
| govulncheck                         | `v1.1.4`               |

Bootstrap implementation notes:

- `mise.toml` pins Go, Node.js, pnpm, and helper CLIs for contributors who use `mise`
- `go.mod` pins the Go toolchain used for module commands
- `scripts/audit` pins `govulncheck` for deterministic vulnerability scans
- root `package.json` pins Playwright, tsgo, oxlint, oxfmt, and prek in the lockfile-managed frontend toolchain

## target runtime components

The harness-only pivot currently ships no application runtime. The table below is the target stack to restore when implementation resumes.

| Surface                          | Version  | Notes                                                     |
| -------------------------------- | -------- | --------------------------------------------------------- |
| React                            | `19.2.4` |                                                           |
| Vite                             | `8.0.1`  |                                                           |
| Vitest                           | `4.1.0`  |                                                           |
| Cloudflare Workers compatibility | `2026-03-20` | pin via Wrangler compatibility date for the control plane |
| LiveKit Server                   | `1.9.12` |                                                           |
| LiveKit JS client                | `2.17.3` |                                                           |
| SQLite                           | `3.51.3` | control-plane local persistence substitute and sessiond   |
| Caddy                            | `2.11.2` | disposable session-server TLS frontend or local `edge` profile |
| coturn                           | `4.9.0`  | disposable session-server TURN runtime or local `edge` profile |
