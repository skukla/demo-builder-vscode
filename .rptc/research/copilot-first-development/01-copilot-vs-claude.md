# GitHub Copilot: how it works, and how it compares to Claude Code

Research date: **2026-09-15**. All sources were read that day (see Sources). Current VS Code
stable is **1.137 (2026-09-09)**; 1.138 is Insiders. Current Copilot CLI is **1.0.83
(2026-09-04)**.

How this was checked: GitHub Docs were read as raw markdown through the docs article API;
VS Code docs and release notes from the `microsoft/vscode-docs` repo (last commit
2026-09-14); API stability from `src/vscode-dts/vscode.d.ts` on `microsoft/vscode` main;
Claude Code docs from `code.claude.com/docs/en/*.md`.

Labels used below:
- **Doc** = stated in official documentation.
- **Source** = read in product source code, not stated in docs.
- **Inferred** = my conclusion from the evidence, not stated anywhere.
- **UNVERIFIED** = I could not confirm it from a primary source.

---

## 0. The findings that matter most for this decision

1. **Copilot already reads Claude Code's files.** Copilot CLI loads `CLAUDE.md`, `AGENTS.md`,
   `.claude/skills/`, `.claude/agents/`, `.claude/commands/` and `.mcp.json` [S14]. VS Code
   reads `CLAUDE.md`, `.claude/rules`, `.claude/skills/` and Claude-format hooks from
   `.claude/settings.json` [S22][S23][S24]. **Doc.** So a lot of a Claude-shaped AI bundle
   works under Copilot as-is. The catch: tool names and hook payload fields differ, so hook
   scripts need changes [S24].
2. **Claude models are inside Copilot.** GA models are Haiku 4.5, Sonnet 4.6 (retired
   2026-09-01 except on annual plans), Sonnet 5, Opus 4.7, 4.8 and 5, and Fable 5 and 5.1
   [S9]. Business and Enterprise get all of them. Pro gets only Haiku 4.5 and Sonnet 5. **Doc.**
3. **VS Code can run Anthropic's Claude Agent SDK as a harness, billed to Copilot.** "Harness"
   means the program that runs the agent loop. VS Code offers Local, Copilot, Claude and Codex
   harnesses. The Claude one is on by default and can bill through the Copilot subscription
   [S20]. Admins can turn it off with the `Claude3PIntegration` policy [S19]. **Doc.**
4. **An extension can hand Copilot an MCP server through a finalized API.**
   `vscode.lm.registerMcpServerDefinitionProvider` plus `contributes.mcpServerDefinitionProviders`
   are in stable `vscode.d.ts` and shipped in 1.101 (May 2025) [S27][S29]. The Language Model
   Tools API (`vscode.lm.registerTool`) is also stable, since 1.95 [S29].
5. **Admins can block both routes.**
   - The MCP allowlist and denylist (`chat.mcp.allowedServers` / `ChatAllowedMcpServers`,
     VS Code 1.130+) block servers by name, URL or command [S19][S31].
   - In VS Code source, that check runs when *any* MCP server starts, including
     extension-registered ones [S30]. **Source/Inferred.**
   - `ChatAgentExtensionTools=false` disables extension-contributed tools but leaves MCP tools
     working [S19]. **Doc.**
   - A registered server with an unresolved `${VAR}` in its URL or command is blocked while an
     allowlist is active [S31]. **Doc.**
6. **Billing has been tokens, not requests, since 2026-06-01.** The unit is "GitHub AI
   Credits" (1 credit = $0.01). Business includes 1,900 credits per user per month and
   Enterprise 3,900, pooled across the org [S11][S12]. Completions and next-edit suggestions
   are unlimited [S12]. Paid overage is **on by default** for orgs [S12]. **Doc.**
7. **Content exclusion does not apply to agent mode in VS Code.** The exclusion table says
   VS Code Chat is supported but Edit and Agent are not [S34]. Copilot CLI and cloud agent
   do honor it [S34][S33]. **Doc.**
8. **"Copilot coding agent" is now "Copilot cloud agent"** (renamed 2026-04-01) [S40]. It runs
   in GitHub Actions with a 59-minute hard limit [S1]. It supports MCP **tools only**, with no
   OAuth remote servers [S2].

---

## 1. How Copilot works

### 1.1 Surface map

| Surface | Where it runs | Status (date) | Source |
|---|---|---|---|
| Copilot in VS Code: completions, next edit suggestions (NES), chat, agents | VS Code. The agent loop runs in the extension host (Local harness) or in a separate "Agent Host" process (Copilot, Claude and Codex harnesses) | GA | S17, S20, S21 |
| Copilot cloud agent (formerly coding agent) | GitHub Actions runner (Ubuntu x64 or Windows x64) | GA, all paid plans | S1, S3, S40 |
| Copilot CLI (`copilot`) | Terminal process on Linux, macOS, Windows | GA 2026-02-25 | S13, S41 |
| Copilot SDK | Your process, driving the Copilot CLI runtime | GA 2026-06-02; Node, Python, Go, .NET, Rust, Java | S38, S42 |
| GitHub Copilot app | Desktop app "built on GitHub Copilot CLI" | GA 2026-06-17 | S39 |
| Third-party cloud agents (Anthropic Claude, OpenAI Codex) on GitHub | GitHub Actions, same limits as cloud agent | Public preview | S35, S36 |
| Visual Studio, JetBrains, Eclipse, Xcode, Neovim | IDE plugins | See 1.8 | S9, S37 |

### 1.2 Copilot in VS Code

**Inline suggestions and NES.** These are always on, and they are not billed in AI credits on
paid plans [S12]. BYOK (bring your own API key) does not cover inline suggestions, semantic
search or embeddings. Those still need a GitHub account [S25]. **Doc.**

**Chat roles.** Built-in roles are **Ask**, **Agent** and **Plan** [S20]. **Edit mode** was
hidden in 1.110 and deprecated in 1.126, when the `chat.editMode.hidden` setting was also
removed. It still shows for users whose org disables Agent by policy [RN-1.126]. Inline chat
still exists [S17]. **Doc.**

