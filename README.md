# very-good-podcast-recorder

Open-source remote podcast recording with a temporary session server, browser-based joining, and local tracks. It is built for creators who want Riverside-style recording quality while keeping control of their workflow, data, and costs.

This repo is for technical podcast hosts and producers who want the recording quality of local tracks without handing the whole workflow to a hosted platform.

## How it works

For each recording session, the host starts a temporary session server in the best available region.

That server runs the backend for the live browser session and receives uploaded recording chunks during the call. The host shares a join URL, and hosts and guests open it in Chrome or another modern browser, like a normal video call.

While the session is running, each participant records audio and video locally on their own machine. Those recordings are uploaded to the session server in the background as chunks. The main host controls when recording starts and stops. After the session, the host downloads the files and destroys the server.

That gives you three separate things:

- a live session path for conversation and monitoring
- a local capture path for higher-quality per-participant recordings
- an upload path that pushes recorded chunks to the session server during the session

The point is simple: joining should feel like opening a normal call link, but the final files should be better than a live mixed recording.

## What you get

- browser-based group session that hosts and guests join via a URL
- a temporary session server for the live session and recording uploads
- separate local audio and video tracks per participant
- host-controlled recording start and stop
- storage and workflow under your control
- session costs tied to actual recording time

## Current scope

The first version is intentionally narrow.

It does this:

- start a temporary session server for a recording
- provide a join URL for hosts and guests
- run the live browser session through that server
- let the main host start and stop recording
- record local participant tracks
- upload those tracks in the background to the server
- let the host download the files manually
- destroy the server when the session is over

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
