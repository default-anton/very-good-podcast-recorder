# docs map

These docs are meant to be **single-owner specs**.

Rules:

- `README.md` is high-level and may repeat product basics.
- Inside `docs/`, each topic should have one source of truth.
- Other docs should link to that source instead of restating it.
- Track implementation status in the owning spec. See `docs/implementation-status.md`.

## docs process

| Doc | Owns |
| --- | --- |
| `docs/implementation-status.md` | temporary convention for marking which spec docs and sections are implemented |

The repo normally keeps source-of-truth specs outside `docs/issues/`.
User-requested execution plans or issue drafts may live there temporarily, but they do **not** replace the owning specs.

## product shape

| Doc | Owns | Impl |
| --- | --- | --- |
| `docs/alpha-scope.md` | exact hosted-alpha cut line, deferred surfaces, end-to-end flow, and 3 implementation milestones | |
| `docs/architecture.md` | hosted-alpha system shape, component boundaries, stack choices | |
| `docs/ux-contract.md` | v1 host/guest UX surface, responsive behavior, required screens, status model, failure language | |
| `docs/repo-layout.md` | current repo shape and where new alpha implementation should land | |
| `docs/local-stack.md` | internal dev harness and local runtime contract; not a user-facing deployment story | |
| `docs/version-pins.md` | host toolchain and target third-party runtime component version pins | |
| `docs/feedback-loop.md` | local quality loop, hooks, CI, logging baseline | |
| `docs/testing.md` | alpha harness shape and must-pass scenarios | |

## deployment and ops

| Doc | Owns | Impl |
| --- | --- | --- |
| `docs/public-networking.md` | public hostnames, Cloudflare DNS, direct session hostnames, session-scoped TURN, DNS publication | |
| `docs/session-server-bootstrap.md` | disposable session-server bootstrap chain, bundle layout, readiness contract | |
| `docs/operator-cli.md` | deferred operator CLI boundary for alpha | |
| `docs/releases.md` | alpha release/version rules and manual hosted update notes | |

## session auth and state

| Doc | Owns | Impl |
| --- | --- | --- |
| `docs/identity.md` | join-link model, durable seat identity, role model, LiveKit identity mapping | |
| `docs/seat-claim-protocol.md` | seat-claim state machine, liveness, claim endpoints, takeover/reclaim wire contract | |
| `docs/session-lifecycle.md` | session/server/recording/track lifecycle states and escalation rules | |
| `docs/database-schema.md` | control-plane and session-server schema | |

## recording

| Doc | Owns | Impl |
| --- | --- | --- |
| `docs/capture-profile.md` | v1 source model and capture targets/fallbacks | |
| `docs/recording-control-protocol.md` | recording start/stop, session snapshot, clock-sync protocol | |
| `docs/recording-upload-protocol.md` | track start/upload/finish protocol and upload idempotency | |
| `docs/artifact-manifest.md` | on-disk artifact layout, manifest JSON, status values, file naming | |

## editing rule

Before expanding a doc, check whether the information already belongs to another doc above.

If it does, add a link. Do not fork the contract.

When implementation lands, update the relevant status markers last. See `docs/implementation-status.md`.
