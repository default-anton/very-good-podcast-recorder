# issue 06 — repeated screen-share path

Related docs:

- `docs/alpha-scope.md`
- `docs/testing.md`
- `docs/capture-profile.md`
- `docs/artifact-manifest.md`

## goal

Finish the remaining milestone-1 feature slice after the happy path is stable.

## scope

Add:

```text
e2e/scenarios/
└── repeated-screen-share.spec.ts
```

Automate:

- start from the happy path local stack
- one seat starts screen share during recording
- if the browser/platform exposes system audio, enable it too
- run long enough to produce multiple chunks for that share episode
- stop the share cleanly while recording stays active
- later in the same recording run, start screen share again
- host stops recording and uploads finish
- verify manifest/source-instance grouping and summary output

## non-goals

- multi-camera coverage
- reconnect or upload-stall/resume coverage
- hosted provisioning or hosted smoke-path work
- hardening beyond this repeated-screen-share proof

## acceptance criteria

- the scenario runs deterministically against the real local stack
- the screen-sharing seat keeps one seat ID / LiveKit participant identity
- the manifest shows at least 2 distinct `screen` `source_instance_id` values for that seat
- paired `system_audio` is explicit when available and explicit non-failing when unavailable
- stopping the first share finishes cleanly; it does not become `abandoned` on a normal stop
- each started extra source uploads more than one chunk
- summary JSON and final artifact layout are inspectable

## feedback loop

Run the scenario narrowly:

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/repeated-screen-share.spec.ts
```

If this flakes, fix fixture determinism, capture signaling, or manifest/log output before adding more scenario coverage.

## notes

This closes the remaining local milestone-1 feature proof.
Do **not** treat multi-camera, reconnect, or upload-stall/resume as milestone-1 blockers.
Those belong after the hosted path in milestone 2 is real.
