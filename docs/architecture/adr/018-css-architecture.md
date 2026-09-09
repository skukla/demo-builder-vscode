# ADR-018: CSS architecture — vendor in the lowest layer, and `!important` is not a mechanism

**Status:** ACCEPTED for NEW code (owner-ratified 2026-08-29). The MIGRATION of
existing CSS under §§1–2 is **not yet authorised** — see the evidence bar below.
**Ratifying the RULES and authorising the MIGRATION are separate decisions.**
All six sections are safe to adopt as rules for NEW code today. Migrating the
8,044 existing lines under §§1–2 is NOT yet supported by the evidence — see
"The evidence bar for MIGRATING existing CSS" below, which names four specific
gaps found by auditing this ADR's own measurements before asking for it.
**Scope:** every stylesheet under `src/`, and vendor CSS as the build injects it.
**Relationship:** ADR-017 §6 rules WHICH BUNDLE a stylesheet reaches. This rules
WHAT WINS once it is there.
**Enforced by:** `tests/sop/stylesheet-bundles.test.ts` (§§3–4 today). §§1–2 gain
enforcement with their implementation, tracked in PL-21.

## Context

8,044 lines of CSS across 9 stylesheets, one of them 6,217 lines against a
500-line SOP ceiling, and **1,957 `!important` declarations**. A third of all CSS
commits in this repo's history (81 of 255) are `fix(` commits repairing CSS.

The owner's account of why: *"We have tried CSS refactors in the past and been
bitten by them every time. There are certain things that we never could make
render properly."*

That is not a discipline problem. It has a cause, and the cause is in this
document's §1.

## Decision

### 1. Vendor CSS goes in the LOWEST layer; ours goes above it

```css
@layer vendor, reset, theme, overrides;
```

with `node_modules` CSS wrapped in `@layer vendor` by `cssInjectionPlugin` at
build time, and the order statement prepended to every injected sheet (layer
precedence is fixed by first declaration, and sheets arrive in whatever order the
bundle graph produces — relying on one sheet to be first is relying on luck).

**Why, measured.** React Spectrum ships **no `@layer` of its own** — every layer
in a built bundle is ours. For NORMAL declarations, unlayered beats layered. So
wrapping our stylesheets in `@layer theme` put every plain rule we write BELOW
Spectrum's, and `!important` became the only way a layered rule could win.

The wrapper was deliberate; `custom-spectrum.css` says *"Wrapped in @layer theme
for cascade control"*. It achieved the opposite of its intent.

Proven on a real Spectrum Button in the running dashboard bundle:

| rule | padding-left |
|---|---|
| Spectrum's own | 14px |
| ours, LAYERED, normal (wants 41px) | 14px — **lost** |
| ours, UNLAYERED, normal (wants 42px) | 42px — **won, no `!important`** |

**The important-reversal is not a risk here.** Layer order reverses for
`!important` — earlier layers win — so a `vendor` layer declared first could in
principle out-rank us. Measured: Spectrum contributes **~1** `!important` to a
bundle against our ~1,950. There is nothing there to out-rank us with.

### 2. `!important` is not how you beat vendor styles

It is not a tool of last resort here, it is a symptom of §1. Once §1 lands, the
overwhelming majority are inert.

**Measured, by doing it.** With the layer fix applied, **all 1,866 `!important`
declarations were stripped from `custom-spectrum.css`** and the eight surfaces
re-snapshotted:

| | result |
|---|---|
| surfaces identical | **7 of 8** |
| elements moved | **7**, all on the dashboard |

1,866 removals; 7 elements affected. They were compensating for §1, not holding
anything up.

A residue is expected and legitimate: Spectrum sets some styles inline from its
own JS, and no stylesheet rule beats an inline style. The rule is therefore
narrow and strict: **"to override Spectrum" is not a justification.** A surviving
`!important` carries a comment saying what it beats and why nothing else can.

### 3. A class lives in a sheet every bundle that RENDERS it loads

**AMENDED 2026-09-09, owner-adopted.** This previously required a class used by a
`core/ui` component to live in a *globally-loaded* sheet. It now requires only
what its own enforcer has always checked.

