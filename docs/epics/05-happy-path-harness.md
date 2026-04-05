# epic 05 — happy-path harness

## Recommended PR slices

split into 2 PRs:
- [done] harness primitives/fixtures/summary
- happy-path scenario using them

Related docs:

- `docs/testing.md`
- `docs/artifact-manifest.md`
- `docs/local-stack.md`
- `docs/repo-layout.md`

## goal

Automate the first must-pass scenario and make it the default truth source for milestone 1.

## scope

Use the repo-local runtime entrypoints from epic 04 as lifecycle plumbing:

- start the shared runtime with `mise exec -- ./scripts/local-up`
- optionally gate startup with `mise exec -- ./scripts/local-smoke` when debugging or when startup readiness is flaky
- stop it with `mise exec -- ./scripts/local-down`

Those scripts are the runtime contract, not the happy-path oracle. The harness itself must still drive browsers, verify uploads/manifests/artifacts, and emit the real scenario summary.

Add or extend:

```text
e2e/fixtures/
├── fake-media/
│   ├── camera.y4m
│   ├── mic.wav
│   └── screen-share.y4m
├── browser.ts
├── session-driver.ts
└── summary.ts

e2e/scenarios/
└── happy-path.spec.ts
```

Automate:

- host seat + 2 guest seats join
- host starts recording
- multiple chunks upload
- host stops recording
- manifests/raw files verify cleanly
- machine-readable summary is emitted
- keep the existing shell smoke specs as fast frontend-only proof; the real-stack harness adds to them instead of replacing them

## non-goals

- multi-camera assertions
- repeated screen-share assertions
- reconnect coverage
- upload stall/resume coverage
- takeover/failure hardening scenarios

## acceptance criteria

- `happy-path.spec.ts` runs headless and deterministically
- it exercises the real local stack, not mocks
- runtime startup/teardown goes through the repo-local `local-up` / `local-down` contract instead of new ad hoc bring-up logic
- `local-smoke` may be used as a fast preflight, but happy-path pass/fail still comes from the scenario's own browser/artifact assertions
- summary JSON is emitted and inspectable
- final artifact layout and manifest expectations are validated
- `e2e/scenarios/control-shell.spec.ts` and `e2e/scenarios/session-shell.spec.ts` remain as a cheap frontend preflight separate from the real-stack scenario
- the scenario is reliable enough to gate more milestone-1 work

## feedback loop

Primary proof stays the scenario itself:

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/happy-path.spec.ts
```

Recommended troubleshooting order:

```bash
mise exec -- ./scripts/local-up
mise exec -- ./scripts/local-smoke
mise exec -- pnpm exec playwright test e2e/scenarios/happy-path.spec.ts
mise exec -- ./scripts/local-down
```

If the signal is weak, first use `local-smoke` plus the existing control/session shell smokes to separate runtime startup failures from frontend-only regressions, then improve fixture determinism and summary/log outputs before adding more scenarios.

## notes

Do **not** move on to broader feature work until this scenario is reliable.

Do **not** make each Playwright test shell out to `local-up` / `local-smoke` / `local-down` independently. Use those commands as stable lifecycle plumbing around the harness run, and keep the happy-path scenario as the real correctness proof.