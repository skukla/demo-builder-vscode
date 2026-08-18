# Phase 6 — Hooks, then agents

**Status:** PLANNED 2026-08-17, not started. Last phase in the program.

**Scope, decided before anything else.** "Hooks" here means hooks **shipped into a generated
demo project**, not this repo's dev-time hooks. The program is about the agent working in a
user's demo project; this repo already has 8 hooks + 6 rules for its own development and they
are not the subject. Same for agents: `.claude/agents/` in the generated bundle.

## What is actually there today — measured, not assumed

| Fact | Where |
|---|---|
| The bundle ships exactly **one** hook: PostToolUse git-sync, EDS projects only, plus a home-Chat variant | `claudeSettingsWriter.ts:53`, `:146` |
| The writer's type supports **PostToolUse only** — `ClaudeSettings.hooks` has one key | `claudeSettingsWriter.ts:36-40` |
| The merge identifies "our" hook by a hard-coded signature substring, and handles exactly **one** | `GIT_SYNC_SIGNATURE`, `isGitSyncHook`, `mergeClaudeSettings:103` |
| Hook commands are shell strings; an unsafe path installs **no hook, silently** | `SHELL_METACHAR_RE`, `buildGitSyncCommand:260` returns `''` |
| The bundle ships **zero** agent definitions | no `.claude/agents/` writer exists |
| 15 skill templates ship | `src/features/project-creation/templates/skills/` |

So the Enforcement axis's "one hook, and it syncs rather than guards" is exactly right, and the
gap is specific: **nothing shipped can stop an agent doing the wrong thing.** A PostToolUse hook
runs after the fact.

## The governing lesson — a hook that fails silently is worse than none

The git-sync hook read `$CLAUDE_TOOL_INPUT`, an env var Claude Code never sets. `TOOL_FILE` was
always empty, the path guard never matched, and **the hook silently did nothing on every EDS
project ever generated.** The original author flagged the assumption as unverified; it was wrong
(`claudeSettingsWriter.ts:197-210`).

Two rules follow, and they are not optional:

1. **Pin the behaviour by EXECUTING it, never by grepping the command string.** That is how the
   extractor is pinned now, and it is the only reason we know it works.
2. **The metachar guard's silent `''` is a second instance of the same shape.** A user with an
   apostrophe in their path gets no hook and no message. Any new hook must either report that it
   was skipped or not use this mechanism.

## Part A — hooks

### The bar a candidate must clear

1. The trap is **measured**, not theorized.
2. An agent can **reach** it with tools it has.
3. A hook can **detect** it from tool name + input alone, before the call.
4. Guidance has not fixed it, or structurally cannot.

### Candidates, scored

| # | Candidate | Bar | Verdict |
|---|---|---|---|
| A | **The `aio` global-selection conflict** | all four | **Build this** |
| B | Datapack import started without a dry run | fails (3) | Drop |
| C | `commerceInstance` guessed | fails (4) | Drop — already enforced in the handler |
| D | Percent-encoded PDP paths written into storefront files | passes (1,2), (3) is fuzzy | Defer; revisit if it recurs |
| E | 19 tools mutate state ungated | fails (3) | Not a hook — a code fix, and explicitly outside this program |

**Why A is the one.** Two org-targeting models coexist in one project. The extension targets
`aio` per-operation via `withOrgContext` and deliberately stopped writing the CLI's process-global
selection (`orgContextEnv.ts:116-122`). The `commerce-extensibility` MCP the extension itself
installs ships `aio-configure-global`, `aio-app-use` and `aio-where`, which write and read exactly
that global state. The failure already happened from a single unwrapped internal call:
**`deployMeshHeadless` deployed into a DELETED project for two days.**

It clears every clause. Measured, with a named incident. Reachable — we install the tool that does
it. Detectable from the tool NAME alone, which is the cheapest possible match. And unfixable by
guidance, because the other MCP's tools are equally discoverable and equally well described; our
skill saying "don't" competes with their tool saying "do".

**The precedent is in this repo and it works.** `.claude/settings.json:36-42` wires a PreToolUse
matcher that already includes `mcp__*` regex patterns, and `rules/10-jest-pipe.rule` blocks a
matching call outright. The mechanism needs no discovery — only porting.

### Recommended shape: one inline hook, NOT a router