`custom-spectrum.css`, `index.css` and `vscode-theme.css` reach every bundle;
anything under `src/features/*/ui/styles/` does not. The question is therefore not
"could this component render anywhere" but "which entries actually reach it", and
that is decided by the import graph.

**Why the old wording overshot.** It reasoned from POTENTIAL usage. Three things
make actual usage knowable:

1. The import graph determines exactly which of the eight entries reach a
   component. It is what proved `.prerequisite-*` wizard-only and `.eventing-*`
   integrations-only during the 2026-09 migration.
2. **Nothing is dynamically loaded** — zero uses of `React.lazy` or
   `await import()` anywhere in `src/`. The static graph is the truth, not an
   approximation.
3. **The failure the old rule guarded against is caught automatically.** Verified
   by planting it: a class defined only in a wizard-only sheet and used from a
   dashboard component fails `bundleStylesheets` by name and file —
   `prerequisite-container @ dashboard:src/features/dashboard/ui/ProjectDashboardScreen.tsx`.

The old rule was therefore stricter than the check enforcing it, and a rule
stricter than its enforcer is one people follow only by accident. It also pinned
321 of the god file's feature rules in place for a guarantee the enforcer already
provides.

**The residual risk, stated rather than waved away.** `bundleStylesheets` reads
class names statically, and 95 sites per bundle assemble them at runtime where it
cannot look. That blind spot is real and bounded, and is ratcheted by
`dynamicClassSiteCeiling`. It argues for keeping that ratchet tight, not for
keeping half the CSS in one file.

**What this does NOT license.** Moving a family whose consumers span several
entries still means importing the sheet from EVERY one of them — `.ai-*` is
imported by three. Check reach before moving, not after: a sheet placed where a
consumer cannot see it is the `.text-orange-*` bug, and it renders as the colour
simply not applying.

Enforced by ADR-017 §6's `bundleStylesheets` check, which is a BANNED list — it
takes no exemptions, and an entry in it reads as reopening the ban.

### 4. A class a component uses must be defined somewhere

Enforced today as `classesDefinedNowhere`, with 19 known cases seeded so the set
cannot grow (PL-20). Two were fixed on sight because they were visible bugs:
`.text-orange-700` on warning text and `.text-red-500` on an error icon, both
rendering with no colour at all.

*(This check existed before this ADR did — a rule enforced with no document
claiming it, which is the same fault PL-17 was filed to fix. §4 is its home.)*

### 5. A component defines no CSS in a `<style>` block

**Amended 2026-09-09: this section originally declined to ban them. It now does.**
What it said before is kept below, because the reason it changed is the useful part.

Four components defined 12 classes inside inline `<style>` blocks. Those classes
exist **only while that component is mounted**, which is a stranger dependency
than anything else in this document.

`.text-red-500` was one of them, and `AdobeAuthStep` depended on it — so the
auth-failure icon was red only when `VerifiedField` happened to be on screen.

The original rule was narrower: a block may define only what its own component
uses, and a class anyone else references belongs in a stylesheet. Banning outright
was rejected on cost — "rewriting four components for no measured benefit" — and on
the view that a genuinely component-private rule is fine next to its component.

**Both halves turned out to be wrong, and the migration is what showed it.**

The cost was not four components. By the time the god file was drained it was two,
holding six rules between them, and **five were byte-identical to copies already
sitting in a stylesheet** — redundant duplicates, not private styling. The sixth,
`.text-green-500`, was referenced by no markup anywhere in `src/`: every call site
uses `.text-green-600`, which is in `custom-spectrum.css`. So the whole remaining
population was five duplicates and one dead rule, and deleting both blocks changed
nothing on screen (103 elements compared on the wizard surface, 102 byte-identical,
the one difference an entrance animation caught mid-flight).

The "genuinely component-private rule" also never showed up. Every rule anyone
actually wrote in a block was either shared or dead — the private case the
exception was reserved for did not exist in twelve months of this codebase.

And the narrow rule left the hazard intact. It banned SHARING, which is the
symptom; the cause is that a block's classes come and go with a mount, and that is
true whether or not anyone else is using them yet. `.text-red-500` was compliant
with the narrow rule for the entire period it was rendering the sign-in error icon
colourless.

**A webview component defines no CSS in a `<style>` block.** Standalone
`<!DOCTYPE html>` pages are out of scope: they load none of our stylesheets, so a
block is the only styling they can have.

