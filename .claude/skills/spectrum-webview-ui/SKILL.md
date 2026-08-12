---
name: spectrum-webview-ui
description: Load-bearing Adobe Spectrum + webview-UI gotchas — dimension-token scale mismatch, Menu section/submenu composition (+ its test mock), the Flex-450px full-width trap, box-sizing overflow, dashboard-notice conventions, and tokens-vs-CSS-classes. Use when styling any React/Spectrum webview, positioning an absolute decoration, building a grouped or submenu Menu, or chasing a width/overflow/"my CSS does nothing" bug.
---
# Spectrum + Webview UI Gotchas

The handbook is `docs/development/styling-guide.md` (CSS architecture, `cn()`, token
utilities, class conventions) and `docs/development/ui-patterns.md` (layout constraints,
menu/dropdown patterns, width debugging). This skill is only the incident-derived facts
that keep biting — read the docs for the how, read this for the traps.

## When NOT to use
- Adding a wizard step / Build-Your-Project area or its layout — use `wizard-step-authoring`.
- Wiring an extension↔webview message — use `webview-command-handler`.
- Pure logic/state with no Spectrum or CSS surface — no skill needed.

## Gotchas

### Dimensions & absolute positioning
- **A Spectrum size PROP and the matching CSS var can resolve to DIFFERENT px.**
  `<View width="size-300">` is resolved by Spectrum's JS dimension resolver at the *active
  scale* (medium 24 / large 30); `var(--spectrum-global-dimension-size-300)` resolves from the
  `.spectrum--medium/--large` class on the cascade. The bundle defines BOTH values, and in this
  webview they disagree. So a decoration positioned with a computed `left` derived from the CSS
  token lands off-center, and a hardcoded px can't track scale.
- **Fix: anchor the decoration to the ELEMENT, not to a computed offset.** Render it as a
  *child* of the (position:relative) target and center with `left:50%; transform:translateX(-50%)`.
  That is the true center by construction — immune to the scale mismatch and any wrapper offset.
  Reference: the timeline connector in `TimelineNav.tsx` + `.timeline-connector` in
  `custom-spectrum.css` (a child of the `size-300` dot; the stretch case uses a tall line clipped
  by `.timeline-step-wrap-clip`'s `overflow:hidden`).
- **`DialogContainer type="fullscreen"` outranks the Dialog's `size` and every CSS override.**
  It renders `spectrum-Modal--fullscreen` / `spectrum-Dialog--fullscreen`, which size to the
  VIEWPORT — so a modal looks far too big for its content and no `max-width`/`height` aimed at
  the Dialog can win. Worse, `UNSAFE_className` on `Dialog` lands on an element INSIDE the
  painted panel, so a width cap there squeezes the content while the panel stays wide.
  Symptom → check the container's `type` FIRST; there should be none (2026-07-31: the Add
  Integration flow was the only fullscreen container in the repo, and it cost four failed CSS
  fixes; guarded by a source-reading test in flowStages.test.ts).
- **When a style override does not take, READ THE DOM before writing a second one.** One pass
  up the ancestor chain names the culprit; a second guess rarely does. In the webview devtools
  the console defaults to VS Code's outer document — switch the frame dropdown from `top` to
  the innermost `vscode-webview://` frame, or right-click the element → Inspect, then walk
  `parentElement` printing `className` + `getBoundingClientRect()` + the computed
  `display`/`align-items`/`align-self` of each ancestor.
- **"My CSS edit does nothing" → a Spectrum View style PROP is beating it.** A prop like
  `left="11px"` renders as an inline style that outranks your class. Remove the prop so the class
  wins. Prove a rule controls the element with a fat/obvious diagnostic before theorizing values.

### Grouped `Menu` with sections + a submenu (`@adobe/react-spectrum` v3)
Reference impl: `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx`.
1. **`Section` children are typed `ItemElement[]` only** — a `SubmenuTrigger` is NOT a valid
   Section child. A "More…" submenu must be a **top-level sibling** of the sections, never nested.
