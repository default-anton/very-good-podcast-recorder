# local runtime contract

`deploy/local/topology.json` is the committed source of truth for repo-local hostnames and ports.

If you touch local runtime ports, origins, hostnames, or loopback assumptions, update `deploy/local/topology.json` first and then adjust code/tests to import that contract.

Current scope:
- loopback host defaults for the core local runtime
- control/session app ports
- control-plane, sessiond, and LiveKit local ports
- reserved edge-only ports for later Caddy and coturn work

Rules:
- do not put secrets here
- do not add hosted bootstrap assets here
- keep hosted bootstrap work in `deploy/session-server/` when that slice is real
