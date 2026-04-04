# recommended repo layout

Related docs:

- `docs/alpha-scope.md`
- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/testing.md`
- `docs/releases.md`

## recommendation

Keep the repo boring.

The current single-repo shape is a good fit for alpha **if** we lock the implementation landing zones now and avoid a later reshuffle.

That means:

- keep one repo
- keep `web/control/` as the Cloudflare control-plane root
- keep `web/session/` as the browser session app root
- keep `web/shared/` as the neutral home for cross-app contracts and local-runtime helpers
- let `e2e/` own reality-like harness work
- add Go runtime, migrations, and deploy assets in predictable top-level homes when the first real slice lands
- keep layout guidance in docs; do not enforce it with brittle repo-shape tests

Do **not** split repos. Do **not** invent a workspace architecture. Do **not** add placeholder trees just to feel organized.

## current repo shape

```text
.
├── deploy/
│   └── local/           # committed local runtime topology/assets
├── docs/                # product and engineering specs
├── e2e/
│   ├── fixtures/        # deterministic inputs for the local harness
│   └── scenarios/       # Playwright scenarios for reality-like end-to-end runs
├── internal/
│   └── harness/         # Go harness-side package when real behavior needs Go-level tests/helpers
├── releases/            # release metadata, if and when alpha uses it
├── scripts/             # stable quality-loop and helper entrypoints
├── web/
│   ├── control/         # control-plane package
│   ├── session/         # join/session package
│   ├── shared/          # neutral frontend contracts/runtime helpers shared across apps
│   └── tests/           # fast frontend tooling guardrails
├── AGENTS.md
├── go.mod
├── mise.toml
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.base.json
└── vitest.config.ts
```

That is fine for the harness-only state.

## near-term target shape

When implementation returns, grow into this shape:

```text
.
├── deploy/
│   ├── local/                   # local runtime topology and compose assets
│   └── session-server/          # cloud-init, systemd, Caddy, bootstrap assets
├── docs/
├── e2e/
│   ├── fixtures/
│   └── scenarios/
├── web/
│   ├── control/                 # Cloudflare control plane: host UI + API
│   ├── session/                 # join/session browser app
│   ├── shared/                  # neutral contracts/runtime helpers shared across web apps
│   └── tests/
├── cmd/
│   └── sessiond/                # Go session-server entrypoint
├── internal/
│   ├── harness/
│   └── sessiond/                # Go internals for claims, ingest, manifests, etc.
├── db/
│   └── migrations/
│       ├── controlplane/        # D1/control-plane migrations
│       └── sessiond/            # session-server SQLite migrations
├── releases/                    # machine-readable release metadata if used
├── scripts/
├── AGENTS.md
├── go.mod
├── mise.toml
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.base.json
└── vitest.config.ts
```

## landing rules

### `web/control/`

This is the control-plane deployable root.

It should eventually own:

- host UI
- control-plane API
- Cloudflare config
- any control-plane-local migration wiring or deploy config that naturally belongs with that app

Do **not** split the control-plane UI and API into separate top-level roots unless deployment pain proves we need it.

### `web/session/`

This is the browser join/session app root.

Keep it separate from `web/control/` so the host app and in-call app can evolve independently without turning one frontend into a kitchen sink.

### `web/shared/`

This is the neutral home for browser-facing code that is shared across `web/control/`, `web/session/`, and `web/tests/`.

Use it for:

- shared DTO and wire-contract types
- route/path builders and pure link helpers
- local runtime topology/config readers

Do **not** turn it into a dumping ground for generic UI helpers, app state, or product logic that still belongs to one app.

### `cmd/sessiond/` and `internal/sessiond/`

This is the boring Go shape for the disposable session server.

Use:

- `cmd/sessiond/` for the entrypoint
- `internal/sessiond/` for the actual runtime code

Do **not** add `pkg/` or a wide Go service tree before the first backend slice exists.

### `db/migrations/`

Keep migrations explicit and split by runtime:

- `db/migrations/controlplane/`
- `db/migrations/sessiond/`

That matches the architecture and schema docs and avoids hiding critical schema state in random app folders.

### `deploy/local/`

This is the home for the repo-local runtime contract and assets:

- committed topology/port source of truth
- Compose files and related local runtime config when that slice lands
- local-runtime docs that should stay internal-facing

This exists before `deploy/session-server/` on purpose because milestone 1 needs one real local runtime first.

### `deploy/session-server/`

This is the home for hosted bootstrap assets:

- cloud-init
- systemd units
- Caddy config
- related bootstrap templates/scripts

Keep this scoped to the disposable session-server topology. Do **not** grow a generic multi-provider infra tree for alpha.

### `e2e/`

Keep the reality-like harness here:

- `e2e/scenarios/` for session-critical flows
- `e2e/fixtures/` for deterministic fake-media inputs and helpers

Do not hide the real harness in ad hoc scripts.

## rules

- `docs/` stays the source of truth for product contracts
- `scripts/` should stay small and boring; prefer a few stable entrypoints over shell sprawl
- reintroduce new top-level directories only in the same change that gives them real purpose
- do **not** add empty placeholder trees just to reserve names; land them with code or real assets
- keep diffs reviewable; do not rebuild the old product tree speculatively

## avoid

Skip these until implementation forces them:

- a public CLI tree built ahead of need
- generic provider abstraction directories
- Terraform or multi-cloud layout by default
- separate repos for control plane, session server, or deploy assets
- server-side post-production pipelines
- JS workspace sprawl or premature package splitting
