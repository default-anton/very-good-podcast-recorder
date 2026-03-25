# v1 operator CLI

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

Use one laptop-installed CLI, `vgpr`, as the operator surface for install, bootstrap, and day-2 operations.

Do **not** ship a separate bootstrap script as the main workflow.

For v1:

- install the CLI on macOS with Homebrew: `brew install default-anton/tap/vgpr`
- use the CLI for local setup, mock-provider setup, and later DigitalOcean setup
- bootstrap one persistent deployment that includes the public control plane and a private session-runner
- let the browser handle the product UI and recording readiness test
- keep normal operations API-first; use SSH only for bootstrap and recovery

## one-line purpose

`vgpr` provisions and operates a very-good-podcast-recorder deployment from the operator's laptop.

## examples

```bash
brew install default-anton/tap/vgpr
brew upgrade vgpr

vgpr setup local
vgpr setup local --profile edge
vgpr setup mock --name demo
vgpr setup do --name prod --domain app.example.com --dns-provider cloudflare

vgpr open
vgpr status
vgpr doctor
vgpr update --dry-run
vgpr update
vgpr logs --component controlplane --follow
vgpr backup create
vgpr restore backup_2026-03-20T18-42-11Z
vgpr destroy --confirm-name prod
```

## usage [done]

```text
vgpr [global flags] <command> [args]

Commands:
  setup <local|mock|do>   Create or bootstrap a deployment
  open                    Open the current deployment in the browser
  status                  Show a compact deployment summary
  doctor                  Run readiness and health checks
  update                  Apply an app update to the current deployment
  logs                    Show deployment logs
  backup create           Create a backup
  backup list             List known backups
  restore <backup-id>     Restore a backup
  destroy                 Tear down a deployment
  help <command>          Show command help
```

Bootstrap slice note: the top-level command tree, `--help`, `help <command>`, `--version`, and global flag parsing are wired. Subcommands still return explicit stub errors until the local and remote deployment flows land.

## command status

| Command | Purpose | v1 implementation order |
| --- | --- | --- |
| `setup local` | Run the full stack locally for trial/dev | first |
| `setup mock` | Exercise remote provisioning flow against a mock provider | first |
| `setup do` | Provision the real remote deployment on DigitalOcean compute | after mock |
| `open` | Open the control plane login page | first |
| `status` | Read current deployment health via the control-plane API | first |
| `doctor` | Run deeper checks: API, DNS, TLS, TURN, storage, session-runner health | first |
| `update` | Trigger a remote app update | after mock |
| `logs` | Read or follow logs by component | after mock |
| `backup create` / `backup list` | Create and inspect backups | after mock |
| `restore` | Restore a named backup | later v1 |
| `destroy` | Tear down local or remote deployment | after mock |

## global flags [done]

| Flag | Meaning |
| --- | --- |
| `-h`, `--help` | Show help and ignore other args |
| `--version` | Print CLI version to stdout |
| `--deployment <name>` | Use a named deployment profile instead of the active one |
| `--json` | Emit stable JSON on stdout |
| `--plain` | Emit stable line-oriented text on stdout |
| `-q`, `--quiet` | Suppress non-essential success output |
| `-v`, `--verbose` | More progress detail on stderr |
| `-f`, `--force` | Skip confirmations where the command allows it |
| `--no-color` | Disable color |
| `--no-input` | Never prompt; fail if required input is missing |

Rules:

- progress and diagnostics go to stderr
- primary command output goes to stdout
- `--json` and `--plain` never mix decorative output into stdout
- commands that would auto-open the browser do **not** auto-open when `--json`, `--plain`, or `--no-input` is set unless `--open` is passed explicitly

## setup commands

### `vgpr setup local`

Purpose: fastest path to a working local stack.

Behavior:

- boots the local control plane, private session-runner, and supporting services with the repo's local stack package
- uses the local stack contract from `docs/local-stack.md`
- creates or updates a local deployment profile named `local` unless `--name` is set
- creates the initial admin account during setup
- creates an operator API token for later CLI commands
- prints the login URL and, by default, opens it in the browser

Key flags:

| Flag | Meaning |
| --- | --- |
| `--name <name>` | Deployment profile name; default `local` |
| `--profile <core|edge>` | Local stack profile; `core` for normal dev, `edge` to add Caddy + coturn; default `core` |
| `--admin-email <email>` | Initial admin email |
| `--admin-username <name>` | Initial admin username |
| `--admin-password-file <path>` | Read initial admin password from file |
| `--admin-password-stdin` | Read initial admin password from stdin |
| `--open` / `--no-open` | Force or suppress browser open |
| `-n`, `--dry-run` | Show what would be created without changing anything |

