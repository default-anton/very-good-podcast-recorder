# epic 09 — alpha hardening scenarios

## Recommended PR slices

split into separate issues entirely:
- repeated screen share hardening
- multi-camera
- reconnect/reclaim
- upload stall/resume
- shared hosted rehearsal/log preservation plumbing

Related docs:

- `docs/alpha-scope.md`
- `docs/ux-contract.md`
- `docs/frontend-design.md`
- `docs/testing.md`
- `docs/capture-profile.md`
- `docs/seat-claim-protocol.md`
- `docs/recording-upload-protocol.md`

## goal

Finish milestone 3 hardening after the hosted smoke path is green.

## scope

Add or extend:

```text
e2e/scenarios/
├── repeated-screen-share.spec.ts
├── multi-camera.spec.ts
├── reconnect.spec.ts
└── upload-stall-resume.spec.ts
```

Implement in this order:

1. harden repeated screen share against the hosted path and preserved-log workflow
2. multi-camera
3. reconnect/reclaim
4. upload stall/resume

Also add hosted rehearsal plumbing that preserves summary JSON, structured logs, and final artifacts for every failure.

## non-goals

- active seat takeover during recording
- localized track failure with continued salvage
- terminal session-level failure
- broad network-impairment matrices
- post-production or export work

## acceptance criteria

- each scenario runs deterministically against the real stack and is reusable for hosted rehearsals
- repeated screen share stays explicit in manifests under stop/start cycles
- multi-camera keeps multiple camera source instances under one seat identity
- reconnect/reclaim avoids ambiguous identity and keeps track timeline semantics explicit
- upload stall/resume never silently drops already-recorded media
- degraded vs failed recording signals stay explicit in UI, manifests, and logs
- UI assertions check the explicit text labels for critical failure-state communication, not color or icon changes alone
- rehearsal runs preserve enough logs and artifacts to debug failures after the fact

## feedback loop

Run each scenario narrowly locally first, then on the hosted rehearsal path as soon as the hosted smoke path is stable.

For UI checks, prefer text assertions for states such as `recording`, `draining`, `degraded`, `failed`, `reconnecting`, and `catching_up` so the product contract stays testable without visual diff fragility.

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/repeated-screen-share.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/multi-camera.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/reconnect.spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/upload-stall-resume.spec.ts
```

If a scenario flakes twice, stop adding coverage and fix determinism, logging, or fixture control first.

## notes

Do **not** start this before milestone 2 is real.
Milestone 3 is about trustworthiness, not scope expansion.
