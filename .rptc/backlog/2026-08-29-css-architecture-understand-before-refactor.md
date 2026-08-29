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

## Phase 4 — REFACTOR: the workflow, now that the safety net is proven

No longer "gated on a maybe". The net exists, so this is an operating procedure.

### The unit of work is ONE change, not one session

Because the definition of done is "returns to baseline exactly", the cycle is
worth only as much as its resolution. A batch of twelve edits that moves the
snapshot tells you twelve things might be wrong. One edit that moves it tells you
exactly what did.

    build -> capture -> ONE change -> rebuild -> re-capture -> diff -> commit or revert

Roughly 20s per cycle for all eight surfaces today, most of it a removable sleep.
Cheap enough to do per-rule.

### Two kinds of change, and they have different done-conditions

- **Behaviour-preserving** (the majority: moving rules, splitting files,
  consolidating duplicates, deleting dead rules). **Done = empty diff.** A
  non-empty diff is a bug in the refactor, full stop.
- **Intentional** (the ADR says a rule should change). **Done = the diff contains
  exactly the expected elements and nothing else**, and the new fingerprint is
  committed as the new baseline with the reason in the commit message. An
  unexpected element in the diff is a cascade side effect — the thing that has
  always bitten us — and it is now visible instead of shipped.

Never accept a new baseline to make a red cycle go green. That converts the
instrument back into the manual process it replaces.

### Do the cheap safety work FIRST

