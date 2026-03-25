# very-good-podcast-recorder

Open-source remote podcast recording with a persistent host control plane, temporary session servers, browser-based joining, and local tracks. It is built for creators who want Riverside-style recording quality while keeping control of their workflow, data, and costs.

This repo is for technical podcast hosts and producers who want the recording quality of local tracks without handing the whole workflow to a hosted platform.

## How it works

The main host runs or deploys a persistent control plane web app plus a private session-runner service. The control plane keeps the SQLite database for sessions and participants and gives the host one place to manage the recording. The session-runner owns the cloud and edge credentials needed to create and destroy temporary session servers.

For each recording session, the control plane requests a temporary session server and the private session-runner starts it in the best available region and syncs the stable participant IDs needed for reconnect handling. That server runs the backend for the live browser session and receives uploaded recording chunks during the call. The host shares a stable join URL from the control-plane domain, while a persistent edge/TLS layer routes that session to the current temporary backend. TURN may be co-hosted for tiny installs or split onto dedicated capacity. Hosts and guests open the shared link in Chrome or another modern browser, like a normal video call.

While the session is running, each participant records media locally on their own machine. For v1, a participant seat may produce one mic source, one or more camera source instances, and zero or more screen-share source instances during the recording run. Each screen-share start may also produce a paired best-effort system-audio source instance when the browser/platform exposes it. Starting and stopping screen share during the session is normal and creates additional source instances rather than errors. Video targets 1080p30 with 720p30 fallback, and audio targets 48 kHz Opus in browser-native WebM. Those recordings are uploaded to the session server in the background as chunks. The main host controls when recording starts and stops from the control plane. After the session, the host downloads the files and requests server teardown from the control plane.

That gives you three separate things:

- a live session path for conversation and monitoring
- a local capture path for higher-quality per-participant recordings
- an upload path that pushes recorded chunks to the session server during the session

The point is simple: joining should feel like opening a normal call link, but the final files should be better than a live mixed recording.

## What you get

- a persistent host control plane web app with SQLite-backed session and participant state
- a private session-runner service that owns session-server lifecycle
- browser-based group session that hosts and guests join via a URL
- a temporary session server for the live session and recording uploads
- separate local source tracks per participant seat, including mic, one or more camera sources, and repeatable optional screen/system-audio capture episodes
- stable participant identities for reconnect handling
- host-controlled recording start and stop
- storage and workflow under your control
- session costs tied to actual recording time

## Current scope

The first version is intentionally narrow.

It does this:

- run the host control plane locally or on a cheap VPS
- create sessions and participant records there
- request a temporary session server for a recording
- provide a join URL for hosts and guests
- run the live browser session through that server
- let the main host start and stop recording from the control plane
- record local participant source tracks, including repeated screen-share episodes and multi-camera seats
- upload those tracks in the background to the server
- let the host download the files manually
- request server teardown from the control plane when the session is over

It does not try to be a polished studio product yet.

## Setup and operations

The default operator surface for v1 is a laptop-installed CLI: `vgpr`.

- macOS install path: `brew install default-anton/tap/vgpr`
- CLI upgrade path: `brew upgrade vgpr`
- local bring-up path: `vgpr setup local`
- remote-shape development path: `vgpr setup mock`
- first real hosted path: `vgpr setup do`
- update discovery path: `vgpr status` shows the deployed version and whether a newer release exists
- app update path: `vgpr update` backs up the control-plane SQLite state, applies control-plane migrations, restarts the persistent services, and leaves already-running temporary session servers alone
- first real compute provider: DigitalOcean
- supported DNS providers for the hosted path: Cloudflare DNS and DigitalOcean DNS

The CLI creates the initial admin account during setup. The browser should open to a login page, not to a public first-user-wins setup flow.

See `docs/README.md` for the docs map, `docs/operator-cli.md` for the CLI contract, and `docs/releases.md` for release discovery and update behavior.

## Bootstrap the repo

The repo ships a `mise.toml` with the baseline Go, Node.js, pnpm, and helper CLI versions.

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm run hooks:install
mise exec -- pnpm run check
```

Use `mise exec -- ...` unless your shell already activates `mise` shims. That keeps the repo off `corepack` and avoids accidentally picking up an old `pnpm` shim from `PATH`.

## Default quality loop

The stable repo commands are:

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check
```

`pnpm run check` is the default local gate. It verifies formatting, lint, type checks, and tests without requiring browser-only validation.

Focused proof commands for the bootstrap slice:

```bash
go test ./...
pnpm exec tsgo --noEmit -p web/control/tsconfig.json
pnpm exec tsgo --noEmit -p web/session/tsconfig.json
pnpm exec oxlint web/control/src/App.tsx web/session/src/App.tsx
pnpm exec oxfmt --check web/control/src/App.tsx web/session/src/App.tsx
```

## Current bootstrap surface

The repo now contains these runnable skeleton entrypoints:

- `go run ./cmd/controlplane`
- `go run ./cmd/sessionrunner`
- `go run ./cmd/sessiond`
- `go run ./cmd/vgpr --help`
- `mise exec -- pnpm exec vite --config web/control/vite.config.ts`
- `mise exec -- pnpm exec vite --config web/session/vite.config.ts`

Backend services emit structured JSON logs to stderr. The CLI keeps primary output on stdout and diagnostics on stderr.

## Likely users

- indie podcasters with remote guests
- small production teams
- developer-creators
- people who care about self-hosting, cost control, or data ownership

## Later

Once the core recording path is solid, useful additions would be:

- direct export to S3, Google Drive, DigitalOcean Spaces, Dropbox, Backblaze, MEGA, and other storage providers.
- livestream output to YouTube, Twitch, X, LinkedIn, and other platforms
- support for other temporary recording hosts, including Hetzner Cloud, Vultr, Linode, and AWS Lightsail
- smoother post-recording delivery