### `vgpr setup mock`

Purpose: prove the remote-shape install and ops flow without talking to a real cloud provider.

Behavior:

- uses the same operator flow and state model as the future real provider path
- talks to mock compute and mock DNS backends
- keeps the command contract stable while the real provider implementation lands
- is intended for development, CI, and provisioning-harness work; not for production

Key flags: same as `setup local`, plus:

| Flag | Meaning |
| --- | --- |
| `--region <region>` | Mock region name |
| `--size <preset>` | Mock machine preset |
| `--dns-provider <mock>` | Explicit for clarity; only `mock` is valid here |

### `vgpr setup do`

Purpose: provision the real hosted deployment.

Behavior:

- provisions DigitalOcean compute
- configures DNS with either Cloudflare DNS or DigitalOcean DNS
- bootstraps the persistent deployment, including the public control plane and private session-runner
- records the default stock-image + cloud-init session-server bootstrap settings used for temporary recording servers
- creates the initial admin account during setup
- creates an operator API token for later CLI commands
- waits for readiness, then prints and optionally opens the login URL

Key flags:

| Flag | Meaning |
| --- | --- |
| `--name <name>` | Local deployment profile name; required when more than one deployment exists |
| `--domain <fqdn>` | Public control-plane hostname, for example `app.example.com` |
| `--dns-provider <cloudflare|digitalocean>` | Required |
| `--dns-zone <zone>` | DNS zone to manage, for example `example.com` |
| `--region <region>` | DigitalOcean region slug |
| `--size <preset>` | VM size preset |
| `--turn-mode <cohosted|dedicated>` | TURN placement |
| `--admin-email <email>` | Initial admin email |
| `--admin-username <name>` | Initial admin username |
| `--admin-password-file <path>` | Read initial admin password from file |
| `--admin-password-stdin` | Read initial admin password from stdin |
| `--do-token-file <path>` | Read DigitalOcean API token from file |
| `--cloudflare-token-file <path>` | Read Cloudflare API token from file |
| `--open` / `--no-open` | Force or suppress browser open |
| `-n`, `--dry-run` | Show the planned resources and checks without creating them |

## bootstrap security rules

Do **not** expose a public first-user-wins setup page on a deployed system.

Rules:

- the initial admin account is created during `vgpr setup ...`, not in the browser
- the server exposes bootstrap APIs only behind a single-use bootstrap credential
- the CLI gets that bootstrap credential through the bootstrap channel only; it is not part of the human login flow
- after successful bootstrap, public setup routes are disabled permanently for that deployment
- the browser's first page after setup is the login page
- the CLI stores the operator API token separately from the admin password
- passwords are prompted interactively with hidden input unless `--admin-password-file` or `--admin-password-stdin` is used
- do **not** accept passwords directly on command-line flags

## operator model

Use API-first operations after setup.

Normal commands like `status`, `doctor`, `update`, `backup`, and `logs` should talk to the control-plane HTTPS API with the stored operator token.

The control plane coordinates the private session-runner. It should not hold the cloud or edge credentials used for per-session runtime lifecycle.

Use SSH only for:

- first bootstrap
- recovery when the control-plane API is unavailable
- deep debugging

If a routine day-2 command needs SSH, the product surface is wrong.

## day-2 command semantics

### `vgpr open`

- opens the control-plane login page or app home for the selected deployment
- read-only
- fails with exit code `3` if no deployment is selected

### `vgpr status`

- fetches a compact state summary: deployed version, latest available version, reachable URL, service health, disk free space, recent backup status, active sessions
- read-only
- exit code is `0` if the request succeeded, even if the deployment is degraded; health is reported in the payload
- if update discovery fails, still return the deployment summary and print the release-check warning on stderr

### release discovery

Use the release feed and versioned manifest from `docs/releases.md`.

Rules:

- `vgpr status` and `vgpr update --dry-run` fetch the `stable` release feed and report `current_version`, `latest_version`, and `update_available`
- when a newer release exists, human output should end with the exact next step: `brew upgrade vgpr && vgpr update`
- the browser may surface the same signal later, but the CLI is the source of truth for v1

### `vgpr doctor`

