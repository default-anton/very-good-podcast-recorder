# issue 05 — happy-path harness

Related docs:

- `docs/testing.md`
- `docs/artifact-manifest.md`
- `docs/local-stack.md`
- `docs/repo-layout.md`

## goal

Automate the first must-pass scenario and make it the default truth source for milestone 1.

## scope

Add:

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
- the scenario is reliable enough to gate more milestone-1 work

## feedback loop

The primary proof command is:

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/happy-path.spec.ts
```

If the signal is weak, improve fixture determinism and summary/log outputs before adding more scenarios.

## notes

Do **not** move on to broader feature work until this scenario is reliable.