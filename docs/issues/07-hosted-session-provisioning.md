# issue 07 — hosted session provisioning

Related docs:

- `docs/alpha-scope.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`
- `docs/releases.md`
- `docs/operator-cli.md`

## goal

Make milestone 2 real: the control plane can provision, replace, and tear down one disposable hosted session backend.

## scope

Add the minimum hosted bootstrap/provisioning slice needed for milestone 2:

```text
deploy/
└── session-server/
    ├── cloud-init/
    ├── systemd/
    ├── caddy/
    ├── livekit/
    ├── turn/
    └── README.md

releases/
└── manifests/
    └── <session-server-release-manifest>.json
```

And the matching control-plane provisioning code in `web/control/`.

Implement only what milestone 2 needs:

- record provisioning intent in the control plane
- create a DigitalOcean VM from the stock Ubuntu LTS image with cloud-init
- install one versioned session-server bundle with explicit checksum verification
- configure and start Caddy, LiveKit, `sessiond`, and `coturn`
- publish and remove `<session-id>.sessions.<domain>` in Cloudflare DNS
- poll the disposable server readiness JSON before marking it `ready`
- replace failed bootstrap before recording starts while keeping the stable human join link
- keep all operator workflows maintainer-only; no public CLI

## non-goals

- multi-provider abstraction
- public operator CLI
- custom VM images or Docker-first bootstrap
- in-place repair before recording starts
- broad day-2 ops UX

## acceptance criteria

- the control plane can drive one disposable backend from provisioning intent to `ready`
- readiness is based on machine-readable checks, not sleep loops
- the session hostname serves HTTPS and TURN comes from that same disposable server
- a pre-recording bootstrap failure destroys and replaces the VM, repoints DNS, and keeps the same human join link
- teardown removes the VM and DNS record cleanly
- the chosen session-server bundle version and checksum are explicit in config or manifest data

## feedback loop

Use text-first hosted provisioning proof, not manual clicking.
Start with focused tests around provisioning state transitions plus one maintainer smoke command that prints backend ID, IP, hostname, readiness JSON, and teardown result.

Example checks:

```bash
mise exec -- pnpm exec vitest run web/tests/<focused-provisioning-test>.spec.ts
mise exec -- ./scripts/hosted-provision-smoke
```

If this is flaky, improve readiness reporting and provisioning logs before touching more hosted product work.

## notes

This is milestone-2 infrastructure work.
Do **not** block it on CLI packaging or provider abstraction.
