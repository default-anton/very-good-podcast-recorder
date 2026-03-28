# issue 06 — alpha feature scenarios

Related docs:

- `docs/testing.md`
- `docs/capture-profile.md`
- `docs/seat-claim-protocol.md`
- `docs/recording-upload-protocol.md`

## goal

Cover the remaining milestone-1-critical scenarios after the happy path is stable.

## scope

Add:

```text
e2e/scenarios/
├── repeated-screen-share.spec.ts
├── multi-camera.spec.ts
├── reconnect.spec.ts
└── upload-stall-resume.spec.ts
```

Implement in this order:

1. repeated screen share
2. multi-camera
3. reconnect
4. upload stall/resume

## non-goals

- active seat takeover
- localized track failure with continued salvage
- terminal session-level failure
- broad network impairment simulation

Those stay deferred until after the 5 alpha must-pass scenarios are reliable.

## acceptance criteria

- each scenario runs narrowly and deterministically against the real local stack
- repeated screen share proves repeated source-instance behavior
- multi-camera proves multiple camera source instances under one seat identity
- reconnect proves stable seat identity and explicit segment behavior
- upload stall/resume proves already-recorded media is not silently lost

## feedback loop

Run each scenario narrowly as it lands:

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/repeated-screen-share.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/multi-camera.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/reconnect.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/upload-stall-resume.spec.ts
```

If one scenario flakes twice, stop expanding coverage and improve determinism, logs, or fixtures first.

## notes

This issue finishes milestone 1 coverage. Do **not** broaden into hardening-only scenarios until these 4 are green behind the happy path.