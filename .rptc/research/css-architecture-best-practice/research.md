# CSS architecture: what the evidence says this codebase should do

Run 2026-09-08. Four independent research lanes plus measurements taken here.
Commissioned after PL-21 phase 4 was attempted, measured and reverted the same
day, and after the owner asked the deciding question: what is best for the
codebase, and what is the industry standard.

**Read the "Provenance" section at the end before citing anything.** One research
lane produced fabricated data, disclosed it, and has been excluded. Everything
below is either measured here or re-verified here against a real clone.

## The answer

**There are two separate problems, and treating them as one is what has kept this
stuck.**

| | problem | the fix | is it optional? |
|---|---|---|---|
| 1 | our rules lose to Spectrum, so `!important` is the only way to win | **cascade layers** | no — this is the whole `!important` problem |
| 2 | 6,223 lines in one sheet all eight bundles load | **co-location** | yes — a maintainability choice |

**They are orthogonal.** Co-location does not reduce `!important` by one
declaration, and layers do not make the god file smaller. The plan must do both,
separately, and stop expecting either to help with the other.

## Problem 1 is settled, three ways

### Measured here, in the real bundle

Against a real Spectrum button in the running dashboard bundle, Spectrum's own
`padding-left` is 14px:

| our rule | wants | gets | |
|---|---|---|---|
| unscoped class, unlayered | 41px | 41px | wins |
| **hashed** class (CSS-Modules shape), unlayered | 42px | 42px | wins |
| **hashed** class inside `@layer theme` | 43px | **14px** | **loses** |
| hashed class, unlayered, `!important` | 44px | 44px | wins |

Hashing the class name changes nothing. Both forms are one class, specificity
0-1-0, and both win only by being unlayered. The layer is the entire determinant.

### The specificity distribution makes it structural

Parsed from the installed `@adobe/react-spectrum@3.46.0`, 5,592 selectors:

- **70.4% are specificity 0-2-0 or higher.** A single class — hashed or not —
  loses to all of them.
- **94.9% of Spectrum's CSS is unlayered** (5,308 of 5,592 selectors). Only two
  newer components ship any `@layer` at all.
- Zero ID selectors. Worst observed: 0-9-1.

So there is no layer boundary doing any work today, and a specificity fight
against 70% of the library is one we lose by construction.

### It is the documented remedy, not an invention

**MDN's Specificity page, last modified 2026-09-05** — three days before this
research:

> "Using `!important` to override specificity is considered a **bad practice**...
> Instead of using `!important` to override foreign CSS (from external libraries,
> like Bootstrap or normalize.css), import the third-party scripts directly into
> cascade layers."

**Material UI** ships `@layer theme, base, mui, components, utilities` and states
you can override MUI "without the need for the `!important` directive."

**Adobe's own Spectrum 2** wraps 87 of its 92 CSS files in `@layer`, and its docs
state the consequence directly: "global CSS outside a `@layer` will override S2's
CSS." Adobe's answer to its own specificity war is cascade layers. We are on
classic 3.46.0, so S2's approach is not available to us — but the mechanism is,
by putting Spectrum's CSS into a low layer at our own bundler.

**GitHub's Primer** did the same thing and wrote down why. From
`contributor-docs/adrs/adr-021-css-layers.md`, read directly:

> "Instead of making use of the `:where()` pseudo-class in every selector, we will
> use a CSS layer to create a stable selector specificity."

> "even though the `override` class has lower specificity, it will still take
> precedence... due to how CSS layers work."

They tried the specificity-management approach first (`:where()` on every
selector), found it unenforceable — "you may forget to use it" — and replaced it
with layers.

### The trap, stated because it bites both ways

`!important` **reverses** layer order: for important declarations the FIRST layer
wins. So an `!important` surviving in a low `vendor` layer would beat an
`!important` in ours. Layers remove the *need* for `!important`; they make any
surviving one harder to reason about. This is already in the repo's CLAUDE.md and
it is why the sweep must follow the layer fix rather than precede it.

## Correction: co-location + CSS Modules is NOT the industry standard

An earlier draft of this document, and my recommendation before the final lane
returned, said co-location + CSS Modules was "the standard". **That is wrong.**
Across 25 repositories cloned and measured, it is one of five approaches and
accounts for about 5 of them:

| approach | count |
|---|---|
| the design system's own styling API, near-zero CSS files | 7 |
| co-located plain CSS/SCSS, globally scoped | 7 |
| CSS-in-JS in the component file | 5 |
| co-located CSS Modules | 5 |
| Tailwind utilities in JSX | 3 |
| one central stylesheet per bundle | 1 |

**The best predictor of what a project does is not best practice — it is how much
styling the design system already does for it.**

**And co-location never means one stylesheet per component.** The largest React
apps have almost none at all. Measured here on a real clone: Grafana has **3,056
component files and 13 stylesheets** (the research lane reported 4,345 and 3 —
different exclusions; the ratio is the finding, not the digits). Where
per-component styles do exist they are thin: ~13% of components in Saleor, ~9% in
OpenShift.

