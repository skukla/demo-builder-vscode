---
id: PL-21
kind: question
area: platform
needs: []
value: high
status: active
title: CSS has no architecture and no safety net — understand it before changing any of it
parent: PL-30
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
the `webview-visual-baseline` skill (instrument) and
`.rptc/research/webview-visual-testing/` (the writeups).

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
- `docs/development/styling-guide.md` — CORRECTED 2026-09-08. This said
  `docs/development/ui-patterns.md` "currently teaches `!important` as the
  technique". Stale twice: no such file exists, and the guide that does already
  states `!important` is not a mechanism. Nothing there needs changing.

## Shipped so far

- 2026-08-29  Phase 1 VERIFIED 2026-08-29 at the owner's request. All 8 webview bundles mount outside VS Code; Spectrum theme resolves in all 8; signal identical across runs (6/6); detection proven against pre-fix vs post-fix bundles. Two traps recorded: the handshake reply must be ~30ms not 0ms (a 0ms reply lands before the client's listener and everything hangs), and the Spectrum theme scope only exists once mounted (so an unmounted harness reports false regressions and must abort). Chose computed-style assertions over screenshots. Cost: no browser driver installed and CI skips the build, so recommend a release-cut instrument rather than a CI gate. Remaining work is building it.
- 2026-08-29  CORRECTION: an earlier note said 'no browser driver is installed'. Wrong — Playwright via MCP is what ran the entire verification, at zero cost. Only a REPO-LEVEL dependency is missing (5 MB package; browsers already cached locally at 1.7 GB). Revised recommendation: start agent-driven like codebase-sweep/dream/eds:drift, add the dependency when a human or script needs it, consider CI last. MCP constraint: its browser is containerised, so the harness must be served at host.docker.internal, not localhost.
- 2026-08-29  Baseline/change/re-snapshot/compare workflow PROVEN end to end on all 8 surfaces: baseline captured, rebuild matched 8/8, a planted CSS change was DETECTED on exactly the 3 affected surfaces, and reverting returned all 8 to baseline exactly. Snapshot = full-tree computed-style fingerprint, not a screenshot. Three prerequisites found by controls that failed first: freeze animations (a pulsing status dot made captures differ), cache-bust the BUNDLE url (the first control compared a build against itself), and — the big one — !important INSIDE @layer beats !important outside it, so appending an override at the bottom of custom-spectrum.css does not override anything in @layer theme. That last one belongs in the ADR.
- 2026-08-29  MAJOR FINDING 2026-08-29: !important is NOT necessary here. Spectrum's CSS is unlayered, ours is in @layer theme, and unlayered normal declarations beat layered ones — so every one of our normal rules loses to Spectrum and !important is the only way a layered rule can win. The 1,957 are ONE systemic workaround with ONE cause. Proven on a real Spectrum Button: our layered normal rule lost, our unlayered normal rule won, no !important. Consequences: the !important policy can be written NOW rather than after an audit, and the LAYER FIX IS A PREREQUISITE for the !important sweep rather than a follow-on — removing an !important while rules are still layered breaks them. Sequence corrected accordingly.
- 2026-08-29  ADR-018 written (PROPOSED) and its central claims MEASURED by implementing the layer fix, snapshotting all 8 surfaces before/after, stripping all 1866 !important from custom-spectrum.css, re-snapshotting, then reverting everything. Layer fix alone: 5/8 surfaces identical, 23 of ~209 elements moved, each naming its element and property. Layer fix + 1866 !important removed: 7/8 surfaces IDENTICAL, 7 elements moved. That is the proof that the !importants were compensating for the layer wrapper. Not shipped — the change belongs in phase 4 under the snapshot with each move adjudicated. Also: §6 REVERSES my earlier recommendation (utilities go in @layer overrides, not unlayered) because the measurement changed the answer.
- 2026-08-29  SELF-AUDIT of ADR-018 before ratification. §§1-2 are safe to ratify as RULES but the evidence does NOT yet authorise migrating existing CSS. Four gaps recorded in the ADR: (1) '5 of 8 surfaces identical' is weaker than it reads — the 3 content-bearing surfaces ALL moved, the 5 that held still have 5-22 elements each, so the honest figure is 23 of 154 content elements, 15%; (2) 467 declarations sit in properties the fingerprint does not capture and 108 of those carry !important (box-shadow 34, border-radius 64, z-index 10) so the sweep would touch things the snapshot cannot see; (3) the 23 moved elements were never visually reviewed; (4) no interaction states captured and never confirmed in a real VS Code host. Bar before migration: fixtures, extended property list, interaction states, human review of every move, Dev Host confirmation. ~1 day.
- 2026-08-29  FIXTURES BUILT 2026-08-29. All 8 surfaces now render real content: 209 -> 455 elements, none under 30, 8/8 stable. Property list extended 16 -> 23 (box-shadow, border-radius, z-index, transform, overflow, outline, gap), closing the audit gap where 467 declarations incl 108 !important were invisible. Four fixture shapes were INVENTED first and each broke something visibly — registry keyed-vs-array crashed configure, an invented statusUpdate payload crashed dashboard AND integrations to an empty root, the wrong message envelope (data vs payload) crashed them again, and the manifest's missing path/status left projectsList loading forever. Biggest find: WebviewClient matches responses on isResponse+responseToId, not type:'response'+requestId — so NO request had ever been answered in any earlier run; surfaces rendered from init alone and it looked fine. Also: the CSS animation freeze could not beat .animate-pulse because that is !important inside @layer theme and the harness rule is unlayered — the instrument bitten by ADR-018 §1 itself; fixed with the Web Animations API.
- 2026-08-29  fix(fixtures): make the compiler read the shapes, because the rule alone does not (`a9a7381d0`)
- 2026-08-29  docs(css): ratify ADR-018 for new code, and build the fixtures its audit demanded (`5afb5a21a`)
- 2026-08-29  docs(css): audit ADR-018's own evidence before asking for ratification (`b13234633`)
- 2026-08-29  docs(css): ADR-018 — written, and its central claim MEASURED by doing it (`71dcf0c21`)
- 2026-08-29  docs(css): !important is NOT necessary here — it compensates for our own layer wrapper (`69b5e9e02`)
- 2026-08-29  docs(css): rewrite PL-21 phase 4 as an operating procedure, not a gated maybe (`0dd89b778`)
- 2026-08-29  docs(css): the baseline/change/re-snapshot workflow WORKS — proven on all eight surfaces (`b8de84875`)
- 2026-08-29  docs(css): correct the driver claim — we DO have Playwright, and it ran the spike (`e846b2a5a`)
- 2026-08-29  docs(css): PL-21 phase 1 VERIFIED — all eight surfaces, stable, and it detects the bug (`7367668b8`)
- 2026-08-29  docs(css): file PL-20/PL-21, and SPIKE the question the owner asked (`6183e20c4`)
- 2026-09-08  PHASE 2 (THE AUDIT) DONE 2026-09-08. All six questions answered by measurement against today's tree. Corpus re-measured first: 8,039 CSS lines across 9 sheets (was 8,044), and !important went UP 12 in ten days, 1,957 -> 1,969, which is the untreated-cause signal.

