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
- shipped third-party runtime components

Do **not** duplicate those pins in local-only or remote-only docs.

Use latest stable versions unless a source-of-truth doc says otherwise.
Exact implementation pins still live in lockfiles, image tags, and release manifests.

Versions below were verified from upstream registries/releases on 2026-03-22.

## host toolchain

| Tool | Version |
| --- | --- |
| Go | `1.26.1` |
| Node.js LTS | `24.14.0` |
| pnpm | `10.32.1` |
| Playwright | `1.58.2` |
| tsgo (`@typescript/native-preview`) | `7.0.0-dev.20260322.1` |
| oxlint | `1.56.0` |
| oxfmt | `0.41.0` |
| prek | `0.3.6` |

## shipped runtime components

| Surface | Version | Notes |
| --- | --- | --- |
| React | `19.2.4` |  |
| Vite | `8.0.1` |  |
| Vitest | `4.1.0` |  |
| LiveKit Server | `1.9.12` |  |
| LiveKit JS client | `2.17.3` |  |
| SQLite | `3.51.3` |  |
| Caddy | `2.11.2` | persistent edge or local `edge` profile |
| coturn | `4.9.0` | persistent TURN or local `edge` profile |
