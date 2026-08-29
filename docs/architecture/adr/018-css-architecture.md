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

### 3. A class used by shared components lives in a globally-loaded sheet

`custom-spectrum.css`, `index.css` and `vscode-theme.css` reach every bundle;
anything under `src/features/*/ui/styles/` does not. A component in `core/ui/`
can render on any surface, so its classes must be defined where every surface
loads them.

Enforced today by ADR-017 §6's `bundleStylesheets` check. Three violations were
found and fixed on the day that check was written.

### 4. A class a component uses must be defined somewhere

Enforced today as `classesDefinedNowhere`, with 19 known cases seeded so the set
cannot grow (PL-20). Two were fixed on sight because they were visible bugs:
`.text-orange-700` on warning text and `.text-red-500` on an error icon, both
rendering with no colour at all.

*(This check existed before this ADR did — a rule enforced with no document
claiming it, which is the same fault PL-17 was filed to fix. §4 is its home.)*

### 5. Component `<style>` blocks are for that component only

Four components define 12 classes inside inline `<style>` blocks. Those classes
exist **only while that component is mounted**, which is a stranger dependency
than anything else in this document.

`.text-red-500` was one of them, and `AdobeAuthStep` depended on it — so the
auth-failure icon was red only when `VerifiedField` happened to be on screen.

A `<style>` block may define only what its own component uses. A class any other
component references belongs in a stylesheet.

Not banned outright: banning would mean rewriting four components for no measured
benefit, and a genuinely component-private rule is a reasonable thing to keep
next to its component.

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

## The evidence bar for MIGRATING existing CSS (§§1–2)

Ratifying these as RULES costs nothing: new CSS should not reach for
`!important` to beat Spectrum regardless, and that is safe from today.

**Migrating the 8,044 existing lines is a different authorisation**, and the
measurement behind §§1–2 does not yet reach it. Four gaps, stated because "5 of 8
surfaces identical" reads stronger than it is:

1. **The clean result is concentrated where there was least to test.** The three
   surfaces with real content — dashboard (72 elements), integrations (46),
   dataInstaller (36) — ALL moved. The five that held still are the five with
   almost nothing rendered: 8, 5, 15, 22 and 5 elements. So the honest figure is
   23 of 154 content-bearing elements moved (15%), not 23 of 209.

2. **467 declarations live in properties the fingerprint does not capture**, and
   **108 of them carry `!important`** — box-shadow (34 important), border-radius
   (64), z-index (10), plus transform, overflow, outline, gap and grid columns.
   The `!important` sweep would touch declarations whose effect the snapshot
   literally cannot see, and report a clean diff either way.

3. **The 23 moved elements were never LOOKED at.** We know what changed
   numerically — `font-size: 14px -> 18px`, `width: 762.969px -> 769.969px` — not
   whether the result is right. Some are probably our intent finally applying;
   some may be regressions. Nobody has judged which.

4. **Only the default state, only the harness.** No hover, focus, disabled or
   error states were captured — and those are exactly where Spectrum's own rules
   concentrate. Nor was any of this confirmed in a real VS Code webview; the
   harness supplies theme variables by hand.

**Before the migration is authorised, all of:**

- build the four missing surface fixtures, so "identical" means something on
  every surface
- extend the fingerprint to box-shadow, border-radius, z-index, transform,
  overflow, outline and gap at minimum
- capture interaction states (hover, focus, disabled, error)
- re-run the before/after, and have a HUMAN look at every moved element
- confirm the result in the Extension Development Host, not only the harness

That is roughly a day of work, and it is phase 4's step 0 in PL-21 either way.

## Consequences

- §1 is a **global precedence change**. It moves 23 elements across 3 of 8
  surfaces (5 are provably identical), each move naming its element and property.
  It must be implemented under the snapshot workflow with every move adjudicated
  — it is the highest-risk change in the CSS programme, and it is now a
  measured risk rather than an unknown one.
- §1 is a **prerequisite** for §2, not a companion. Removing an `!important`
  while our rules are still layered leaves a rule that loses. An earlier version
  of the PL-21 plan had this backwards.
- `docs/development/ui-patterns.md` currently teaches `!important` as the
  technique for overriding Spectrum. It is flagged in place and should be
  rewritten when §§1–2 land.

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
