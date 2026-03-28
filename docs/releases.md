# alpha release and update notes

Related docs:

- `docs/alpha-scope.md`
- `docs/session-server-bootstrap.md`
- `docs/database-schema.md`
- `docs/repo-layout.md`

## recommendation

Keep release and update policy small for alpha.

This is a maintainer workflow, not a public product surface.

## alpha rules

- use SemVer release versions, for example `0.4.2`
- tag releases as `v0.4.2`
- publish human release notes on GitHub Releases
- keep any machine-readable release metadata under `releases/`
- do **not** make a mutable `stable.json` feed part of the alpha repo contract
- treat control-plane deploys as maintainer-run work
- never mutate an already-running disposable session server in place

## session-server artifact naming

If the disposable session-server bundle is published as a release artifact, use:

- `vgpr-session-server_<version>_linux_amd64.tar.gz`
- `SHA256SUMS`

That bundle is the one described by `docs/session-server-bootstrap.md`.

## hosted update rules

For alpha:

- do not run a hosted update while any session is `active` or still draining uploads
- take a fresh control-plane backup before any control-plane schema migration
- verify the target session-server bundle checksum before making it the default for new sessions
- run control-plane migrations as part of the maintainer update workflow
- do **not** touch already-running disposable session servers; they finish on the version they started with

If an update goes bad after a control-plane schema migration committed, restore from backup. Do **not** rely on production down-migrations as the normal rollback path.

## deferred

These are explicitly deferred until later than alpha:

- public update UX
- operator-facing release discovery
- a mutable stable feed as part of the product contract
- a full manifest schema unless implementation needs it now
- automatic channel/ring management

## repo note

If release metadata is used, keep it under `releases/`, typically under `releases/manifests/`.

That path is reserved, but alpha does **not** require a broad public release system or a mutable feed.
