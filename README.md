# very-good-podcast-recorder

Open-source remote podcast recording with a **hosted alpha** architecture: a persistent control plane, disposable per-session recording servers, browser-based joining, and local per-seat tracks.

This repo is for technical podcast hosts and producers who want Riverside-style recording quality without turning v1 into a full self-hosting platform.

## Current repo status

This repo is intentionally **harness-only** right now.

All application implementation code was removed during the pivot. What remains is the product spec, the quality loop, the test runner/lint/typecheck harness, and the minimal repo-shape guardrails that keep those tools honest.

Treat the product docs below as the target contract to restore, not as shipped behavior.

If you want the shortest path to the current intended product slice, start with `docs/alpha-scope.md` and then follow the linked owning specs.

If you want to know where implementation should land in this repo, read `docs/repo-layout.md`.

## How it works

The host uses a persistent control plane hosted on Cloudflare. That control plane owns the session roster, stable human join links, and the host UI.

For each recording session, the control plane provisions a **disposable DigitalOcean session server**. That server runs the live room backend, receives uploaded recording chunks during the call, terminates its own session-side TLS, and provides TURN for that session. Cloudflare DNS publishes a session hostname directly to that disposable backend. There is no persistent edge box in v1.

While the session is running, each participant records media locally on their own machine. For v1, a participant seat may produce one mic source, one or more camera source instances, and zero or more screen-share source instances during the recording run. Each screen-share start may also produce a paired best-effort system-audio source instance when the browser/platform exposes it. Starting and stopping screen share during the session is normal and creates additional source instances rather than errors. Video targets 1080p30 with 720p30 fallback, and audio targets 48 kHz Opus in browser-native WebM. Those recordings are uploaded to the session server in the background as chunks. The main host controls when recording starts and stops from the control plane. After the session, the host downloads the raw files and manifests, then the disposable session server is torn down.

That gives you three separate things:

- a live session path for conversation and monitoring
- a local capture path for higher-quality per-seat recordings
- an upload path that pushes recorded chunks to the session server during the session

The point is simple: joining should feel like opening a normal call link, but the final files should be better than a live mixed recording.

## What you get

- a persistent Cloudflare-hosted control plane web app and API
- one disposable DigitalOcean session server per recording session
- browser-based group session that hosts and guests join via a stable control-plane URL
- separate local source tracks per participant seat, including mic, one or more camera sources, and repeatable optional screen/system-audio capture episodes
- stable seat identities for reconnect handling
- host-controlled recording start and stop
- manual download of raw uploaded files and manifests
- responsive UI layouts for host and guest screens
- session costs tied to actual recording time

## Current scope

The first version is intentionally narrow.

It does this:

- ship one hosted deployment shape only
- run the persistent control plane on Cloudflare
- use Cloudflare DNS for the control-plane domain and per-session backend hostnames
- provision one disposable DigitalOcean server per session
- keep networking cheap: no persistent edge box, and run TURN on the disposable session server
- provide stable control-plane join links for hosts and guests
- let the host start and stop recording from the control plane
- record local participant source tracks, including repeated screen-share episodes and multi-camera seats
- upload those tracks in the background to the session server
- let the host download the files manually after the session
- keep the UI responsive across common viewport sizes, while keeping recording support Chromium-first

It explicitly does **not** do this in v1 alpha:

- self-hosting as a supported product feature
- local deployment as a user-facing feature
- a polished operator CLI
- provider abstraction or multi-provider support
- dedicated TURN deployment modes
- server-side compositing, editing, livestreaming, or publishing
- cloud storage export integrations
- broad browser/platform support beyond modern Chromium-first recording flows

## Setup and operations

The product surface for v1 alpha is **hosted**, not laptop-installed.

That means:

- no user-facing `vgpr` CLI in alpha
- no supported local/self-host bring-up flow for operators
- deployment, updates, and recovery are internal maintainer workflows for now
- the browser is the primary product surface for hosts and guests

The repo still needs a **local dev and test harness**. That is an internal feedback loop, not a supported operator story. See `docs/local-stack.md` and `docs/testing.md`.

## Bootstrap the repo

The repo ships a `mise.toml` with the baseline Go, Node.js, pnpm, and helper CLI versions.

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm run hooks:install
mise exec -- pnpm run check
```

Use `mise exec -- ...` unless your shell already activates `mise` shims. That keeps the repo off `corepack` and avoids accidentally picking up an old `pnpm` shim from `PATH`.

## Likely users

- indie podcasters with remote guests
- small production teams
- developer-creators
- people who care about controlling cost and owning their raw recordings

## Later

Once the hosted alpha recording path is solid, useful additions would be:

- a real operator CLI
- a self-host/local deployment story
- direct export to S3, Google Drive, DigitalOcean Spaces, Dropbox, Backblaze, MEGA, and other storage providers
- livestream output to YouTube, Twitch, X, LinkedIn, and other platforms
- support for other temporary recording hosts beyond DigitalOcean
- smoother post-recording delivery
