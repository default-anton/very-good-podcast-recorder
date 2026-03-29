# frontend design and UI stack

Related docs:

- `docs/README.md`
- `docs/alpha-scope.md`
- `docs/architecture.md`
- `docs/ux-contract.md`
- `docs/repo-layout.md`
- `docs/version-pins.md`

## recommendation

Ship one shared frontend direction for both `web/control/` and `web/session/`.

Call it **studio utility**:

- modern, responsive, operational UI
- slightly nostalgic for late-90s / early-2000s recording gear and desktop broadcast tools
- warm, tactile, and calm
- text-first and truthful under failure
- distinct from generic SaaS dashboards

This should feel like a dependable recorder console, not a startup template and not fake-retro cosplay.

Use this stack for alpha:

- **React + TypeScript + Vite**
- **client-rendered apps**, not Next.js, Remix, SSR, or React Server Components
- **React Router** for route structure
- **Tailwind CSS** for layout, tokens, and utilities
- **Radix UI primitives** for accessibility-critical headless components
- **thin in-repo UI wrappers** for buttons, inputs, sheets, dialogs, status pills, and panels
- **`class-variance-authority` + `clsx` + `tailwind-merge`** for variant control
- **TanStack Query** for control-plane fetch/cache work only
- **Lucide** for baseline icons

Do **not** use a heavyweight component kit.

Do **not** ship stock `shadcn/ui` visuals.

If a `shadcn` component saves time, vendor the code, strip the default look, and restyle it as ours. Treat it as scaffolding, not as the design system.

## product-level rules

- one visual language across host setup, join flow, room shell, and post-recording summary
- dark theme first for alpha; no theme switch yet
- status is always **text first**, color second
- live call, local capture, and upload state must stay visually distinct
- the session room may be denser than the control plane, but both apps must look related
- avoid novelty that weakens scan speed during a recording session

## visual direction

### mood

Borrow from:

- field recorders
- compact audio mixers
- labeled tape cases
- older desktop utility software
- public-radio and studio tooling

Not from:

- glossy glassmorphism
- neon gamer dashboards
- whimsical illustration-heavy startup sites
- fake CRT or pixel-art gimmicks

### palette

Use a warm dark base with restrained signal colors.

Starting tokens:

- `bg`: `#151716`
- `panel`: `#1d211f`
- `panelRaised`: `#252a27`
- `line`: `#3a413d`
- `text`: `#f2eadb`
- `textMuted`: `#b8b09f`
- `accent`: `#c98a2b`      ← recorder amber
- `ok`: `#728a52`          ← tape green
- `warn`: `#d0a24a`
- `danger`: `#b65443`
- `info`: `#6f8ea3`
- `focus`: `#9ec3db`

Rules:

- amber is the brand accent, not bright blue
- green/amber/red reinforce state, never replace labels
- keep saturation controlled; this is operational software, not a nightclub

### typography

Use:

- **IBM Plex Sans** for UI copy
- **IBM Plex Mono** for timers, session IDs, manifests, status codes, and technical metadata

Rules:

- dense but readable
- short uppercase labels are fine for small section headers and status tags
- avoid oversized marketing-style headings in product screens
- do not rely on ultra-light font weights

### surfaces and spacing

Rules:

- panels, rails, and modules over floating marketing cards
- 1px hairline borders are the default separator
- radius stays tight: `6px` to `8px`
- use subtle inset/outset shadows only where they improve hierarchy
- 4px spacing scale with comfortable defaults at `8 / 12 / 16 / 24`
- no giant empty padding blocks in operational screens

The UI should feel tactile and intentional, not soft and anonymous.

### motion

Rules:

- motion is minimal and fast: roughly `120ms` to `180ms`
- use fades, small slides, and state transitions
- no springy bounce on critical controls
- no decorative motion during recording unless it conveys system activity

## component rules

### status bars

Status bars are part of the product, not decoration.

Rules:

- keep them persistent
- give them stronger contrast than surrounding panels
- use clear labels such as `Recording`, `Capture`, `Upload`, `Reconnecting`
- use icons only as reinforcement

### buttons

Rules:

- primary actions are solid and high-contrast
- recording actions must look deliberate, not casual
- destructive actions use danger color and explicit wording
- ghost buttons are for low-risk utility actions only

### forms

Rules:

- labels are always visible; placeholders are not labels
- inputs should look like utility controls, not glossy consumer forms
- validation errors are blunt and local to the field or action
- copy-link actions should feel like tool buttons, not inline text tricks

### roster rows and seat cards

Rules:

- each row/card must read like a labeled channel strip
- seat identity is visually stronger than decorative chrome
- per-seat state badges should align consistently across rows
- narrow layouts may stack fields, but must preserve scan order

### overlays

Rules:

- use dialogs for confirmation and takeover
- use sheets/drawers sparingly on narrow layouts
- menus and popovers must stay boring and obvious
- tooltips are hints only; never the only place critical meaning exists

## stack boundaries

### use Radix for

- dialog
- alert dialog
- popover
- dropdown menu
- tooltip
- select
- switch
- checkbox
- tabs
- scroll area
- separator

### do not add by default

- MUI
- Chakra
- Ant Design
- a full `shadcn/ui` component dump
- Redux
- Zustand
- Framer Motion

Add a new dependency only when the default stack is clearly insufficient for a real product need.

## implementation rules

- keep UI primitives in-repo and small
- prefer composition over giant prop-heavy components
- avoid a premature shared package; mirror or extract only after real duplication appears in both apps
- every component must work in narrow and wide layouts from day one
- build states before polish: empty, loading, degraded, failed, reconnecting, draining
- if a component cannot express degraded or failed state cleanly, redesign it

## app-specific emphasis

### `web/control/`

Bias toward calmer planning and session-management surfaces:

- more whitespace than the session room
- clearer form grouping
- obvious copy/share actions
- strong setup and summary affordances

### `web/session/`

Bias toward monitoring and speed:

- denser information layout
- stronger persistent status bar
- participant media first, controls second, chrome third
- degraded-state visibility over visual cleanliness

## non-goals for alpha

- light theme
- theme customization
- marketing-site design system work
- skeuomorphic nostalgia gags
- bespoke icon set before the core product is stable
- animation polish beyond clear state transitions

## source-of-truth map

This doc owns:

- frontend stack choices above the React/Vite baseline
- visual direction and aesthetic constraints
- typography, color, spacing, and motion rules
- component-library policy, including `shadcn` stance

This doc does **not** own:

- user-visible workflow behavior → `docs/ux-contract.md`
- hosted topology and runtime boundaries → `docs/architecture.md`
- exact dependency versions → `docs/version-pins.md`
