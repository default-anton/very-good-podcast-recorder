# v1 UX contract

Related docs:

- `docs/README.md`
- `README.md`
- `docs/architecture.md`
- `docs/frontend-design.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/capture-profile.md`
- `docs/recording-control-protocol.md`

## recommendation

Ship one boring, truthful, **responsive** UX.

The v1 promise is:

- join from a normal browser link
- pick one pre-created seat
- show one obvious recording state
- keep live call, local capture, and upload health separate
- make failures explicit before they become support mysteries
- keep the UI usable across common viewport sizes

This doc owns user-visible behavior, not visual design. Visual direction and frontend component rules live in `docs/frontend-design.md`.

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

## responsive requirement

Responsive UI is **required** for v1.

Rules:

- all required screens must work at common laptop, desktop, and tablet widths
- narrow layouts must stay fully usable without horizontal scrolling for core actions
- critical recording state and error text must remain visible in narrow layouts
- do **not** hide recording start/stop, seat status, or failure language behind hover-only interactions
- layout reflow is required; feature parity on every phone browser is **not** promised yet

Product support remains Chromium-first for live recording flows. Responsive layout does **not** imply full mobile capture support in alpha.

## required surfaces

### 1. host session setup [done]

The host setup flow must let the operator:

- create or edit the session title
- create the seat roster and assign `host` or `guest` seats
- set unambiguous display names before the session starts
- copy the host link
- copy the guest link
- see whether the session is `draft`, `ready`, `active`, or `ended`

Once the session is `active`, roster edits, display-name edits, and join-link rotation for that hosted run must be visibly unavailable.

Responsive rules:

- the primary actions stay above the fold on common laptop widths
- seat rows may stack on narrow layouts, but seat identity and role must stay obvious
- copy-link actions must remain tap/click friendly

### 2. join flow [done]

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

Responsive rules:

- the seat picker must work cleanly on narrow layouts
- long display names must truncate safely without losing seat identity
- the takeover action must stay explicit and hard to trigger accidentally

### 3. session room [done]

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

Responsive rules:

- the session status bar stays persistent in all supported layouts
- the host roster/status panel may collapse below the grid on narrow screens, but its state signals must remain available without mode-switch confusion
- participant controls must stay reachable without covering the status bar
- do not rely on drag-and-drop or hover-only affordances for required actions

### 4. post-recording summary

After recording stops, the host must be able to see:

- whether the session is still `draining`
- whether the final result is `healthy`, `degraded`, or `failed`
- whether artifacts are ready for download
- plain-language failure reasons when the result is not healthy

V1 does not require in-product media review, editing, or publishing.

Responsive rules:

- final status and artifact readiness must appear before secondary metadata
- download actions must remain obvious on narrow layouts
- error summaries must wrap cleanly and stay text-first

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
- full mobile recording support