**Harnesses (the "Session Target" control)** [S20][S21]:

| Harness | Where it runs | What it can use |
|---|---|---|
| **Local** | Extension host | Built-in tools, extension tools, MCP servers, BYOK models |
| **Copilot** | Agent Host on your machine, powered by the Copilot SDK | Survives window close. Can run remotely over SSH or a dev tunnel. Only some VS Code and extension tools. Only **local MCP servers without authentication** |
| **Claude** | Your machine | Anthropic's Claude Agent SDK. Bills to Copilot or to Anthropic credentials. Permission modes: Edit automatically, Request approval, Plan. Claude-native slash commands for agents, hooks and memory files |
| **Codex** | Your machine | OpenAI Codex |
| **Cloud** | Provider's cloud | Hands off to a cloud agent. No access to VS Code tools |

**Agent loop.** The harness prepares instructions, context and tool definitions. The model
returns a reply or a tool call. The harness applies approval rules, runs the tool, returns the
result, and repeats [S21]. **Doc.**

**Built-in tools** are grouped into tool sets: `#agent`, `#browser`, `#edit`, `#execute`,
`#read`, `#search`, `#web`, `#vscode`. Individual tools include:
- files and edits: `#edit/editFiles`, `#read/problems`
- terminal and tests: `#execute/runInTerminal`, `#execute/testFailure`
- search: `#search/codebase`, `#search/usages`
- web and GitHub: `#web/fetch`, `#githubRepo`
- subagents and tasks: `#agent/runSubagent`, `#todos`
- VS Code: `#vscode/runCommand`, `#vscode/installExtension`

A request can have at most **128 tools** enabled. Virtual tools
(`github.copilot.chat.virtualTools.threshold`) manage larger sets [S18][S26]. **Doc.**

**Approvals** [S19][S22]:
- **Permission levels** (`chat.permissions.default`): Manual (default), Assisted (a model
  judges each call; Agent Host only; off by default in Stable), and Allow all.
- **Autopilot** is a mode, not a permission level. It auto-approves, retries, and answers its
  own blocking questions.
- **Per-tool approval**: once, for the session, for the workspace, or always.
  `chat.tools.eligibleForAutoApproval` can force manual approval for a named tool.
- **Global auto-approve**: `chat.tools.global.autoApprove`, also `/yolo` and `/autoApprove`.
- **URL approval**: `chat.tools.urls.autoApprove`.
- **MCP tools** marked `readOnlyHint` skip confirmation [S27].

**Terminal.** Common read-only commands run automatically. Risky ones such as `rm` ask first.
Rules go in `chat.tools.terminal.autoApprove`. Turning off `chat.tools.terminal.enableAutoApprove`
makes every command ask. A message starting with `!` runs a shell command directly, with no
agent and no approval [S22][S16]. **Doc.**

**Sandbox.** `chat.agent.sandbox.enabled` (default `off`) isolates the file system and network
at OS level. It covers terminal commands only [S22]. **Doc.**

**Checkpoints.** On by default (`chat.checkpoints.enabled`). A file snapshot is taken before
each request, and "Restore Checkpoint" rolls back later changes. Checkpoints don't undo changes
to external services [S16][S23b]. **Doc.**

**Context** [S25b][S26b]:
- `#file`, selections and similar references attach context explicitly.
- `#codebase` is semantic search over a workspace index that Copilot builds automatically.
  Parts may be remote.
- `.gitignore` and `files.exclude` keep files out of search and the index.
- Near the context limit, VS Code **auto-compacts** older turns. `/compact` does it on demand.
- 1M-token context windows are offered for some models in VS Code and the CLI only [S9].

**Instructions and customization files** [S23][S24][S28]:

| Kind | Locations |
|---|---|
| Instructions | `.github/copilot-instructions.md`, `*.instructions.md`, `AGENTS.md` (nested ones optional), `CLAUDE.md` (root, `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md`; `chat.useClaudeMdFile`), `.claude/rules` |
| Skills | `.github/skills`, `.claude/skills`, `.agents/skills`, plus the `~/` equivalents |
| Custom agents | `.agent.md` files |
| Hooks | Same JSON format as Claude Code and Copilot CLI. Read by default from `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`. Tool names and input field casing differ from Claude Code |
| Plugins | Formats: Agent Plugins 1.0, Copilot `plugin.json`, **Claude `.claude-plugin/plugin.json`**, and legacy OpenPlugin |

**Memory.** A memory tool (preview, `chat.tools.memory.enabled`) with three scopes: user
(`/memories/`, first 200 lines auto-loaded), repository and session. Stored locally [S26c].
**Doc.**

**Subagents.** Built in (`#agent/runSubagent`), with context isolation and parallel runs.
Custom agents can run as subagents [S26d]. **Doc.**

**Model picker.** Shows the models your plan and org policy allow (see 1.3), plus BYOK models.
Built-in BYOK providers include Anthropic, Azure, Gemini and OpenAI, and there is a custom
endpoint type for Chat Completions, Responses or Messages APIs. Business and Enterprise admins
can disable BYOK [S25]. **Doc.**

### 1.3 Models (as of 2026-09-15) [S9][S10]

- **Anthropic (all GA):** Claude Haiku 4.5, Sonnet 4.6*, Sonnet 5, Opus 4.7, Opus 4.8,
  Opus 4.8 (fast mode, preview), Opus 5, Fable 5, Fable 5.1.
  - \*Sonnet 4.6 was retired 2026-09-01 for monthly plans. It remains on annual Pro and Pro+.
- **OpenAI:** GPT-5 mini, GPT-5.3-Codex (the fallback "LTS" model), GPT-5.4, 5.4 mini,
  5.4 nano, GPT-5.5, GPT-5.6 Luna, Sol and Terra, GPT-6 Astra.
- **Google:** Gemini 3.5, 3.6, 3.7 and 3.8 Flash.
- **Others:** Microsoft MAI-Code-1.1-Flash; Moonshot Kimi K2.7 Code and K3; xAI Grok 4.5 and 4.6.

