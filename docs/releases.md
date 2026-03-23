# release and update contract

Related docs:

- `docs/architecture.md`
- `docs/operator-cli.md`
- `docs/session-server-bootstrap.md`
- `docs/database-schema.md`
- `docs/repo-layout.md`
- `docs/version-pins.md`

## recommendation

Use the GitHub repository as the only public release surface for v1.
No separate website is required.

Use one repo release version, one public update channel, one machine-readable release feed, and explicit operator-triggered updates.

For v1:

- use SemVer for the product release version
- publish one public channel: `stable`
- keep the machine-readable release feed in the repo
- keep human release notes and binary assets on GitHub Releases
- upgrade the operator CLI separately from the deployed app: `brew upgrade vgpr`
- apply persistent deployment updates explicitly with `vgpr update`
- never mutate a running temporary session server in place
- keep production migrations `up`-only in normal operation, but keep `down` paths for disposable local and mock development databases

## version model

- machine version string: `0.4.2`
- git tag: `v0.4.2`
- GitHub release title: `v0.4.2`
- the same release version identifies:
  - the `vgpr` CLI build
  - the persistent host bundle for `controlplane` + `sessionrunner`
  - the temporary session-server bundle for `sessiond` + `livekit-server`
- manifest `schema_version` is independent from app `version`

Use one channel only for v1:

- `stable`

Do **not** add `beta`, `nightly`, or auto-update rings until we have a real reason.

## published release surfaces

Every shipped release publishes 3 things:

1. human release notes on GitHub Releases
2. a tiny stable feed committed in the repo at `releases/stable.json`
3. an immutable versioned manifest committed in the repo at `releases/manifests/<version>.json`

Fetch contract:

- `stable.json` is fetched from the default branch raw URL, for example `https://raw.githubusercontent.com/default-anton/very-good-podcast-recorder/main/releases/stable.json`
- each versioned manifest is fetched from the matching git tag raw URL, for example `https://raw.githubusercontent.com/default-anton/very-good-podcast-recorder/v0.4.2/releases/manifests/0.4.2.json`

Rules:

- the CLI uses the feed and versioned manifest as the machine contract
- do **not** scrape Homebrew metadata or the GitHub Releases API as the primary update contract
- the GitHub repo is the only public machine-readable surface for v1
- the stable feed is mutable and always points to the latest stable release
- each versioned manifest is immutable once published because it is fetched through the exact git tag
- all downloadable assets in the versioned manifest include exact SHA-256 checksums
- the CLI has one built-in release-feed base URL; local development and CI may override it via `VGPR_RELEASE_BASE_URL` or user config

## stable feed

`stable.json` is the discovery surface used by `vgpr status` and `vgpr update --dry-run`.

Example:

```json
{
  "schema_version": 1,
  "channel": "stable",
  "version": "0.4.2",
  "published_at": "2026-03-22T20:15:00Z",
  "manifest_url": "https://raw.githubusercontent.com/default-anton/very-good-podcast-recorder/v0.4.2/releases/manifests/0.4.2.json",
  "notes_url": "https://github.com/default-anton/very-good-podcast-recorder/releases/tag/v0.4.2"
}
```

Field contract:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | feed schema version; starts at `1` |
| `channel` | string | release channel; `stable` only for v1 |
| `version` | string | latest stable app version |
| `published_at` | RFC3339 string | when that release became current |
| `manifest_url` | string | absolute HTTPS URL for the immutable versioned manifest |
| `notes_url` | string | human-facing release notes |

## versioned manifest

`<version>.json` is the source of truth for one exact release.

Example:

```json
{
  "schema_version": 1,
  "version": "0.4.2",
  "git_tag": "v0.4.2",
  "channel": "stable",
  "published_at": "2026-03-22T20:15:00Z",
  "notes_url": "https://github.com/default-anton/very-good-podcast-recorder/releases/tag/v0.4.2",
  "assets": {
    "cli": {
      "darwin_arm64": {
        "url": "https://github.com/default-anton/very-good-podcast-recorder/releases/download/v0.4.2/vgpr_0.4.2_darwin_arm64.tar.gz",
        "sha256": "...",
        "size_bytes": 12345678
      },
      "darwin_amd64": {
        "url": "https://github.com/default-anton/very-good-podcast-recorder/releases/download/v0.4.2/vgpr_0.4.2_darwin_amd64.tar.gz",
        "sha256": "...",
        "size_bytes": 12345678
      }
    },
    "persistent_bundle": {
      "linux_amd64": {
        "url": "https://github.com/default-anton/very-good-podcast-recorder/releases/download/v0.4.2/vgpr-host_0.4.2_linux_amd64.tar.gz",
        "sha256": "...",
        "size_bytes": 23456789
      }
    },
    "session_server_bundle": {
      "linux_amd64": {
        "url": "https://github.com/default-anton/very-good-podcast-recorder/releases/download/v0.4.2/vgpr-session-server_0.4.2_linux_amd64.tar.gz",
        "sha256": "...",
        "size_bytes": 34567890
      }
    },
    "checksums": {
      "url": "https://github.com/default-anton/very-good-podcast-recorder/releases/download/v0.4.2/SHA256SUMS",
      "sha256": "...",
      "size_bytes": 456
    }
  }
}
```