- runs the required operator checks: API auth, DNS, TLS, TURN, storage, worker/session-runner health, and bootstrap completeness
- read-only
- exits `0` when all required checks pass, `5` when any required check fails
- should support `--check <name>` later for focused diagnosis without changing the core contract

### `vgpr update`

- triggers a remote update through the control-plane API
- state-changing
- must be idempotent for the same target version
- should support `--dry-run` and a later `--version <version>` override
- must refuse to run while any session is `active` or still draining uploads
- follows the persistent update contract from `docs/releases.md`
- updates only the persistent deployment; already-running temporary session servers finish on the bundle version they started with
- if post-update checks fail after a schema migration committed, recovery is restore-from-backup, not down-migrations

### `vgpr logs`

- streams or fetches logs for the selected deployment
- read-only
- key flags: `--component <name>`, `--since <duration|timestamp>`, `--follow`

### `vgpr backup create` and `vgpr backup list`

- `backup create` creates a new backup and returns its backup id
- `backup list` lists known backups with created time, size, and status
- `backup create` is state-changing; `backup list` is read-only

### `vgpr restore <backup-id>`

- restores a named backup onto the selected deployment
- destructive and state-changing
- requires confirmation in TTY mode or `--force --confirm-name <deployment>` in non-interactive mode

### `vgpr destroy`

- tears down the selected deployment
- destructive and state-changing
- requires confirmation in TTY mode or `--force --confirm-name <deployment>` in non-interactive mode

## output contract

### stdout

- final command result
- stable JSON when `--json` is set
- stable line-based text when `--plain` is set

### stderr

- progress messages
- warnings
- validation errors
- recovery hints

### human output rules

- keep success output short
- after a state-changing command, print what changed and what to do next
- `setup ...` should end with the deployment name, login URL, and the next recommended command: `vgpr doctor`

## exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | generic runtime failure |
| `2` | invalid usage or argument validation failure |
| `3` | deployment not found or no active deployment selected |
| `4` | auth/credential failure |
| `5` | preflight or readiness check failed |
| `6` | remote operation timed out or ended in an unknown retryable state |

## config, state, and secrets

Precedence: flags > env > user config > built-in defaults.

### user config

- path: `~/.config/vgpr/config.toml`
- stores non-secret defaults only, for example preferred region, default DNS provider, output mode, and an override release feed base URL for development or CI

### deployment state

- path: `~/.local/state/vgpr/deployments/<name>.json`
- stores the active deployment name, base URL, provider metadata, and non-secret local context

### secrets

For the macOS-first v1 path:

- store provider API tokens, bootstrap tokens, and operator API tokens in the macOS Keychain
- do **not** store the admin password after setup completes
- do **not** store secrets in `config.toml`
- do **not** require secret env vars in the default flow

Environment variables may override non-secret defaults only:

- `VGPR_DEPLOYMENT`
- `VGPR_CONFIG`
- `VGPR_NO_BROWSER=1`
- `VGPR_OUTPUT=json|plain|human`
- `VGPR_RELEASE_BASE_URL=https://...` for local release-feed testing or CI

## safety rules

- `setup ... --dry-run` must show the resource plan and validation plan without changing anything
- destructive commands require confirmation in TTY mode
- non-interactive destructive commands require `--force` and `--confirm-name <deployment>`
- rerunning `setup local`, `setup mock`, or `setup do` for the same deployment name must be idempotent when possible
- when the final state is unknown, return exit code `6` and print the exact follow-up command to inspect or resume

## provider model

Separate compute from DNS.

### compute targets

- `local`
- `mock`
- `digitalocean`

### DNS providers

- `cloudflare`
- `digitalocean`
- `mock` for `setup mock` only

Keep the CLI surface stable while providers expand.

That means:

- `setup do` stays the DigitalOcean compute path
- DNS choice is a flag, not a different top-level command
- adding later compute providers should add new `setup <provider>` subcommands without changing day-2 ops commands

## browser role

The browser is still required after setup, but only for product work:

- sign in with the admin account created by the CLI
- run the device and recording readiness test
- operate sessions and recordings

The browser should not be responsible for creating the first admin account on a public deployment.

## implementation order

1. `setup local`
2. `setup mock`
3. `open`, `status`, `doctor`, `destroy` against local/mock deployments
4. `setup do` with DigitalOcean compute
5. `setup do --dns-provider cloudflare|digitalocean`
6. `update`, `logs`, `backup create`, `backup list`
7. `restore`
