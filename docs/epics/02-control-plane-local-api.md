# epic 02 — control-plane local API in `web/control`

## Recommended PR slices

split into 2–3 PRs:
- local API/router/bootstrap contract
- session + seat CRUD wiring
- guest/bootstrap fetch integration

Related docs:

- `docs/alpha-scope.md`
- `docs/architecture.md`
- `docs/frontend-design.md`
- `docs/identity.md`
- `docs/repo-layout.md`

## goal

Turn `web/control/` into the real control-plane root for milestone 1: host UI + local API in one deployable/unit.

## scope

Add the minimum local control-plane implementation needed for milestone 1:

```text
web/control/
├── wrangler.jsonc
└── src/
    ├── worker.ts
    ├── api/
    │   ├── router.ts
    │   ├── sessions.ts
    │   ├── seats.ts
    │   ├── join-links.ts
    │   └── bootstrap.ts
    └── app/
        └── lib/
            ├── api.ts
            ├── query.ts
            └── state.ts
```

Implement only what milestone 1 needs:

- create/edit session
- create/edit seats
- generate stable host/guest links
- return bootstrap data used by `web/session`
- use TanStack Query for control-plane fetch/cache work instead of ad hoc request state sprawl

## non-goals

- hosted Cloudflare deployment polish
- D1 production migration system unless it materially improves the local loop
- auth beyond the alpha host-flow minimum
- provider-specific provisioning work

## acceptance criteria

- `web/control/` owns both host UI and local API wiring
- host UI can create a session and seat roster
- stable host/guest links can be generated locally
- `web/session/` can fetch bootstrap data from `web/control/`
- no separate top-level control-plane backend tree is introduced

## feedback loop

Start with the fastest proof:

- focused typecheck/lint on `web/control/`
- one narrow integration test for session + seat creation and bootstrap response

Example checks:

```bash
mise exec -- pnpm exec tsgo --noEmit -p web/control/tsconfig.json
mise exec -- pnpm exec vitest run web/tests/<focused-control-test>.spec.ts
mise exec -- pnpm exec oxlint web/control/src
mise exec -- pnpm exec oxfmt --check web/control/src
```

## notes

Do **not** split control-plane UI and API into separate top-level roots unless deployment pain proves we need it later.

Frontend work in `web/control/` should follow `docs/frontend-design.md`: Tailwind CSS, Radix primitives where they buy accessibility, and thin in-repo wrappers instead of a stock component library.