**Claude models by plan.**
- Pro: Haiku 4.5 and Sonnet 5 only.
- Pro+, Max, Business, Enterprise: all Claude models above.
- Free and Student: auto model selection only.

**By client.** All Claude models are available in VS Code, the CLI, Visual Studio and
JetBrains. Opus 4.8 fast mode is not on GitHub.com. Minimum VS Code version is 1.128 for
Opus 5 and 1.124 for Sonnet 5.

**Org enablement.**
- Business and Enterprise have a "default availability" policy for new GA models.
- **Fable 5 and 5.1 are always disabled by default.** They are "not covered by GitHub's data
  retention agreement": Anthropic retains prompts and outputs unless the enterprise gets a
  zero-data-retention exemption, which runs through end of 2026.
- Pre-GA and open-weight models are also disabled by default.

**Price examples** (per 1M tokens, input / output) [S10]:

| Model | Input | Output |
|---|---|---|
| Sonnet 5 | $2 | $10 |
| Opus 5 | $5 | $25 |
| Haiku 4.5 | $1 | $5 |
| Fable 5 | $10 | $50 |

### 1.4 Billing: AI credits [S11][S12][S15][S10]

- **Start date:** 2026-06-01 (announced 2026-04-27). Cost is model rate x tokens, counting
  input, output and cached tokens. 1 credit = $0.01.
- **Plans:**

| Plan | Price | Included credits |
|---|---|---|
| Free | $0 | Some allowance |
| Pro | $10/mo | 1,000 |
| Pro+ | $39/mo | 3,900 |
| Max | $100/mo | 10,000 |
| Business | $19/seat | 1,900, pooled at the billing entity |
| Enterprise | $39/seat | 3,900, pooled at the billing entity |

- Business and Enterprise got promotional extra credits 2026-06-01 to 2026-09-01.
- **What burns credits:** Chat, CLI, cloud agent, Spaces, Spark, third-party agents.
  Code review burns credits plus Actions minutes.
- **What does not:** completions and NES.
- **Overage:** allowed by default for orgs; an admin must disable the "AI credits paid usage"
  policy to cap spend. Budgets can be set per enterprise, cost center or user.
- **Legacy:** "premium requests" (300 per month on Pro, 1,500 on Pro+, $0.04 each extra, with
  model multipliers) now apply only to annual Pro and Pro+ plans bought before the switch.
- **CLI spend cap:** `/limits set max-ai-credits` sets a per-response soft limit [S14].

### 1.5 Copilot cloud agent (formerly "coding agent") [S1][S2][S3][S4][S44]

**How to start it.**
- The agents panel on GitHub.com.
- Assign Copilot to an issue.
- `@copilot` in a PR comment.
- From VS Code, the Copilot CLI (`/delegate`), GitHub Mobile, the API, or the Slack, Teams,
  Jira, Linear and Azure Boards integrations.
- Automations on a schedule or on events.

It can research, plan, and change a branch before a PR exists (on GitHub.com).

**Runtime and limits.**
- Ephemeral GitHub Actions environment.
- **59-minute hard limit.**
- One repository and one branch per task.
- GitHub-hosted repos only.
- Rulesets that restrict commit authors can block it (add Copilot as a bypass actor).

**Setup: `.github/workflows/copilot-setup-steps.yml`.**
- Must contain one job named `copilot-setup-steps`, and must be on the default branch.
- Only these keys are honored: `steps`, `permissions`, `runs-on`, `services`, `snapshot`,
  `timeout-minutes` (max 59).
- Supports larger runners and self-hosted runners (ARC recommended; the firewall must be
  disabled for self-hosted), Windows, and Git LFS.
- If a step fails, the remaining steps are skipped and the agent starts anyway.

**Firewall.**
- On by default, with a recommended allowlist (OS package repos, container registries,
  language package registries, certificate authorities, Playwright browser hosts).
- Configured per org or repo under "Internet access": enable, recommended list, custom rules,
  org allowlist.
- It **only covers processes the agent starts through its Bash tool**. It does not cover MCP
  server processes or setup steps. The docs say it can be bypassed.

**MCP.**
- Configured as repo-settings JSON (`mcpServers`, types `local`, `stdio`, `http`, `sse`).
- Secrets must be named with a `COPILOT_MCP_` prefix.
- GitHub (read-only token for the current repo) and Playwright (localhost only) servers are on
  by default.
- **Tools only**: no resources or prompts, and no OAuth remote servers.
- Tools run **without approval**.
- Custom agents can carry their own MCP servers.

**Other customization.** Custom instructions, custom agents, hooks, skills, and Copilot Memory
(public preview on Pro, Pro+ and Max).

**Cost.** Actions minutes plus AI credits.

### 1.6 Copilot CLI [S13][S14][S14b][S14c][S14d][S43]

**Install.** Any of:
- `npm install -g @github/copilot` (Node 22+)
- `brew install --cask copilot-cli`
- `winget install GitHub.Copilot`
- `curl -fsSL https://gh.io/copilot-install | bash`

Sign in with `/login` or a fine-grained PAT with "Copilot Requests" permission
(`COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`). **GA since 2026-02-25** [S41].

**Modes.**
- Interactive `copilot`, with Shift+Tab cycling ask/execute and plan.
- Autopilot (`/autopilot`).
- Programmatic `-p`, with `-s` for quiet output, `--output-format json` (JSONL), and `--share`
  for a transcript.
- `--fleet` for parallel subagents.
- `--cloud` for a cloud sandbox.
- ACP server mode (Agent Client Protocol), so other tools can drive the CLI.

**Permissions.**
- The first use of a modifying tool prompts: once, for the session, or no.
- Flags: `--allow-tool` / `--deny-tool` with patterns `shell(git push)`, `write`,
  `Server(tool)`, `url(...)`. Also `--allow-all-tools`, `--allow-all` / `--yolo`,
  `--available-tools`, `--excluded-tools`, `--add-dir`.
- `/permissions default|assisted|allow-all`.
- Folder trust prompt on start.
- Local OS sandbox (`/sandbox enable`, public preview).
- **All MCP tool calls need explicit permission.**

