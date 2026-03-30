# epic 08 — hosted alpha smoke path

## Recommended PR slices

if issue 07 is already landed cleanly, keep this as 1 PR:
- hosted smoke scenario + summary/artifact verification

otherwise split into 2 PRs:
- hosted smoke harness plumbing against the deployed control plane
- end-to-end hosted smoke assertions, artifact verification, and teardown checks

Related docs:

- `docs/alpha-scope.md`
- `docs/ux-contract.md`
- `docs/frontend-design.md`
- `docs/testing.md`
- `docs/public-networking.md`
- `docs/session-lifecycle.md`

## goal

Prove the full milestone-2 hosted flow: create → provision → join → record → stop → download → teardown.

## scope

Add:

```text
e2e/scenarios/
└── hosted-smoke.spec.ts
```

Reuse the local harness abstractions where they fit, but run against the deployed control plane and one disposable hosted backend. Reuse the same text-first labels and selectors already exercised by `e2e/scenarios/control-shell.spec.ts` and `e2e/scenarios/session-shell.spec.ts` where they still apply; do not invent a second UI assertion vocabulary for the hosted path.

Automate:

- create a session and seat roster through the hosted control plane
- provision the disposable session backend
- join host + 2 guests through the stable human links
- assert the critical text-first UI states are visible on the hosted path: setup actions, recording status, draining state, and artifact readiness
- record long enough to produce multiple chunks per baseline source
- stop recording and wait for upload drain
- download raw artifacts and verify manifests
- tear down the hosted backend and remove the session DNS record
- preserve summary JSON and logs for every run

## non-goals

- public operator CLI
- multi-camera, reconnect, or upload-stall hardening scenarios
- multi-region or provider-matrix work
- operator polish beyond one reliable maintainer smoke path

## acceptance criteria

- stable human join links work end to end on the hosted path
- the hosted backend becomes joinable within target time or reports why it did not
- the recording path works without manual backend fiddling
- the run summary captures hostname, backend ID, seat identity mapping, chunk counts, artifact result, and teardown result
- the hosted smoke asserts the same critical text states (`recording`, `draining`, `reconnecting`, `failed`) as the fast shell smokes when those states are present
- teardown removes both the backend and DNS record cleanly
- failed runs preserve enough logs and artifacts to debug without video review
- the smoke path proves critical operational UI remains text-first and visible without hover-only or icon-only interpretation

## feedback loop

Primary proof is one scripted hosted smoke run with text output and preserved artifacts.

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/hosted-smoke.spec.ts
```

If hosted browser automation is too flaky early, first build a deterministic maintainer smoke command for provision/readiness/teardown that emits the same summary schema.

## notes

Do **not** move on to milestone-3 hardening until this hosted smoke path is green.
