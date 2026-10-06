# Copilot-first development: what changes for Demo Builder

Research date: **2026-09-15**. Trigger: colleagues will be required to use GitHub Copilot for
all AI coding work. Versions this describes: VS Code **1.137** (stable, 2026-09-09), Copilot CLI
**1.0.83** (2026-09-04). Copilot changes monthly; re-check anything load-bearing before building
on it.

Three passes fed this document:

| File | What it covers |
|---|---|
| [`01-copilot-vs-claude.md`](01-copilot-vs-claude.md) | How Copilot works on each surface, and a sourced comparison with Claude Code |
| [`02-customization-mapping.md`](02-customization-mapping.md) | Copilot's instructions, skills, agents, hooks and MCP config, and a file-by-file conversion map for this repo and for what the extension generates |
| this file, §5 | An inventory of every Claude Code assumption in the extension's code (develop @ `32740ff4f`), with file references |

Claims marked **Doc**, **Source**, **Inferred** or **UNVERIFIED** in the two reports keep those
labels. §7 lists what was re-checked independently for this summary.

---

## 1. The answer in brief

1. **"Copilot" is five different agents, and they read different things.** VS Code's *Local*
   agent, VS Code's *Copilot* agent (a separate process), VS Code's *Claude* agent (Anthropic's
   SDK, billed through Copilot), Copilot CLI in a terminal, and the cloud agent in GitHub
   Actions. A plan has to say which one colleagues will use.
2. **Most of our text carries over unchanged.** Every surface reads `AGENTS.md`. VS Code, the CLI
   and the cloud agent also read `CLAUDE.md` and `.claude/skills/<name>/SKILL.md` directly.
   All 15 generated skill templates pass Copilot's skill rules.
3. **The extension's MCP server is already almost agent-neutral.** It uses standard MCP: tools,
   `readOnlyHint` and `destructiveHint` annotations, elicitation, progress. The Claude coupling
   sits around it: how clients find it, the config files and hooks we write, the `claude`
   terminal launch, and the checks that read Claude's own files.
4. **Two things will actively break under Copilot.**
   - **Hooks.** Copilot reads Claude-format hooks in some surfaces but runs them under a
     different contract. The generated `aio` guard can block every tool call in VS Code if a user
     enables Claude hooks, and this repo's own hooks can deny every Bash and Edit call in
     Copilot CLI.
   - **Tool count.** VS Code allows at most **128 tools** per request. The extension exposes 110,
     and a storefront project adds dropins (21), Playwright and sometimes commerce-extensibility
     (11).
5. **The biggest decision is not technical.** VS Code's Claude agent runs on Anthropic's SDK,
   reads `.claude/` natively, and can bill through a Copilot subscription. If the requirement is
   "billed through Copilot", that keeps nearly everything working. If it means "GitHub's own
   agent", most of §6 applies. Only the Copilot admin can say whether org policy allows the
   Claude agent.

---

## 2. How Copilot works

Detail and sources: [`01` §1](01-copilot-vs-claude.md).

**In VS Code (Copilot Chat).** Chat has Ask, Edit, Agent and Plan modes. Each agent session runs
in a **harness** chosen per session:

| Harness | Runs in | Can use |
|---|---|---|
| Local | the extension host | built-in tools, extension tools, all MCP servers |
| Copilot | the "Agent Host", a separate local process (Copilot SDK) | some extension tools, and only local MCP servers without auth; survives closing the window |
| Claude | local, Anthropic's Claude Agent SDK | `.claude/` config; billed to Copilot or to Anthropic credentials |
| Codex | local, OpenAI Codex | |
| Cloud | a provider's cloud | no VS Code tools |

Agent mode loops model → tool call → approval → result. Approvals are per tool (once, per
session, per workspace, always). MCP tools marked `readOnlyHint` skip the confirmation. Global
auto-approve and an "Autopilot" mode exist. A request can carry at most 128 tools; above a
threshold VS Code groups tools into "virtual tools".