2. **`Menu` children reject `false`/`undefined` but tolerate `null`.** Use `{cond ? <Section/> : null}`,
   not `{cond && <Section/>}` (else tsc: "Type 'false' is not assignable to CollectionElement").
3. **Map Items with an inferred-return arrow, not a helper typed `: React.ReactElement`** — the
   explicit return widens props to `unknown` and breaks assignability to `ItemElement`.
4. **The test mock must mirror composition.** `tests/__mocks__/@adobe/react-spectrum.tsx` fully
   mocks Spectrum; a sectioned/submenu Menu won't render unless the mock exports `SubmenuTrigger`
   and its `Menu` recursively flattens `Section` (heading + items) and `SubmenuTrigger` (trigger
   menuitem + nested `<ul data-testid="spectrum-submenu">`). Content renders eagerly — query
   `within(getByTestId('spectrum-submenu'))` with no user-event. Section headings are
   `role="presentation"`, not menuitems.

### `Picker` / collection children: build ONE array, never static + mapped
A static `<Item>` beside a `{list.map(…)}` in the same children list makes React prefix the
MAPPED items — they are a nested array, so their keys come back namespaced rather than as the
plain key you wrote. Measured 2026-08-12 with `React.Children.toArray`:

| children | resulting `child.key` |
|---|---|
| `<Item key="all"/>` then `{arr.map(…)}` | `.$all`, **`.1:$import`**, **`.1:$export`** |
| one `.map()` over `['all','import','export']` | `.$all`, `.$import`, `.$export` |

**The static item is fine; the mapped ones break** — the opposite of the intuitive reading,
so look at the list, not at the option you hand-wrote. The repo's Spectrum mock decodes only
`.$key` / `.key` (`tests/__mocks__/@adobe/react-spectrum.tsx` `getOriginalKey`), so
`.1:$import` survives as the literal string `1:$import`.

**Scope of the evidence — do not overstate it.** React's namespacing and the mock's decoder
are both measured above. Whether the REAL `@adobe/react-spectrum` collection builder mangles
keys the same way is **unverified**; the only observed breakage was through the mock. So a
mixed children list is a guaranteed TEST failure and a suspected runtime one. If you hit an
empty/garbled key at runtime, treat this as a lead, not a diagnosis.

Fix either way: put every option in one array and map it once — `DatapackActivityView.tsx`'s
`MODE_OPTIONS` is the reference. A test catches this **only if it asserts the payload**
`onSelectionChange` received; asserting that a request merely fired passes with a mangled key.

### Layout width & box model
- **Spectrum `Flex` caps width at ~450px** — use a plain `<div>` with flex styles for any
  full-width wizard/webview layout (root `CLAUDE.md` gotcha; see ui-patterns.md "Width Debugging").
- **`box-sizing: border-box` lives in `reset.css`** (lowest cascade priority; unlayered author
  rules win). An input that sets `width:100%` + `padding` + `border` MUST also set
  `box-sizing: border-box` explicitly (or add `.box-border`) or it overflows its container.
- **Align content to `--content-width`** (960px, the canonical LEFT-aligned band in
  `custom-spectrum.css`) and wrap in `.page-container-padded`. Don't hardcode widths.

### Dashboard / webview notice conventions
The dashboard is minimal/dark — conform, don't invent.
- Ambient status → `StatusCard` (colored dot + uppercase label + value) from
  `@/core/ui/components/feedback`. Actions → a `Button` or quiet `Link` (`<Link isQuiet>`).
- **No saturated/filled banners, no `InlineAlert`.** Attention uses an accent BORDER + warning
  icon (`AlertCircle`) + message text, not a `backgroundColor="static-*-400"` fill. Reference:
  `src/features/dashboard/ui/components/OrgContextNotice.tsx`.
- **`StatusDisplay` (feedback/) is a full-height centered block** for empty/error screens — NOT
  for inline notices.