Field contract:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | manifest schema version; starts at `1` |
| `version` | string | exact app version |
| `git_tag` | string | exact git tag |
| `channel` | string | release channel |
| `published_at` | RFC3339 string | release publication time |
| `notes_url` | string | human release notes URL |
| `assets` | object | downloadable release assets and checksums |

Asset naming contract:

- CLI: `vgpr_<version>_darwin_arm64.tar.gz`, `vgpr_<version>_darwin_amd64.tar.gz`
- persistent deployment bundle: `vgpr-host_<version>_linux_amd64.tar.gz`
- temporary session-server bundle: `vgpr-session-server_<version>_linux_amd64.tar.gz`
- checksums file: `SHA256SUMS`

## bundle contents

### persistent deployment bundle

The persistent bundle contains the exact runtime needed by `vgpr update`:

- `controlplane` binary
- `sessionrunner` binary
- default config templates
- systemd unit templates
- build metadata and checksums

Install layout on the persistent host:

- `/opt/vgpr/host/releases/<version>/...`
- `/opt/vgpr/host/current -> /opt/vgpr/host/releases/<version>`
- persistent mutable state stays outside the versioned directory

### temporary session-server bundle

The session-server bundle is the artifact described by `docs/session-server-bootstrap.md`.

It contains:

- `sessiond`
- `livekit-server`
- default config templates
- systemd unit templates
- build metadata and checksums

Install layout on the temporary server is owned by `docs/session-server-bootstrap.md`.

## CLI discovery and update contract

- `vgpr status` fetches `stable.json` and reports the deployed version and latest stable version
- `vgpr update --dry-run` fetches the target versioned manifest and prints the exact planned update
- when a newer stable release exists, human output should end with: `brew upgrade vgpr && vgpr update`
- if release discovery fails, `vgpr status` still returns deployment health and prints the release-check warning on stderr

Do **not** auto-apply updates from the browser UI or from the CLI on startup.

## persistent deployment update contract

`vgpr update` updates only the persistent deployment.

Hard rules:

- refuse the update if any session is `active` or still draining uploads
- take a fresh control-plane backup before any schema migration
- verify the target bundle checksum from the versioned manifest before install
- install the new persistent bundle under a new versioned directory, then switch `current`
- run control-plane migrations after the new bundle is installed but before the update is declared healthy
- run the same required health checks as `vgpr doctor` before reporting success
- after success, set the new temporary session-server bundle version as the default for future hosted runs
- do **not** touch already-running temporary session servers; they finish on the version they started with

Failure policy:

- if the new bundle fails before a schema migration commits, switch back to the previous persistent bundle
- if a control-plane schema migration commits and the new release must be backed out, restore from the backup taken at the start of the update
- do **not** rely on production `down` migrations for rollback

## migration contract

Use `pressly/goose` with SQL files that contain both `Up` and `Down` sections.

Rules:

- keep control-plane migrations in `db/migrations/controlplane/`
- keep session-server migrations in `db/migrations/sessiond/`
- use numbered filenames such as `00001_init.sql`
- each reversible schema migration should include both `-- +goose Up` and `-- +goose Down`
- production bootstrap and `vgpr update` run `up` only
- local and mock development may run `down` against disposable databases during schema iteration
- if a migration is intentionally irreversible, mark that clearly in the file and prefer resetting or restoring the dev database instead of pretending rollback is safe
- session-server migrations run only during fresh bootstrap before readiness; do **not** in-place migrate an already-running temporary session server in v1

## repo paths for release metadata

Keep the machine-readable release metadata in-repo:

```text
releases/
├── stable.json
└── manifests/
    ├── 0.4.1.json
    └── 0.4.2.json
```

Rules:

- `releases/stable.json` lives on the default branch and is updated each time a new stable release ships
- `releases/manifests/<version>.json` is committed before tagging that exact release and then fetched through the matching tag URL
- this repo layout is enough; no standalone website, docs site, or update server is required

## release process summary

1. commit `releases/manifests/<version>.json`
2. tag `vX.Y.Z`
3. build CLI archives and both Linux bundles
4. generate `SHA256SUMS`
5. publish GitHub release notes and upload release assets
6. update `releases/stable.json` on the default branch to point to that version
7. operators upgrade with `brew upgrade vgpr && vgpr update`
