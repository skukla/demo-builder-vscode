---
id: PL-21
kind: question
area: platform
needs: []
value: high
status: backlog
title: CSS has no architecture and no safety net — understand it before changing any of it
---

# CSS: understand it, then get a safety net, then rule on it — refactor last, if at all

Filed 2026-08-29. The owner's framing, which is the reason this item is shaped
the way it is:

> "My one concern about this is that it's massively load-bearing. We have tried
> CSS refactors in the past and been bitten by them every time. There are certain
> things that we never could make render properly when we refactor CSS, and we
> need to understand how it works in depth and what's available to us in this
> architecture."

**So this item is explicitly NOT "refactor the CSS".** It is four phases, and the
refactor is the last one and optional. Every previous attempt started at the end.

## The measurements that say this is real

Taken 2026-08-29:

| | |
|---|---|
| Stylesheets in `src/` | 9 |
| Total CSS | 8,044 lines |
| `custom-spectrum.css` alone | **6,217** (the repo's own SOP ceiling is 500) |
| `!important` declarations | **1,957** |
| Classes defined in 2+ sheets | 19 |
| Classes defined in component `<style>` blocks | 12, across 4 components |
| CSS commits, all time | 255 |
| …of which are `fix(` | **81 (32%)** |
| Comment blocks inside `custom-spectrum.css` | 489 |

Two of those deserve reading twice. **A third of all CSS commits are fixes to
CSS** — that is the "bitten every time" pattern, measured rather than
remembered. And **489 comment blocks** in one stylesheet is a codebase telling
you it has been surprised repeatedly and is trying to warn the next person.

## The finding that reorders everything: there is no way to SEE a regression

There is **no visual regression testing of any kind**. No Playwright, no
Puppeteer, no image snapshots, no Percy/Chromatic. The only DOM environment is
jsdom, which does not do cascade or layout, and exactly 5 test files touch
computed styles at all.

So every CSS change in this repo has been verified by a human looking at the
Extension Dev Host, and every regression has been found the same way — later, by
whoever noticed.

That is the whole explanation for "we get bitten every time". It is not that the
CSS is unusually hard. It is that the feedback loop is manual, so a refactor
changes hundreds of rules with no mechanism that can tell you which one broke.
An ADR written before that is fixed would be an opinion, and a refactor before it
is a gamble.

## Phase 1 — SPIKE: ANSWERED 2026-08-29, it is possible

The owner asked the right question — *"is such a visual regression strategy even
possible for us?"* — against an item whose phase 1 had assumed the answer.
It was spiked rather than assumed. Full writeup:
`.rptc/research/webview-visual-testing/research.md`; the working harness is
beside it.

**Proven, by running it:**

- a webview bundle loads in a plain browser with no VS Code involved, given a
  root div, a stubbed `acquireVsCodeApi` and the `--vscode-*` theme variables
- the CSS pipeline works standalone — 35 style tags, 1,392 rules, because
  `cssInjectionPlugin` makes the CSS travel inside the JS
- the Data Installer surface MOUNTED and rendered real UI, then issued real
  requests the harness answered with canned data — so states are drivable
- our own rules resolve: `.page-container-padded` computed to `padding: 0 32px`

**And the trap that would have wrecked a naive attempt.** `.text-orange-600`
probed as inherited grey, which reads as "the utility is broken". It is not:
`--spectrum-global-color-orange-600` is defined in all eight bundles but scoped
to Spectrum's theme selector, and the harness probed outside the Provider's
subtree. A naive harness **silently under-styles**, so a diff against it reports
regressions that do not exist — or invites a "fix" that breaks the real thing.
That mechanism is a strong candidate for the owner's "things we could never make
render properly".

**So the harness needs a positive control of its own**, asserting that a known
Spectrum variable resolves and a known rule applies, and ABORTING rather than
reporting if it does not. A visual check that cannot prove it is faithful is
worse than none.

**Narrowed deliverable:** computed-style assertions FIRST — Playwright reads
resolved values, which is far steadier than pixel diffing and would have caught
all three CSS bugs found on 2026-08-29. Screenshot diffing is a separate, later
question, unattempted.

**Still open:** whether all eight surfaces mount as readily (only `dataInstaller`
was tried; the sidebar is the likeliest holdout since it acquires the API itself
— PL-19); whether the Provider's theme scope is best reproduced statically or by
rendering the real entry inside a real `Provider`; run-to-run stability; and
whether this belongs in CI at all, since Playwright is not currently a
dependency.

## Phase 2 — AUDIT: how does this CSS actually work?

Only once phase 1 can prove a change is safe. The audit answers what nobody can
currently answer:

- **Sheet ownership.** What belongs in `custom-spectrum.css` versus a feature
  sheet? Today `.number-badge` lived in `wizard.css` while two CORE components
  used it, and `.text-orange-*` lived in EDS's sheet while `StatusDisplay` used
  it. Both were found by accident.
- **Layer discipline.** `@layer theme` appears in 6 sheets and NOT in others —
  `eds-steps.css` declares none, so its rules outrank every layered rule. Is
  that designed or accumulated? Moving a rule between the two silently changes
  which wins, which is a trap already hit once on 2026-08-29.
- **The 1,957 `!important`s.** How many are load-bearing overrides of Spectrum's
  own styles, and how many are cargo copied from a neighbour? `ui-patterns.md`
  currently teaches this as the technique, so the answer determines whether that
  doc is guidance or a bug report.
- **The 19 double-defined classes.** Which definition wins, and does anything
  depend on the loser?
- **Inline `<style>` blocks.** Four components define 12 classes this way, so
  those classes exist only while the component is mounted. `.text-red-500` was
  one, and `AdobeAuthStep` depended on it — the error icon was red only when
  `VerifiedField` happened to be on screen. Is this pattern ever legitimate?
- **The 6,217-line file.** Is there a real seam, or is its size a symptom of
  something else?

## Phase 3 — RULE: ADR-018

Written from the audit, not from first principles. It should settle sheet
ownership, layer discipline, where utilities live, whether inline `<style>`
blocks are permitted, and what `!important` is allowed to mean.

It has somewhere to hang enforcement already: ADR-017 §6 established that a
stylesheet belongs to its bundle's graph, and
`tests/sop/stylesheet-bundles.test.ts` plus the `classesDefinedNowhere` rule are
running.

## Phase 4 — REFACTOR: only if the ADR requires it, and only behind phase 1

Explicitly gated. If phase 1 fails to produce a safety net, phase 4 does not
happen — the ADR governs NEW code and existing CSS is left alone. That is a
legitimate outcome and better than the alternative this item exists to avoid.

## Why the ADR alone is not enough

The three bugs found on 2026-08-29 (`.text-orange-*` in a feature sheet,
`.number-badge` in `wizard.css`, `.text-red-500` in a `<style>` block) were all
caught by a STATIC check, because they are structural. The failures the owner
describes — "things we could never make render properly" — are cascade and
layout failures, which no static check can see. Only phase 1 addresses those.

## Related

- ADR-017 §6 and its check (`tests/sop/stylesheet-bundles.test.ts`)
- PL-20 — 19 classes used but defined nowhere; overlaps the audit and may be
  absorbed into it
- `.claude/skills/spectrum-webview-ui` — the craft knowledge, including the
  incident where four consecutive guesses at one spinner's placement cost four
  build-and-reload cycles. That skill is what the team has INSTEAD of an
  architecture, and it is worth reading before phase 2.
- `docs/development/ui-patterns.md` — currently teaches `!important` as the
  technique; phase 2 decides whether that stands.