**Config locations.**
- User: `~/.copilot/` (override with `COPILOT_HOME`), containing `settings.json`,
  `mcp-config.json`, `copilot-instructions.md`, `agents/`, `skills/`, `hooks/`,
  `permissions-config.json`, `session-state/`.
- Repo: `.github/copilot/settings.json` and `settings.local.json`,
  `.github/allowed_models.txt`.
- Also reads shared keys from `.claude/settings.json`.
- MDM-managed settings supported.

**What it loads from a repo.**
- Instructions (all merged): `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`,
  `.github/copilot-instructions.md`, `.github/instructions/**`, supporting `@path` imports.
- Skills: `.github/skills`, `.agents/skills`, `.claude/skills`.
- Agents: `.github/agents` or `.claude/agents`.
- Commands: `.claude/commands`.
- Workspace MCP: `.mcp.json` and `.github/mcp.json` (the folder must be trusted).

**MCP.**
- Transports: `stdio`/`local`, `http`, `sse`.
- OAuth, including headless `client_credentials`.
- Built-in servers: github-mcp-server, playwright, fetch, time.
- Server instructions (since 0.0.400) [S43].
- Sampling with user approval (since 1.0.13, 2026-03-30) [S43].
- Elicitation (the ask_user form, since 0.0.421; SDK elicitation since 1.0.10) [S43].
- **MCP prompts and resources in the interactive CLI: UNVERIFIED.** The changelog mentions only
  SDK RPCs for listing and reading resources.
- Enterprise MCP allowlist is fail-closed.
- Docs conflict: "About Copilot CLI" says the CLI can't enforce the org "MCP servers in Copilot"
  and "MCP Registry URL" policies [S13]. The surfaces table marks both as supported for the
  CLI [S33]. **Treat as unresolved.**

**Agents.**
- Built-in: `explore`, `task`, `general-purpose`, `code-review`, `security-review`, `research`,
  `rubber-duck`.
- Subagent depth defaults to 6. Max concurrency by plan: Free 2, Pro/Pro+ 4, Max 8,
  Business 16, Enterprise 32.
- Agents can message each other (`list_agents` / `write_agent`).

**Context.** Auto-compaction at 95% of the token limit, `/compact`, `/context`.
`/undo` (`/rewind`) rolls back the conversation, with or without file changes.

**Plugins.** `/plugin install`, marketplaces (`/plugin marketplace add`), Agent Plugins 1.0
(2026-08-12) [S45].

**BYOK.** `COPILOT_PROVIDER_TYPE=openai|azure|anthropic`.

### 1.7 Copilot SDK [S38][S42]

- GA 2026-06-02.
- Languages: Node/TS (`@github/copilot-sdk`), Python (`github-copilot-sdk`), Go, .NET, Rust,
  Java.
- It drives the Copilot CLI runtime. Node, Python and .NET bundle the CLI.
- Features: custom tools, MCP, hooks (pre/post tool use, session lifecycle), skills, custom
  agents, fleet mode, steering, session persistence, OpenTelemetry, BYOK.
- Available to all Copilot subscribers, including Free for personal use, and to non-Copilot
  users via BYOK.

### 1.8 Other IDEs (brief)

- Models are available in Visual Studio, JetBrains, Eclipse and Xcode (all Claude models in
  VS and JetBrains) [S9].
- The docs "feature matrix" shows agent mode and MCP in VS, JetBrains, Eclipse and Xcode, and
  no chat in Neovim [S37]. **That matrix looks stale:** it lists VS Code 1.108 as newest and
  still marks Edit mode as available.
- MCP registry enforcement minimum versions: VS Code 1.109.3, VS 18.4.0, JetBrains 1.5.64,
  Eclipse 4.38, Xcode 0.47.0 [S32].

### 1.9 Enterprise and org controls for a mandated rollout

**GitHub-side policies (AI controls)** [S33][S5][S46][S36]:
- **Features:** Copilot CLI, the Copilot app (a separate policy), cloud agent (enterprise can
  pick orgs; repo owners can opt out), third-party Claude and Codex agents, Editor preview
  features, web search.
- **MCP:** "MCP servers in Copilot" and registry-only restriction.
- **Models:** per-model enable/disable plus the default-availability policy.
- **Custom models / BYOK.**
- **Content exclusion.**
- **Copilot Memory.**
- **Extra blocking:** enterprises can block cloud agent and code review in all their repos,
  even for users licensed elsewhere [S6].
- **Conflicts:** multiple orgs in one enterprise resolve to the *least* restrictive setting;
  multiple enterprises resolve to the *most* restrictive [S5][S46].
- **Default state of "MCP servers in Copilot" for Business/Enterprise: UNVERIFIED.** Not stated
  in the pages read.

**`managed-settings.json`** (GA 2026-07-01) [S7][S31][S47]. Delivered from GitHub, MDM, or a
file. One definition governs the CLI, VS Code and the Copilot app.

| Key | Effect | Support |
|---|---|---|
| `permissions.disableBypassPermissionsMode` | No YOLO / allow-all | CLI, VS Code, app, JetBrains |
| `permissions.allow`, `ask`, `deny` | Fine-grained rules | CLI and app; VS Code only for Agent Host sessions |
| `model` | Default model | CLI, VS Code, app, cloud agent |
| `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces` | Plugin control | All listed clients |
| `allowedMcpServers`, `deniedMcpServers` | MCP allow/deny | CLI, VS Code, app, JetBrains. **Not cloud agent** |
| `sandbox` | Minimum sandbox rules | CLI only |
| `telemetry`, `remoteControl` | OpenTelemetry export; remote-control limits | See [S7] |

- **MCP matchers:** `serverName` (exact; users choose names, so weak), `serverUrl` (wildcards),
  `serverCommand` (exact argv).
- **Evaluation:** built-ins always allowed, then deny, then allow. Unresolved `${VAR}` means
  blocked. Malformed JSON means block everything except built-ins.
