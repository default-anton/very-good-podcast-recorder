# alpha scope

Related docs:

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/frontend-design.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`
- `docs/operator-cli.md`
- `docs/testing.md`
- `docs/ux-contract.md`

## recommendation

Ship one narrow hosted alpha that proves the recording path, not a platform.

Keep:

- disposable per-session servers
- stable control-plane join links
- local per-seat recording
- multi-camera
- repeated screen share
- best-effort system audio
- reconnect/reclaim
- responsive host and guest UI
- manual raw artifact download

Cut or defer:

- self-hosting
- local deployment as a product feature
- public operator CLI
- provider abstraction
- multiple DNS providers
- persistent edge box
- persistent TURN VM
- editing, publishing, exports, livestreaming
- broad browser/platform support beyond Chromium-first recording flows

## exact alpha topology

Use one hosted shape only:

- **Cloudflare Workers + D1** for the persistent control plane
- **Cloudflare DNS** for `app.<domain>` and per-session DNS publication
- **one disposable DigitalOcean VM per recording session**
- **Caddy + LiveKit + sessiond + coturn on that disposable VM**

Rules:

- human join links stay on `app.<domain>`
- browsers learn the current session backend from the control plane bootstrap flow
- each session server is created before the session and destroyed after it
- there is no separate session-runner deployment in alpha
- there is no persistent edge or TURN box in alpha

## value retained

This cut still keeps the core product value:

- higher-quality local recordings than a mixed live call
- host-controlled recording start/stop
- multiple cameras under one seat
- repeated screen-share episodes during one recording run
- optional paired system audio when the browser/platform exposes it
- explicit live vs local capture vs upload state
- cheap session economics because heavy infra exists only while recording sessions exist

## explicit alpha cuts

### product cuts

- no self-hosting promise
- no laptop-installed operator workflow
- no public bootstrap/update/destroy CLI
- no post-production workflow
- no storage-export integrations
- no livestream output
- no server-side mixed program recording as the success path

### infrastructure cuts

- no separate session-runner service to operate
- no multi-provider abstraction
- no DigitalOcean DNS path
- no mock-provider product surface
- no dedicated TURN deployment mode
- no persistent reverse-proxy layer
- no multi-region orchestration

### compatibility cuts

- no Safari-first work
- no Firefox-first work
- no mobile-recording support promise
- no 4K / 60 fps / HDR goals

Responsive UI is still required. Broad recording compatibility is not.

## exact alpha flow

### 1. create

The host signs into the control plane, creates a session, defines the seat roster, and shares stable host/guest links from `app.<domain>`.

### 2. provision

When the session is activated, the control plane:

- creates provisioning intent
- boots one disposable DigitalOcean VM
- passes cloud-init for the session bundle and config
- allocates `<session-id>.sessions.<domain>` in Cloudflare DNS

### 3. bootstrap DNS/TLS/TURN

The disposable VM:

- installs the versioned session-server bundle
- starts Caddy, LiveKit, sessiond, and coturn
- serves HTTPS for the session hostname
- exposes TURN for that session lifetime
- reports readiness back to the control plane

If bootstrap fails before recording starts, the control plane destroys the VM, creates a new one, republishes DNS, and keeps the same human join link.

### 4. join

Browsers open the stable control-plane link, select seats, reclaim or take over if needed, fetch session bootstrap data, and connect to the current disposable backend.

### 5. record

The host starts recording. Each seat records local sources and uploads raw chunks to the session server in the background. The live call, local capture path, and upload path remain separate in state and failure handling.

### 6. stop and drain

The host stops recording. Uploads drain. The session server finalizes manifests and raw artifact layout.

### 7. download and teardown

The host downloads the raw files and manifests. The control plane then tears down the disposable session server and removes the per-session DNS record.

## deferred docs and surfaces

These docs remain valid, but they are **deferred or constrained** for alpha:

| Doc | Alpha stance |
| --- | --- |
| `docs/operator-cli.md` | public CLI is deferred; maintainer workflows only |
| `docs/local-stack.md` | internal dev/test harness only; not a product feature |
| `docs/releases.md` | maintainer-run hosted updates only; public update UX deferred |
| `docs/public-networking.md` | one topology only; no provider or TURN mode matrix |

## three implementation milestones

### milestone 1 — local proof of value

Goal: prove the product is worth continuing before paying cloud complexity tax.

Build:

- responsive host session setup
- responsive join flow and room shell
- seat claim / reclaim basics
- one local runtime for control plane + session server + LiveKit
- happy-path recording with mic, one camera, repeated screen share, and raw artifact download
- machine-readable harness summary

Must prove:

- host + 2 guests can join one real session
- host can start and stop recording
- each seat uploads multiple chunks
- manifests and raw files are correct
- narrow and wide layouts both keep core actions usable

Out of scope for this milestone:

- hosted provisioning
- Cloudflare DNS publication
- per-session TLS issuance on disposable servers
- advanced failure recovery

### milestone 2 — hosted alpha path

Goal: make the narrow product real on the internet with the chosen hosted topology.

Build:

- Cloudflare-hosted control plane deploy
- DigitalOcean disposable session-server provisioning
- per-session Cloudflare DNS publication
- session-side TLS on the disposable server
- TURN on the disposable server
- hosted smoke path: create → provision → join → record → stop → download → teardown

Must prove:

- stable human join links survive backend reprovision before recording starts
- disposable servers become joinable within target time
- hosted recording path works end to end without manual backend fiddling
- teardown removes the backend and DNS record cleanly

Out of scope for this milestone:

- public CLI
- self-hosting
- multi-provider support
- sophisticated day-2 ops UX

### milestone 3 — alpha hardening

Goal: make the narrow hosted product trustworthy enough for real alpha users.

Build:

- reconnect/reclaim hardening
- repeated screen-share path hardening
- multi-camera path hardening
- upload stall/resume coverage
- degraded vs failed recording signals that stay explicit in UI and manifests
- hosted rehearsal runs with preserved logs/artifacts

Must prove:

- reconnect does not create identity ambiguity
- upload interruptions do not silently lose already-recorded media
- one failing track does not lie about overall recording health
- the responsive UI still exposes critical state cleanly under degraded conditions

Out of scope for this milestone:

- polishing every operator edge case
- post-production features
- broad platform compatibility work

## sequencing rule

Do not start broad operator tooling or self-hosting work before milestone 2 is real.

Do not start post-production/export work before milestone 3 is trustworthy.

If the hosted path is flaky, improve the harness and observability before adding more features.
