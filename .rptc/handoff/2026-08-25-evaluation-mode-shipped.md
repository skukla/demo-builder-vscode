# Handoff — Evaluation Mode, steps 01–07 shipped

**Branch:** `feature/evaluation-mode-dry-run`, 35 commits, **pushed**.
**Gate at handoff:** 1,150 suites / 14,988 tests green, both typechecks clean,
whole-repo lint 0 errors (131 pre-existing warnings — that is the baseline),
build succeeds.

## Read these first, in this order

1. `docs/systems/evaluation-mode.md` — what exists and how it works.
2. `.rptc/plans/evaluation-mode/overview.md` — the step table and every decision
   the owner made, with dates.
3. `.rptc/plans/evaluation-mode/prompt-threads/overview.md` — **the next work.**

## What shipped

| Step | Ships |
|---|---|
| 01 | The dry run: agent mutation is impossible, not discouraged |
| 01b | Every tool declares read/write, carries an authored phrase, and the consent dialog names its target |
| 02 | The trace recorder — reads included, with an argument fingerprint so repeats are computable |
| 03 | One evaluation runner behind two doors (`evaluate_prompt` + a command) |
| 04 | The workbench: try, read the verdict, apply a suggestion, run for real, save |
| 05 | An evaluation gets its OWN dry-run server, so it stops pausing the window |
| 06 | Per-tool session grants, only where repeating is recoverable |
| 06b | Consent asked in the chat, VS Code modal as the floor |
| 07 | History survives a reload |

## KNOWN BROKEN — do not re-diagnose

**Refining a prompt destroys its history.** History keys on exact text, so
"down from $0.24" only appears when re-running something UNCHANGED — the one case
where nothing improved. Two related gaps: a saved prompt cannot be loaded back
into the workbench, and suggestions never see the prompt so they advise naming a
project in a prompt that already names it.

All three are one problem and all three are specified in `prompt-threads/`.
**Do that before any further workbench work** — it changes the storage step 07
shipped, and doing it later means migrating twice.

## Open, and none of it blocks

- **06b's remaining check.** Does an interactive session RENDER a usable consent
  prompt? Four attempts failed on config paths and tool-search deferral, never on
  elicitation itself. The design does not depend on the answer (anything that is
  not an explicit accept is a refusal), so this decides only whether the chat path
  is worth keeping. Record: `.rptc/research/consent-in-the-chat/`.
- **`measurement/`** — the held-out prompt set. Blocks step 09 absolutely.
  The owner answered its source question: mine existing chats AND map tasks from
  the code. A survey is already in the sub-plan.
- **`opentelemetry/`** — task one is DONE and changed its shape: no traces exist,
  we need a SINK not an exporter, and our own tools arrive anonymised as
  `mcp_tool`. Record: `.rptc/research/claude-code-telemetry/`.
- **Step 09** — Claude-written suggestions. Blocked on `measurement/`.

## Owner decisions that are settled — do not reopen

- **Claude Code's own permission checks stay OFF.** The interruption cost is
  real. Consequence: our gate covers OUR tools only, and that limit is now stated
  in `docs/systems/agent-alerts.md`.
- **Telemetry is local-only, no vendor.**
- **Suggestion cost is ours, not the prompt's** — it must never enter the number
  a producer is trying to reduce.
- **Held-out prompts come from both sources** (chats + code map).

## Traps this session paid for

- **A `str.replace` with no assert reports success whether or not it matched.**
  It silently dropped a whole plan rewrite once, and a falsification run twice.
  Assert that the edit landed before believing a result.
- **A zero from a truncated capture is not an absence.** A 4,000-byte cap on an
  OTLP capture nearly produced "Claude Code does not report tool use".
- **`ENABLE_TOOL_SEARCH` is settings-only.** Override per run with
  `--settings '{"env":{"ENABLE_TOOL_SEARCH":"false"}}'` or an MCP probe tool is
  invisible while its server is connected fine.
- **Probe configs in `.rptc/research/` are RELATIVE** (public repo, no home
  paths). Generate a runnable one with `.rptc/research/probe-config.mjs`.
- **`git status --short` collapses a new directory to one line**, so a
  changed-files lint can skip a whole new feature. Lint new directories
  explicitly.
- **The MCP socket name is shared across worktrees** — last host to start owns
  it. Close other windows before testing.

## Filed today, unrelated to the next step

- `2026-08-25-agents-barely-use-the-tool-surface.md` — 104 tools, and a survey of
  37 real sessions found almost none being used. Worth more than the battery it
  came from.
- `2026-08-25-eds-service-cards-are-one-shell.md` — verified duplication, fix it
  when someone next opens either card.
- `2026-08-25-claude-code-disk-footprint.md` — `~/.claude` is 2.2 GB, growing
  ~4 GB/year, unreported.
- `2026-08-25-resume-a-past-chat.md` — the Chat tile reaches only the most recent
  of 45 conversations; Claude Code already ships the picker.

## Not committed

The manual test plan lives in the session scratchpad and will be gone. If testing
has not happened yet, ask the owner for its results — they are the input to
whatever comes next.
