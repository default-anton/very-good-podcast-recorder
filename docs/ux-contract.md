# v1 UX contract

Related docs:

- `docs/README.md`
- `README.md`
- `docs/architecture.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/capture-profile.md`
- `docs/recording-control-protocol.md`

## recommendation

Ship one boring, truthful UX.

The v1 promise is:

- join from a normal browser link
- pick one pre-created seat
- show one obvious recording state
- keep live call, local capture, and upload health separate
- make failures explicit before they become support mysteries

This doc owns user-visible behavior, not visual design.

## core product model

Users must be able to learn this product in one pass:

- a session has a fixed roster
- each session has 2 bearer role links: `host` and `guest`
- a person joins a pre-created seat; there is no join-time name entry
- one seat has at most one active browser owner at a time
- the host controls one recording run for the session
- the product has 3 separate runtime paths:
  - live call
  - local recording
  - upload / salvage

The UI must not collapse those 3 paths into one vague health indicator.

## required surfaces

### 1. host session setup

The host setup flow must let the operator:

- create or edit the session title
- create the roster and assign `host` or `guest` seats
- set unambiguous display names before the session starts
- copy the host link
- copy the guest link
- see whether the session is `draft`, `ready`, `active`, or `ended`

Once the session is `active`, roster edits, display-name edits, and join-link rotation for that hosted run must be visibly unavailable.

### 2. join flow

The join flow must do this in order:

1. validate the role link
2. show the seat picker for that role
3. auto-reclaim the current browser's owned seat when possible
4. require explicit takeover for an already active seat
5. show a minimal device preview before joining
6. join the room

The seat picker must expose only these states from `docs/seat-claim-protocol.md`:

- `available`
- `you`
- `in_use`
- `rejoin_available`

### 3. session room

The room must stay simple. V1 requires:

- participant grid
- persistent session status bar
- basic media controls
- host roster/status panel

Required participant controls:

- mute / unmute mic
- camera on / off
- choose mic
- choose camera
- start / stop screen share
- leave session

Required host-only controls:

- start recording
- stop recording

If multi-camera ships in v1, expose it as a plain add/remove camera action. Do not turn v1 into a routing console.

### 4. post-recording summary

After recording stops, the host must be able to see:

- whether the session is still `draining`
- whether the final result is `healthy`, `degraded`, or `failed`
- whether artifacts are ready for download
- plain-language failure reasons when the result is not healthy

V1 does not require in-product media review, editing, or publishing.

## required status model

### session-wide status

The persistent session status bar must show recording phase and recording health separately.

Recording phase:

- `waiting`
- `recording`
- `draining`
- `stopped`
- `failed`

Recording health:

- `healthy`
- `degraded`
- `failed`

`degraded` means recording may continue, but the final artifact set is incomplete or partially failed.

### per-seat status

For each seat, the product must keep these signals separate:

#### live call

- `connected`
- `reconnecting`
- `disconnected`

#### local capture

- `not_recording`
- `recording`
- `issue`

#### upload / salvage

- `synced`
- `uploading`
- `catching_up`
- `failed`

The host roster must show these states per seat. Guests only need their own seat status.

The UI must not imply that a good live call means recording is healthy.

## host vs guest requirements

### host

In the room, the host must always be able to see one roster view with one row per seat showing:

- display name
- role
- joined vs not joined
- live call status
- local capture status
- upload / salvage status
- ownership problems that require attention, such as takeover or rejoin availability

### guest

A guest must always be able to see:

- their seat name
- whether session recording has started
- whether their own local capture is active
- whether their uploads are healthy or catching up
- whether they are reconnecting
- whether screen share is active

Guests do not need session-wide artifact detail beyond the current recording state.

## wording rules

Use blunt, operational language.

Required rules:

- do not say or imply that the whole session is safe just because the room is connected
- do not imply that every participant is recording successfully from the session-level recording badge alone
- when a seat has a local-capture problem, say that seat has a local-capture problem
- `draining` must mean recording has stopped and uploads are still finishing
- `degraded` must mean recording continues or finished, but at least one track is incomplete, failed, or only partially salvageable
- `failed` must mean the hosted recording run is terminally broken or untrustworthy at the session level
- takeover must always be an explicit user action, never a silent replacement

## non-goals for v1

Do not make this doc responsible for:

- chat or reactions
- branding/themes
- transcript or notes UX
- teleprompter or scene controls
- advanced audio/video tuning panels
- server-side mixed-program review UI
- post-production workflow
- freeform join-time names
- public first-user-wins account setup
