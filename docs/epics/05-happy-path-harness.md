# epic 05 — happy-path harness

## Recommended PR slices

split into 2 PRs:
- harness primitives/fixtures/summary
- happy-path scenario using them

Related docs:

- `docs/testing.md`
- `docs/artifact-manifest.md`
- `docs/local-stack.md`
- `docs/repo-layout.md`

## goal

Automate the first must-pass scenario and make it the default truth source for milestone 1.

## scope

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
- summary JSON is emitted and inspectable
- final artifact layout and manifest expectations are validated
- `e2e/scenarios/control-shell.spec.ts` and `e2e/scenarios/session-shell.spec.ts` remain as a cheap frontend preflight separate from the real-stack scenario
- the scenario is reliable enough to gate more milestone-1 work

## feedback loop

The primary proof command is:

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/happy-path.spec.ts
```

If the signal is weak, first run the existing control/session shell smokes to separate pure frontend regressions from runtime or harness regressions, then improve fixture determinism and summary/log outputs before adding more scenarios.

## notes

Do **not** move on to broader feature work until this scenario is reliable.