**Models.** Business and Enterprise seats get GPT, Gemini and Claude models, including Claude
Haiku 4.5, Sonnet 5, Opus 4.7/4.8/5 and Fable 5/5.1 (Fable is off by default for orgs because of
Anthropic's retention terms). Pro gets fewer. Since 2026-06-01 usage is metered in AI credits
($0.01 each): Business includes 1,900 per seat per month, Enterprise 3,900, pooled across the org.

**Copilot CLI** (`copilot`, GA 2026-02-25) is a terminal agent comparable to `claude`. It reads
`AGENTS.md`, `CLAUDE.md`, `.claude/skills|agents|commands`, `.mcp.json`, `~/.copilot/mcp-config.json`
and `.claude/settings.json` hooks. It has a headless `copilot -p` mode.

**Cloud agent** (renamed from "coding agent", April 2026) works from issues and PRs inside GitHub
Actions, stops at 59 minutes, and takes MCP config from repository settings (tools only, no
OAuth servers).

**Admin controls that matter for a mandate.**
- An MCP allowlist, matched by server name, URL or exact command.
- A policy that turns off extension-provided tools (`ChatAgentExtensionTools`).
- A policy that turns off the Claude harness (`Claude3PIntegration`).
- Content exclusion, which VS Code's Agent and Edit modes do **not** honor.

**Extension APIs** (all in the stable `vscode.d.ts` of 1.137, re-checked):
`vscode.lm.registerMcpServerDefinitionProvider` (stable since 1.101), `vscode.lm.registerTool`,
`vscode.chat.createChatParticipant`, `vscode.lm.selectChatModels`.

---

## 3. Copilot compared with Claude Code

Full table: [`01` §2](01-copilot-vs-claude.md).

| | Claude Code | Copilot |
|---|---|---|
| Where the agent runs | one agent, the same in terminal, IDE, desktop and web | split across the extension host, Agent Host, CLI and Actions, each with different tool and MCP limits |
| Memory / instructions | `CLAUDE.md`, `.claude/rules` | `AGENTS.md`, `.github/copilot-instructions.md`, `*.instructions.md` with `applyTo`; also reads `CLAUDE.md` |
| Skills | `.claude/skills/*/SKILL.md` | the same Agent Skills format; reads `.github/skills` **and** `.claude/skills` |
| Subagents | `.claude/agents/*.md` | custom agents (`.agent.md`, `.github/agents/`), `runSubagent`; the CLI reads `.claude/agents` |
| Hooks | `.claude/settings.json`, PascalCase events, stdin JSON, exit 2 blocks | `.github/hooks/*.json`, camelCase events; reads Claude files in some surfaces; different tool names and fields; any non-zero exit from a pre-tool hook denies in the CLI |
| Permissions | allow/deny lists in settings | VS Code settings (`chat.tools.*autoApprove`) or CLI flags; no file equivalent |
| MCP config | `.mcp.json`, `~/.claude.json` | `.vscode/mcp.json` (`servers`), `.mcp.json` (VS Code 1.137, CLI, Agent Host), `~/.copilot/mcp-config.json`, extension providers |
| MCP features | tools, resources, prompts, elicitation | VS Code: tools, prompts, resources, elicitation, sampling, roots, MCP Apps. Cloud agent: tools only |
| Headless | `claude -p` | `copilot -p` |
| Models | Anthropic only | several vendors, including Claude |
| Unique | classifier-based permission mode; one config tree | runs other vendors' agents inside VS Code; cloud agent from issues |

---

## 4. Skills, agents and hooks in Copilot, and converting ours

Full mapping with sources: [`02` Parts A–C](02-customization-mapping.md).

| Ours (Claude) | Copilot equivalent | Converts? |
|---|---|---|
| `AGENTS.md` | read by every surface | **as is**; Claude-specific wording should become neutral (§6.4) |
| `CLAUDE.md` pointer files | read by VS Code, CLI, cloud agent | as is; whether `@AGENTS.md` is expanded is UNVERIFIED |
| `.claude/skills/<name>/SKILL.md` | read directly by VS Code, CLI, cloud agent | **as is**; names and descriptions pass Copilot's rules |
| `.claude/commands/*.md` | prompt files, deprecated in Agent Host; make them skills | rewrite as skills |
| `.claude/agents/*.md` | `.agent.md` / `.github/agents/`; the CLI reads `.claude/agents` | mostly as is for the CLI; rewrite frontmatter for VS Code |
| `.claude/settings.json` hooks | `.github/hooks/*.json` | **must be rewritten**: event names, tool names (`create_file`, `server-tool`), input fields, blocking semantics |
| `.claude/settings.json` permissions | VS Code settings or CLI flags | lossy |
| `.mcp.json` | read by VS Code 1.137, CLI and Agent Host; the cloud agent needs repo settings | **as is**, except for the cloud agent |

There is no official converter. The awesome-copilot repository has community examples.

**What would be lost:** Claude hook matchers (VS Code's Local harness ignores them); blocking a
turn from ending with exit 2 on `Stop` (a warning in the CLI); allow/deny lists as files;
`ToolSearch`-style deferred loading guidance.

---

## 5. Where the extension assumes Claude Code

From a read of the code on develop (`32740ff4f`). Classification: **neutral**, **mappable**
(an obvious Copilot equivalent), **Claude-only**.

| Area | Where | Class |
|---|---|---|
| MCP server core: per-connection server on a Unix socket; logging, consent, progress, trace | `src/features/ai/server/inExtensionMcpServer.ts` | neutral |
| stdio→socket proxy; handshake replay after reload; `#cwd:` scoping preamble | `src/mcp-proxy.ts`, `mcpSocketDiscovery.ts`, `src/core/utils/mcpSocketPath.ts` | neutral (Unix sockets only; no Windows branch) |
| 110 tools; annotations; `confirm:true` gate; 18 consent dialogs; `needsAuth` handoffs; response caps | `toolDescriptors.ts`, `mcpToolServer.ts`, `agentAlertCopy.ts`, `docs/systems/mcp-tools.md` | neutral |
| Elicitation consent and progress notifications | `consentViaChat.ts`, `inExtensionMcpServer.ts` | neutral protocol, **measured only against Claude Code** |
| Protocol surface: no prompts, resources, sampling, roots or server `instructions` | grep of `src/` | neutral |
| `.mcp.json` + `.claude/mcp.json` | `aiBundle/mcpConfigWriter.ts` | mappable (VS Code 1.137 reads `.mcp.json`) |
| `.claude/settings.json` hooks: git-sync `PostToolUse` (`Write\|Edit`), `aio` guard `PreToolUse` (`mcp__commerce-extensibility__…`) | `aiBundle/claudeSettingsWriter.ts` | **Claude-only as written** |
| `AGENTS.md` text naming `.claude/skills/`, `ToolSearch`, `mcp__` prefixes, "Try asking Claude" | `aiBundle/agentsMdSections.ts`, `homeAiContextWriter.ts` | mappable |
| Skills in `.claude/skills/` | `aiBundle/skillsWriter.ts` | neutral in practice (Copilot reads them) |
| Global registration in `~/.claude.json` | `aiBundle/globalMcpRegistration.ts` | mappable (`~/.copilot/mcp-config.json`) |
| Chat launch: `claude [--continue]` terminal, bracketed-paste reuse, transcript probe `~/.claude/projects` | `src/commands/openInClaude.ts`, `claudeSessionStore.ts` | Claude-only |
| AI Ready badge, drift and health checks, inspectors, capabilities modal read `.claude/mcp.json`, `.claude/skills/`, `~/.claude.json` | `aiSetupVerifier.ts`, `mcpDriftDetector.ts`, `skillInspector.ts`, `mcpInspector.ts` | mappable |
| claude.ai connector detection, `~/.claude` footprint in Diagnostics, `claudeCode.preferredLocation` reset | `sessionMcpDetector.ts`, `claudeCodeFootprint.ts`, `openInClaude.ts` | Claude-only |
| `demoBuilder.ai.engine` setting: one value, `claude-code`, never branched on | `package.json` | mappable |
| VS Code AI APIs (`vscode.lm`, chat participants, MCP providers) | none used; `engines.vscode` is `^1.84.0` | n/a |
| Decisions on record | ADR-004 (Claude Code is the harness; VS Code Chat declined), ADR-019 (terminal-only delivery) | would need revisiting |

---

## 6. What the extension's MCP and AI bundle need for Copilot-first

Ordered by what unblocks colleagues soonest. Each item names the check that proves it.

### 6.1 Make the server reachable from VS Code's own agent, by name (recommended first)

Register the server with `vscode.lm.registerMcpServerDefinitionProvider` (stable since 1.101)
alongside the files we already write.
- VS Code's Local agent then gets `demo-builder` in any folder, without a per-folder trust prompt
  for `.mcp.json`. The definition can pass the project path through `env` or `cwd` instead of
  depending on the proxy's `#cwd:` preamble.
- The org allowlist gets a stable server label to allow. Whether allowlists match extension
  servers by label or by the per-user command path is **UNVERIFIED**; that decides whether admins
  can allow us at all.
- Cost: raise `engines.vscode` from `^1.84.0` to at least `^1.101.0`. Current is 1.137.
- Keep `.mcp.json` for Copilot CLI and the Agent Host.
- Check: in a clean profile with no `.mcp.json`, Copilot agent mode lists `demo-builder` tools;
  then again with an org allowlist naming it.

### 6.2 Stay under 128 tools

110 of ours plus dropins (21), Playwright and commerce-extensibility (11) is over the cap on a
storefront project. What Copilot does past the cap is only partly documented: it groups into
virtual tools above a threshold.
- First measure: open a storefront project in Copilot agent mode and record which tools a
  request actually receives, and whether any of ours are dropped or grouped.
- Then choose one: publish tool sets so users enable groups (storefront, Adobe Console, content,
  diagnostics); consolidate read tools with near-identical purposes; or expose a smaller default
  set with the rest behind a setting. The measurement decides which.
- The generated `AGENTS.md` guidance about `ToolSearch` must go either way.

### 6.3 Consent: avoid asking twice

Copilot already confirms any MCP tool not marked `readOnlyHint`. Our server can also ask through
elicitation, then a modal. Under Copilot that can mean two or three prompts for one action.
- Read the client's `clientInfo` at `initialize`, and for VS Code's Copilot client rely on its
  own tool confirmation for `destructiveHint` tools, keeping `confirm:true` and the modal as the
  backstop. Keep today's behavior for Claude Code.
- Check: run `delete_mesh` (or another confirmed tool) from Copilot agent mode and count the
  prompts; run it again from `copilot -p` with `--allow-tool`.

### 6.4 Generated bundle: neutral text, safe hooks

Four seams plus an `AI_CONTEXT_VERSION` bump, per the `ai-context-authoring` skill.
- **AGENTS.md:** replace "Try asking Claude", `ToolSearch`, `mcp__` examples and `.claude/mcp.json`
  mentions with agent-neutral wording.
- **`aio` guard hook (urgent):** it relies on a matcher. VS Code's Local harness ignores matchers,
  so if a user enables Claude hooks the guard's `exit 2` blocks every call. Make the script check
  the tool name itself and exit 0 otherwise, and accept both `mcp__server__tool` and Copilot's
  `server-tool` names. Also write the equivalent `.github/hooks/*.json` for Copilot.
- **Git-sync hook:** read the edited path from Claude's and Copilot's field names (Copilot's
  exact `tool_input` keys are UNVERIFIED; one probe hook settles it).
- Skills stay in `.claude/skills/`; Copilot reads them.
- Check: open a generated storefront project in Copilot CLI and in VS Code with
  `chat.useClaudeHooks` on; confirm ordinary tool calls pass and the guarded `aio` commands are
  refused.

### 6.5 Launch and "AI Ready" for Copilot users

- Give `demoBuilder.ai.engine` real values: `claude-code`, `copilot-cli` (terminal `copilot`
  with the same prompt delivery) and `vscode-chat` (open Copilot Chat with the prompt). Whether
  VS Code offers a command that opens chat with a prompt pre-filled is UNVERIFIED here; ADR-019
  recorded that injecting into a live chat was not possible at the time.
- Register the server in `~/.copilot/mcp-config.json` when the engine is Copilot CLI.
- Teach the AI Ready and drift checks to read Copilot's locations, so a Copilot user doesn't see
  "not ready".
- Remove or gate the Claude-only diagnostics (claude.ai connector detection, `~/.claude`
  footprint) by engine.

### 6.6 Deliberately out of reach

- **The cloud agent cannot use our server.** The tools live in a local VS Code window on a Unix
  socket. Demos are built locally, so this is a limitation to state, not a goal.
- **Windows.** The socket path has no Windows branch and the hooks use bash. Relevant only if
  colleagues run Windows; nobody has said so.

### 6.7 This repository (developers, not SCs)

This repo's hooks call `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/…"`. Copilot's hooks reference
does not list that variable, and a failing pre-tool hook denies the call in Copilot CLI. Anyone
opening this repo in Copilot CLI would likely have every Bash and Edit call refused. A one-line
fallback (`${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}`) avoids it. Reported for
Windows in github/copilot-cli#4001; macOS is untested.

---

## 7. Checked independently for this summary

| Claim | Evidence | Status |
|---|---|---|
| VS Code 1.137 reads a workspace `.mcp.json` in Claude's `mcpServers` format, with no setting gating it (per-server trust approval applies). The docs say discovery is off by default; the two reports disagreed | `src/vs/workbench/contrib/mcp/common/discovery/workspaceDotMcpDiscovery.ts` and `mcp.contribution.ts` at tag 1.137.0: unconditional `register(new SyncDescriptor(WorkspaceDotMcpDiscovery))`, reads `.mcp.json`, `trustBehavior: TrustedOnNonce` | VERIFIED (source) |
| MCP definition provider, stdio/HTTP definitions, `lm.registerTool`, `createChatParticipant`, `selectChatModels` are stable API | `src/vscode-dts/vscode.d.ts` at 1.137.0, lines 20124, 20425, 20474, 20769, 20777, 20841 | VERIFIED |
| Copilot CLI reads `.claude/settings.json` hooks; non-zero `preToolUse` exits deny; `CLAUDE_PROJECT_DIR` is not among the variables Copilot documents | docs.github.com/en/copilot/reference/hooks-reference, read 2026-09-15 | VERIFIED (doc) |
| This repo's hooks depend on `$CLAUDE_PROJECT_DIR` | `.claude/settings.json` lines 8–54 | VERIFIED |
| Extension `engines.vscode` is `^1.84.0`; local VS Code is 1.137.0 | `package.json` line 8; `code --version` | VERIFIED |
| Tool count 110 | `docs/systems/mcp-tools.md` (generated) | VERIFIED (generated doc) |
| Copilot CLI on macOS denies every call in this repo | github/copilot-cli#4001 is a Windows report; Copilot CLI is not installed here | INCONCLUSIVE |
| Whether org allowlists match an extension-provided server by label or by command | `01` reads VS Code source on `main`; docs are silent | INCONCLUSIVE |
| Whether org policy allows the VS Code Claude harness | needs the Copilot admin | INCONCLUSIVE |
| Model list, pricing, Agent Host MCP limits | `01` sources; not re-checked | attributed to `01` |

## 8. Decisions for the owner

1. **Which Copilot agent is the target?** The VS Code Claude harness (least work, if policy
   allows it), VS Code's Local/Copilot agent, or Copilot CLI. §6 assumes VS Code's own agent.
2. **Keep Claude Code as a supported engine alongside Copilot?** The research suggests yes at low
   cost: the neutral pieces serve both.
3. **Order of work.** Recommended: §6.4 hook safety first (it can block users today), then §6.1
   registration, then measure §6.2, then §6.3 and §6.5.
