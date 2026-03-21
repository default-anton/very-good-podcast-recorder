# v1 session lifecycle

Related docs:

- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/seat-claim-protocol.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/testing.md`

## recommendation

Lock the product to 4 nested state machines:

1. control-plane session lifecycle
2. temporary session-server lifecycle
3. hosted recording phase + health lifecycle
4. per-track upload lifecycle

Keep them separate.

Do **not** overload one state to mean provisioning, joinability, recording progress, and artifact trust at the same time.

For the hosted recording run, split:

- **phase**: are we waiting, recording, draining, stopped, or terminally failed?
- **health**: is the salvage set still clean, degraded, or unrecoverable?

That split is what lets us keep salvaging unaffected tracks without pretending the result is clean.

## scope

This doc defines:

- allowed transitions for `sessions.state`
- allowed transitions for `session_servers.state`
- allowed transitions for `session_snapshot.recording_state`
- allowed transitions for `session_snapshot.recording_health`
- how track failures escalate at the session level
- what `degraded` vs `failed` means for the host and the artifact set
- what artifacts must remain inspectable after terminal failure

It does **not** define:

- the browser seat-claim wire contract
- chunk upload request/response bodies
- cloud-specific provisioning implementation details

## 1. control-plane session lifecycle

`control_plane.sessions.state` is the host-facing lifecycle for one recording session.

States:

- `draft`: host is still editing session setup
- `ready`: session can be provisioned and shared, but no recording run has started
- `active`: the session has an assigned temporary runtime or has already started its hosted run
- `ended`: host closed the session; history/download only

### allowed transitions

- `draft -> ready`
- `ready -> draft`
- `ready -> active`
- `active -> ready` only if the temporary server died or was destroyed **before** any `recording_epoch_id` was minted
- `draft -> ended`
- `ready -> ended`
- `active -> ended`

`ended` is terminal in v1.

### meaning

#### `draft`

- roster may change
- display names may change
- join keys may rotate
- no temporary server is required
- browsers must not be told the session is joinable yet

#### `ready`

- roster is internally valid and names are unambiguous
- join links exist and may be shared
- the control plane may request provisioning of the temporary server through the private session-runner
- roster may still change
- join keys may still rotate
- there is no recording run yet

#### `active`

- a temporary session server is being created, is joinable, is draining, or has already hosted the recording run
- once the session first enters `active`, the hosted runtime owns join/claim/recording semantics
- invited seats may still authenticate, claim, reconnect, and join after `active`, including while recording is already in progress
- if a recording run starts, the session can never return to `ready`

#### `ended`

- no new temporary server may be provisioned for this session in v1
- no new recording run may start
- control-plane UI is history/download only

### mutability rules

Keep the hosted auth path live during `active`, but freeze **control-plane edits** to auth + roster for that hosted run.

Rules:

- `draft` and `ready`: roster, display names, and join keys may change
- `active`: invited seats may still authenticate, claim, reconnect, and join; recording does **not** disable join/auth for already-invited participants
- `active`: control-plane roster edits, display-name edits, and join-key rotation are frozen for that hosted run
- `ended`: history only

If the host needs a changed roster after `active`, create a new session. In v1, keep the active session's auth model static, but do **not** stop authenticating invited participants during the hosted run.

## 2. temporary session-server lifecycle

`control_plane.session_servers.state` is the control-plane view of the assigned temporary runtime.

States:

- `creating`: provisioning or bootstrap still in progress
- `ready`: runtime is up and the session server may accept browser traffic
- `stopping`: teardown has been requested
- `stopped`: teardown completed intentionally
- `failed`: infrastructure or runtime is broken enough that the control plane cannot trust it as joinable/healthy

### allowed transitions

- `creating -> ready`
- `creating -> failed`
- `ready -> stopping`
- `ready -> failed`
- `stopping -> stopped`
- `stopping -> failed`

`stopped` and `failed` are terminal for that runtime instance.

### meaning

#### `creating`

- browsers must not attempt to join
- roster and join auth snapshot must be fully loaded before `ready`

#### `ready`

- the join flow, seat-claim endpoints, recording control endpoints, and upload endpoints may be served
- `session_snapshot.recording_state` may independently be `waiting`, `recording`, `draining`, `stopped`, or `failed`

#### `stopping`

- no new seat claims or room joins should be accepted
- use this only after the hosted recording is terminal (`stopped` or `failed`) or when aborting before recording start

#### `failed`

Use `session_servers.state = 'failed'` for infrastructure/runtime failure, for example:

- the session-runner could not complete provisioning
- the session server process is crash-looping
- the VM/container is unreachable
- local session state is unreadable or irrecoverably corrupted
- the control plane cannot reliably determine whether the runtime is still serving the session

This is **not** the same as a localized recording-path failure that the still-running session server can represent with `recording_health = 'degraded'`.

## 3. hosted recording phase + health lifecycle

The hosted recording run has 2 server-owned fields:

- `session_snapshot.recording_state`
- `session_snapshot.recording_health`

### 3.1 recording phase (`recording_state`)

`recording_state` is the phase of the hosted recording run.

States:

- `waiting`: room exists, seats may be claimed, recording has not started
- `recording`: host accepted start; browsers may start and upload track segments
- `draining`: host accepted stop; no new capture should begin, but accepted work may still finish uploading
- `stopped`: the hosted run is complete enough to expose a final salvage manifest
- `failed`: the hosted run is terminally broken or untrustworthy at the session level

### allowed transitions

- `waiting -> recording`
- `recording -> draining`
- `recording -> failed`
- `draining -> stopped`
- `draining -> failed`
- `waiting -> failed`

`stopped` and `failed` are terminal in v1.

There is no second recording run for the same hosted session.

### 3.2 recording health (`recording_health`)

`recording_health` is the trust level of the current or final artifact set.

States:

- `healthy`: no known terminal data loss or unreconciled track failure has happened
- `degraded`: at least one track or localized recording path failed, but the session server can still preserve/describe committed artifacts and continue salvaging unaffected work
- `failed`: the session-level salvage set is no longer trustworthy enough to continue normally

### allowed transitions

- `healthy -> degraded`
- `healthy -> failed`
- `degraded -> failed`

`degraded` and `failed` are sticky in v1. Never move back to `healthy`.

### invariants

- when `recording_state = 'waiting'`, `recording_health` must be `healthy`
- when `recording_state = 'failed'`, `recording_health` must be `failed`
- when `recording_state = 'stopped'`, `recording_health` may be `healthy` or `degraded`
- `recording_health = 'degraded'` does **not** by itself stop the recording run

### exact `degraded` rule

Move `recording_health` to `degraded` when either is true and the session server is still trustworthy enough to continue salvaging unaffected work:

1. at least one started track reaches `recording_tracks.state = 'failed'`, or
2. the session server detects a localized recording-path inconsistency that it can still describe explicitly in the final manifest without lying about completeness

Typical `degraded` examples:

- one participant's video segment hits a terminal storage commit failure, but all other tracks can keep uploading
- one track manifest row is unrecoverable, but the server can still identify the failed track and preserve the rest of the session accurately
- one seat's pre-takeover segment becomes unusable in a way that is explicit and isolated

### exact `failed` rule

Move `recording_state` to `failed` and `recording_health` to `failed` only when the session server can no longer guarantee a trustworthy salvage manifest **or** can no longer continue safely.

Typical `failed` examples:

- the session-local database is unreadable or corrupt enough that committed chunk ranges cannot be trusted
- the artifact root or manifest store is unreadable across the hosted run
- the server cannot reliably distinguish committed vs uncommitted work
- repeated session-wide storage failure makes further ingest unsafe or meaningless
- cleanup cannot build a truthful final salvage manifest

### state ownership

- browsers may request `waiting -> recording` via host `start`
- browsers may request `recording -> draining` via host `stop`
- only the session server may decide `healthy -> degraded`
- only the session server may decide `-> failed`
- only the session server may decide `draining -> stopped`

### continue-on-degraded rule

While:

- `recording_state = 'recording'` or `recording_state = 'draining'`, and
- `recording_health = 'degraded'`

continue accepting **phase-appropriate work for unaffected tracks**.

That means:

- do **not** hard-stop the whole session just because one track failed
- keep allowing unaffected tracks to upload and finish
- keep allowing new segments only if the phase already allows them
- keep rejecting mutations for a track that is already terminally `failed`

This is the v1 salvage rule: maximize durable recovery without pretending the result is clean.

### `stopped` rule

Move `draining -> stopped` when all started tracks are terminal **and** the session server can still expose a truthful final salvage manifest.

Terminal track states are:

- `complete`
- `abandoned`
- `failed`

Result interpretation:

- `stopped + healthy` = clean final salvage set
- `stopped + degraded` = partial but explicit final salvage set

## 4. per-track lifecycle

`recording_tracks.state` remains:

- `recording`
- `uploading`
- `complete`
- `abandoned`
- `failed`

Track transitions are defined in `docs/recording-upload-protocol.md`.

This doc adds the escalation rule only:

- any `recording_tracks.state = 'failed'` **must** force `recording_health = 'degraded'`
- a failed track **may** also force `recording_state = 'failed'` if the broader session-level salvage set is no longer trustworthy

There is no downgrade from `failed` back to `abandoned` or `complete`.

## failure policy by layer

### control-plane `sessions.state`

`ended` is lifecycle closure, not failure.

A control-plane session may stay `active` even if the hosted runtime or recording run degraded or failed. The failure signal lives in the temporary-server state and/or the hosted recording fields, not in `sessions.state` itself.

### `session_servers.state = 'failed'`

This means the runtime instance itself is no longer trustworthy as a live service.

Consequences:

- the control plane must stop advertising the server as joinable
- the host must not expect further successful browser mutations
- the control plane may move `active -> ready` only if no `recording_epoch_id` was ever started
- otherwise the control-plane session stays `active` until the operator ends it

### `recording_health = 'degraded'`

This means the host should expect a partial or damaged final result, but the system is still trying to salvage unaffected work.

Consequences:

- keep the run visible as degraded in host UI/logs/manifests
- continue phase-appropriate ingest for unaffected work
- preserve already committed chunks and explicit failure metadata
- never present the final artifact as clean

### `recording_state = 'failed'`

This means the hosted recording run is terminal and must not accept new work.

Consequences:

- reject all new `start`, `chunk`, and `finish` mutations
- keep returning success for exact idempotent replays of already-committed operations
- keep the already-minted `recording_epoch_id` stable if one exists
- preserve already committed artifacts if storage is still readable
- never transition back to `recording`, `draining`, or `stopped`

### `recording_tracks.state = 'failed'`

This means the server accepted work for that track but cannot safely represent that one track segment as trustworthy durable state.

Consequences:

- do not silently mask it as `abandoned`
- mark the hosted recording at least `degraded`
- preserve already committed chunks and explicit failure metadata if possible

## artifact guarantees

### when the hosted recording is `stopped` and `healthy`

The session server must be able to produce a final manifest that explicitly lists:

- `recording_epoch_id`
- all expected seats
- all started track segments
- each track terminal state
- capture offset ranges
- committed chunk ranges

This is the clean happy-path artifact.

### when the hosted recording is `stopped` and `degraded`

The session server must still be able to produce a truthful final salvage manifest.

That manifest must make these explicit:

- final recording health is `degraded`
- failed track ids or ranges
- committed chunk ranges per track
- known missing, abandoned, failed, or unreconciled ranges
- any seats or segments that are partial only

`stopped + degraded` means: download is still valid, but it is a partial or damaged salvage set, not a clean session artifact.

### when the hosted recording is `failed`

The session server must preserve every chunk file and manifest row that was already durably committed, as long as local storage remains readable.

If the server can still answer read requests, it must expose a failure manifest that makes these explicit:

- session-level terminal failure reason
- final `recording_state = 'failed'`
- final `recording_health = 'failed'`
- committed chunk ranges per track
- known missing, abandoned, failed, or unreconciled ranges

`failed` never means "pretend it stopped cleanly".

### when the temporary server itself is `failed`

The control plane may lose the ability to read the runtime over the normal API.

Guarantee only this:

- already committed local-disk artifacts must not be intentionally discarded by cleanup

Do **not** promise API availability or remote download when the runtime itself is down.

## teardown and retry rules

### safe retry before recording start

If the temporary server fails **before** any `recording_epoch_id` exists:

- the control plane may destroy that runtime
- the control-plane session may move `active -> ready`
- the host may provision a fresh temporary server for the same session

### no retry after recording start

If any `recording_epoch_id` was minted for that hosted run:

- do **not** move the control-plane session back to `ready`
- do **not** provision a second hosted recording run for the same session
- the only lifecycle move left is `active -> ended`

This keeps the v1 artifact model honest: one session, one hosted recording run, one manifest lineage.

## canonical lifecycle examples

### normal successful run

1. control-plane session `draft -> ready`
2. host requests server provisioning: `ready -> active`
3. runtime `creating -> ready`
4. hosted recording phase `waiting -> recording`
5. host stops recording: `recording -> draining`
6. all started tracks become terminal and none are `failed`
7. hosted recording `draining -> stopped`
8. final result is `stopped + healthy`
9. runtime `ready -> stopping -> stopped`
10. control-plane session `active -> ended`

### localized track failure with successful salvage

1. hosted recording is `recording + healthy`
2. one track hits terminal unrecoverable storage/manifest failure
3. that track moves to `failed`
4. hosted recording health moves to `degraded`
5. unaffected tracks keep uploading and finishing under the normal phase rules
6. host stops recording: phase moves to `draining`
7. all started tracks become terminal and the server can still build a truthful final salvage manifest
8. hosted recording becomes `stopped + degraded`

### unrecoverable session-level recording failure

1. hosted recording is `recording` or `draining`
2. session-level state becomes untrustworthy enough that the server cannot continue safely
3. hosted recording moves to `failed + failed`
4. new recording/upload mutations are rejected
5. already committed artifacts are preserved if they remain readable

### server bootstrap failure before recording start

1. control-plane session `ready -> active`
2. runtime `creating -> failed`
3. no `recording_epoch_id` exists
4. control-plane session `active -> ready`
5. host retries provisioning

## non-goals for v1

- multiple recording runs inside one session
- auto-recovery from session-level `failed`
- live control-plane roster mutation or join-key rotation while a session is active
- hiding degraded or failed artifacts behind a synthetic clean `stopped`
