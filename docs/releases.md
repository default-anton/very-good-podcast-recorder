# release and update contract

Related docs:

- `docs/architecture.md`
- `docs/operator-cli.md`
- `docs/session-server-bootstrap.md`
- `docs/database-schema.md`
- `docs/repo-layout.md`
- `docs/version-pins.md`

## recommendation

Use the GitHub repository as the only public release surface for alpha.

Alpha is a **hosted product**, so release and update work is a maintainer workflow, not a user-facing feature.

Rules:

- use SemVer for product releases
- publish human release notes on GitHub Releases
- publish immutable versioned manifests in the repo
- deploy control-plane updates manually through maintainer workflows
- never mutate a running disposable session server in place
- keep production migrations `up`-only in normal operation

## version model

- machine version string: `0.4.2`
- git tag: `v0.4.2`
- GitHub release title: `v0.4.2`
- the same release version identifies:
  - the control-plane code and migrations
  - the default disposable session-server bundle for new sessions
- manifest `schema_version` is independent from app `version`

Do **not** design alpha around channels, rings, or auto-update UX.

## published release surfaces

Every shipped release publishes:

1. human release notes on GitHub Releases
2. an immutable versioned manifest committed in the repo at `releases/manifests/<version>.json`
3. the disposable session-server bundle referenced by that manifest

Optional later work:

- a mutable feed like `releases/stable.json`
- a public operator CLI update flow

Those are explicitly deferred.

## versioned manifest

`<version>.json` is the source of truth for one exact release.

Example:

```json
{
  "schema_version": 1,
  "version": "0.4.2",
  "git_tag": "v0.4.2",
  "published_at": "2026-03-22T20:15:00Z",
  "notes_url": "https://github.com/default-anton/very-good-podcast-recorder/releases/tag/v0.4.2",
  "assets": {
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
| `published_at` | RFC3339 string | release publication time |
| `notes_url` | string | human release notes URL |
| `assets` | object | downloadable release assets and checksums |

## asset naming contract

For alpha, the only required downloadable runtime asset is:

- disposable session-server bundle: `vgpr-session-server_<version>_linux_amd64.tar.gz`
- checksums file: `SHA256SUMS`

The control plane is deployed from the tagged source tree and its normal build artifact path. Do **not** block alpha on inventing a second public packaging surface just for symmetry.

## session-server bundle contents

The session-server bundle is the artifact described by `docs/session-server-bootstrap.md`.

It contains:

- `caddy`
- `sessiond`
- `livekit-server`
- `coturn`
- default config templates
- systemd unit templates
- build metadata and checksums

Install layout on the disposable server is owned by `docs/session-server-bootstrap.md`.

## hosted update contract

Hosted updates are maintainer-run.

Hard rules:

- refuse a control-plane update while any session is `active` or still draining uploads
- take a fresh control-plane backup before any schema migration
- verify the target session-server bundle checksum from the versioned manifest before making it the default for new sessions
- run control-plane migrations before the update is declared healthy
- do **not** touch already-running disposable session servers; they finish on the version they started with

Failure policy:

- if the new control-plane release fails before a schema migration commits, roll back the control-plane deploy
- if a control-plane schema migration commits and the release must be backed out, restore from backup
- do **not** rely on production `down` migrations for rollback

## migration contract

Use `pressly/goose` with SQL files that contain both `Up` and `Down` sections.

Rules:

- keep control-plane migrations in `db/migrations/controlplane/`
- keep session-server migrations in `db/migrations/sessiond/`
- use numbered filenames such as `00001_init.sql`
- each reversible schema migration should include both `-- +goose Up` and `-- +goose Down`
- hosted deploys and updates run `up` only
- local development may run `down` against disposable databases during schema iteration
- if a migration is intentionally irreversible, mark that clearly in the file and prefer resetting or restoring the dev database instead of pretending rollback is safe
- session-server migrations run only during fresh bootstrap before readiness; do **not** in-place migrate an already-running temporary session server in v1

## repo paths for release metadata

Keep the machine-readable release metadata in-repo:

```text
releases/
└── manifests/
    ├── 0.4.1.json
    └── 0.4.2.json
```

Rules:

- `releases/manifests/<version>.json` is committed before tagging that exact release
- that manifest is then fetched through the matching tag URL
- this repo layout is enough; no standalone website, docs site, or update server is required for alpha
