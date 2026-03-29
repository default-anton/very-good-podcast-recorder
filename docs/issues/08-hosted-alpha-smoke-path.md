# issue 08 — hosted alpha smoke path

Related docs:

- `docs/alpha-scope.md`
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

Reuse the local harness abstractions where they fit, but run against the deployed control plane and one disposable hosted backend.

Automate:

- create a session and seat roster through the hosted control plane
- provision the disposable session backend
- join host + 2 guests through the stable human links
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
- teardown removes both the backend and DNS record cleanly
- failed runs preserve enough logs and artifacts to debug without video review

## feedback loop

Primary proof is one scripted hosted smoke run with text output and preserved artifacts.

```bash
mise exec -- pnpm exec playwright test e2e/scenarios/hosted-smoke.spec.ts
```

If hosted browser automation is too flaky early, first build a deterministic maintainer smoke command for provision/readiness/teardown that emits the same summary schema.

## notes

Do **not** move on to milestone-3 hardening until this hosted smoke path is green.
