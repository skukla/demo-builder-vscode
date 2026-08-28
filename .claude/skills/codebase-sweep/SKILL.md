---
name: codebase-sweep
description: Out-of-band periodic pass over the CODEBASE — run the duplication, extraction, cycle and dead-code scans together, triage their output against known-noise baselines, and propose evidence-backed cleanups for the user to accept or reject. Use at a release cut, after a large feature lands, or when asked to sweep / audit the codebase for duplication, drift, orphans or cycles. Sibling of `dream`, which does the same for instructions.
---

# codebase-sweep — second-order curation of the code

`dream` audits the INSTRUCTIONS given to the agent. This does the same job for the
CODE, and exists for the same reason: a session doing the work splits its budget
between the task and noticing, and it can only see what it touched. Cross-cutting
duplication is invisible from inside a feature.

It is also the answer to a specific failure. The scans below already existed and
already worked; nothing ran them. Every defect in the 2026-08-04/05 sessions was
found by the user. Drift and orphans now have hooks that fire automatically
(`doc-drift.sh`, `deletion-scan-router.sh`); duplication cannot, because deciding
whether two things SHOULD be one needs judgment. That judgment is what this pass
schedules.

## Hard rules

1. **Propose, never apply.** Write exactly one file — the proposal. Code changes
   happen only after the user accepts specific items.
2. **Every finding carries evidence and a verdict**: file:line, how many sites, and
   whether it is real or known noise. A scan hit is a candidate, never a verdict.
3. **Compare against the baselines below.** A count matching the baseline is NOT a
   finding. Only movement, or a group whose shape says "shared shell", is.
4. **Do not re-derive what the scan skills already say.** Each has its own triage
   section; read it rather than reasoning from raw output.

## When NOT to use
- A single feature you are actively building — that is `reuse-first` at write time.
- Instructions, memory, CLAUDE.md staleness — that is `dream`.
- "Can I delete this symbol?" — that is `dead-code-scan` directly.

## Procedure

Run all six, then triage. ~30s total.

```bash
bash .claude/skills/component-extraction-scan/scan-classnames.sh src   # UI markup
bash .claude/skills/code-duplication-scan/scan.sh src                  # logic (jscpd)
npx jscpd tests --min-lines 20 --min-tokens 140 --reporters console  # TESTS tree (ratchet 160)
bash .claude/skills/circular-dependency-scan/scan.sh src               # cycles (madge)
bash .claude/skills/dead-code-scan/scan.sh src                         # orphans + doc drift
bash .claude/skills/architecture-duplication-scan/signals.sh src       # competing impls
# Boundary-cast audit — silenced type errors (the stackBackend / payload class).
# Quote the glob args (zsh); the second grep drops comment-only lines.
grep -rEn '\bas (any|never)\b|as unknown as' src --include='*.ts' --include='*.tsx' \
  | grep -vE ':[0-9]+:\s*(//|\*|/\*)'
```

### Baselines measured 2026-08-27 (dedup sweep) — a number at baseline is not news

| Scan | Baseline | What movement means |
|---|---|---|
| component-extraction | 3 groups (page-container-padded ×5, icon-label ×4, status-text ×3) — all adjudicated 2026-08-27: variants or shared-component internals, not rebuilds | a NEW group, or one growing past 3 files |
| code-duplication (jscpd) | **66 clones, RATCHET** (was 74 before the 2026-08-27 dedup sweep; 64 on 2026-08-11). Composition: 58 ts + 1 tsx + **7 json** — the JSON clones are config/schema STRUCTURE (registry blocks, schema files), an inert floor, so the meaningful moving number is **59**. Verified deterministic (two identical runs) and set-stable across the sweep's final commits (same 46 file-pairs). Parameter-bound to scan.sh's flags (min-lines 8, min-tokens 60, tests ignored) — a run with different flags is a different metric, not movement | **The count may only FALL.** Any rise must name its new clones with per-clone verdicts (same-job → fix; variant → record here). Zero is deliberately NOT the target: the remainder is adjudicated variants and two-instance pairs below Rule of Three, and forcing those into one shape welds together things that change independently |
| tests-tree duplication (jscpd) | **160 clones / 2.44%, RATCHET** (measured 2026-08-28 baseline; was 167 before the 2026-08-28 dedup pass). Parameter-bound to `npx jscpd tests --min-lines 20 --min-tokens 140` — a different flag set is a different metric. JITTER: the count moves ±1 between identical runs, so a single-digit change is noise, not movement. Composition context: 89 split families lack a shared setup, of which only 20 carry ≥40 duplicated lines (`.rptc/plans/architecture-test-convergence/family-worklist.json` ranks all 89; total removable ≈2,446 lines) | **The count may only FALL.** Zero is NOT the target: per-suite mock isolation is ratified policy (webview-test-authoring §2) and 42 of the 89 families are legitimate size-splits. The target is an ADJUDICATED FLOOR — every remaining clone either carries a named reason or sits on the worklist. A rise means a new family or a copy-pasted preamble: name it and fix or adjudicate |
| circular-dependency | 0 cycles (the 2026-08-24 consolidation broke all 13; re-verified 2026-08-27 over 914 files) | ANY cycle is new and real |
| dead-code doc-drift | 0 | any hit is real — it is confirmed against `git log` |
| boundary-cast audit | 40 (6 `as never`, 34 `as unknown as`, 0 `as any`) — measured 2026-08-21 after the full first triage (all 55 original sites opened) plus the partial-HandlerContext resolution | any `as any`; any NEW cast; any existing cast on an ARGUMENT to a collaborator (see triage). Remaining sites all carry verdicts: `as never` — 1 documented Spectrum shim (CardActionsMenu), 4 in AddIntegrationFlowAdapter + 1 in stackComponentCollector (both deferred INTO the untyped-channels backlog item). `as unknown as` — ~16 bundled-JSON-to-declared-type consts (RESOLVED — the two contract suites in tests/templates/ enforce data↔schema and data↔interface; the casts stay but are check-backed; `../complete/2026-08-21-bundled-config-json-is-cast-not-validated.md`), the ~7 partial-HandlerContext casts (RESOLVED — callee parameters narrowed to the fields they read; `../complete/2026-08-21-partial-handler-contexts-cast-to-full.md`), 4 wizard-state/request launderings in createProjectTool + executor + 2 generic handler-wrapper casts in addIntegrationFlowHandlers (untyped-channels item), rest local DOM/stream/library shims. Every non-benign cluster has a backlog home — a future sweep reports MOVEMENT against this, it does not re-triage |