(2) LAYER DISCIPLINE IS ACCUMULATED, NOT DESIGNED, and the audit's headline falls out of it. Of 3,320 declarations, 2,865 are inside a layer and 455 are not. THREE SHEETS DECLARE NO LAYER AT ALL — data-installer.css, connect-services.css, eds-steps.css. custom-spectrum.css then carries a deliberate 104-declaration carve-out at line 6160 whose own comment says it is outside @layer BECAUSE eds-steps declares none, so the exception exists to compensate for the inconsistency.

(3) THE 1,969 !IMPORTANTS, WITH THE NATURAL EXPERIMENT THAT SETTLES THEM. 68% of layered declarations carry !important (1,946 of 2,865). 4% of unlayered ones do (19 of 455). 99% of every !important in the repo sits inside a layer. The three sheets that were never layered barely use it — that is ADR-018's central claim proven from the opposite direction by code already in the tree, independently of the strip-and-resnapshot experiment.

(4) THE 19 DOUBLE-DEFINED CLASSES, RESOLVED PER PROPERTY. 11 of the 19 are custom-spectrum + eds-steps, and since eds-steps is unlayered it WINS. But the cascade resolves per property, and only THREE produce a real rendering difference, all wizard-only: .text-sm is 12px on seven surfaces and 0.875rem on the wizard, .text-xs is 11px vs 0.75rem, .letter-spacing-05 is 0.5px vs 0.05em. The other 8 are same-value copies where core merely adds !important. .list-refresh-container looked like a fourth and is not — core declares height, eds declares max-height, different properties, both apply. A first pass called all 11 different; that was a broken comparison (stripping !important left a stray space) and is corrected here.

