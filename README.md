# very-good-podcast-recorder

Open-source remote podcast recording with a persistent host control plane, temporary session servers, browser-based joining, and local tracks. It is built for creators who want Riverside-style recording quality while keeping control of their workflow, data, and costs.

This repo is for technical podcast hosts and producers who want the recording quality of local tracks without handing the whole workflow to a hosted platform.

## How it works

The main host runs or deploys a persistent control plane web app. It keeps the SQLite database for sessions and participants, creates and destroys temporary session servers, and gives the host one place to manage the recording.

For each recording session, the control plane starts a temporary session server in the best available region and syncs the stable participant IDs needed for reconnect handling. That server runs the backend for the live browser session and receives uploaded recording chunks during the call. The host shares a join URL, and hosts and guests open it in Chrome or another modern browser, like a normal video call.

While the session is running, each participant records media locally on their own machine. For v1, a participant seat may produce one mic source, one or more camera source instances, and zero or more screen-share source instances during the recording run. Each screen-share start may also produce a paired best-effort system-audio source instance when the browser/platform exposes it. Starting and stopping screen share during the session is normal and creates additional source instances rather than errors. Video targets 1080p30 with 720p30 fallback, and audio targets 48 kHz Opus in browser-native WebM. Those recordings are uploaded to the session server in the background as chunks. The main host controls when recording starts and stops from the control plane. After the session, the host downloads the files and destroys the server from the control plane.

That gives you three separate things:

- a live session path for conversation and monitoring
- a local capture path for higher-quality per-participant recordings
- an upload path that pushes recorded chunks to the session server during the session

The point is simple: joining should feel like opening a normal call link, but the final files should be better than a live mixed recording.

## What you get

- a persistent host control plane web app with SQLite-backed session and participant state
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
- start a temporary session server for a recording
- provide a join URL for hosts and guests
- run the live browser session through that server
- let the main host start and stop recording from the control plane
- record local participant source tracks, including repeated screen-share episodes and multi-camera seats
- upload those tracks in the background to the server
- let the host download the files manually
- destroy the server from the control plane when the session is over

It does not try to be a polished studio product yet.

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