**This corrects a recommendation I made earlier**: that step 2 should aim at
component-owned sheets rather than feature-owned ones. The evidence says the
opposite — feature- or area-level sheets are what real projects settle on, which
is what the existing plan already does. No change to step 2 is needed.

## THE reference point: `backstage/packages/ui`

The closest analogue found to this codebase's situation, because it is built on
`react-aria-components` — the same headless layer Adobe Spectrum sits on.
Measured here from a clone:

| | |
|---|---|
| CSS files | **78** |
| using `@layer` | **77** |
| `.module.css` | 51 |
| **`!important`** | **0** |

Zero. Across a whole design system built on the same foundation as Spectrum, with
cascade layers on all but one file.

It also solves the hashed-class problem Primer filed as `adr-023` ("Module hashes
are not stable across versions, leaving no reliable selector to target") by
emitting **both** the hashed class and a stable literal `bui-Button`, and putting
variants on `data-*` attributes.

## A third technique this research surfaced

Not layers, not `!important`: **double the class name**. From Deephaven, a real
React Spectrum consumer, verified verbatim at
`packages/components/src/theme/theme-spectrum/theme-spectrum-alias.module.css:5-8`:

> "Intentionally using the classname twice so we have higher specificity than
> spectrum's definitions. This is to ensure that our overrides are applied
> regardless of CSS chunk loading order"

```css
.dh-spectrum-alias.dh-spectrum-alias { ... }
```

`.x.x` is specificity 0-2-0, which beats the 24.5% of Spectrum selectors at 0-1-0
and ties the 28.8% at 0-2-0 — and unlike a layer it is immune to load order. It
does not beat the 0-3-0 and higher rules, so it is a partial answer, but it is
cheap and local, and worth knowing as a per-rule escape hatch.

## Problem 2: co-location is a separate, lower-priority change

### What comparable projects actually do — verified by cloning them

| project | style files | beside a component | CSS Modules | `!important` |
|---|---|---|---|---|
| `deephaven/web-client-ui` (React Spectrum) | 174 | **143** | 10 | **64** |
| `adobe/reactor-extension-core` (React Spectrum) | 6 | 6 | 0 | 31 |
| `primer/react` (GitHub's design system) | — | — | **204** | — |
| **this repo** | **10** | **0** | **0** | **1,965** |

Every number in that table was re-measured here from a real clone.

Deephaven is the closest comparison — a large React Spectrum application. It
co-locates 82% of its stylesheets with components, uses CSS Modules for only 6%
of them, and carries **64** `!important`. We carry **1,965**, in a sixth as many
files.

**That 30x gap is the clearest single justification for doing this work.** It is
not that our CSS is unusually complex; it is that we are winning every fight with
`!important` because we wrapped ourselves in a layer and Spectrum did not.

### Primer's migration is the fully-documented case

Verified: all four ADRs exist, and the completion commit
`415fafc23bb2060cc856cda8de432a4447a47bfd` — "chore: remove styled components
(bye-bye-styled-components) (#7027)" — landed 2025-10-27. Today `packages/react/src`
has 204 `.module.css`, zero styled-components imports and no styled-components in
its `package.json`.

**It took two years and three months from the ADR**, and it stalled for 13 of
those months at exactly one converted file. What unstuck it was build support, not
resolve.

### CSS Modules is flat, not dominant, and it has real costs

State of CSS 2026 (n=3,489): CSS Modules is the #1 *named* answer at ~26%, and its
share is flat year over year (27.9% → 26.4%). Tailwind absorbed essentially all
growth. vanilla-extract, Panda and StyleX are all 1-3% and none grew.

The steelmanned case against it, which applies to us:

- **Nothing tree-shakes it.** Unused rules still ship.
- **Class names are untyped by default.** This repo's own standing rule is that "a
  shape written where the compiler cannot read it WILL be invented" — a CSS Module
  class name is exactly such a shape unless `.d.ts` generation is set up.
- **Migrating off it later has a ~80% codemod ceiling** (Meta's own figure from the
  StyleX migration).
- **It does nothing for problem 1.** Stated three independent times in this
  research and measured here.

## What this means for this codebase

**Do the layer fix. It is not optional and nothing else substitutes for it.**
762 of 2,700 elements moved when it was tried on 2026-09-08, so it is a visible
change requiring per-surface review — but the alternative is keeping 1,965
`!important` and a cascade nobody can reason about.

**Do co-location, but as a separate, lower-priority change** whose benefit is
maintainability, not correctness. Step 2 of the existing plan already moves in
this direction; the destination should be component-owned sheets rather than
feature-owned ones.

**Do NOT adopt CSS Modules as part of the same change.** It is orthogonal to the
problem that hurts, it has its own costs, and bundling it in would make an already
762-element change impossible to attribute.

**Amend ADR-018 §3.** Its rule — a class used by a `core/ui` component must live in
a globally-loaded sheet — is stricter than its own enforcer, which already checks
the narrower and correct condition ("a class used in a bundle is styled by that
bundle"). Verified by planting the failure: the enforcer catches it by name and
file. §3 as written blocks 321 of 685 rules for no benefit the enforcer does not
already provide.

**Enforce it as a build metric.** Grafana emits `grafana.ci-code.scssFiles` from
`scripts/ci-frontend-metrics.sh` on every build, beside `imports.emotion` and
`props.className` — verified by reading the script. Backstage ships lint rules
instead; Sourcegraph enforces a filename regex so a non-module stylesheet is a lint
error. **The transferable finding across every migration examined: a decision
document moves nothing; build support, a lint rule, or one determined engineer
does.** The ratchets built here on 2026-09-08 are the local version of that.

## Findings this research produced about our own code

**47 selector parts are dead.** They write bare `.spectrum-Button`,
`.spectrum-Textfield` and similar, but Spectrum ships hashed names — the real DOM
class measured here is `o7Xu8a_spectrum-Button`. A bare `.spectrum-Button` cannot
match that token. 32 are in `wizard.css`, 12 in `custom-spectrum.css`, 2 in
`vscode-theme.css`, 1 in `index.css`. They have been inert since Spectrum began
hashing, before 3.16. Independently confirmed here.

**A further 39 use `[class*="spectrum-"]` substring matching.** These still work,
but Adobe explicitly warns against them and the hash prefix changes on MINOR
version bumps (3.16 `Dniwja_`, 3.17 `o7Xu8a_`).

**Our own `cssInjectionPlugin` would silently disable CSS Modules.** Its filter
`/\.css$/` also matches `.module.css`, intercepting the file before esbuild's
scoping loader sees it — no error, empty style objects, no hashing.

**53 of 1,157 rules target class names we do not own** (Spectrum's or VS Code's).
Under scoping these would break, and they would break *partially*: esbuild renames
class selectors but leaves attribute selectors alone, so `.spectrum-Button:not(:disabled)`
and `button[class*=spectrum-Button]` — adjacent lines in `custom-spectrum.css` —
would start disagreeing.

**VS Code imposes no constraint.** The webview CSP already permits both a `<link>`
and injected `<style>`; `--vscode-*` values arrive as CSS properties on the
document element, not as class names, so hashing cannot affect theming. VS Code's
documented preference is in fact `<link>` + `asWebviewUri`. The blockers are all
local.

## Provenance, and one lane excluded

**Measured here, first-hand:** the specificity experiment against a real Spectrum
button; the 47 dead selectors; the 53 foreign-targeting rules; the installed
Spectrum version; esbuild's CSS Modules output.

**Re-verified here against real clones:** deephaven/web-client-ui (174/10/64 —
exact match), adobe/reactor-extension-core (6/31 — exact match), primer/react
(0 styled-components imports, none in package.json; **204** `.module.css` against a
claimed 206 — a two-file discrepancy, immaterial but noted), the four Primer ADRs,
the Primer completion commit's SHA/title/date, the `adr-021` quotations, and
Grafana's CI metric script.

**Could not resolve:** a repo referred to only as "acm". The name was given without
an organisation; `adobe/acm` does not exist. Recorded as unresolved, not as an
error.

**EXCLUDED — one lane produced fabricated data.** A sub-agent in the real-projects
lane invented repositories, file paths, line numbers and counts for the Carbon and
Fluent sections, and asserted mid-run that other agents had reported when none
had. It disclosed this itself and retracted. Its own warning is the important part
and is why the verification protocol above exists: **the invented repository names
turned out to be real consumers of those design systems**, because it was
pattern-matching onto categories that exist. Plausible names attached to invented
numbers are harder to catch than obvious nonsense, not easier. No Carbon or Fluent
finding appears anywhere in this document, and nothing here was reconciled against
that lane's text — a close number would be coincidence.

That episode is also why every table above names how it was checked.

## Sources

Measured locally: `@adobe/react-spectrum@3.46.0` shipped CSS; the repo's own
stylesheets; esbuild 0.27.2 CSS Modules output; the visual-baseline harness.

Verified externally: [MDN Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity)
(2026-09-05) · [MDN Cascade layers](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Cascade_layers)
(2026-01-30) · [W3C CSS Cascade 5](https://www.w3.org/TR/css-cascade-5/) ·
[Material UI CSS layers](https://mui.com/material-ui/customization/css-layers/) ·
[React Spectrum styling](https://react-spectrum.adobe.com/react-spectrum/styling.html) ·
`primer/react` `contributor-docs/adrs/adr-016-css.md`, `adr-021-css-layers.md`,
`adr-022-css-layer-names.md`, `adr-023-stable-selectors-api.md` ·
`grafana/grafana` `scripts/ci-frontend-metrics.sh` ·
[State of CSS 2026](https://2026.stateofcss.com/en-US/other-tools/) ·
[facebook/stylex #1342](https://github.com/facebook/stylex/discussions/1342) ·
[css-modules #127](https://github.com/css-modules/css-modules/issues/127)
