# Codebase sweep — 2026-08-25

Run after Evaluation Mode steps 01–05 (dry-run gate, tool self-description, trace
recorder, runner, workbench, per-connection scoping). Roughly 2,400 new lines
across a new feature directory, four new server modules and a new webview.

## Movement since the last sweep (2026-08-11)

| Scan | Last | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **3 groups** | Improved, not by this work. No group contains a new file |
| code-duplication (jscpd) | 64 clones / 0.70% | **72 clones / 0.61%** | Count up 8, DENSITY down. Composition now: 62 typescript, 7 json, 3 tsx. **Zero touch the new code** |
| circular-dependency | 13 cycles | **0 cycles** | Genuinely clean — verified with a planted cycle, which madge caught |
| dead-code doc-drift | 0 | **1** | Real, and pre-existing — see below |
| boundary casts | 40 | **31** | Down 9. The new code adds **zero** |

The cycle result deserves the control it got: a zero from a scan is
indistinguishable from a scan that never ran. `npx madge --circular` against a
planted two-file cycle reported it, so the zero over `src` is a measurement.

## Findings

### 1. An exported constant with no consumer — FIXED IN THIS PASS

- Site: `src/features/ai/evaluation/evaluatePromptCommand.ts:20` —
  `EVALUATE_PROMPT_COMMAND`
- Shape: written to name the command id, then never used, because the id is
  passed to `registerCommand` as a LITERAL so `manifest-mirrors.test.ts` can see
  it. Its sibling `TOGGLE_DRY_RUN_COMMAND` earns its keep — the status bar item
  and two tests read it — which is what makes this one's absence of callers a
  finding rather than a pattern.
- Verdict: an optional export nothing fills is the accepted-but-ignored shape
  this project forbids. Deleted rather than reported.

### 2. Doc drift naming a deleted symbol — PRE-EXISTING, NOT FIXED

- Site: `src/features/project-creation/ui/steps/reviewPredicates.ts:41` —
  comment names `summarizeSelectedAppBuilderComponents`, defined once under
  `src/` and absent now.
- Verdict: real (the scan confirms against `git log`), one line, and **outside
  anything this work touched**. Reported rather than chased — fixing code a pass
  did not otherwise open is scope creep wearing a tidy hat. Cheap for whoever is
  next in that file.

### 3. The two EDS service cards are one shell rendered twice — REAL, NOT IN REACH

**Two independent scans point at the same pair**, which is what lifts it above
the noise:

- jscpd: `DaLiveServiceCard.tsx [71:8-85:12]` ↔ `GitHubServiceCard.tsx [62:2-76:5]`
  (14 lines) and `DaLiveServiceCard.tsx [239:8-252:2]` ↔
  `GitHubServiceCard.tsx [123:16-136:8]` (13 lines).
- component-extraction: both files appear in the `status-text` group.

Opened both. It is not a coincidence of formatting — it is the same service-card
state machine written twice:

    connected  →  CheckmarkCircle + status-text, with a compact variant
    error      →  Alert + status-text-error + a "Try Again" button
    otherwise  →  a service-action-button

Everything that differs is a LABEL or a CALLBACK: `verifiedOrg` vs `user.login`,
`onSetup` vs `onConnect`, "Connect DA.live" vs "Connect GitHub". That is the
shape that drifts — a fix to one card's error state does not reach the other.

**Not fixed here, deliberately.** It is in `features/eds/ui/components/`, which
this work never opened; chasing it is scope creep wearing a tidy hat. It is also
not urgent — both cards work, and the duplication costs a future edit rather than
a user. Recorded with file:line so whoever next touches either card can extract
in the same turn, which is when it is genuinely cheap.

## Considered and rejected

### The composition of the +8 jscpd clones
An earlier draft of this file claimed "7 of the new ones are JSON". **That was
wrong** — 7 is the json TOTAL, not the increase, and the previous run's
per-language breakdown was not kept, so the composition of the +8 is not
recoverable. What IS measurable: none of the 72 involve the new code, overall
density FELL from 0.70% to 0.61% (the tree grew faster than the clones), and the
json clones are config blocks inside `demo-packages.json` plus two schema files
sharing a definition. Recording the per-language split in the baseline below so
the next sweep can answer this properly.

### `resetEvaluationSession` reported as an unused export
`src/features/ai/evaluation/evaluationSession.ts:57`. Used by tests only, and its
docstring says so ("Test seam — reset the flag between cases"). ts-prune cannot
see test-only consumers; this is the documented false-positive class. Keeping it.

### The two `as unknown as` casts in `src/features/ai/server/`
`componentRequirementsTool.ts:47` and `configureProjectTool.ts:58`, both
bundled-JSON-to-declared-type. Pre-existing, and already triaged as RESOLVED in
the 2026-08-21 baseline — the two contract suites in `tests/templates/` enforce
data↔schema and data↔interface, so the casts are check-backed. Neither is on an
ARGUMENT, which is the dangerous position.

### `page-container-padded` (5 files), `status-text` / `icon-label` (4 each)
Layout and text utilities spanning unrelated features — one utility reused, not
one shell rendered N times. The signal is the same SET of files sharing SEVERAL
classes, and none of these groups shares a file set with another.

## Baselines to carry forward

| Scan | Baseline (2026-08-25) |
|---|---|
| component-extraction | 3 groups |
| code-duplication (jscpd) | 72 clones, 0.61% lines — 62 typescript / 7 json / 3 tsx |
| circular-dependency | 0 cycles |
| dead-code doc-drift | 1 (reviewPredicates.ts:41, unfixed) |
| open extraction candidate | EDS service cards (finding 3), unfixed by choice |
| boundary casts | 31 (0 `as any`, all remaining carry 2026-08-21 verdicts) |

Note the cycle baseline is now **0**, which makes the next sweep's job easier and
stricter: any cycle at all is news.
