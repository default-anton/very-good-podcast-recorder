# local runtime

This is the internal `core` local runtime for app work and harness work.

Use:

```bash
mise exec -- ./scripts/local-up
mise exec -- ./scripts/local-smoke
mise exec -- ./scripts/local-down
```

`./scripts/local-reset --force` deletes the disposable `.vgpr/local/` runtime state.

## config

Precedence is:

1. script flags
2. shell env
3. `.env.local`
4. committed defaults in `deploy/local/sessiond.env`

`deploy/local/topology.json` owns the loopback host and local ports.

`deploy/local/livekit.yaml` is the committed template. `./scripts/local-up` renders the resolved config into `.vgpr/local/config/livekit.yaml` and writes `.vgpr/local/config/compose.env` for Compose.

`./scripts/local-up` refuses to attach to unmanaged listeners already holding the local runtime ports. That keeps `local-down` honest: it only reuses services the repo started and can stop.

## inspectability

The local runtime keeps disposable files under `.vgpr/local/`:

- `artifacts/` — sessiond uploads and manifests
- `state/` — SQLite and runtime state
- `logs/` — control app, session app, sessiond, and captured LiveKit logs
- `e2e/local-smoke.json` — latest smoke summary

Failed runs are kept until you delete them with `local-reset`.