### 6. Utilities go in `@layer overrides`

A utility class exists to win — that is the whole point of `.text-orange-600`.
Under §1's order, `overrides` is the highest layer, so a utility placed there
beats `theme` and `vendor` with a plain declaration.

**This reverses an earlier recommendation in this work, and the measurement is
why.** Before §1 was measured, "unlayered" looked correct, since unlayered beats
layered. Once vendor sits in a layer below us, unlayered stops being special and
becomes merely un-ordered — and it would still lose to any `!important` we keep
under §2. `overrides` is both stronger and explicit.

## 7. What this ADR does NOT yet rule

Named rather than omitted, because a document that hides its gaps is worse than
one that has them.

- **The exact `!important` residue.** §2 says the count should collapse; it does
  not say to what. Each of the 7 elements that moved needs adjudicating, and only
  then is the surviving set known.
- **Whether `custom-spectrum.css` gets split, and along what seam.** 6,217 lines
  is over the ceiling, but the file interleaves `@layer theme`, `@layer overrides`,
  `@layer theme` again and unlayered content, so "split it" is not yet a
  well-formed instruction.
- **The 19 classes defined nowhere** (PL-20) — each is either a rule nobody wrote
  or dead markup, and only a person can say which.

## SUPERSEDED 2026-09-08 — the migration measurement was wrong

The section that stood here set an evidence bar for migrating the existing CSS
and reported that the layer fix alone moved 23 of ~209 elements, while the layer
fix plus removing 1,866 `!important` moved only 7 — concluding that the
`!important` declarations were compensating for our own `@layer theme` wrapper,
so removing both together would land closer to the original than the layer fix
alone.

**Both figures and that conclusion are wrong.** Re-measured 2026-09-08 against a
2,700-element baseline over 48 surface/theme/width cells, with the layer fix
actually implemented and reverted:

| | elements moved, of 2,700 |
|---|---|
| layer fix alone | **762 (28.2%)** |
| layer fix + all 1,946 layered `!important` removed | **780 (28.9%)** |

The sweep adds 18 elements to the layer fix's 762. It does not cancel it. **The
layer fix causes essentially all of the movement, and the `!important`s are not
holding the old rendering in place.**

**Why the old number was so much smaller, and it is not that the code changed.**
That run measured 209 elements over 16 properties; this one measured 2,700 over
26. `line-height` alone accounts for 528 of the property changes and was added to
the fingerprint on 2026-09-08 — it was invisible in August by construction. This
ADR's own self-audit predicted exactly that ("467 declarations live in properties
the fingerprint does not capture") and under-estimated it.

**The evidence bar it set has been met.** Fixtures now render real content on all
eight surfaces; the fingerprint captures 26 properties; interaction states
(hover/focus/active) are captured by `capture-interactions.js`. Two conditions
remain and both need a human: someone looks at every moved element, and the result
is confirmed in the Extension Development Host.

**What did NOT change: §§1-2 as rules still stand, and are now better supported.**
See the section below.

## The approach, settled 2026-09-08

Established by four research lanes plus measurements taken here; full evidence and
provenance in `.rptc/research/css-architecture-best-practice/research.md`. The
migration itself is `.rptc/plans/css-architecture-migration/`.

**There are two problems and they are orthogonal. Treating them as one is what
kept this stuck for months.**

| | problem | fix | optional? |
|---|---|---|---|
| 1 | our rules lose to Spectrum, so `!important` is the only way to win | **cascade layers** | **no** |
| 2 | 6,223 lines in one sheet every bundle loads | co-location into feature sheets | yes — maintainability |

Cascade layers remove no lines from the god file. Co-location removes no
`!important`. Expect neither to help with the other.

**Cascade layers are the documented remedy, not a local invention.** MDN's
Specificity page (modified 2026-09-05) names importing third-party CSS into a
cascade layer as the alternative to `!important`. Material UI ships
`@layer theme, base, mui, components, utilities` and documents overriding it
without `!important`. Adobe's own Spectrum 2 wraps 87 of its 92 CSS files in
`@layer`. GitHub's Primer tried managing specificity with `:where()` on every
selector first, found it unenforceable, and replaced it with layers
(`adr-021-css-layers.md`).

