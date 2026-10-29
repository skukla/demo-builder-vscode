# ADR-025: Demo Builder serves the SC's agent — Copilot in VS Code by default

**Status**: Accepted (owner-approved 2026-10-06). Supersedes the harness claim of
[ADR-004](004-claude-code-harness.md) ("Claude Code (CLI) is the harness"). Narrows
[ADR-019](019-claude-code-delivery-terminal-only.md): terminal-only delivery now holds for
the two terminal agents, not for every agent.

**Date**: 2026-10-06

Related: `.rptc/plans/copilot-first-agent-support/` (AI-12), [mcp-server.md](../../systems/mcp-server.md),
[ai-agents.md](../../systems/ai-agents.md).

---

## Context

ADR-004 made Claude Code the one AI harness, and ADR-019 made its delivery a terminal
running the `claude` CLI. Both were right for the tools available in May–August 2026.

What moved is a tooling policy, not our judgement of the technology: GitHub Copilot is the
agent colleagues are required to use, and VS Code now ships Copilot built in, with an agent
mode in its own chat panel. An extension that only knows how to open Claude Code leaves
those SCs with a Chat button that leads nowhere.

The facts that decided it, each measured on 2026-10-06 against VS Code 1.140 and Copilot
CLI 1.0.91:

1. **VS Code's chat takes a prompt from an extension.** `workbench.action.chat.open` with
   `{ mode: 'agent', query, isPartialQuery: false }` opens the panel in agent mode and runs
   the prompt. That is the capability ADR-019 rejected the Claude Code extension for
   lacking, so the rejection does not carry over to Copilot.
2. **The panel finds our tools with nothing installed.** The window is homed at the
   projects root, and VS Code discovers that folder's `.mcp.json`. A live "List my
   projects" in the panel called `mcp_demo-builder_list_projects` and answered correctly.
3. **The 128-tool cap does not bind.** Models with tool search (GPT-5.4 and newer, Claude
   4.5 and newer) receive all 158 of our tools as deferred and load them by `tool_search`;
   older models group them behind `activate_*` tools. Neither drops one. Record:
   `.rptc/plans/copilot-first-agent-support/step-06-tool-budget.md`.
4. **The Claude option in VS Code's panel is not Claude Code.** It runs Anthropic's agent
   SDK on the Copilot subscription. An SC who uses their own Claude subscription still
   needs the CLI, and the Claude Code VS Code extension still cannot take an injected
   prompt (ADR-019's rejection stands).

## Decision

**`demoBuilder.ai.engine` names the agent, and one module resolves it.**
`src/features/ai/engine/agentEngine.ts` describes each engine (its launch) and resolves the
setting; `src/features/ai/engine/activeEngine.ts` reads it and answers which one this window
serves and whether it can start. The Chat launch (`src/commands/openInClaude.ts`)
and the "AI Ready" badge both ask it, so they cannot disagree.

| Engine | Chat opens | MCP config it reads |
|---|---|---|
| `copilot-vscode` (**default**) | VS Code's chat panel, agent mode, prompt submitted | the projects root's `.mcp.json` |
| `claude-code` | a "Claude Code" terminal: `claude -- '<prompt>'` (ADR-019, unchanged) | `.mcp.json`; `~/.claude.json` when registered globally |

**Copilot in VS Code is the default even when Claude Code is installed** (owner,
2026-10-06): the panel is the experience Demo Builder promotes.

**Copilot CLI is not a Chat engine** (owner, 2026-10-06). It shipped as a third option, with
`auto` to choose between the CLIs, and both were removed the same day: same subscription and
models as the panel, so to an SC it was a technical choice they should not have to make.
Any value but `claude-code` — including a stale `copilot-cli` or `auto` — resolves to the
default. Its tools still reach an SC who runs `copilot` themselves: it reads the projects
root's `.mcp.json` in a trusted folder, and "Register Global MCP" writes
`~/.copilot/mcp-config.json` (`GLOBAL_MCP_CONFIGS` — a list of agent CLIs, deliberately
not the engine list).

**`demoBuilder.ai.permissions` (`ask` | `auto` | `full`) sets how much Claude Code may do
without asking**, as its own flags (`--permission-mode auto` /
`--dangerously-skip-permissions`). VS Code's chat takes no launch argument for it, so the panel follows VS
Code's own `chat.permissions.default`.

**Consent is unchanged, and agent-independent.** A destructive call is asked about in the
chat by MCP elicitation, with the modal dialog as the fallback. VS Code renders the
elicitation in the chat panel; in the 1.140 source its local elicitation path has no
Autopilot auto-answer (Autopilot auto-answers the model's own `ask_user` tool, not a
server's elicitation) — read in the code, not yet watched live with a destructive call; headless
`copilot -p` declines it at once, which is a refusal, exactly as headless `claude -p` does.
So at every permission level the SC sees Demo Builder's own question, named in its words —
the one prompt that survives an agent told to ask nothing.

## Consequences

**Positive.** An SC with only Copilot gets a working Chat button, the prompt library and
all the tools with nothing to install. The terminal path is kept, unchanged, for SCs on
their own Claude Code subscription.

**Negative.** Three launch paths to keep working instead of one; each has a live check in
the RC test plan. At the `ask` level a destructive call is asked about twice — once by the
agent's generic tool approval, once by ours — which is the cost of keeping ours at every
level.

**Neutral.** Registering the server with VS Code through
`vscode.lm.registerMcpServerDefinitionProvider` (plan step 05) is not built: while the
window is homed at the projects root its `.mcp.json` already connects, and a second
registration would list every tool twice.

## Alternatives rejected

**VS Code's panel for Claude users too.** Its Claude option bills Copilot and does not use
the SC's own Claude subscription (fact 4).

**Building a tool budget** — tool sets, consolidation, or a default subset (plan step 06).
The measurement showed no tool is dropped; with deferred tools what matters is that each
description lets the search find it, which `mcp-tool-authoring` already governs.

**Skipping our chat consent for Copilot clients** (plan step 07's first design). It assumed
Copilot's own approval always runs. It does not under Autopilot or `--allow-all`, and those
are exactly the levels `demoBuilder.ai.permissions` now lets an SC choose.

## Reference notes

- `workbench.action.chat.open`, `workbench.action.chat.newChat`,
  `workbench.action.chat.focusAgentSessionsViewer` — VS Code commands, verified in the
  1.140 workbench bundle; they resolve in VS Code, not in this repository.
- `chat.permissions.default`, `github.copilot.chat.virtualTools.threshold` — VS Code and
  Copilot settings, owned by those products.
- `tool_search`, `activate_*`, `mcp_demo-builder_list_projects` — names as Copilot presents
  them to the model, read from a saved chat session.
- `vscode.lm.registerMcpServerDefinitionProvider` — the VS Code API step 05 would use; not
  called anywhere here, deliberately.