### A CSS class working in one webview proves NOTHING about another
Each webview is its own esbuild entry (`WEBVIEW_ENTRIES`), and a feature stylesheet reaches a
bundle only via a side-effect `import` somewhere in *that* entry's graph. So a class can be
styled in one surface and simply absent in the next — the element renders raw, with no error
anywhere.
- **Incident (2026-07-31).** `DestinationStage` used `.service-action-link`, defined in EDS's
  `connect-services.css`. That sheet reaches the WIZARD bundle only because `StorefrontStep.tsx`
  imports it. On the integrations surface the class didn't exist and the "Change" button rendered
  as a raw grey box ("This UI looks broken"). Its styling in the wizard was working by accident.
- **Earlier shape of the same trap:** warning-text utilities like `text-orange-500/600` are
  feature-scoped (`eds-steps.css`), NOT global — don't depend on them from the dashboard.
- **Before reusing a component across surfaces**, confirm every class it needs lives in a sheet
  the TARGET bundle loads. `custom-spectrum.css` / `index.css` / `vscode-theme.css` are imported
  by every entry; anything under `src/features/*/ui/styles/` is not.
- Small inline text-button actions have a global home: **`.inline-action-link`**
  (`custom-spectrum.css`) — use it instead of EDS's `.service-action-link`.

### Styling mechanics
- Prefer a CSS class via `cn()` (see styling-guide.md) over inline styles. `GridLayout` /
  `TwoColumnLayout` accept Spectrum `DimensionValue` props (`gap="size-300"`) — use those, not
  inline px, for token-driven layout.
- **`tests/sop/inline-styles.test.ts` counts `style={{` / `UNSAFE_style={{`.** New inline styles
  fail the SOP unless the value is genuinely dynamic (props) — then add a documented exception to
  that test's `DOCUMENTED_EXCEPTIONS` map with a reason.

## Verify

**You cannot see this UI.** It renders in a VS Code webview — no Playwright, no screenshot, no
devtools you can reach. The global CLAUDE.md "verify in the browser" rule does not apply here and
nothing automatic replaces it. Compilation proves nothing either: the mock can't render real
Spectrum popup layout, and scale/overflow bugs only show at runtime. The user is the only
renderer, so:

- **Never report a visual result you did not see.** "The rows line up now", "this matches the
  project card" — that is a prediction. Say so, or ask for a screenshot.
- **Never assert parity from declarations.** Identical properties render differently under
  different ancestors. `.integration-card` was commented "Matched to `.project-card-spectrum`",
  had the same declarations, and rendered at a different height.
- **Make parity structural instead.** One shared custom property that both surfaces consume
  (`--card-min-height` / `--card-min-width` / `--card-padding` / `--card-gap`, in
  `custom-spectrum.css`). A number that exists once cannot drift; a number copied twice already
  has.
  - **Caveat — some of those numbers are READ AS TEXT by a guard, so leave them literal.**
    `tests/features/dashboard/ui/components/integrations/integrationsGridLayout.test.ts`
    parses px out of the stylesheet SOURCE (`minmax(\d+px`, `gap:\s*\d+px`) because jsdom
    resolves no layout and a rendering test would pass either way. Lifting `.projects-grid` /
    `.integrations-grid` track and gap values into a `var()` moves the number out of the rule
    and the suite fails — including its positive control asserting `.projects-grid` still
    matches `minmax(240px, 1fr)`. It fails LOUDLY, which is the design; **the fix is to keep
    the literal, never to loosen the guard to accept `var()`.** Attempted and reverted
    2026-08-12. Before deduplicating any CSS number, grep `tests/` for the selector.
- **Check a list's real cardinality before designing per-row anything.** A per-row hint built to
  explain 6 rows annotated all 717, and was reverted.

Then, with the user driving:
1. `npm run watch:all` in the background; F5 once, then Cmd+R in the Extension Dev Host after edits.
2. Ask for a screenshot of the surface **populated** — an empty one hides every density, overflow
   and cardinality bug. Check: decoration centered under its element at both scales; a grouped/
   submenu Menu opens and the submenu is reachable; no element overflows its container.
3. Open the webview devtools console — no errors; a hang or repeated identical renders points at
   an inline empty-array/object reference passed to a hook.
4. If you touched inline styles, run `npx jest tests/sop/inline-styles.test.ts --no-coverage`.

_If this skill was wrong or incomplete, fix it before closing the task._
