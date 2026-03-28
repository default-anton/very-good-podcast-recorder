# deferred operator CLI

Related docs:

- `docs/alpha-scope.md`
- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/releases.md`

## recommendation

Keep the public operator CLI out of alpha.

The alpha product surface is the hosted browser app. Deployment, updates, logs, and recovery stay as maintainer workflows behind the scenes.

## alpha rule

For alpha:

- do **not** require a user-installed `vgpr` CLI
- do **not** block product work on CLI design or packaging
- do use internal scripts/manual workflows for deploy, update, logs, and recovery
- do keep normal host operation in the browser

## maintainer-only work that still exists

Alpha still needs these capabilities:

- deploy the Cloudflare control plane
- provision and destroy disposable DigitalOcean session servers
- publish and remove per-session DNS when that topology is in use
- inspect logs and artifacts
- rotate secrets and provider credentials
- update the hosted control plane
- choose the default session-server bundle version for new sessions

These are real tasks. They are just not a public product interface yet.

## explicitly deferred

Defer all of this until after the recording path is trustworthy:

- setup/bootstrap CLI UX
- public update/status/doctor flows
- backup/restore/destroy command surface
- Homebrew packaging
- Keychain-backed token storage
- provider abstraction in the CLI surface
- a local/self-host operator story

## if the CLI returns later

Start smaller than the old plan:

- hosted-first
- one provider shape first: Cloudflare + DigitalOcean
- browser remains the normal session-operation surface
- maintainer ops only at first

A future CLI should begin as a thin maintainer tool, not as a second product.