- **Multiple sources intersect.**
- Microsoft calls the custom-registry method weaker (name-based, bypassable) and
  "not prioritized" [S31b][S32].

**VS Code device policies (ADMX / MDM)** [S19]:
- `ChatAgentMode` (turn agents off).
- `ChatMCP` = `all | registry | none`, and `McpGalleryServiceUrl` (private registry).
- `ChatAllowedMcpServers` / `ChatDeniedMcpServers` (1.130), `ChatAllowManagedMcpServersOnly`
  (1.132).
- **`ChatAgentExtensionTools`** (turn off extension-contributed LM tools).
- `ChatHooks`, `ChatPluginsEnabled`, `BrowserChatTools`.
- `ChatToolsAutoApprove`, `ChatToolsEligibleForAutoApproval`,
  `ChatToolsTerminalEnableAutoApprove`.
- Sandbox and network-filter policies.
- **`Claude3PIntegration`** (turn off the Claude Agent harness).
- **`ChatApprovedAccountOrganizations`**: AI features stay off until the user signs in to an
  approved GitHub org. Fail-closed.

**Extension MCP servers and the allowlist.**
- `McpServer.start()` in VS Code evaluates the allow/deny policy for every server before
  starting it, and only then activates the contributing extension [S30].
- The identity is built from the definition label plus URL (HTTP) or command and args (stdio).
- **So an extension's server is subject to the same allowlist** (Source/Inferred; docs don't say
  so explicitly).
- An allowlist entry would have to match the exact command and args the extension produces.
  Machine-specific paths such as `/Users/<name>/.vscode/extensions/...` would change that per
  user. **Inferred.**

**Content exclusion** [S34]:
- Honored by completions everywhere, VS Code Chat, Visual Studio, JetBrains, the CLI, the app,
  GitHub.com and code review.
- **Not honored by VS Code Edit or Agent**, Xcode chat, or Eclipse chat.
- Doesn't apply to symlinks or remote filesystems.
- IDE-provided semantic info (types, hovers) can still leak excluded content.

### 1.10 How a VS Code extension integrates with Copilot

| API | Namespace / contribution | Stability | Since | Source |
|---|---|---|---|---|
| Language Model API | `vscode.lm.selectChatModels`, `LanguageModelChat.sendRequest` | Stable | 1.90 (May 2024); public in Stable 1.91 | S29 RN-1.90/1.91, vscode.d.ts |
| Chat Participant API | `vscode.chat.createChatParticipant`, `contributes.chatParticipants` | Stable (participant detection finalized 1.95) | 1.90 | S29 RN-1.90/1.95 |
| Language Model Tools API | `vscode.lm.registerTool`, `vscode.lm.tools`, `vscode.lm.invokeTool`, `contributes.languageModelTools` | Stable | 1.95 (Oct 2024); usable in agent mode from 1.99 | S29 RN-1.95/1.99 |
| MCP server definition provider | `vscode.lm.registerMcpServerDefinitionProvider`, `contributes.mcpServerDefinitionProviders`, `McpStdioServerDefinition`, `McpHttpServerDefinition` | Stable | Proposed in 1.100; shipped 1.101 (May 2025); `when` clause on the contribution in 1.105 | S27 S29 RN-1.100/1.101/1.105 |
| Language model chat provider (contribute models) | `vscode.lm.registerLanguageModelChatProvider` | Stable | 1.104 (Aug 2025) | RN-1.104, vscode.d.ts |
| Still proposed (not usable in Marketplace extensions) | `chatSessionsProvider`, `chatHooks`, `chatPromptFiles`, `mcpToolDefinitions`, `mcpServerDefinitions`, `remoteCodingAgents`, `languageModelToolSupportsModel`, others | Proposed | — | vscode-dts listing S29b |

Notes, all **Doc** unless marked:
- **Language Model API.**
  - The user must consent (an auth dialog), so call `selectChatModels` from a user action.
  - Requests can fail on quota; use `LanguageModelError`.
  - Extension usage counts against the user's quota.
  - Don't use it in integration tests.
  - The guide's list of model families (`gpt-4o`, `claude-3.5-sonnet`...) is **stale**. Treat it
    as UNVERIFIED which `family` strings map to current Claude models.
- **Tools API.** Extension tools always get a generic confirmation dialog, which can be
  customized with `prepareInvocation`. Tools can be `when`-gated. Admins can disable them all
  with `ChatAgentExtensionTools`.
- **Tools in other harnesses.** Extension tools reach the Copilot (Agent Host) harness only
  while the window with that extension is connected, and not every tool is exposed [S20][S21].
  Cloud sessions can't use them.
- **Where MCP servers come from** [S27][S21][S26e]:
  - **Local harness:** `.vscode/mcp.json`, user profile, extension providers, `vscode:mcp/install`
    links, `--add-mcp`, and discovery from other apps (`chat.mcp.discovery.enabled`, default
    `false`).
  - **Agent Host:** reads `.mcp.json` (workspace) and `~/.copilot/mcp-config.json`, plus
    servers VS Code forwards to it. Servers that need `${input:...}` are not forwarded.
- **MCP features VS Code supports** [S27]: stdio, streamable HTTP, SSE (legacy); tools,
  prompts (as `/mcp.server.prompt`), resources and templates, elicitation, sampling (user must
  authorize; per-server model access), OAuth (GitHub and Entra built in, plus DCR and a client
  credentials fallback), server instructions, roots, MCP Apps (inline UI), icons.

---

## 2. Copilot vs Claude Code

### 2.1 Comparison table

