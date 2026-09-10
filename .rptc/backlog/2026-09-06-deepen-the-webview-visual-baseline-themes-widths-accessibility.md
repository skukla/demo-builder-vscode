---
id: PL-47
kind: feature
area: platform
needs: []
value: high
status: shipped
parent: PL-11
---

# One harness, more probes: themes, widths, and the accessibility gap

Researched 2026-09-06, from the question "what's possible for automated visual testing".
Sibling of [[PL-46]], which covers driving the real VS Code. This one is about getting more
out of the instrument that already exists — cheaper, and independently useful.

`webview-visual-baseline` already pays the expensive part: it loads the REAL built bundle
for each of the eight surfaces in a real browser, stubs `acquireVsCodeApi`, and serves
fixtures generated from real artifacts. Everything below is another READING of that same
page, not a new system.

## The accessibility gap — the highest-value finding

**This repository has no accessibility tooling at all.** No `axe-core`, no `pa11y`, nothing
— verified against `package.json` on 2026-09-06. Meanwhile the root CLAUDE.md asks for
"WCAG 2.1 AA" on significant UI features, so the standard is stated and unenforced.

`axe-core` is the industry standard and it wants exactly what the harness already provides:
a real bundle rendered in a real browser. Same page, second probe, no new tool chain.

Adobe Spectrum gives a good floor for free, which is why nothing has visibly broken. What
it cannot give is the composition: a label bound to the wrong control, a live region that
never announces, a contrast failure in a custom class, a focus order that follows the DOM
rather than the reading order. Those are ours, not Spectrum's.

## Two dimensions the fingerprint cannot currently see

The capture is 23 properties keyed by structural path — colour, typography, box model,
flex, position, shadow, radius, z-index, transform, overflow, outline, gap. Strong. But it
runs at ONE theme and ONE width.

**Themes.** VS Code ships light, dark and high-contrast, and the extension inherits the
user's. A CSS change can be correct in dark and wrong in light with nothing to say so. The
capture already parameterises on bundle; theme is the same shape.

**Widths.** VS Code panels resize. The root CLAUDE.md records a Spectrum layout that
constrains at 450px — a width bug the current fingerprint is structurally blind to, because
it never changes width. `tests/` has nine files touching media queries or geometry ad hoc,
which is the shape of a gap being worked around one component at a time.

Both multiply what one run proves against the cost already paid for loading the bundle.

## Tools considered and REJECTED, with the reason

Recording these so the next person does not re-open them.

- **Screenshot services** — Percy, Chromatic, Applitools, Argos; and self-hosted
  BackstopJS, `jest-image-snapshot`, `reg-suit`, Loki. For regression detection these are a
  step DOWN from what this repo has: pixel comparison brings font-rendering drift,
  anti-aliasing noise and tolerance-tuning, and cannot say WHICH rule changed. That
  conclusion is already written into the visual-baseline skill and ADR-018. They do catch
  one thing a computed-style fingerprint cannot — elements that overlap or render wrongly
  while every computed value is correct — which is rare here and expensive to insure
  against. If screenshots are ever added, add them as review ARTIFACTS, never as a gate.
- **Storybook** — real value for a component library people browse. The harness already
  does the isolation, so this would be a parallel system maintaining a catalog nobody has
  asked for.
- **Lighthouse / Core Web Vitals** — largely inapplicable, and the root CLAUDE.md should
  probably drop it. Those metrics describe network-loaded pages; a webview loading a local
  bundle inside an editor has no meaningful Largest Contentful Paint.

## Order, cheapest first

1. **`axe-core` against the existing harness.** Closes a stated-but-unenforced standard.
   Expect a burst of findings on first run: ledger them shrink-only, the way the
   credential-shape and logger-wording rules were, rather than trying to fix everything.
2. **Theme variants.** Second reading of the same page; catches a bug class nothing sees.
3. **Widths.** Same, and it retires the ad-hoc geometry checks scattered across nine files.

## What this does NOT do

It never proves the surface OPENS, nor that the extension host sends the right payload —
the harness supplies a fixture instead of the real message. That is [[PL-46]]'s half.

**And the fixtures are the seam that will rot.** They are generated from real artifacts, but
nothing checks they still match what the extension sends. A functional test is exactly the
thing that could: open a real surface, capture the real payload, compare it to the fixture.
That is the strongest reason to want both items rather than either.

## Shipped so far

- 2026-09-08  Step 1 (axe-core) SHIPPED 2026-09-08 — and it did NOT need the browser this item assumed. 195 of 211 rendering suites already mount real Spectrum in jsdom, so axe runs inside the existing jest run; only colour contrast still needs the browser harness, which remains this item's step 1b. tests/core/ui/accessibility.test.tsx: 4 components plus a positive control, all clean on first run, which is the expected result since Spectrum handles its own primitives' semantics. No burst of findings materialised, so no shrink-only ledger was needed. Three traps recorded in the suite: real timers must be restored in beforeEach not beforeAll (the React setup re-installs fake ones in its own beforeEach, and axe never settles under them — five probes, cracked by running the same code in a bare jsdom); colour-contrast disabled explicitly because jsdom has no layout; and zero violations with zero PASSES means nothing was inspected, so every case asserts the pass count too. Steps 2 (themes) and 3 (widths) not started.
- 2026-09-08  Steps 2 (themes) and 3 (widths) SHIPPED 2026-09-08. Capture is now keyed surface@theme@width; diff() unchanged since it compares by key. PREMISE CORRECTION: this item says the extension inherits the user's VS Code theme. It does NOT — WebviewApp and the sidebar entry both force vscode-dark, and the owner confirmed the imposition is deliberate. So the theme axis is a guard that the IMPOSITION HOLDS, not a light/dark regression check: VS Code still supplies its own --vscode-* variables from the user's real theme and our CSS reads 13 of them, which is where it could leak. Measured on the dashboard: 68 app elements, byte-identical colours at both themes, so it holds today. Palettes read from VS Code's shipped dark_modern.json and light_modern.json, not invented; the existing dark set matched byte for byte, which confirmed the pairing. High contrast deliberately absent — hc_black.json defines 11 colours and inherits the rest. 420px is the load-bearing width (Spectrum Flex constrains at 450). Verified in a real browser. TRAP RECORDED: port 8899 was answered by an unrelated Fastify app inside the browser container, so every iframe got a JSON 404 that reads exactly like an inert theme switch; the skill now requires a sentinel fetched through the browser first. Remaining: axe colour-contrast in the browser harness (step 1b), the only part jsdom cannot do.
- 2026-09-08  Step 1b (colour contrast in the browser) SHIPPED 2026-09-08 — PL-47 COMPLETE. auditContrast() runs the one WCAG rule jsdom cannot judge, against the real bundle: dashboard, wizard and sidebar all clean at 10/14/8 passing checks, zero violations, measured at the dark theme because the extension imposes it by design. FIXTURE ROT FOUND AND FIXED, exactly where this item predicted it: the sidebar first reported 0 violations AND 0 passes, which is nothing inspected rather than a pass. Cause was buildPushedMessages still sending the pre-PL-19 'data' envelope while the sidebar now reads 'payload' — it sat on its spinner in the harness while working perfectly in a real window (owner reloaded and confirmed). Sidebar went 11 elements/no text -> 42 elements/8 contrast checks. The sibling line in the same function already used payload; the two had silently diverged. Strengthens the case for PL-46: a functional test is the only thing that could check a fixture against a real payload.