**Why a specificity fight cannot be won here**, measured against the installed
`@adobe/react-spectrum@3.46.0`: of its 5,592 selectors, **70.4% are specificity
0-2-0 or higher** and **94.9% are unlayered**. A single class loses to seven out
of ten of them.

**DO NOT ADOPT CSS MODULES as part of this.** Measured here against a real
Spectrum button: a hashed CSS-Modules-style class and a plain global class behave
identically — both win only by being unlayered, and the same hashed class inside
`@layer theme` loses to Spectrum exactly as our current CSS does. Scoping changes
collision safety, not specificity. It is also not the industry default: across 25
repositories surveyed it is one of five approaches. Our own `cssInjectionPlugin`
would silently disable it anyway — its `/\.css$/` filter also matches
`.module.css`.

**Co-location means feature-level sheets, not one sheet per component.** The
largest React applications have almost no per-component stylesheets: Grafana has
3,056 component files and 13 stylesheets. Thin co-location is the norm.

**The target, with a name.** `backstage/packages/ui` is built on
`react-aria-components` — the same headless layer Spectrum sits on — and carries
**78 CSS files, 77 of them in `@layer`, and zero `!important`.** That is the
destination this repo is walking towards.

**A per-rule escape hatch worth knowing.** Deephaven, a real React Spectrum
consumer, beats Spectrum by doubling the class name —
`.dh-spectrum-alias.dh-spectrum-alias` — with the reason in the file: "higher
specificity than spectrum's definitions... regardless of CSS chunk loading order".
It is 0-2-0, so it loses to Spectrum's 0-3-0 and above, but it is local and
immune to load order.

## Consequences

- §1 is a **global precedence change**. It moves 23 elements across 3 of 8
  surfaces (5 are provably identical), each move naming its element and property.
  It must be implemented under the snapshot workflow with every move adjudicated
  — it is the highest-risk change in the CSS programme, and it is now a
  measured risk rather than an unknown one.
- §1 is a **prerequisite** for §2, not a companion. Removing an `!important`
  while our rules are still layered leaves a rule that loses. An earlier version
  of the PL-21 plan had this backwards.
- **Resolved 2026-08-30.** `docs/development/ui-patterns.md` taught `!important` as
  the technique for overriding Spectrum — a document actively teaching the practice
  this ADR calls a symptom. It was dissolved into the `spectrum-webview-ui` skill
  (`7c6835b2c`), and the guidance did not survive the move: the skill mentions
  `!important` zero times. Nothing now teaches it, so §§1–2 no longer have a
  contradicting document to land against.

## How this was established

Everything asserted above was measured, not reasoned:

- an isolated four-case cascade experiment (layered vs unlayered, normal vs
  important)
- the same, re-run against a real Spectrum Button in the running dashboard
- the layer fix implemented, all eight surfaces snapshotted before and after
- 1,866 `!important` declarations stripped and the surfaces re-snapshotted
- the whole experiment reverted; working tree verified clean

Instrument: the `webview-visual-baseline` skill. Writeups stay in
`.rptc/research/webview-visual-testing/`, in particular
`important-is-not-necessary.md`. The snapshot instrument itself is PL-21 phase 1,
verified the same day.

## Ratification status

**RATIFIED 2026-08-29 as rules for new code — all six sections.** §§3–4 are already enforced and
carry no risk. §§5–6 are judgement calls stated with their reasons, and are the
ones most worth arguing with. §§1–2 as rules cost nothing: nobody should be
writing `!important` to beat Spectrum in new CSS whatever we do about the old.

**Migration of existing CSS: NOT authorised.** The evidence bar above
lists what is missing, and the honest summary is that the measurement was run on
a corpus where the surfaces that stayed clean are the surfaces with the least
rendered, and against a property list that cannot see 108 of the `!important`
declarations the sweep would delete.

Roughly a day of work closes it, and that work is phase 4's step 0 regardless.

## Reference notes

- `docs/development/ui-patterns.md` — deliberately named, and deliberately gone. It was
  dissolved into the `spectrum-webview-ui` skill on 2026-08-30 (`7c6835b2c`). The record
  of what it taught is the point of the Consequences entry above; rewriting that entry to
  stop naming the file would erase the reason the entry exists.