| Dimension | GitHub Copilot | Claude Code |
|---|---|---|
| Where the agent runs | Several places: VS Code extension host (Local), VS Code Agent Host process (can be remote, survives window close), `copilot` CLI terminal process, Copilot app (built on CLI), GitHub Actions (cloud agent) [S20][S21][S13][S39][S1] | Terminal CLI process; also VS Code and JetBrains extensions, desktop app, web/cloud, Slack. The CLI is the most complete surface; "scripting and the Agent SDK are CLI-only" [C8] |
| Compaction | VS Code auto-compacts plus `/compact` [S25b]. CLI auto-compacts at 95% plus `/compact`, `/context` [S13] | Auto-compaction with a configurable window, `/compact`, `/context` [C6][C11] |
| Checkpoints / undo | VS Code checkpoints per request [S23b]; CLI `/undo` / `/rewind` with or without files [S14] | Checkpoint before each prompt, `/rewind`, last 100 kept, persists across resume [C12] |
| Subagents | VS Code `runSubagent`, custom agents as subagents [S26d]; CLI built-in agents, depth 6, concurrency 2–32 by plan [S14] | Subagents with own context, custom subagents, forked subagents [C3] |
| Parallel agents | CLI `/fleet` and `--fleet`, multiple sessions, worktrees; VS Code multiple sessions, worktree isolation; Copilot app; cloud agent tasks [S14][S14d][S20][S39] | Agent view (research preview), agent teams (experimental, off by default), dynamic workflows, worktrees, cross-session messaging, `/batch` [C3] |
| Memory / instructions | `.github/copilot-instructions.md`, `*.instructions.md`, `AGENTS.md`, **and `CLAUDE.md`**; VS Code memory tool (preview, local); Copilot Memory (preview, cloud agent/CLI, Pro/Pro+/Max) [S23][S14][S26c][S1] | `CLAUDE.md` hierarchy (managed, user, project, local), `@imports`, `.claude/rules/`, auto memory [C5] |
| Permission model | VS Code: Manual / Assisted / Allow all, Autopilot, per-tool/URL/terminal rules, OS sandbox [S22]. CLI: allow/deny tool patterns, `/permissions default\|assisted\|allow-all`, folder trust, sandbox [S13][S14]. Cloud agent: MCP tools run unapproved inside a firewalled runner [S2] | Modes `default` (Manual), `acceptEdits`, `plan`, `auto` (classifier), `dontAsk`, `bypassPermissions`; allow/ask/deny rules; deny wins in every mode; sandboxed Bash [C4] |
| Headless | `copilot -p "..." [-s] [--output-format json] [--allow-tool ...] [--agent X] [--fleet]` [S14b] | `claude -p "..." --output-format json\|stream-json --allowedTools ... [--bare] [--json-schema]` [C2] |
| SDK | Copilot SDK (GA 2026-06-02): Node, Python, Go, .NET, Rust, Java; drives the CLI runtime [S42] | Claude Agent SDK: Python, TypeScript, plus CLI `-p` [C2] |
| MCP transports | stdio, HTTP, SSE in VS Code and CLI [S27][S14]; cloud agent `local/stdio/http/sse`, no OAuth [S44] | stdio, HTTP, SSE (deprecated), WebSocket [C1] |
| MCP features | VS Code: tools, prompts, resources, elicitation, sampling, roots, OAuth, MCP Apps [S27]. CLI: tools, instructions, sampling, elicitation; prompts/resources UNVERIFIED [S43]. Cloud agent/code review: **tools only** [S2] | Tools, resources (@-mention), prompts as commands, elicitation (plus `Elicitation` hook), OAuth, channels (push into session), tool search; can itself be an MCP server (`claude mcp serve`) [C1]. Sampling: not in its MCP doc (UNVERIFIED) |
| Org MCP control | `managed-settings.json` allow/deny (VS Code, CLI, app, JetBrains; not cloud agent); VS Code `ChatMCP`; org "MCP servers in Copilot" policy [S7][S19][S33] | Managed settings `allowedMcpServers` / `deniedMcpServers` / `allowManagedMcpServersOnly`, `managed-mcp.json` [C10] |
| Pricing | Seat plus pooled AI credits (token-metered, 1 credit = $0.01); completions unlimited; overage on by default for orgs [S11][S12] | API token billing, or Pro/Max/Team/Enterprise subscriptions; also via Bedrock, Google Agent Platform, gateways [C7][C8] |
| Models | Multi-vendor: OpenAI, Anthropic (Claude Haiku 4.5 through Opus 5 and Fable 5.1), Google, xAI, Moonshot, Microsoft; BYOK [S9][S25] | Anthropic Claude models (Sonnet, Opus, Haiku, Fable families; 1M context variants) [C11] |
| Extensibility | Skills, custom agents, hooks (Claude-compatible format), prompt files, plugins (Agent Plugins 1.0, Copilot, **Claude** formats) and marketplaces; VS Code extension APIs (LM, tools, participants, MCP provider) [S24][S28][S45] | Skills, subagents, hooks, slash commands, plugins and marketplaces, output styles, status line [C9][C13] |

### 2.2 What Claude Code does that Copilot does not (per docs read)

- **One Anthropic-native agent across terminal, IDE, desktop and web, with one config tree.**
  Copilot splits work across the extension host, Agent Host, CLI and Actions, and each has
  different tool and MCP limits. Example: the Copilot harness in VS Code can use only local MCP
  servers without auth [S20]. **Doc.**
- **Classifier-based `auto` permission mode and `dontAsk` for locked-down CI** [C4]. Copilot has
  "Assisted permissions" (a model judge) in VS Code Agent Host and the CLI [S22][S14], which is
  the closest equivalent.
- **Agent teams, dynamic workflows, and cross-session messaging between separate sessions** [C3].
  Copilot CLI has inter-agent messaging within one session tree [S14]. Messaging across
  independent sessions: **UNVERIFIED.**
- **MCP channels (push events into a live session) and WebSocket transport** [C1]. Not found in
  Copilot docs.
- **Claude Code can act as an MCP server** (`claude mcp serve`) [C1]. The Copilot CLI instead
  exposes ACP (Agent Client Protocol) [S13].

### 2.3 What Copilot does that Claude Code does not (per docs read)

- **Multi-vendor model choice under one bill**, including Claude models, with org-level
  per-model policy [S9].
- **Cloud agent tied to GitHub issues and PRs**, with `copilot-setup-steps.yml`, a managed
  firewall, commit signing, and automatic CodeQL, secret and dependency scanning of third-party
  agent output [S1][S3][S4][S36]. Claude Code has GitHub Actions and web sessions [C8], but the
  issue-assignment and Actions-environment model is Copilot's.
