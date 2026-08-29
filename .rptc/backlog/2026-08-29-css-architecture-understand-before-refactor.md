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

## Phase 1 — VERIFIED 2026-08-29. The path is clean.

Spiked, then fully verified at the owner's request ("can you do all of the CSS
verification so we have a clean path when we get there?"). Every open question is
closed. Full writeup + working harness:
`.rptc/research/webview-visual-testing/`.

| Question | Answer |
|---|---|
| Do all eight surfaces mount outside VS Code? | **Yes, all eight** |
| Is the sidebar a holdout (it acquires the API itself)? | **No** — it mounts too |
| Must the Provider's theme scope be reproduced by hand? | **No** — mounting the real entry produces it |
| Is the signal stable? | **Identical across runs**, 6/6 values, no tolerance needed |
| How slow? | ~2s per surface, dominated by a removable fixed sleep |
| Can it detect the bug class we care about? | **Yes, demonstrated** |

**The detection proof.** Probing inside the dashboard's themed subtree after
today's fixes: `text-orange-600` → `rgb(232,116,0)`, `text-orange-700` →
`rgb(249,137,23)`, `text-red-500` → `rgb(238,67,49)`, and a nonexistent class →
inherited `rgb(235,235,235)`. The same probes returned inherited grey against the
PRE-FIX bundle, so the instrument distinguishes broken from fixed.

**Two traps, both found the hard way and both written down:**

1. The handshake reply must not be immediate. `setTimeout(..., 0)` lands in the
   gap before the client registers its listener, and the app waits forever. 30ms
   works. This produced a wrong intermediate conclusion — "six of eight cannot
   mount" — when in truth none had been answered.
2. The Spectrum theme scope exists only once the app has MOUNTED. An un-mounted
   harness resolves no Spectrum variable, so every themed rule reads as broken.
   **A harness that fails to mount reports a screenful of false regressions**, so
   the instrument must assert it is faithful and ABORT rather than report.

**Approach chosen: computed-style assertions, not screenshots.** Exact string
equality, no pixel tolerance, no font drift — and it already catches the failures
this codebase actually has. Screenshot diffing stays unattempted and unneeded.

**Who can run it — CORRECTED.** An earlier version of this item said "no browser
driver is installed". That was wrong in the way that mattered: **Playwright is
what ran the whole verification**, via MCP. What is missing is only a
*repo-level* dependency.

| Route | Available now | Who runs it | Cost |
|---|---|---|---|
| Agent-driven via MCP | **yes — used today** | an agent | **zero** |
| Repo dependency | no | anyone / any npm script | 5 MB package; browsers already cached (1.7 GB in `~/Library/Caches/ms-playwright`) |
| CI | no | CI | the above + a build step, since CI runs `npm ci --ignore-scripts` and never builds the bundles |

**Recommendation: start agent-driven, because it works today at zero cost** and
matches how this repo already runs periodic instruments — `codebase-sweep`,
`dream` and `eds:drift` are all agent-invoked at a release cut, not CI gates. Add
the 5 MB dependency when a human or script needs to run it without an agent.
Consider CI last; the build step is the awkward part there, not the driver.

One constraint on the MCP route: that browser runs in a container, so the harness
must be served over HTTP at an address the container can reach —
`host.docker.internal`, not `localhost`. A `python3 -m http.server` in the bundle
directory is enough.

**Remaining work is building it, not discovering whether it is possible.** Four
surfaces (configure, sidebar, aiOverview, dashboard's deeper states) render empty
under the trivial init payload used for the spike; they need realistic fixtures.
That is a known, bounded task.

## The baseline workflow is PROVEN (owner's proposal, 2026-08-29)

*"Capture each and every webview as a baseline snapshot, try our CSS architecture
on it, take another snapshot, compare. Definition of done is that it returns back
to the baseline exactly."* — run end to end against all eight surfaces:

| Step | Result |
|---|---|
| capture baseline | 8 hashes |
| rebuild, no change | 8/8 match |
| plant a CSS change | **3 DETECTED** — precisely the surfaces rendering the affected element |
| revert | **8/8 back to baseline exactly** |

A snapshot is a full-tree computed-style fingerprint (every element, keyed by
structural path, 16 properties), not a screenshot.

**Three things must be right, all found by controls that failed first:**

1. **Freeze animations.** The dashboard's pulsing `.status-dot` made captures
   differ by opacity 0.736 vs 0.766. With animations and transitions disabled,
   five surfaces captured twice were byte-identical.
2. **Cache-bust the BUNDLE url**, not just the page. The first control reported
   "no change" for a change that was in the bundle — the harness was comparing a
   build against itself.
3. **`!important` inside `@layer` beats `!important` outside it.** Cascade layers
   REVERSE precedence for important declarations. `custom-spectrum.css` wraps its
   rules in `@layer theme`, so a rule appended at the bottom of that same file
   loses to one inside the layer even with `!important`. "Append an override at
   the end" — the obvious move — **does not work here**, and that is a strong
   candidate for the owner's "things we never could make render properly".

Point 3 is the single most valuable thing the spike found and belongs in the ADR.

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

## Shipped so far

- 2026-08-29  Phase 1 VERIFIED 2026-08-29 at the owner's request. All 8 webview bundles mount outside VS Code; Spectrum theme resolves in all 8; signal identical across runs (6/6); detection proven against pre-fix vs post-fix bundles. Two traps recorded: the handshake reply must be ~30ms not 0ms (a 0ms reply lands before the client's listener and everything hangs), and the Spectrum theme scope only exists once mounted (so an unmounted harness reports false regressions and must abort). Chose computed-style assertions over screenshots. Cost: no browser driver installed and CI skips the build, so recommend a release-cut instrument rather than a CI gate. Remaining work is building it.
- 2026-08-29  CORRECTION: an earlier note said 'no browser driver is installed'. Wrong — Playwright via MCP is what ran the entire verification, at zero cost. Only a REPO-LEVEL dependency is missing (5 MB package; browsers already cached locally at 1.7 GB). Revised recommendation: start agent-driven like codebase-sweep/dream/eds:drift, add the dependency when a human or script needs it, consider CI last. MCP constraint: its browser is containerised, so the harness must be served at host.docker.internal, not localhost.
- 2026-08-29  Baseline/change/re-snapshot/compare workflow PROVEN end to end on all 8 surfaces: baseline captured, rebuild matched 8/8, a planted CSS change was DETECTED on exactly the 3 affected surfaces, and reverting returned all 8 to baseline exactly. Snapshot = full-tree computed-style fingerprint, not a screenshot. Three prerequisites found by controls that failed first: freeze animations (a pulsing status dot made captures differ), cache-bust the BUNDLE url (the first control compared a build against itself), and — the big one — !important INSIDE @layer beats !important outside it, so appending an override at the bottom of custom-spectrum.css does not override anything in @layer theme. That last one belongs in the ADR.
