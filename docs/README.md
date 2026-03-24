# docs map

These docs are meant to be **single-owner specs**.

Rule:

- `README.md` is high-level and may repeat product basics.
- Inside `docs/`, each topic should have one source of truth.
- Other docs should link to that source instead of restating it.

## product shape

| Doc | Owns |
| --- | --- |
| `docs/architecture.md` | top-level system shape, component boundaries, stack choices |
| `docs/ux-contract.md` | v1 host/guest UX surface, required screens, status model, failure language |
| `docs/repo-layout.md` | repo/package layout |
| `docs/local-stack.md` | local boot flow, profiles, env/config, port map, local logs/state/artifacts |
| `docs/version-pins.md` | host toolchain and third-party component version pins |
| `docs/feedback-loop.md` | local quality loop, hooks, CI, logging baseline |
| `docs/testing.md` | end-to-end harness shape and required scenarios |

## deployment and ops

| Doc | Owns |
| --- | --- |
| `docs/public-networking.md` | public hostnames, persistent edge, TURN placement, route publication |
| `docs/session-server-bootstrap.md` | temporary session-server bootstrap chain, bundle layout, readiness contract |
| `docs/operator-cli.md` | operator-facing CLI UX, commands, flags, output, safety rules |
| `docs/releases.md` | release versioning, published artifacts, update discovery, and persistent update contract |

## session auth and state

| Doc | Owns |
| --- | --- |
| `docs/identity.md` | join-link model, durable seat identity, role model, LiveKit identity mapping |
| `docs/seat-claim-protocol.md` | seat-claim state machine, liveness, claim endpoints, takeover/reclaim wire contract |
| `docs/session-lifecycle.md` | session/server/recording/track lifecycle states and escalation rules |
| `docs/database-schema.md` | control-plane and session-server schema |

## recording

| Doc | Owns |
| --- | --- |
| `docs/capture-profile.md` | v1 source model and capture targets/fallbacks |
| `docs/recording-control-protocol.md` | recording start/stop, session snapshot, clock-sync protocol |
| `docs/recording-upload-protocol.md` | track start/upload/finish protocol and upload idempotency |
| `docs/artifact-manifest.md` | on-disk artifact layout, manifest JSON, status values, file naming |

## editing rule

Before expanding a doc, check whether the information already belongs to another doc above.

If it does, add a link. Do not fork the contract.