- **Runs other vendors' harnesses** (Claude Agent SDK, Codex) inside VS Code, billed to Copilot
  [S20].
- **VS Code-native integration points:** extension tools, chat participants, MCP definition
  providers, MCP Apps (inline UI in chat), and completions and next-edit suggestions, which are
  unlimited and unbilled [S27][S12].
- **Admin gate on GitHub org membership** before any AI feature turns on
  (`ChatApprovedAccountOrganizations`) [S19].

### 2.4 Cross-compatibility (useful for a Claude-first codebase)

- Copilot CLI: `CLAUDE.md`, `.claude/skills`, `.claude/agents`, `.claude/commands`,
  `.mcp.json`, and some `.claude/settings.json` keys [S14].
- VS Code: `CLAUDE.md`, `.claude/rules`, `.claude/skills`, `~/.claude/skills`, Claude hooks in
  `.claude/settings.json`, and Claude `.claude-plugin/plugin.json` plugins [S23][S24][S28].
- VS Code Local harness MCP comes from `.vscode/mcp.json`, extension providers, or discovery
  (off by default). The Agent Host reads `.mcp.json` [S21][S26e]. **So a workspace `.mcp.json`
  alone is not guaranteed to reach the Local harness unless discovery is on** (Inferred from
  docs; not tested).
- Hook scripts written for Claude Code need changes: Copilot tool names differ (`create_file`
  vs `Write`) and input fields are camelCase (`filePath` vs `file_path`) [S24].
- This repo's own `CLAUDE.md` says the extension generates an AI bundle (skills, `AGENTS.md`,
  `.mcp.json`). I did not open that code. How much of the bundle each Copilot surface picks up
  should be tested per surface, not assumed.

---

## 3. Open questions / UNVERIFIED

1. Default state of the org "MCP servers in Copilot" policy for Business and Enterprise.
2. Whether Copilot CLI supports MCP **prompts** and **resources** interactively.
3. Whether the CLI enforces the org "MCP servers in Copilot" policy. The docs contradict
   themselves [S13] vs [S33].
4. Which `vscode.lm.selectChatModels({vendor:'copilot', family})` strings return current Claude
   models. The guide is stale.
5. The extension-registered MCP server allowlist behavior was read from VS Code `main` source,
   not documentation. Confirm on the pinned VS Code version the team uses.
6. Claude Code MCP **sampling** support (not on its MCP page).
7. What exact `serverCommand` an extension-provided stdio server presents to the allowlist on
   each OS. It depends on how the extension builds the command.

---

## Sources (all read 2026-09-15)

GitHub Docs (read via `docs.github.com/api/article/body?pathname=...`):
- [S1] https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent — cloud agent triggers, Actions runtime, 59-min limit, customization, costs, limitations
- [S2] https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent — tools only, no OAuth remote, default GitHub/Playwright servers, no approval
- [S3] https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment — copilot-setup-steps.yml rules, runners, Windows, LFS
- [S4] https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall — firewall defaults, limits, org/repo settings
- [S5] https://docs.github.com/en/copilot/concepts/enterprise/policies — policy scope, multi-license resolution, CLI/app separate policies
- [S6] https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/block-agentic-features — block cloud agent / code review enterprise-wide
- [S7] https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings — managed-settings keys and client support, MCP matchers
- [S9] https://docs.github.com/en/copilot/reference/ai-models/supported-models — model list, per-client/per-plan tables, retirements, Fable data retention, min IDE versions
- [S10] https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing — per-1M-token prices, 1 credit = $0.01
- [S11] https://docs.github.com/en/copilot/get-started/plans — plan prices and included credits (incl. Max)
- [S12] https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises — pooling, what's billed, overage default on
- [S13] https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli — modes, permissions, compaction 95%, sandbox, BYOK, ACP, MCP policy limitation note
- [S14] https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference — slash commands, instruction/skill/agent/MCP locations, transports, subagent limits, built-in agents, allowlist
- [S14b] https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference — `-p`, `-s`, `--output-format json`, env vars, model precedence
- [S14c] https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference — `~/.copilot` layout, repo settings, MDM
- [S14d] https://docs.github.com/en/copilot/concepts/agents/copilot-cli/fleet — /fleet parallel subagents
- [S15] https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests — legacy premium requests, annual-plan scope
- [S31] https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-enterprise-allowlist — MCP allowlist evaluation order, fail-closed behavior
- [S31b] https://docs.github.com/en/copilot/concepts/enterprise/mcp-management — managed settings vs registry comparison
- [S32] https://docs.github.com/en/copilot/reference/enterprise-administrators/mcp-private-registry-enforcement — registry enforcement per surface and min versions
- [S33] https://docs.github.com/en/copilot/reference/supported-surfaces-for-policies — policy x surface table
- [S34] https://docs.github.com/en/copilot/concepts/context/content-exclusion — content exclusion support table (not VS Code agent/edit)
- [S35] https://docs.github.com/en/copilot/concepts/agents/anthropic-claude — Claude coding agent on GitHub (preview), Claude Agent SDK, models
- [S36] https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents — third-party agents, security scanning, costs, policies don't cover local VS Code agents
- [S37] https://docs.github.com/en/copilot/reference/copilot-feature-matrix — IDE feature matrix (appears stale)
- [S38] https://docs.github.com/en/copilot/get-started/sdk-quickstart — SDK languages, bundled CLI
- [S39] https://docs.github.com/en/copilot/concepts/agents/github-copilot-app — Copilot app built on CLI, separate policy
- [S44] https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers — cloud agent MCP JSON, `COPILOT_MCP_` secrets, types
- [S46] https://docs.github.com/en/copilot/reference/enterprise-administrators/policy-conflicts — least-restrictive resolution for CLI, preview features, MCP policy
- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli — install methods, PAT auth (cited in 1.6)
- https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/manage-policies — MCP policy scope note, partner agents toggle

