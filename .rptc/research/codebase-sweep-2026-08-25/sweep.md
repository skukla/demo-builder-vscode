# Codebase sweep — 2026-08-25

Run after Evaluation Mode steps 01–05 (dry-run gate, tool self-description, trace
recorder, runner, workbench, per-connection scoping). Roughly 2,400 new lines
across a new feature directory, four new server modules and a new webview.

## Movement since the last sweep (2026-08-11)

| Scan | Last | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **3 groups** | Improved, not by this work. No group contains a new file |
| code-duplication (jscpd) | 64 clones / 0.70% | **72 clones / 0.61%** | Count up 8, DENSITY down. 7 of the new ones are JSON config (5.1%); **zero touch the new code** |
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

## Considered and rejected

### The 8 new jscpd clones
Seven are JSON config (`json` row: 5.1% duplicated lines) and one is within a
single file. **None cross a feature boundary**, which is the shape that drifts,
and none involve the new code. Overall density fell from 0.70% to 0.61% because
the tree grew faster than the clones. Not a finding.

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
| code-duplication (jscpd) | 72 clones, 0.61% lines |
| circular-dependency | 0 cycles |
| dead-code doc-drift | 1 (reviewPredicates.ts:41, unfixed) |
| boundary casts | 31 (0 `as any`, all remaining carry 2026-08-21 verdicts) |

Note the cycle baseline is now **0**, which makes the next sweep's job easier and
stricter: any cycle at all is news.