Prior: 2026-08-11 — 4 groups · 64 clones/0.70% · 13 cycles · 0 drift. 2026-08-05 —
9 groups · 61 clones/0.65% · 13 cycles · 0 drift. The component-extraction
drop from 9 to 4 was the `step-view`/`step-nav` shell being extracted, not the scan
weakening; 4 → 3 is the EDS-7 ServiceCardShell extraction.

Re-measure and update this table whenever the sweep runs; a stale baseline turns
every finding into noise.

### The adjudicated-variant watchlist — do NOT re-litigate, DO watch for the trigger

Every pair below was OPENED AND READ on 2026-08-27 (the dedup sweep) and left
deliberately: a variant whose differences are load-bearing, or a two-instance
pair below Rule of Three. A sweep that re-flags one of these reports "still at
baseline" — UNLESS its trigger fired, which converts it to a finding:

| Pair | Verdict | The trigger that converts it |
|---|---|---|
| `useComponentConfig.updateField` ↔ `useConfigureFieldValues.updateField` (wizard vs Configure) | two instances, byte-identical — carries the PAAS_URL→GraphQL linked-field rule TWICE | ANY edit to either hook: extract `buildFieldWrites` FIRST, then make the edit. The most drift-dangerous pair on the list |
| prerequisites `checkHandler` ↔ `continueHandler` per-node variant checks + payload builders | variants: different major-resolution inputs, different message fns, continue writes shared state mid-build | a third handler joining the family, or the id-mapping question resolving as a bug (see the check's `resolveRequiredMajors` vs continue's `getNodeVersionKeys` — investigated 2026-08-27, verdict on PL-8) |
| auth `handleCreateAdobeProject` ↔ `handleCreateAdobeWorkspace` prologues | deliberate entity mirror, noun-parameterized | a third entity-create handler |
| updates `applyBlockLibraryUpdate` lookup ↔ `applyBlockLibraryUpdateResolved` lookup | the wrapper's copy is a pre-dialog guard; removing it prompts users for no-ops | the lookup logic itself changing (then extract `findInstalledLibrary`) |
| `githubRepoOperations` internal response→GitHubRepo mapper ×2 | two instances | a third mapping site |
| ai/server `write_page` + `delete_page` openers vs `openPathCall` | variants: write_page's resolve opts depend on a parsed flag; delete_page's confirm gate sits mid-prologue | either constraint dissolving |

### Reading the UI scan — shape beats count

The signal is not "N files share a class". It is **the same SET of files sharing
SEVERAL classes** — that is one shell rendered N times, not one utility reused.

Worked example (2026-08-05, real): `step-view`, `step-nav-area`, `step-nav` and
`commerce-body` each appeared in exactly `CommerceStep.tsx`, `IntegrationsStep.tsx`
and `StorefrontStep.tsx`. Four classes, one identical trio — a shared step shell
that was never extracted. Meanwhile `page-container-padded` spanned 5 unrelated
files and is simply a layout utility doing its job. Same scan, opposite verdicts.

Second signal: a class named after a component appearing in files that are NOT
that component (`choice-card-name` in two files plus `ChoiceCard.tsx`) — consumers
reimplementing its internals instead of using it.

### Triage rules

- **Cycles**: type-only cycles (`import type`) are harmless; a runtime cycle in the
  same feature usually wants one file split. Check which before proposing.
- **jscpd**: clones INSIDE one file or one test suite are usually fine. A clone
  spanning two features is the finding — that is the shape that drifts.