This repo's `router.sh` + `.rule` files is the better architecture at 6 rules. At **one** rule it
is the wrong trade: shipping a router means new bundle FILES, which means `GeneratedFileWriter`
hash-and-skip, removal-with-proof, and a per-file user-edit story — a large surface for one guard.
Rule of Three. Start inline; extract a router if and when a third rule appears.

Open design question, to settle before writing code: **block or warn?** Blocking is honest but a
user legitimately running `aio` CLI work outside Demo Builder would be stopped. Warning preserves
the escape hatch but is ignorable. Recommendation: **block, with the message naming the
Demo-Builder tool that does the job properly** — a block the agent can route around is a nudge,
and nudges are what failed here.

### Engineering work this actually requires

Roughly in order; the hook command itself is the small part.

1. **Extend the type**: `ClaudeSettings.hooks` gains `PreToolUse`. Currently one key.
2. **Generalize the merge.** `mergeClaudeSettings` drops-and-re-adds by one hard-coded signature.
   Two hooks need two signatures and a merge that preserves the user's own entries in BOTH lists.
   This is the real cost of the phase, and it is paid once.
3. **Build the guard command** — matcher on the three `aio-*` tool names, refusal message naming
   the alternative.
4. **Test by EXECUTION.** Feed the hook a real PreToolUse payload on stdin and assert it blocks;
   feed it an unrelated tool and assert it does not. Grepping the command string proves nothing —
   see the governing lesson.
5. **Decide the gate.** The git-sync hook is EDS-only. This guard is relevant to any project that
   gets the App Builder tooling, so it likely rides `projectNeedsAppBuilderTooling` — the same
   predicate as the ai-defaults entries, applied at all four seams (`ai-context-authoring`).
6. **Bump `AI_CONTEXT_VERSION`** (10 → 11) with a note. Without it no existing project ever gets
   the hook — the activation sweep is driven by that stamp.
7. **Regenerate parity**: "Regenerate AI Files" must produce it for a project that qualifies later.

## Part B — agents

### The finding: the one flow that qualifies already has an orchestrator, and it is a skill

The phase's own bar is "agents only where a flow spans 3+ skills with a required order". Exactly
one flow clears it — the EDS site-scraping cluster, whose order is stated in the skills' own
descriptions:

    scrape-reference-site
      → commerce-block-mapper · header-nav-footer · demo-data-injector   ("after a reference site is scraped")
      → refine-visual-match                                              ("after blocks have been authored")

Five skills, a genuine required order. **And `scrape-reference-site` is already the orchestrator** —
its own description reads "Orchestrates the EDS site-scraping workflow… Routes between the Mod
Agent and Playwright MCP." The routing job an agent definition would do is already done, in the
cheaper form.

Add the standing constraint — *"Do not add agents to save tokens. Measured: a ~121,000-token
derivation was performed BY a subagent. Isolation moves where cost is paid; it does not reduce
it"* — and the conclusion is that **Part B ships nothing.**

That is a finding, not a gap. Recording it is the deliverable: the Roles axis reads "no agent
definitions ship at all" as though it were a hole, and the next person should not read it that
way. The axis should say: one flow qualifies, it is already orchestrated by a skill, and adding an
agent would duplicate it.

**Re-open only if** a flow appears that spans 3+ skills AND has no natural orchestrator skill AND
the ordering is being got wrong in practice. All three, with evidence.

## Sizing

Small. One hook, one merge generalization, one axis-row correction. If the outcome is a single
PreToolUse guard and a documented "no agents", that is the right size — the same judgement phase 5
made when it shipped one corrected skill and one new one.

## Non-negotiables

- Test the hook by **executing** it. This is the phase's whole lesson.
- `AI_CONTEXT_VERSION` bump, or existing projects never learn.
- All four gate seams move together, or creation and regenerate produce different bundles.
- Every bundle write through `GeneratedFileWriter`.
- Docs to sync: `src/features/ai/README.md`, `src/features/CLAUDE.md`, `docs/systems/mcp-server.md`.

## Before starting — two things to re-measure

Both are cited from 2026-08-16 and this program's own numbers have rotted within hours before.

1. **Does `commerce-extensibility` still ship those three tools?** The whole case for hook A rests
   on it. One live probe.
2. **Is the global selection still meaningless to us?** Confirm `orgContextEnv.ts:116-122` still
   holds. If the extension ever starts writing the global again, the conflict dissolves and the
   hook becomes wrong.
