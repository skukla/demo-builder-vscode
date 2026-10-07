# AI agents: Copilot and Claude Code

How an SC talks to Demo Builder through an AI agent, which agents work, and how to check
one is ready. The decision behind it is
[ADR-025](../architecture/adr/025-demo-builder-serves-the-scs-agent.md); how the tools
themselves work is [mcp-server.md](mcp-server.md).

## Which agent the Chat button opens

`demoBuilder.ai.engine` (Settings → AI Assistant) picks it. Every Chat door — the sidebar,
the dashboard, the projects list and the prompt library — opens the same one.

| Setting | What opens | Needs |
|---|---|---|
| **Copilot in VS Code** (default) | VS Code's own chat panel, in agent mode, with the prompt already sent | Copilot signed in to VS Code. Nothing to install |
| Claude Code | a terminal tab named "Claude Code" running `claude -- '<prompt>'` | the `claude` command and the SC's own Claude subscription |

Copilot in VS Code is the default even when Claude Code is installed: it is the experience
Demo Builder promotes. Claude Code stays for SCs who use their own Claude subscription.

**Copilot CLI is not a Chat choice** (removed 2026-10-06). It is the same subscription and
the same models as the panel, so offering both asked SCs to make a technical choice. An
SC who runs `copilot` in a terminal themselves still gets every tool — see below. A
settings.json still holding `copilot-cli` or `auto` from an earlier beta opens the
default.

**"Claude" in VS Code's chat is not Claude Code.** The panel's agent picker offers a Claude
option; it runs on the Copilot subscription, not the SC's Claude account, so Demo Builder
does not use it for Claude Code users.

### New Chat and earlier chats

| | Copilot in VS Code | Claude Code |
|---|---|---|
| Chat | opens the panel and sends the prompt | `--continue` when this folder has a conversation |
| New Chat | `workbench.action.chat.newChat`, then the prompt | never continues |
| Pick an earlier chat | VS Code's agent sessions list | `claude --resume` |

A resumed conversation does not re-read `AGENTS.md`, so its prompt starts with a line
naming the active project.

The sidebar's Chat tile offers New Chat and Pick an earlier chat only for Claude Code. With Copilot in VS Code it is a plain button that opens the panel in agent mode:
the panel has its own New Chat (**+**) and history, and Copilot keeps its own sessions. The
two commands stay in the Command Palette for every agent.

## How much the agent may do without asking

`demoBuilder.ai.permissions`, for Claude Code:

| Level | Claude Code |
|---|---|
| Ask first (default) | — |
| Auto | `--permission-mode auto` |
| Full access | `--dangerously-skip-permissions` |

VS Code's chat panel cannot be given a level at launch; it follows the permissions picker
in the chat box (Default, Bypass Approvals, Autopilot), whose default is VS Code's
`chat.permissions.default`.

**At every level Demo Builder still asks before anything destructive** — a delete, a reset,
a publish. The question arrives in the chat (MCP elicitation), naming what will change; if
the chat cannot be asked it falls back to a dialog in the VS Code window.
`demoBuilder.ai.requireAgentConsent` turns that off, for unattended use only.

## How the agent reaches Demo Builder's tools

The window is always homed at the projects root (`~/.demo-builder/projects`), and that
folder's `.mcp.json` names the `demo-builder` server. Every agent reads it:

- **VS Code's chat** discovers it as a workspace MCP server. The first time, VS Code may ask
  to trust or start it.
- **Copilot CLI**, when an SC runs `copilot` themselves, reads it only in a folder it
  trusts; "Register Global MCP" also writes `~/.copilot/mcp-config.json`.
- **Claude Code** reads it directly; "Register Global MCP" also writes `~/.claude.json`.

There are 158 tools. Copilot does not hand them all to the model at once: models with tool
search load the ones a request needs by `tool_search`, older ones get them grouped. None is
dropped (measured 2026-10-06,
`.rptc/plans/copilot-first-agent-support/step-06-tool-budget.md`). What decides whether the
right tool is found is its description.

## Checking an agent is ready

The dashboard's **AI** badge reads Ready when the bundle is current and the chosen agent can
start. With Claude Code chosen and `claude` missing it reads "Claude Code not installed", and
the Chat button says so — and points at Copilot in VS Code, which needs nothing installed —
instead of opening a terminal that says `command not found`. Demo Builder does not help
install Claude Code: an SC who chooses it brings their own. **View AI Capabilities** lists the skills
and MCP servers the agent gets.

## What an admin may have blocked

An organisation can restrict Copilot by policy: MCP servers in general, servers from
extensions, or the panel's third-party agents. If the panel shows no `demo-builder` tools
in its tools list, ask whether MCP is allowed for your Copilot seat.

## Where it lives

- `src/features/ai/engine/` — the engine seam: `agentEngine.ts` (what each agent is),
  `activeEngine.ts` (which one this window serves), `chatLaunch.ts` (the terminal command
  lines), `agentCli.ts` (is the CLI installed).
- `src/commands/openInClaude.ts` — the Chat launch, for every engine.
- `src/features/project-creation/services/aiBundle/globalMcpRegistration.ts` — Register
  Global MCP, for both agent CLIs that keep a config file (`GLOBAL_MCP_CONFIGS`).