- **ts-prune**: entry points and DI/config-registered symbols report as unused. The
  `dead-code-scan` skill lists the false-positive classes; apply them.
- **Rule of Three**, with the standing override: if the same behaviour has already
  been FIXED separately on two surfaces, that is demonstrated drift and it extracts
  at two.
- **Boundary casts**: what matters is POSITION, not count. A cast on an ARGUMENT
  handed to a collaborator (`client.startImport(request as never)`,
  `authManager: authManager as never`) is the class that produced four silent
  production no-ops (CLAUDE.md "A cast at a call boundary is a silenced type
  error") plus the five webview payload bugs — the collaborator dispatches on a
  field the cast hides, and mocks cannot see it. A cast adapting a browser/DOM
  API quirk inside one function (`timer as unknown as { unref?... }`) is noise.
  Fix shape: build the object the callee declares, or widen the callee to
  `unknown` where it treats the value as opaque (the 9144bee9 comm-manager
  precedent) — never delete the cast by loosening the assertion.
- **Relay chains** (guided, no scanner — judgment decides): a value passed
  through ≥3 hops that never READ it, only forward it, flags a missing
  boundary (a shared declaration, a context, a deps object). Raw threading
  depth is NOT the signal — a long compiler-checked chain is verbose but
  safe; a rename lights up every hop. What matters is (a) RELAY-ONLY hops,
  because each one re-states the name/shape and re-statements drift (the old
  dashboard entry was a pure relay with its own hand-typed payload copy —
  where `brandName`/`initialMeshStatus` rotted), and (b) any UNCHECKED hop
  (`unknown`/cast/`Record`) — everything downstream of it is convention-only
  regardless of depth. Fix shape: one shared declaration spread through
  (webviewPayloads precedent), or a deps object whose consumers declare
  `Pick<>` of what they read (the 3df264c6 HandlerContext precedent) — a bag
  WITHOUT per-consumer Picks just trades threading for partial-construction
  casts, which is how seven of them accumulated.
- **Call-site signals** (measured 2026-08-21 — raw fan-in is NOT one of them;
  a popular function with a small stable contract is architecture working):
  - *Fan-in × weak contract*: rank callees by caller count, flag those whose
    return type is unchecked. `parseJSON<T>` is the worked example BOTH ways:
    33 casting call sites nominated it, and the per-site audit ACQUITTED it —
    every site null-checks and optional-chains, because its inputs (aio CLI
    output, user files) fail routinely and routine failure forces defense.
    Counts nominate; reading decides. Corollary recorded from the same audit:
    drift hides where nothing ever visibly fails (bundled configs rotted;
    battle-hardened CLI parsers did not). Audit record:
    `.rptc/complete/2026-08-21-parsejson-call-sites-are-unchecked-casts.md`.
  - *Policy-function bypasses*: for a function that encodes a policy
    (getProjectDisplayName, withOrgContext, credential resolution), the
    dangerous count is sites doing its job BY HAND — grep the raw access the
    policy wraps and diff against its callers. Four missed display-name
    sites were this class; a brand type is the durable fix.
  - *Caller-halo duplication*: N sites wrapping the same callee in the same
    surrounding ritual = missing helper. Recipe: normalized ±4-line windows
    around each call site, cluster identical shapes (a ~30-line script; see
    the sweep that added this). MEASURED characteristics: high precision,
    LOW recall — 3 probes found 1 real lead (an ensureAdobeIOAuth
    guard/cancelled-message pair, 2 sites, Rule-of-Three says wait), while
    the healthy post-extraction case (withOrgContext, 26 sites) and the
    known-duplicated case (parseJSON) both showed fully diverse halos. So:
    use it to FIND leads, never to conclude absence. The high-precision
    detectors for consolidation remain the incident triggers the house
    already runs on: the same FIX applied at ≥2 sites (extract-at-two
    override), the same BUG recurring at ≥2 sites, and a two-surface
    disagreement (architecture-duplication-scan). After consolidating,
    blessed residual duplication gets a coverage test
    (webviewHandlerCoverage / getRegisteredTypes-loop precedent).

## Output

One file: `.rptc/research/codebase-sweep-<date>/sweep.md`.

```markdown
# Codebase sweep — <date>

## Movement since last sweep
| Scan | Last | Now | Verdict |

## Findings (evidence + sites + verdict)
### <title>
- Sites: file:line ×N
- Shape: <why this is one thing rendered N times, not N legitimate uses>
- Proposal: <extract to X / split Y / delete Z>
- Cost: <rough>

## Considered and rejected
### <candidate> — <why it is legitimate>

## Baselines to carry forward
<the updated table>
```

Rejected candidates are not filler: without them the next sweep re-litigates the
same nine groups from scratch.

## Verify
1. Every finding names real file:line pairs — open one and confirm before proposing.
2. Every scan's count is compared to the baseline, not reported raw.
3. The proposal file is the ONLY thing written. No code touched.