(1) SHEET OWNERSHIP, MEASURED BY BUNDLE REACHABILITY with a positive control. eds-steps.css and connect-services.css reach ONLY the wizard bundle; data-installer.css reaches ONLY dataInstaller; custom-spectrum.css reaches all eight. So "feature sheet" here means one surface, and any class defined in one is invisible everywhere else — which is exactly why the three conflicts above are wizard-only. A first probe used .font-medium and returned YES for all eight; that class is one of the 19 duplicates, so it was finding custom-spectrum's copy. Re-run with classes unique to each sheet and a control that passed.

(6) YES, THERE IS A REAL SEAM IN THE 6,212-LINE FILE, and it is a feature seam. 919 top-level rules split 235 utility-family (.text-, .bg-, .border-, .w-) against 684 feature-family across 102 distinct prefixes. 23 prefixes carry 10+ rules and cover 463 of them: .intflow- 51, .project- 43, .integration- 35, .dashboard- 28, .prerequisite- 25, .sidebar- 24, .architecture- 24, .modal- 21, .template- 21, .wizard- 19, .timeline- 19, .brand- 18, .ai- 18. Most already have a feature directory. THE CONSTRAINT ON ACTING ON IT IS ADR-017: a sheet reaches only the bundles whose entry imports it, so moving .dashboard-* out of the global sheet takes it off any surface that does not import the new sheet — which the reachability map above now makes checkable rather than a guess.

(5) INLINE <style> BLOCKS — and the finding that turned into a deletion. Was 4 components / 16 classes. ConfigurationSummary.tsx held 10 of them, and it is DEAD: ts-prune reports it unused, nothing in src imports it, and its only references are two doc comments and its own test. It is the pre-v6 summary, superseded by BuildYourProjectSummary (the generalization of CommerceSummary) when the nested builder landed in 507bf0629. On 2026-08-30 someone measured its 10 classes as redundant copies and wrote TEN enforcer exemptions for them rather than noticing nothing renders the component — the enforcer was appeased instead of the code deleted, which is the shape this repo forbids. Deleting it cascaded to the whole src/core/ui/components/wizard/ directory: StatusSection and configurationSummaryHelpers had no other consumer, and stepStatusHelpers' only consumer was that barrel. Four source modules, three test files, 10 exemptions, 2 equivalent-mutant ledger rows and 3 mutation-baseline rows. PROOF IT WAS INVISIBLE: all eight bundles are byte-identical before and after, because esbuild had already tree-shaken it. Remaining inline blocks: 3 components / 6 classes.

ALSO CORRECTED: root CLAUDE.md named CommerceSummary as a live component rendered by CommerceStep. It does not exist — it was generalized into BuildYourProjectSummary, which BuildYourProjectStep renders as ONE cross-area summary, not per-area.

