# issue 01 — responsive frontend shells

Related docs:

- `docs/alpha-scope.md`
- `docs/ux-contract.md`
- `docs/repo-layout.md`
- `docs/testing.md`

## goal

Land the first real frontend code in the right places and prove the core host/join/room shells work responsively.

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

## non-goals

- real control-plane persistence
- real session-server integration
- shared frontend package extraction
- visual polish beyond usability and clarity

## acceptance criteria

- `web/control/src/` and `web/session/src/` exist with runnable app shells
- narrow and wide layouts both keep core actions usable
- recording state/status bars stay visible in supported layouts
- no horizontal-scroll requirement for core actions on common laptop/tablet widths
- host and guest flows match the UX contract well enough to start wiring real APIs next

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