- **Build the missing fixtures.** Four surfaces (configure, aiOverview, sidebar,
  and the dashboard's deeper states) render near-empty, so rules only exercised
  there are UNPROTECTED. Refactoring them blind is exactly the old workflow.
  Fixture coverage decides what may safely be touched.
- **Extend the property list before you need it.** The fingerprint captures 16
  properties. Touching `z-index`, `box-shadow`, `transform` or `overflow` means
  adding them first — otherwise the check passes because it is not looking.

### CORRECTED 2026-08-29 — the layer fix comes FIRST, not last

The owner asked "are we absolutely confident `!important` is necessary at all?"
It is not. Measured proof:
`.rptc/research/webview-visual-testing/important-is-not-necessary.md`.

Spectrum's CSS is UNLAYERED; ours is in `@layer theme`. Normal declarations:
unlayered beats layered. So every one of our normal rules loses to Spectrum, and
`!important` is the only way a layered rule can win. **The 1,957 are one systemic
workaround with one cause, not 1,957 judgements.**

Proven on a real Spectrum Button in the running dashboard: our layered normal
rule lost (14px unchanged), our UNLAYERED normal rule won (42px) — with no
`!important` anywhere.

Two consequences for the sequence below:

- **The `!important` policy can be written now**, not after an audit. Fix the
  cause and most of them become removable mechanically.
- **The layer fix is a PREREQUISITE for the `!important` sweep, not a follow-on.**
  Removing an `!important` while our rules are still layered BREAKS the rule,
  because without it a layered rule loses. The old order (important at step 4,
  layers last at step 5) would have done exactly that.

Recommended fix is Option B: declare `@layer vendor, reset, theme, overrides;`
and have `cssInjectionPlugin` wrap `node_modules` CSS in `@layer vendor` — a few
lines in one place, keeping our internal layering while putting vendor below us.
Unverified as yet; it flips precedence globally, so it is the highest-risk change
in the programme and must be done under the snapshot with every move adjudicated.

### Sequence, safest to riskiest

1. **Delete verified-dead rules** (PL-20's dead-markup half). Expect an empty
   diff. If deleting a rule MOVES the snapshot, it was not dead — a free finding.
2. **Split `custom-spectrum.css`.** 6,217 lines against a 500-line SOP ceiling,
   and the highest-value structural change available. Import the pieces in the
   SAME order and the cascade is preserved — but note the file interleaves
   `@layer theme`, `@layer overrides`, `@layer theme` again, and unlayered
   content, so "same order" is subtler than it looks. Expect an empty diff, and
   trust the snapshot rather than the reasoning.
3. **Consolidate the 19 double-defined classes.** Keep the winner, delete the
   loser, expect an empty diff. A non-empty one means something depended on the
   loser.
4. **Fix the layering** — `@layer vendor, reset, theme, overrides;` with vendor
   CSS wrapped by the esbuild plugin. HIGHEST RISK: it flips precedence globally,
   so expect the snapshot to move widely and adjudicate every element. This must
   come BEFORE step 5, not after — see the correction above.
5. **Sweep `!important`.** Only once step 4 lands, and then mostly mechanical:
   one removal per cycle, empty diff means it was cargo. Expect the count to
   collapse rather than to be whittled — they were compensating for step 4's
   problem. A residue may remain for genuinely stubborn cases (Spectrum's own
   inline styles, which no stylesheet rule can beat).

### The rule that governs all of it

**`!important` inside `@layer` beats `!important` outside it.** Cascade layers
reverse precedence for important declarations. So:

- appending an override at the end of `custom-spectrum.css` does NOT override
  anything inside `@layer theme`, importantly or otherwise
- moving a rule INTO a layer lowers its important-priority and raises its
  normal-priority — in opposite directions at once
- this is backwards from most people's CSS intuition, which is why it is a
  standing candidate for "we could never make that render properly"

Every step above either avoids moving rules across that boundary, or treats doing
so as an intentional change requiring adjudication.

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
- 2026-08-29  MAJOR FINDING 2026-08-29: !important is NOT necessary here. Spectrum's CSS is unlayered, ours is in @layer theme, and unlayered normal declarations beat layered ones — so every one of our normal rules loses to Spectrum and !important is the only way a layered rule can win. The 1,957 are ONE systemic workaround with ONE cause. Proven on a real Spectrum Button: our layered normal rule lost, our unlayered normal rule won, no !important. Consequences: the !important policy can be written NOW rather than after an audit, and the LAYER FIX IS A PREREQUISITE for the !important sweep rather than a follow-on — removing an !important while rules are still layered breaks them. Sequence corrected accordingly.
- 2026-08-29  ADR-018 written (PROPOSED) and its central claims MEASURED by implementing the layer fix, snapshotting all 8 surfaces before/after, stripping all 1866 !important from custom-spectrum.css, re-snapshotting, then reverting everything. Layer fix alone: 5/8 surfaces identical, 23 of ~209 elements moved, each naming its element and property. Layer fix + 1866 !important removed: 7/8 surfaces IDENTICAL, 7 elements moved. That is the proof that the !importants were compensating for the layer wrapper. Not shipped — the change belongs in phase 4 under the snapshot with each move adjudicated. Also: §6 REVERSES my earlier recommendation (utilities go in @layer overrides, not unlayered) because the measurement changed the answer.
- 2026-08-29  SELF-AUDIT of ADR-018 before ratification. §§1-2 are safe to ratify as RULES but the evidence does NOT yet authorise migrating existing CSS. Four gaps recorded in the ADR: (1) '5 of 8 surfaces identical' is weaker than it reads — the 3 content-bearing surfaces ALL moved, the 5 that held still have 5-22 elements each, so the honest figure is 23 of 154 content elements, 15%; (2) 467 declarations sit in properties the fingerprint does not capture and 108 of those carry !important (box-shadow 34, border-radius 64, z-index 10) so the sweep would touch things the snapshot cannot see; (3) the 23 moved elements were never visually reviewed; (4) no interaction states captured and never confirmed in a real VS Code host. Bar before migration: fixtures, extended property list, interaction states, human review of every move, Dev Host confirmation. ~1 day.
- 2026-08-29  FIXTURES BUILT 2026-08-29. All 8 surfaces now render real content: 209 -> 455 elements, none under 30, 8/8 stable. Property list extended 16 -> 23 (box-shadow, border-radius, z-index, transform, overflow, outline, gap), closing the audit gap where 467 declarations incl 108 !important were invisible. Four fixture shapes were INVENTED first and each broke something visibly — registry keyed-vs-array crashed configure, an invented statusUpdate payload crashed dashboard AND integrations to an empty root, the wrong message envelope (data vs payload) crashed them again, and the manifest's missing path/status left projectsList loading forever. Biggest find: WebviewClient matches responses on isResponse+responseToId, not type:'response'+requestId — so NO request had ever been answered in any earlier run; surfaces rendered from init alone and it looked fine. Also: the CSS animation freeze could not beat .animate-pulse because that is !important inside @layer theme and the harness rule is unlayered — the instrument bitten by ADR-018 §1 itself; fixed with the Web Animations API.