WHAT PHASE 3 STILL OWES: ADR-018 is ratified for NEW code and already settles !important and where utilities live. The audit adds three things it does not yet rule on — whether a feature sheet may go unlayered (three do, and the carve-out at 6160 exists because of it), whether a feature block belongs in the global sheet or its own (the 23 seams, gated by ADR-017 reachability), and what to do about the 3 live wizard-only conflicts.
- 2026-09-08  CYCLE RUN 2026-09-08 UNDER THE VISUAL BASELINE, AND IT RETRACTED THE AUDIT'S OWN HEADLINE FINDING. The audit reported three duplicated utility classes whose two definitions genuinely disagree and which therefore made the wizard render differently from the other seven surfaces — .text-sm 14px vs 12px, .text-xs 12px vs 11px, .letter-spacing-05 0.05em vs 0.5px. THAT WAS WRONG. Deleting all ten duplicated utilities from eds-steps.css moved ZERO elements across 48 surface/theme/width captures and 2,700 elements, and a direct probe of the live wizard shows .text-sm computing to 12px, .text-xs to 11px and .letter-spacing-05 to 0.5px — the CORE values all along.

THE RULE I HAD BACKWARDS. Unlayered NORMAL beats layered normal, which is ADR-018's finding and is true. But every core copy carries !important, and author-important beats author-normal whatever the layers say, so the core declarations always won and the eds duplicates styled nothing. The audit reasoned from the layer rule without checking importance, which is precisely the class of claim this item exists to stop being made from reasoning.

THE FINDING THAT SURVIVES, AND IT IS A SEQUENCING ONE: those duplicates were inert ONLY because of the !important. The moment ADR-018's sweep strips !important from the core copies, an unlayered normal duplicate starts winning and the wizard silently diverges. So removing duplicates is a PREREQUISITE for the !important sweep, not cleanup afterwards. That belongs in phase 4's order alongside the layer fix.

TWO INSTRUMENT DEFECTS FOUND BY RUNNING IT, both of the report-clean-while-blind shape.

(1) THE FINGERPRINT COULD NOT SEE LETTER-SPACING. 23 captured properties and letter-spacing was not among them, so the letter-spacing-05 change would have produced an empty diff whatever it did. Extended to 26 with letter-spacing, text-transform and line-height — text-transform because .text-uppercase is duplicated the same way, line-height because a unitless one moves whenever font-size does. This is the same gap class the ADR-018 self-audit found in 2026-08-29 (467 declarations in uncaptured properties) and it had not been closed for typography.

(2) THE !IMPORTANT CEILING COUNTED ITS OWN DOCUMENTATION. stylesheet-bundles.test.ts matched /!important/ against raw file text, so writing three sentences EXPLAINING the !important problem into a stylesheet pushed the count 1,969 -> 1,972 and turned the build red with no declaration added. Seven of the 1,969 were already comment text. The check now strips comments first, with a control asserting the stripped corpus is not empty, and the pin falls to 1,965 — the real declaration count. THE AUDIT'S OWN REPORTED FIGURE OF 1,969 WAS THEREFORE INFLATED; the true count is 1,965, and the drift-up figure quoted from 2026-08-30 has the same error in it.

ALSO: the harness setup control earned its place again. Port 8899 was answered by an unrelated app inside the browser container and returned a JSON 404 for the sentinel; without that check the run would have fingerprinted eight blank pages and reported everything identical.

