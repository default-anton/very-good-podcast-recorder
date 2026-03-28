# alpha deployment boundary and deferred operator CLI

Related docs:

- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`
- `docs/testing.md`
- `docs/version-pins.md`
- `docs/session-lifecycle.md`
- `docs/database-schema.md`
- `docs/releases.md`

## recommendation

Cut the public operator CLI from v1 alpha.

The alpha product surface is:

- hosted control plane in the browser
- internal maintainer deployment/update workflows behind the scenes

It is **not**:

- a laptop-installed operator product
- a self-serve bootstrap tool
- a local/self-host setup experience

## current alpha rule

For alpha:

- do **not** require a user-installed `vgpr` CLI
- do **not** block product work on CLI design or packaging
- do use internal scripts/manual workflows for deployment, update, logs, and recovery
- do keep browser-based product operation as the main user surface

## what stays in scope

Operationally, alpha still needs these capabilities. They are just not exposed as a public CLI product yet.

- deploy the Cloudflare control plane
- publish and remove per-session Cloudflare DNS records as part of provisioning and teardown
- provision and destroy disposable DigitalOcean session servers
- inspect logs and artifacts
- rotate secrets and provider credentials
- update the hosted control plane between releases
- choose the default session-server bundle version for new sessions

These are maintainer workflows, not product UX.

## what is cut

Defer all of this until after the recording path is real:

- `vgpr setup local`
- `vgpr setup mock`
- `vgpr setup do`
- `vgpr open`
- `vgpr status`
- `vgpr doctor`
- `vgpr update`
- `vgpr logs`
- `vgpr backup`
- `vgpr restore`
- `vgpr destroy`
- Homebrew packaging
- Keychain-backed token storage
- provider abstraction in the CLI surface
- polished non-interactive destructive command semantics

## browser role

The browser remains required for product work:

- sign in as the host
- create sessions and seats
- share host/guest links
- run the device and recording readiness flow
- operate the live session and recording
- review post-recording status and downloads

The browser should not be responsible for cloud deployment or infrastructure bootstrap.

## if the CLI returns later

When a public CLI eventually returns, start smaller than the old plan.

Rules:

- hosted-first, not self-host-first
- one provider shape first: Cloudflare + DigitalOcean
- no mock-provider product surface
- no local operator story as the lead feature
- normal session operation stays in the browser
- day-2 ops can come later, after the recording path is trustworthy

A future CLI should begin as a thin maintainer tool, not as a second product.

## non-goals for alpha

- a complete operator UX
- release discovery in the CLI
- a public update workflow
- local/self-host bootstrap as a product promise
- broad provider pluggability
