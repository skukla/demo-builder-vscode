# Handoff — Evaluation Mode, Phase 1 (not started)

**Branch:** none yet. Start one: `feature/evaluation-mode-dry-run`.
**State of develop:** `f0b4028c9` · full suite **14,815 / 1,132 suites green** ·
tsc, typecheck:tests, eslint, blindspots all clean.
**Plan:** `.rptc/plans/evaluation-mode/` — approved 2026-08-24. `overview.md`
carries the why and the decisions; `step-01`…`step-04` are the executable slices.
This file carries only what a fresh session needs that the plan does not say.

**Kickoff (paste this):**

```
/rptc:feat "Plan is approved, continue to implementation. Plan: .rptc/plans/evaluation-mode/ — start at step-01-dry-run-gate.md. Read .rptc/handoff/2026-08-24-evaluation-mode.md first; it carries the traps and the seam to copy."
```

## What you are building

A **dry-run mode for agent work**. Flip it on and the user chats normally, except
nothing writes: deploys, publishes and deletes report what they *would* have done.
Every call is traced and measured. Then a workbench lets the user refine the
prompt, re-evaluate, run it for real, and optionally save it.

Read the plan for the full shape. **Phase 1 is only the server-side gate** — the
piece that makes mutation impossible rather than discouraged. Do not build the UI
in the same pass.

## Already landed (do not rebuild)

| What | Where |
|---|---|
| Transcript reader (offline/retroactive) | `scripts/trace-session.mjs` + `scripts/trace/` |
| The measurements this plan rests on | `docs/research/2026-08-24-llm-path-measurement.md` |
| What Anthropic documents, and 2 corrections | `.rptc/research/agent-efficiency-measurement/research.md` |
| Four measured optimisation candidates | `.rptc/backlog/2026-08-24-agent-round-trip-optimisation.md` |

The optimisation item is **separate work**. It does not block Phase 1 and Phase 1
does not block it.

## The seam to copy — read this before writing anything

`consentGate` in `src/features/ai/server/inExtensionMcpServer.ts` (`withToolLogging`,
~line 71) already does exactly the shape you need: it is **injected** (so the
module stays vscode-free), it is consulted **before** the handler, and it can
**short-circuit a call and return its own answer**. The dry-run gate is a sibling
of it, not a new mechanism.

Wire it from `extension.ts` the same way `createAgentConsentGate` is wired.

## Traps, each of which has already bitten this repo

1. **Test by EXECUTION, never by reading the flag.** The git-sync hook read an env
   var Claude Code never sets and therefore did nothing on every EDS project ever
   generated — and shipped because its tests asserted the command *string*. Drive
   the real server through `SocketRpc`
   (`tests/features/ai/server/inExtensionMcpServer.testUtils.ts`) and assert a
   mutating tool does **not** reach its handler while a read does.
2. **Do not invent a second classification.** `isReadOnlyToolName` already decides
   which calls are read-shaped (the progress notifier uses it). Reuse it. Two
   classifications will drift.
3. **The result must read as DATA, not an error.** The datapack dry run states the
   rule: "a refusal comes back as `valid:false` with a reason, not as an error."
   An error teaches the agent to retry; data teaches it what would happen.
4. **Dry run must win over consent.** A call carrying `confirm: true` under dry
   run must be blocked by the dry run and must NOT raise a consent dialog —
   asking a user to approve something that will not happen is worse than not
   asking. Order the gates deliberately and test the interaction.
5. **The stub server cannot see registration.** 20 of 22 suites build a fake that
   throws away the tool definition. `tests/features/ai/server/realSdkRegistration.test.ts`
   owns registration; add anything new there too.
6. **Never write a shape you have not read.** If you add `evaluate_prompt` later,
   take its input schema from the handler's payload TYPE, not from the tool name.
   Five defects in two sessions came from inferring a shape; all went green.

## Verification bar

- `gate` before each commit (scoped jest + tsc + typecheck:tests + eslint).
  Whole-repo `npm run lint` before pushing — CI lints everything.
- Phase 1 done means: a mutating tool does not reach its handler under dry run,
  a read tool does, the synthetic result is data, and the consent interaction is
  covered — all asserted by driving the real server.
- If you touch generated bundle content, bump `AI_CONTEXT_VERSION` per the
  `ai-context-authoring` skill, or existing projects never receive the change.

## Decisions already made — do not relitigate

- **Server-enforced, not guidance.** A dry run that occasionally is not dry gets
  trusted and is worse than none. Same reasoning as the `aio` guard shipped
  2026-08-24 as a blocking hook rather than a skill.
- **Status bar toggle.** A mode you cannot see is a trap — the user would ask for
  a deploy, be told "done", and believe it. Precedent: `src/core/build/buildStampUi.ts`.
- **Cost is reported in DOLLARS.** `claude -p --output-format json` returns
  `total_cost_usd`, `usage`, `num_turns`, `duration_ms` and `permission_denials`
  in one object — verified 2026-08-24. So the driven path parses **no
  transcripts**; do not port the reader into `src/`.
- **Grade outcomes, not paths** (Anthropic, researched). The path is a diagnostic
  shown to the user, never a pass/fail criterion.

## Open, owner-actioned

Early-access request for `claude plugin eval` (org-gated by an Anthropic contact).
It evaluates plugins, not standalone MCP servers; the question to ask is whether
wrapping ours as a plugin works. Nothing here depends on the answer.
