# implementation status

Related docs:

- `docs/README.md`
- `docs/testing.md`

## recommendation

Track implementation status inside the owning spec.

Use one marker only: `[done]`.

Example:

```md
## seat reclaim [done]
```

## rules

- Use `[done]` on heading lines for implemented sections.
- Use `done` in `docs/README.md` `Impl` column only when the whole doc is implemented.
- Blank means not done yet.
- Do not use `wip`, `partial`, percentages, dates, badges, or a separate tracker.
- If a section is too broad to mark cleanly, split it before marking it.

## done means

Mark a section `[done]` only when:

1. code for that slice exists
2. the narrowest relevant validation passes
3. if the slice touches join/session/recording/upload/reconnect flows, the relevant harness or scenario expectations from `docs/testing.md` exist or were updated

If in doubt, leave it unmarked.

## where to put markers

Mark only implementable behavior and contracts.

Typical targets:

- endpoints
- state-machine stages
- UX flows
- wire-format sections
- artifact or storage contracts

Do not mark:

- related-doc lists
- recommendation, background, or rationale
- non-normative notes

## process

For each implementation change:

1. implement the slice
2. add or update the narrow proof
3. mark the owning section heading with `[done]`
4. if that finishes the whole doc, mark `done` in `docs/README.md`
5. before handoff, update the markers last

## lifecycle

This is temporary scaffolding.

Keep markers small. When the code becomes the real source of truth and the docs get trimmed, delete stale prose and these markers with it.
