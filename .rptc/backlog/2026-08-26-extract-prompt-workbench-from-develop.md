---
id: AI-3b
kind: feature
area: ai
needs: []
value: high
status: shipped
---

# Take the Prompt Workbench off develop and onto its own branch

The owner is not convinced the Workbench is worth keeping and asked for it on a
feature branch so it can be revisited deliberately. It is currently on develop,
switched off by `demoBuilder.ai.enableEvaluationTools` (default false), so
nobody meets it — but unfinished work is sitting in the mainline.

`feature/prompt-workbench` was cut at `a6c32963e` so nothing is lost whatever
develop does next.

## Why this is surgery, not a revert

Measured 2026-08-26:

- **10 commits touch `src/features/ai/evaluation`, and 7 of them mix it with
  other `src/` work.** Reverting by commit drags unrelated changes out.
- The directory is **4,882 lines across 21 files** and holds **two features**,
  not one:
  - the Workbench — `EvaluationWorkbench`, `PromptWorkbench`,
    `EvaluationVerdict`, `usePromptThread`, `evaluationSession`,
    `evaluationHistory`, `evaluationSuggestions`, `promptEvaluationService`,
    `evaluationServer`, `evaluationMcpConfig`, `evaluatePromptCommand`
  - the agent trace — `agentTraceReport`, `AgentTraceView`,
    `agentTraceHandlers`, `traceRecorderAccess`, `transcriptPhases`,
    `Transcript`. This serves [[AI-2]] ("can you see what the agent is doing"),
    which is a DIFFERENT question and may well be worth keeping.

So the removal is forward-only — delete what goes, in one reviewable commit —
and the first real task is deciding where the line between those two runs.

## The seam is small

Only three files outside the directory reference it: `extension.ts` (three
imports), `commands/commandManager.ts` (one command), and
`ai/server/evaluationTools.ts` (the MCP side).

## Do NOT take dry run or consent with it

Both are standing safety features that ship and work:

- **dry run** — agent reads allowed, every write simulated, enforced in
  `inExtensionMcpServer` before any non-read tool runs
- **consent** — VS Code asks before an agent runs a destructive operation

The dependency runs one way: the Workbench hard-wires its own dry run; dry run
knows nothing about the Workbench. `a6c32963e` already un-gated the dry-run
toggle after it was wrongly hidden with the evaluation commands.

## Open

- **Where does the trace go?** Keeping it means splitting the directory, which
  is most of the work. Dropping it with the Workbench loses [[AI-2]]'s only
  implementation.
- **Does the gate survive?** If the Workbench leaves, `evaluationGate` and the
  `enableEvaluationTools` setting go with it — unless the trace stays and wants
  the same treatment.
- **Decide by opening it first.** [[AI-3a]] has been `built` and unopened since
  it shipped; removing it without ever looking is as uninformed as keeping it.

Filed 2026-08-26.

## Shipped so far

- 2026-08-27  REMOVED from develop. The split turned out clean: the trace viewer has zero references to any workbench module, so the whole .rptc-style folder left together — 33 files, ~6,400 lines, plus 10 orphaned types, the evaluationHistory field nothing wrote, and the enableEvaluationTools setting that had nothing left to hide. Kept: dry run + consent (never depended on it) and the ToolTraceRecorder (nothing reads it; it is what AI-2 needs). Everything is on feature/prompt-workbench. Gate green: 1150 suites, 14989 tests.
- 2026-08-27  Agent dry run moved too, on a second look. It was kept in the first pass for not depending on the workbench — which is not a reason to keep something. Default OFF so it protected nobody unless switched on, AND item.show() was unconditional, so every user carried a permanent 'Dry run off' status bar item for a mode nobody had turned on. 119 src lines + 370 test lines + the enforcement branch in the core MCP server. Consent stays: default ON, asks before each destructive agent operation, doing work for every user right now.
