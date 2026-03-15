# very-good-podcast-recorder

Open-source remote podcast recording with local tracks and pay-only-when-you-record infrastructure. It is built for creators who want Riverside-style recording quality while keeping control of their workflow, data, and costs.

This repo is for technical podcast hosts and producers who want the recording quality of local tracks without handing the whole workflow to a hosted platform.

## How it works

For each recording session, the host starts a temporary DigitalOcean droplet in the best available region.

Everyone joins from Chrome or another modern browser, like a normal video call. While the call is running, each participant records audio and video locally on their own machine. Those recordings are uploaded to the droplet in the background as chunks. After the session, the host downloads the files and destroys the droplet.

That gives you three separate things:

- a live call path for conversation and monitoring
- a local capture path for higher-quality per-participant recordings
- an upload path that pushes recorded chunks to the droplet during the session

The point is simple: the call should feel normal, but the final files should be better than a live mixed recording.

## What you get

- browser-based group call for hosts and guests
- separate local audio and video tracks per participant
- temporary recording infrastructure instead of an always-on server
- storage and workflow under your control
- session costs tied to actual recording time

## Current scope

The first version is intentionally narrow.

It does this:

- start a temporary recording droplet for a session
- let people join in the browser
- record local participant tracks
- upload those tracks in the background
- let the host download the files manually
- shut the droplet down when the session is over

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
- smoother post-recording delivery
