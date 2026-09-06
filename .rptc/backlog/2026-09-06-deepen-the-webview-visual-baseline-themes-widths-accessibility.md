---
id: PL-47
kind: feature
area: platform
needs: []
value: high
status: backlog
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