GitHub Blog / changelog:
- [S40] https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/ — "formerly known as Copilot coding agent" (2026-04-01)
- [S41] https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/ — CLI GA 2026-02-25
- [S42] https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/ — SDK GA 2026-06-02, six languages
- [S45] https://github.blog/changelog/2026-08-12-agent-plugins-1-0-in-vs-code-copilot-cli-and-the-copilot-app/ — Agent Plugins 1.0 (2026-08-12)
- [S47] https://github.blog/changelog/2026-07-01-enterprise-managed-settings-json-is-generally-available/ — managed-settings.json GA (title seen in search results; body not opened)
- https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/ — billing change announced 2026-04-27, effective 2026-06-01
- https://github.blog/changelog/2026-06-17-github-copilot-app-generally-available/ — Copilot app GA (title seen in search results; body not opened)
- [S43] https://github.com/github/copilot-cli/blob/main/changelog.md — CLI 1.0.83 (2026-09-04); sampling 1.0.13; elicitation 0.0.421/1.0.10; server instructions 0.0.400

VS Code (code.visualstudio.com; markdown from github.com/microsoft/vscode-docs, DateApproved 9/9/2026):
- [S16] https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode — `!` commands, request queuing, checkpoint caveat
- [S17] https://code.visualstudio.com/docs/copilot/overview — surfaces, Agent/Plan, harness targets
- [S18] https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features — built-in tools, slash commands, permission levels, settings
- [S19] https://code.visualstudio.com/docs/enterprise/ai-settings (vscode-docs `docs/enterprise/ai-settings.md`) — all device policies, managed settings mapping, MCP allow/deny versions, `ChatAgentExtensionTools`, `Claude3PIntegration`, approved orgs gate
- [S20] vscode-docs `docs/agents/run/agent-harnesses.md` — Local/Copilot/Claude/Codex/Cloud harnesses, Claude billing, Copilot harness MCP limits
- [S21] vscode-docs `docs/agents/concepts/agent-host.md` + `docs/agents/concepts/agent-harnesses.md` — Agent Host, extension-host differences, `.mcp.json` reading
- [S22] vscode-docs `docs/agents/run/approvals.md` — permission levels, autopilot, tool/URL/terminal approvals, sandbox
- [S23] vscode-docs `docs/agent-customization/custom-instructions.md` — AGENTS.md, CLAUDE.md, `.claude/rules`
- [S23b] vscode-docs `docs/agents/run/review-code-edits.md` — checkpoints
- [S24] vscode-docs `docs/agent-customization/hooks.md` + `agent-skills.md` — Claude hook compatibility and differences; skill locations
- [S25] vscode-docs `docs/agent-customization/language-models.md` — model picker, BYOK, admin BYOK policy
- [S25b] vscode-docs `docs/agents/concepts/context.md` — index, compaction
- [S26] vscode-docs `docs/agents/run/tools.md` — 128-tool limit, virtual tools
- [S26b] vscode-docs `docs/agents/reference/workspace-context.md` — `#codebase`, semantic index
- [S26c] vscode-docs `docs/agents/run/memory.md` — memory tool scopes
- [S26d] vscode-docs `docs/agents/run/subagents.md` — subagents
- [S26e] vscode-docs `docs/agent-customization/mcp-servers.md` + `docs/agents/reference/mcp-configuration.md` — MCP config sources, discovery setting
- [S27] https://code.visualstudio.com/api/extension-guides/ai/mcp — MCP feature support, `registerMcpServerDefinitionProvider` usage
- [S28] vscode-docs `docs/agent-customization/agent-plugins.md` — plugin formats incl. Claude
- [S29] VS Code release notes (vscode-docs `release-notes/`): v1_90 (LM + Chat APIs finalized), v1_91 (in Stable), v1_95 (LM Tools API finalized), v1_99 (tools in agent mode), v1_100 (MCP provider proposed), v1_101 (MCP extension APIs), v1_104 (LanguageModelChatProvider finalized), v1_105 (`when` on provider), v1_109/v1_110/v1_126 (Edit mode hidden/deprecated/removed), v1_137 (2026-09-09 current stable)
- [S29b] https://github.com/microsoft/vscode/tree/main/src/vscode-dts — `vscode.d.ts` contains registerMcpServerDefinitionProvider, registerTool, selectChatModels, createChatParticipant, registerLanguageModelChatProvider; proposed file listing
- [S30] https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpServer.ts — `_evaluatePolicy` in `start()` before extension activation; `allowedMcpServers.ts` matcher
- vscode-docs `api/extension-guides/ai/language-model.md`, `tools.md`, `ai-extensibility-overview.md` — consent, quotas, tool confirmation, contribution fields

Claude Code (code.claude.com/docs/en/*.md):
- [C1] https://code.claude.com/docs/en/mcp — transports (stdio/http/sse/ws), resources, prompts, elicitation, channels, `claude mcp serve`
- [C2] https://code.claude.com/docs/en/headless — `claude -p`, `--output-format`, `--bare`, Agent SDK
- [C3] https://code.claude.com/docs/en/agents — subagents, agent view, agent teams, workflows, cross-session messaging
- [C4] https://code.claude.com/docs/en/permission-modes — six permission modes, deny precedence
- [C5] https://code.claude.com/docs/en/memory — CLAUDE.md scopes, rules, auto memory, imports
- [C6] https://code.claude.com/docs/en/context-window — context and compaction (index entry)
- [C7] https://code.claude.com/docs/en/costs — token billing, subscription plans
- [C8] https://code.claude.com/docs/en/platforms — surfaces; SDK and scripting CLI-only
- [C9] https://code.claude.com/docs/en/plugins — plugin structure, marketplaces
- [C10] https://code.claude.com/docs/en/managed-mcp — managed MCP allow/deny keys
- [C11] https://code.claude.com/docs/en/model-config — models, 1M context, auto-compact window
- [C12] https://code.claude.com/docs/en/checkpointing — checkpoints, /rewind, 100 retained
- [C13] https://code.claude.com/docs/llms.txt — doc index (skills, hooks, output styles, status line)