STILL OPEN, deliberately not changed: .list-refresh-container is NOT a same-value duplicate — core declares seven properties including height, overflow and flex, while eds declares only max-height, so both apply and the element carries two competing height constraints from two sheets. That is a layout decision, not a duplicate removal.
- 2026-09-08  fix(css): delete ten inert duplicate utilities, and two instruments that could not see them (`ee3d7e10d`)
- 2026-09-08  docs(backlog): PL-21 phase 2 — the CSS audit, answered by measurement (`2ffe2ee08`)
- 2026-09-08  refactor(ui): delete the pre-v6 summary — dead since the nested builder landed (`9268c29ae`)
- 2026-09-08  PARKED WITH PHASE 4 (owner, 2026-09-08): .list-refresh-container. It is NOT a same-value duplicate and so was excluded from the duplicate deletion. custom-spectrum.css declares seven properties on it — display:flex, flex-direction:column, flex:1, flex:0 0 auto, min-height:0, overflow:auto, height:min(420px, calc(100vh - 22rem)), transition — while eds-steps.css declares only max-height:calc(100vh - 24rem). Different properties, so BOTH apply and the element carries two competing height constraints written in two sheets that were never read together. Deciding which constraint is right is a layout judgement, not a cleanup, and it needs a look at the repo list actually scrolling. Handle it in phase 4 alongside the layer fix.
- 2026-09-08  PHASE 4 STEP 1 ATTEMPTED AND REVERTED 2026-09-08. The layer fix was implemented and measured, and IT IS NOT BEHAVIOUR-PRESERVING at the resolution we can now see. Nothing shipped. This retracts ADR-018's central migration measurement.

WHAT WAS BUILT. cssInjectionPlugin now prepends `@layer vendor, reset, theme, overrides;` to every injected sheet and wraps node_modules CSS in `@layer vendor` — exactly ADR-018 §1. Verified in the bundle: 25 order statements, 21 vendor wrappers. Separately, 1,946 !important were removed from LAYERED declarations only (custom-spectrum 1861, wizard 57, vscode-theme 25, reset 3), taking the repo from 1,965 to 19 — the 19 being the unlayered sheets, deliberately untouched because an unlayered !important may be beating one of OUR layered rules rather than Spectrum's.

THE MEASUREMENT, against a 2,700-element baseline across 48 surface/theme/width cells:
  layer fix ALONE                              762 of 2,700 elements moved (28.2%)
  layer fix + all 1,946 !important removed     780 of 2,700 elements moved (28.9%)

TWO CONCLUSIONS, AND BOTH CONTRADICT ADR-018.

(1) THE LAYER FIX IS THE CAUSE, NOT THE SWEEP. The sweep adds 18 elements to the layer fix's 762. ADR-018 measured the opposite — "layer fix alone: 23 of ~209 moved; layer fix + 1866 removed: 7 moved" — and concluded the !importants were compensating for the layer wrapper, so that removing both together lands closer to the original than the layer fix alone. That does not hold. At 2,700 elements the sweep does not cancel the layer fix; it adds slightly to it.

(2) 28% IS NOT A CLEAN MIGRATION. The changed properties are line-height 528, height 258, width 258, font-weight 138, font-size 18. Two are visible rather than sub-pixel: INPUT line-height 32px -> 21px, and BUTTON/SPAN font-weight 700 -> 400 — buttons losing their bold, which appears in the layer-fix-only run too, so it is the layer change and not the sweep.

WHY THE OLD NUMBER WAS SO MUCH SMALLER, and it is not that the code changed. ADR-018 measured 209 elements over 16 properties; this measured 2,700 over 26. line-height alone accounts for 528 of the property changes and was ADDED TO THE FINGERPRINT TODAY — it was invisible in August by construction. The ADR's own self-audit predicted exactly this ("467 declarations live in properties the fingerprint does not capture... the sweep would touch declarations whose effect the snapshot literally cannot see") and the prediction was right; it just under-estimated how much.

THE FONT-WEIGHT FINDING MATTERS BEYOND THIS ITEM. !important was not only beating Spectrum — it was resolving conflicts BETWEEN OUR OWN RULES. A declaration that wins today because it is !important may lose to a later or more specific rule of ours once that is removed, and the layer fix alone is enough to reshuffle those. Any future sweep has to treat intra-our-CSS conflicts as a first-class case, not a footnote about vendor styles.

