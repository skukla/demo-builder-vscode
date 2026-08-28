# Handoff — build step 10, the workbench redesign

> **SUPERSEDED 2026-08-25 — step 10 was built from this handoff.** The code is
> green and unobserved. Current position, and the four things left before it can
> be archived, are at the foot of
> `.rptc/plans/evaluation-mode/step-10-a-surface-you-can-read.md`. Read the plan,
> not this file; it is kept because its trap list was accurate and paid for.

**Written 2026-08-25 at the end of the session that closed the three holes.**
The next session BUILDS; this file says where things are and what has already
been decided, so none of it gets re-opened.

## Read these, in this order

1. `.rptc/plans/evaluation-mode/step-10-a-surface-you-can-read.md` — the work.
   It carries the reasoning; do not rebuild from this handoff instead.
2. `.rptc/plans/evaluation-mode/overview.md` — where step 10 sits, and the design
   rule that governs it.
3. `docs/systems/evaluation-mode.md` — what already exists and why.

**Read the plan rather than working from this summary.** The overview says why:
*"a fresh session READS the plan instead of remembering it. Two plan-vs-reality
drifts on 2026-08-25 were both caught that way, and both were introduced by
working from memory."*

## Where the code is

- Worktree: `demo-builder-vscode.worktrees/feature/evaluation-mode-dry-run`
- Branch: `feature/evaluation-mode-dry-run`, **3 commits unpushed**
  (`1ce02359c`, `67e137080`, `8a0f39c38`)
- Green as of handoff: 1,152 suites / 15,047 tests · both typechecks · lint at
  baseline (0 errors, 131 warnings) · no import cycles · `npm run compile` clean
- Nothing has been exercised by hand. The three holes closed this session have
  passing tests and no producer use.

## Decided — do not re-open

| Decision | Where it is recorded |
|---|---|
| Keep Claude Code's terminal; render what we control beside it. No custom chat | `.rptc/plans/own-the-chat-surface/overview.md` (PARKED, with what would revive it) |
| No setting to switch between two chats | same file — it doubles what must stay correct, and the non-default rots |
| No general shell-command guard. The one shape worth a narrow `PreToolUse` rule is force-push / hard reset over unpushed work | same file, with the four pieces of evidence |
| Each surface does ONE thing: the library PICKS, the terminal RUNS, the workbench MEASURES | `overview.md`, and step 10 |
| The workbench does NOT fold into the Prompt Library | step 10, "What the Prompt Library actually is" |
| History keys on the piece of work, not the prompt text | `docs/systems/evaluation-mode.md` §5 |
| No eviction preference for saved prompts — built and removed | `evaluationHistory.ts` `appendRun` docstring |

## Start here

The transcript is the bulk of the work and the part the owner can judge on sight.
Build it before the placement work.

Files it replaces or touches:

- `src/features/ai/evaluation/ui/PromptWorkbench.tsx` — the composer moves to the
  bottom; the `Picker` and its "Start fresh" row come out
- `src/features/ai/evaluation/ui/EvaluationVerdict.tsx` — the numbered raw-tool
  list becomes phase bands
- `src/features/ai/evaluation/ui/AgentTraceView.tsx` — same bands, no assistant
  text, no cost
- `src/features/ai/evaluation/ui/usePromptThread.ts` — keeps the thread, saving
  and resuming; loses the list-and-choose part
- `src/features/ai/server/toolNarration.ts` — 103 phrases, zero imports, safe to
  bundle into the webview. Currently used by neither view; that is the defect
- `src/features/ai/evaluation/promptEvaluationService.ts` — capture the run's
  final assistant message, one more field off the JSON

Reference, for design only, not code: `app-builder/tech-case-studio`,
`src/tool-call.ts` and `src/transcript-groups.ts`. Both carry docstrings
explaining WHY they are shaped as they are; read those before designing ours.

## Traps that will bite

- **The sidebar tile is not free.** `AiZone.tsx`'s docstring records a third flat
  tile being withdrawn for pushing the stack past the viewport at zoom. Prove it
  at zoom or fall back to a `Prompts ⌄` menu. Step 10 says this twice because it
  is the easiest thing here to get wrong.
- **`Flex` caps width at 450px.** Use a plain div; add any new `.tsx` with an
  inline style to the documented exceptions in `tests/sop/inline-styles.test.ts`
  or that suite fails.
- **`tests/core/commands/commandManager.test.ts` pins an exact command count**
  (36 today) with a comment deriving it. Changing the commands fails it by
  design — bump the number AND extend the derivation.
- **Webview suites mock Spectrum per file.** Adding a primitive to a component
  breaks every suite mocking that module; the stubs must spread `...props` or a
  `data-testid` is silently dropped. That cost a debugging round this session.
- **`.prettierrc` and eslint disagree about trailing commas.** Running prettier
  on a file breaks lint. Use `eslint --fix`; CI runs eslint, not prettier.
- **Never pipe jest through `tail`/`head`/`grep`**, and the redirect order is
  `> file 2>&1`. A hook blocks the first; the second silently empties the file.

## Open, and NOT part of step 10

- The 37-session survey says agents in demo projects barely use the extension at
  all (`.rptc/backlog/2026-08-25-agents-barely-use-the-tool-surface.md`). The
  owner has said they do not need to ask producers. Until that reading is
  settled, everything after step 10 — `measurement/`, step 09, `opentelemetry/` —
  is building on an unanswered question. Raise it before starting any of them.
- Making the panel live. Fold it into step 10's transcript rather than doing the
  rendering twice.

## Kickoff prompt

```
/rptc:tdd "Build step 10 of Evaluation Mode. Read
.rptc/plans/evaluation-mode/step-10-a-surface-you-can-read.md FIRST, then
.rptc/handoff/2026-08-25-step-10-workbench-redesign.md for where things stand.
Start with the transcript rendering, not the placement work. The worktree is
demo-builder-vscode.worktrees/feature/evaluation-mode-dry-run and it has three
unpushed commits."
```
