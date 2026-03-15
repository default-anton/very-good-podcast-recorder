# Project Overview

very-good-podcast-recorder is an open-source remote podcast recorder: browser call, local per-participant tracks, temporary recording infrastructure, host-controlled files and workflow.

`README.md` is the current product and scope source of truth.

## Current state

- Repo is bootstrap-only right now. Keep the first implementation simple and easy to evolve.
- Add structure, tooling, and dependencies only when they directly help ship the next demoable slice.

## Top priorities / invariants

- Reliability, robustness, and stability first.
- Design for bad networks. Assume packet loss, reconnects, slow uploads, and intermittent failure, especially for guests on poor connections.
- Performance first. Support older hardware and low-end Android phones.
- Protect the recording path over convenience features.
- Keep the live call path, local capture path, and upload path loosely coupled. Failure in one path must not silently corrupt the others.
- Prefer boring, observable systems. Critical paths need logs, reproducible tests, or other fast feedback loops.