A SCRIPT BUG WORTH RECORDING because it nearly shipped as data. The first strip walked the text with a character buffer and dropped the buffer whenever it met a comment, silently deleting 806 lines from custom-spectrum.css while reporting the correct 1,946 removals. It was caught by a check that the file must equal the original once !important is stripped from BOTH — not by reading the diff, which was 5,338 lines. Rewritten index-based so it can only delete the spans it selected, with a fixture proving a comment mentioning !important survives and line counts do not change.

WHAT THIS LEAVES. The layer fix is correct in principle — unlayered normal beats layered normal, and that is why !important exists here. But applying it moves 28% of rendered elements, which is a redesign, not a refactor. The remaining evidence-bar conditions (a human looks at every moved element; confirm in the Extension Development Host) cannot be met by adjudicating 762 elements one at a time. The next move is the owner's: accept a bounded visual change and review it in batches, or scope the layer fix to one surface at a time so each batch is reviewable.
- 2026-09-09  refactor(css): cycle 7 — eventing to one entry, progress into an existing sheet (`56a169f17`)
- 2026-09-09  refactor(css): cycle 6 — integration flow and build summary leave the god file (`e9e44538d`)
- 2026-09-09  refactor(css): cycle 5 — datapack, and a class the move proved had never worked (`aba424bad`)
- 2026-09-09  refactor(css): cycle 4 — the ai family, and the shape that keeps breaking tests (`3fc37191f`)
- 2026-09-09  refactor(css): cycle 3 — brand and expandable leave together, because they are entangled (`15db8b01b`)
- 2026-09-09  docs(css): ADR-018 carried a measurement this repo has since disproved (`bf0d40af3`)
- 2026-09-08  fix(css): delete 47 selectors that have matched nothing since before Spectrum 3.16 (`4b57bcf1a`)
- 2026-09-08  docs(css): the final lane corrects my own recommendation (`230cfae5b`)
- 2026-09-08  docs(css): research — layers are the fix, co-location is a separate change (`e0c5bf6a5`)
- 2026-09-08  refactor(css): cycle 1 — .prerequisite-* leaves the god file, empty diff (`cce2007bb`)
- 2026-09-08  feat(css): step 1 — the ratchets, and a mover that refuses to lie about pixels (`efa11ba69`)
- 2026-09-08  docs(css): the migration plan — split first, flip second, ratchet all of it (`817690b74`)
- 2026-09-08  docs(css): phase 4's layer fix, measured and REVERTED — 28% of elements move (`620394d48`)
- 2026-09-08  feat(tooling): the net can finally see hover, focus and active (`c47eb6041`)
- 2026-09-09  LOOP 2026-09-08/09: five families moved out of custom-spectrum.css across seven cycles — brand+expandable (31, entangled and unsplittable), ai (18, three entries), datapack (12, unlayered), int+sum (23), eventing+progress (12). 96 rules, every cycle verified by an EMPTY diff across 2,700 elements. Pins 660 -> 564 feature rules and 895 -> 799 total; the file is 6,223 -> 5,545 lines. Also: ADR-018's migration measurement corrected (23/7 replaced by the measured 762/780, and the 'the !importants hold the old rendering in place' conclusion withdrawn), the settled approach written into the ADR for the first time, the handbook's two CSS conventions un-staled, and PL-53 filed for the 351-of-647 classes that appear in no source string. THREE THINGS THE CHECKS CAUGHT THAT READING WOULD NOT: brand could not move alone because two rules cross the family boundary and the leftover still applies, so the diff would have been empty and the split broken; .is-selected has never matched anything (defined only in compound form, counted as styled only because a compound sat in the global sheet) and its two test assertions were redundant with aria-pressed and the background fill; and two suites asserted on where a rule LIVES rather than what it says, one of them defeated by the mover's own @layer wrapper making the first rule per sheet invisible to a brace-splitting parser. Report: .rptc/handoff/2026-09-09-loop-report.md
- 2026-09-09  refactor(css): the dashboard family goes to its own bundle (`06570ca29`)
- 2026-09-09  fix(tooling): the interaction net reported a change that never happened (`af3aaf832`)
- 2026-09-09  feat(tooling): the migration resumes from the repo, not from a conversation (`4d111ad5e`)
- 2026-09-09  refactor(css): the project family goes to one bundle, and tests stop pinning sheet names (`f120aa62f`)
- 2026-09-09  docs(css): ADR-018 §3 amended and adopted — reach, not global (`b6892b7b6`)
- 2026-09-09  Merge loop/2026-09-08-css-migration: 96 CSS rules out of the god file, and the ADR corrected (`cac6c6ac5`)
- 2026-09-09  docs(handoff): the overnight loop report (`ef817c543`)
- 2026-09-09  fix(css): nine selectors declared twice in one sheet become one rule each (`ccecea6c9`)
- 2026-09-09  refactor(css): the Add Integration modal and the wizard rail leave the god file (`8769cf12b`)
- 2026-09-09  refactor(css): the comments come with the rules, and the sheets say who loads them (`5fb5456b5`)
- 2026-09-09  fix(tooling): a compound selector is not entanglement, and cycle 3 paid for it (`3fae0f3ce`)
- 2026-09-09  fix(css): two components were hiding in the utility sheet, and the handbook still had the old rule (`086bdc41c`)
- 2026-09-09  fix(css): the file is 703 lines, and 365 of the 968 were craters I left (`664cea892`)
- 2026-09-09  feat(tooling): the mover emits in source order, and `--verify` is the check the diff cannot be (`002b7dd9b`)
- 2026-09-09  refactor(css): the by-hand lane is empty (`e58bf0850`)
- 2026-09-09  refactor(css): two more by-hand families, and three sheets that were not verbatim (`69bded28d`)
- 2026-09-09  refactor(css): the sidebar takes its own styles, breakpoint and all (`3fbad09df`)
- 2026-09-09  feat(css): ADR-017 §7 — a stylesheet lives where its owner lives (`e0d64d1e3`)
- 2026-09-09  refactor(css): the mover lane is empty — 46 families, 129 rules, four batches (`4539c588a`)
- 2026-09-09  refactor(css): .page-* joins the sheet whose reach it already had (`2f848e1ba`)
- 2026-09-09  refactor(css): the shared Modal leaves, and the last stranded comments go with it (`fa58dd61c`)
- 2026-09-09  refactor(css): the integration card family leaves, and the follow-ups join the work list (`43fb533a7`)
- 2026-09-09  feat(tooling): the work list is computed, not written down (`8da30f396`)
- 2026-09-09  feat(css): ADR-018 step 3 begins — Spectrum layered, sidebar only (`19f092ea8`)
- 2026-09-09  fix(css): three sheets shipped a rule the browser throws away (`47159f69b`)
- 2026-09-09  fix(css): the cascade order was backwards — reset belongs below vendor (`90d2ca07a`)
- 2026-09-09  docs(css): projectsList tried and reverted — step 3 is not a queue (`793897cba`)
- 2026-09-09  fix(css): the reset and every design token stopped shipping in April (`07b2e7521`)
- 2026-09-09  refactor(css): custom-spectrum.css becomes utilities.css (`53c171834`)
- 2026-09-09  refactor(css): one design system — Spectrum's — and tokens.css becomes a map (`2043df846`)
- 2026-09-10  feat(css): ADR-018 step 3 is done — all eight entries layered (`a372b23f1`)
- 2026-09-09  docs(css): ADR-018 gains the two decisions that had no record (`f58b08ad1`)
- 2026-09-10  refactor(css): motion joins the one design system — 84 literals, one scale (`c4432ddd5`)
- 2026-09-10  feat(tooling): the fingerprint can see motion, and it found a rule on its first run (`c47686d00`)
- 2026-09-10  refactor(css): !important goes 1,294 -> 0 (`1a2edfae4`)
- 2026-09-10  refactor(ui): layout parameters become custom properties, not inline styles (`6d6012884`)
