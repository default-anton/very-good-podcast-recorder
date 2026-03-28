# recommended repo layout

## recommendation

Keep one repo with the product specs plus the engineering harness that proves the repo can still format, lint, typecheck, and test cleanly.

Do **not** respawn service binaries, browser apps, deploy assets, or database migrations until a new implementation slice is approved.

```text
.
├── docs/                # product and engineering specs
├── e2e/
│   ├── fixtures/        # deterministic inputs reserved for future multi-participant harness work
│   └── scenarios/       # future Playwright scenarios; may stay empty between implementation waves
├── internal/
│   └── harness/         # Go repo guardrails that keep go vet/go test live
├── releases/
│   ├── stable.json      # mutable latest-release feed
│   └── manifests/       # immutable per-version release manifests
├── scripts/             # stable quality-loop and audit entrypoints
├── web/
│   ├── control/         # Vite + tsgo config only; no app source during the pivot
│   ├── session/         # Vite + tsgo config only; no app source during the pivot
│   └── tests/           # Vitest guardrails for tooling and repo shape
├── AGENTS.md
├── go.mod
├── mise.toml
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.base.json
└── vitest.config.ts
```

## rules

- `internal/` is for harness-local Go code only until product implementation returns.
- `web/control/` and `web/session/` own frontend tooling config only. Application source under `src/` stays absent during the pivot.
- `web/tests/` is for fast tooling and repo-contract checks. The reality-like multi-participant harness still belongs in `e2e/` when it exists again.
- `scripts/` is the public interface for humans, CI, and agents. Prefer a few stable commands over ad hoc tool invocations.
- `docs/` stays the source of truth for product contracts. Keep implementation notes out of random markdown.
- `releases/` is still the only home for machine-readable release metadata.
- If a new implementation slice lands, reintroduce only the minimum directories that slice needs and update this doc in the same change.

## avoid for now

Skip these until an approved implementation slice forces them:

- resurrecting `cmd/`, `db/`, or `deploy/` by default
- `pkg/` public Go libraries
- `packages/` or a JS workspace split
- a separate repo for CLI, deploy assets, or harness code
- Terraform or multi-cloud provisioning code
- server-side media post-processing pipelines
