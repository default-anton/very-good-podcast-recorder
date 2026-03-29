# epic 01 — responsive frontend shells

## Recommended PR slices

split into 2–3 PRs:
- control app shell [done]
- session app shell [done]
- responsive/layout smoke assertions if needed [done]

Related docs:

- `docs/alpha-scope.md`
- `docs/ux-contract.md`
- `docs/frontend-design.md`
- `docs/repo-layout.md`
- `docs/testing.md`

## goal

Land the first real frontend code in the right places and prove the core host/join/room shells work responsively with the alpha visual system already in place.

## scope

Add:

```text
web/control/src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── routes/
│   │   ├── SessionSetupPage.tsx
│   │   └── SessionRoomPage.tsx
│   ├── components/
│   │   ├── SessionForm.tsx
│   │   ├── SeatList.tsx
│   │   └── RecordingStatusBar.tsx
│   └── lib/
│       └── types.ts
└── styles.css

web/session/src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── routes/
│   │   ├── JoinPage.tsx
│   │   └── RoomPage.tsx
│   ├── components/
│   │   ├── SeatPicker.tsx
│   │   ├── DevicePreview.tsx
│   │   ├── LocalSeatStatus.tsx
│   │   └── SessionStatusBar.tsx
│   └── lib/
│       └── types.ts
└── styles.css
```

Build only:

- responsive host session setup shell
- responsive join flow shell
- responsive room shell
- enough local state to exercise layout and interaction shells
- the initial `studio utility` visual baseline from `docs/frontend-design.md`
- Tailwind-based design tokens, IBM Plex Sans/Mono, and warm dark panel styling
- React Router app shells and thin in-repo UI wrappers for the first product primitives

## non-goals

- real control-plane persistence
- real session-server integration
- shared frontend package extraction
- a full `shadcn/ui` component dump or stock `shadcn` look
- visual polish beyond usability and clarity

## acceptance criteria

- `web/control/src/` and `web/session/src/` exist with runnable app shells
- narrow and wide layouts both keep core actions usable
- recording state/status bars stay visible in supported layouts
- no horizontal-scroll requirement for core actions on common laptop/tablet widths
- host and guest flows match the UX contract well enough to start wiring real APIs next
- both apps clearly share one visual language and already read as `studio utility`, not a generic SaaS dashboard
- the initial primitive layer follows the stack in `docs/frontend-design.md`: Tailwind CSS, Radix where needed, and in-repo wrappers instead of a stock component kit

## feedback loop

Use fast static proof first:

```bash
mise exec -- pnpm exec tsgo --noEmit -p web/control/tsconfig.json
mise exec -- pnpm exec tsgo --noEmit -p web/session/tsconfig.json
mise exec -- pnpm exec oxlint web/control/src web/session/src
mise exec -- pnpm exec oxfmt --check web/control/src web/session/src
```

If layout confidence is weak, add one narrow Playwright smoke spec that asserts critical controls are visible at one narrow and one wide viewport.

## notes

Keep `web/control/` as the control-plane root and `web/session/` as the in-call app root. Do **not** collapse them into one frontend.

For the first control-shell PR, a narrow Playwright smoke may boot `web/control/` directly from its own Vite config to keep the feedback loop fast. Do not carry that wiring past this epic: when the session-app-shell PR lands, widen or split the smoke setup so frontend coverage no longer hard-codes a single app server as the long-term test entrypoint. If later harness work supersedes that setup, `docs/testing.md` is the durable owner for the broader multi-app test entrypoint.

If `shadcn` code is borrowed for speed, vendor only the needed pieces, strip the default styling, and restyle them to match `docs/frontend-design.md`.
