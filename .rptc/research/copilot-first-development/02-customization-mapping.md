# Claude Code customizations -> GitHub Copilot: how each concept maps

Research date: 2026-09-15. Read-only research; no repository files were edited.

How to read this document:

- **Documented** = stated in a primary doc (URL + date in Sources).
- **Source** = read directly from Microsoft's VS Code source at tag `1.137.0` (the current
  stable release, published 2026-09-09) or from the Copilot CLI changelog.
- **Inferred** = my reading of two or more facts together; not stated anywhere.
- **UNVERIFIED** = no primary source found; needs a direct test before anyone relies on it.

Where the docs and the shipped source disagree, both are stated.

---

## 0. The answer in brief

1. **Most of the text-based material carries over with no conversion.** Every Copilot
   surface reads `AGENTS.md`. VS Code, Copilot CLI and the Copilot cloud agent also read
   `CLAUDE.md` and `.claude/skills/<name>/SKILL.md` directly. All 39 repo skills and all 15
   generated-project skill templates pass Copilot's skill name/description rules (checked by
   script; see Part C).
2. **`.mcp.json` (Claude's format) is read by Copilot CLI, by the VS Code Agent Host, and by
   VS Code's workspace discovery in 1.137.0.** The cloud agent does not read it; it takes MCP
   config from repository settings on github.com.
3. **Hooks are the dangerous part.** Copilot does read `.claude/settings.json` hooks in
   some places, but it runs them under a different contract. For THIS repo, the
   likely result in Copilot CLI (and in VS Code's Copilot harness, which runs the same
   engine) is that **every matched Bash/Edit/Write/WebFetch call is denied**. The cause:
   `$CLAUDE_PROJECT_DIR` is not set, so the router path resolves to `/.claude/hooks/router.sh`,
   and Copilot treats a failing PreToolUse hook as a deny. That is reported in open
   issue github/copilot-cli#4001, on Windows. On macOS it is UNVERIFIED. For a generated demo
   project opened in VS Code's Local harness with Claude hooks switched on, the `aio` guard
   hook (`echo ...; exit 2`) would **block every tool call**, because VS Code ignores
   matchers. Details in Part A.5 and Part C.
4. **Permissions (`allow`/`deny` lists) have no file-based equivalent.** They become VS Code
   settings (`chat.tools.terminal.autoApprove` and related) or Copilot CLI flags
   (`--allow-tool` / `--deny-tool`).
5. **There is a low-conversion option worth deciding on first.** VS Code 1.137 has a
   **Claude harness**, one of the agent runtimes you can pick for a chat session. It runs on
   Anthropic's Claude Agent SDK and reads `.claude/` natively: settings.json hooks,
   `.mcp.json` and skills. It can be billed through a Copilot subscription. If "must use
   Copilot" means "must be billed through Copilot", this harness keeps nearly everything
   working unchanged. If it means "must use GitHub's own Copilot agent", it does not help.
   Whether the org's policy allows it is UNVERIFIED.

---

## Part A — How Copilot handles each concept

### A.0 Which Copilot are we talking about?

These are separate runtimes, and they honor customizations differently. VS Code 1.137 docs
call the in-editor runtimes "agent harnesses".

| Surface | What it is | Notes |
|---|---|---|
| VS Code **Local** harness | Agent runs in the VS Code extension host | Docs: "the Local agent will be removed in a future release". Several settings below apply only here. |
| VS Code **Copilot** harness | Runs in the Agent Host process; "powered by the Copilot SDK" | The docs recommend it as the default for coding work. It aligns with Copilot CLI behavior. |
| VS Code **Claude** harness | Anthropic Claude Agent SDK inside VS Code | Enabled by default (`github.copilot.chat.claudeAgent.enabled: true`). Billed via Copilot subscription or Anthropic credentials. |
| **Copilot CLI** (`copilot`) | Terminal agent | Latest changelog entry: 1.0.83, 2026-09-04. |
| **Copilot cloud agent** (github.com; formerly "coding agent") | Runs in an ephemeral Linux sandbox and opens pull requests | Reads only repo-committed config. |

### A.1 Always-on instructions

| File | VS Code chat | Copilot CLI | Cloud agent | Code review (github.com) |
|---|---|---|---|---|
| `.github/copilot-instructions.md` | yes | yes | yes | yes |
| `.github/instructions/**/*.instructions.md` (`applyTo` glob) | yes | yes | yes | yes |
| `AGENTS.md` (root) | yes (`chat.useAgentsMdFile`, default `true`) | yes: root, cwd, dirs between, and nested dirs on the edited file's path | yes | yes |
| nested `AGENTS.md` | opt-in `chat.useNestedAgentsMdFiles` (default `false`, experimental) | yes (see above) | not stated | not stated |
| `CLAUDE.md`, `.claude/CLAUDE.md` | yes (`chat.useClaudeMdFile`, default `true`); also `~/.claude/CLAUDE.md` and `CLAUDE.local.md` | yes, both paths | yes (`AGENTS.md`, `CLAUDE.md` or `GEMINI.md`) | no |
| `.claude/rules/*` | yes. Read as file-based instructions with Claude's `paths:` array instead of `applyTo` | not listed | not listed | not listed |
| User-level | `~/.copilot/instructions`, `~/.claude/rules`. Agent Host reads these folders, not profile data | `~/.copilot/copilot-instructions.md`, `~/.copilot/instructions/**/*.instructions.md` | n/a | n/a |
| Organization instructions | `github.copilot.chat.organizationInstructions.enabled` (default `false`) | — | yes | yes |

Frontmatter for `*.instructions.md`:

- `name`, `description`, `applyTo` (comma-separated globs). Without `applyTo`, VS Code does
  not auto-apply the file.
- `excludeAgent: "code-review" | "cloud-agent"` exists on the github.com surfaces.

Precedence:

- VS Code: all files are combined in "no specific order". On conflict, personal > repository
  > organization.
- CLI: all files are combined. Identical copies are de-duplicated. There is "no general
  precedence order".

Imports:

- Copilot CLI expands `@relative/path` in `copilot-instructions.md`, `AGENTS.md` and
  `CLAUDE.md`. This shipped in CLI 1.0.66 (2026-06-30). Paths must stay inside the repo.
- VS Code does not document `@` imports. It follows Markdown links (setting
  `chat.includeReferencedInstructions`). Whether VS Code expands `@AGENTS.md`: UNVERIFIED.

**Doc disagreement.** GitHub's "Support for different types of custom instructions" matrix
lists VS Code chat as reading only `copilot-instructions.md`, `*.instructions.md` and
`AGENTS.md`. VS Code's own docs (2026-09-09) and settings reference say VS Code also reads
`CLAUDE.md` by default. The VS Code docs are the more specific and more recent source.

### A.2 Prompt files (`*.prompt.md`) — slash commands

- **Location:** `.github/prompts/` in the workspace; user prompt files live in profile data.
- **Frontmatter:** `description`, `name`, `argument-hint`, `agent` (ask, agent, plan, or a
  custom agent), `model`, `tools`. The body may use `${input:x}`, `${selection}` and
  `#tool:name`.
- **Status (documented 2026-09-09):** "Prompt files are deprecated for Agent Host sessions
  and aren't loaded by Agent Host. They continue to work with the Local agent for now, but
  the Local agent will be removed in a future release."
- **Migration:** a built-in converter to skills exists
  (`chat.customizations.promptMigration.enabled`, default `true`).
- **Copilot CLI** does not use `.prompt.md`. It supports Claude-style `.claude/commands/*.md`
  as "an alternative skill format". The name comes from the filename. Supported fields:
  `argument-hint`, `description`, `allowed-tools`, `disable-model-invocation`.
- **VS Code** docs do not mention `.claude/commands/`. Whether VS Code reads it: UNVERIFIED.
- **Conclusion:** the forward path for slash commands on every Copilot surface is **skills**.

### A.3 Custom agents (formerly chat modes) and subagents

**Files.** Custom agents are `*.agent.md` files. `.chatmode.md` is the legacy name; the fix
is to rename it. Locations:

| Surface | Workspace / repo | User |
|---|---|---|
| VS Code | `.github/agents/`, `.claude/agents/` | `~/.copilot/agents`, `~/.claude/agents` |
| Copilot CLI | walks from cwd up to the git root; `.github/agents/` beats `.claude/agents/` at the same level | `~/.copilot/agents/`. CLI 1.0.36 stopped loading agents, skills and commands from `~/.claude/` |
| Cloud agent | `.github/agents/` on the default branch | org/enterprise level via the `.github` or `.github-private` repo |

**VS Code frontmatter:**

- `description`, `name`, `argument-hint`
- `tools`: list; supports tool sets and `server/*` for all of an MCP server's tools
- `agents`: allowed subagents; `*` or `[]`
- `model`: string or a prioritized list
- `user-invocable`, `disable-model-invocation` (`infer` is deprecated)
- `target`: `vscode` or `github-copilot`
- `mcp-servers`: used only on GitHub Copilot surfaces
- `handoffs[]`: `label`, `agent`, `prompt`, `send`, `model`
- `hooks`: Preview; also needs `chat.useCustomAgentHooks: true`

**GitHub reference (cloud agent, CLI, IDEs):**

- `description` is required. Body max 30,000 characters.
- `tools` accepts aliases, case-insensitive: `execute` (= `shell`, `Bash`), `read` (= `Read`),
  `edit` (= `Edit`, `Write`, `MultiEdit`), `search` (= `Grep`, `Glob`),
  `agent` (= `Task`), `web` (= `WebFetch`, `WebSearch`), `todo` (= `TodoWrite`).
- Unrecognized tool names are ignored.
- `argument-hint` and `handoffs` are ignored on github.com.
- MCP `type: stdio` maps to cloud agent `local`.

**CLI-only fields:** `models`, `modelPolicy`, `reasoningEffort`.

**Claude agent format.** VS Code reads `.claude/agents/*.md` with Claude fields
(`name`, `description`, comma-separated `tools`, `disallowedTools`) and "maps
Claude-specific tool names to the corresponding VS Code tools".

**Subagents:**

- VS Code: the `agent/runSubagent` tool (internal id `runSubagent`). Nesting is off unless
  `chat.subagents.allowInvocationsFromSubagents` is enabled.
- Copilot CLI: the `task` tool. Depth limit 6 by default; concurrency depends on plan
  (Pro: 4).

### A.4 Skills (Agent Skills open standard)

**Locations.** `.claude/skills/` IS read directly. No conversion is needed for the folder.

| Surface | Project locations | Personal locations |
|---|---|---|
| VS Code (all harnesses per docs) | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Copilot CLI | priority order (first found wins on a name clash): `.github/skills/` > `.agents/skills/` > `.claude/skills/` > parent `.github/skills/` | `~/.copilot/skills/`, `~/.agents/skills/` (NOT `~/.claude/skills/`) |
| Cloud agent, code review, Copilot app, JetBrains | `.github/skills`, `.claude/skills`, `.agents/skills` | — |

**Frontmatter (VS Code):**

- `name`: required; lowercase letters, digits and hyphens; must equal the directory name;
  max 64. A bad name "causes the skill to silently fail to load".
- `description`: required; max 1024.
- Optional: `argument-hint`, `user-invocable` (default `true`), `disable-model-invocation`
  (default `false`), `context: fork` (experimental; needs
  `github.copilot.chat.skillTool.enabled`).

**Copilot CLI** adds `allowed-tools` (string or list; pre-approves tools while the skill is
active).

**The open standard** (agentskills.io) defines `name`, `description`, `license`,
`compatibility` (max 500), `metadata`, and `allowed-tools` (experimental). It also sets
extra name rules: no leading, trailing or double hyphen.

**Progressive loading** (documented):

1. `name` and `description` are read up front.
2. The `SKILL.md` body loads when the task matches, or when the user types `/skill-name`.
3. Referenced files load only when the body links to them.

VS Code note: extra files must be linked from `SKILL.md` "for them to be picked up". The CLI
instead "discovers all of the files in the skill's directory".

**Settings.** No enable setting is needed. `chat.agentSkillsLocations` is deprecated and
used only by the Local harness.

**Extensions** can ship skills through the `contributes.chatSkills` contribution point in
`package.json` (`{ "path": "./skills/x/SKILL.md" }`). The directory name must match `name`.

**Claude-only fields with no Copilot meaning:** `model`, `effort`, `agent`, `background`,
`arguments`, `paths`, `shell`, `hooks`, `disallowed-tools`. Neither this repo's skills nor
the generated ones use any of them (Part C).

### A.5 Hooks

#### A.5.1 VS Code Local harness (extension host)

**Files read:**

- `.github/hooks/*.json`
- `.claude/settings.json`, `.claude/settings.local.json`
- `~/.copilot/hooks`, `~/.claude/settings.json`
- plugin `hooks.json`
- `hooks:` in `.agent.md` frontmatter (needs `chat.useCustomAgentHooks`)

The list is controlled by `chat.hookFilesLocations`. Status: Preview. Organizations can
disable hooks by policy.

**Master switches (Source, 1.137.0):**

- `chat.useHooks`: default `true`.
- `chat.useClaudeHooks`: **default `false`**. "Controls whether hooks from Claude
  configuration files can execute. When disabled, only Copilot-format hooks are used ...
  This setting is only used by the Local agent harness."
- When a workspace has Claude-format hooks and the setting is off, VS Code shows the notice
  "Claude Code hooks are available for this workspace. Enable".
- **Docs vs source:** the hooks doc says VS Code reads `.claude/settings.json` "by default".
  In the shipped source those files are loaded, then skipped unless the user opts in.

**Events (8):** `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`.

**Entry format:**

- `{ "type": "command", "command", "windows"|"linux"|"osx", "cwd", "env", "timeout" }`
  (timeout default 30 s).
- Claude-style nested `{ matcher, hooks: [...] }` is parsed.
- **Matchers are ignored.** Documented: "Hook matchers like "Edit|Write" are parsed but not
  applied. All hooks run on every matching event."

**Input:** JSON on stdin with `timestamp`, `cwd`, `session_id`, `hook_event_name`,
`transcript_path`, `tool_name`, `tool_input`, `tool_use_id`, and `tool_response` for
PostToolUse.

- Documented: tool input properties are **camelCase** (`tool_input.filePath`, not
  `file_path`).
- Tool names differ from Claude's. Source `toolNames.ts`: `run_in_terminal`, `create_file`,
  `replace_string_in_file`, `multi_replace_string_in_file`, `read_file`, `fetch_webpage`,
  `runSubagent`.
- The docs' own examples use yet other names (`runTerminalCommand`, `editFiles`). Treat
  exact names as something to capture from the Agent Debug Logs.

**Output and exit codes:**

| Mechanism | Effect |
|---|---|
| exit `0` | stdout parsed as JSON |
| exit `2` | "blocking error: stop processing and show error to model" |
| other non-zero | non-blocking warning shown to the user |
| `continue: false` + `stopReason` | stops the whole session |
| `systemMessage` | warning shown to the user |
| PreToolUse `hookSpecificOutput` | `permissionDecision` (`allow`/`deny`/`ask`), `permissionDecisionReason`, `updatedInput`, `additionalContext` |
| PostToolUse | `decision: "block"` + `reason`, `additionalContext` |
| Stop / SubagentStop | `decision: "block"` + `reason` (check `stop_hook_active`) |
| SessionStart | `additionalContext` |

**Environment (Source, `hookExecutor.ts`):**

- `env = process.env + hook.env`.
- `cwd = hook.cwd` or else the **home directory**.
- No `CLAUDE_PROJECT_DIR` handling was found in the Claude compatibility layer
  (`hookClaudeCompat.ts`, 1.137.0).

#### A.5.2 Copilot CLI (and, inferred, the VS Code Copilot harness)

**Files, in load order:** policy (`/etc/github-copilot/policy.d/*.json`) → `.github/hooks/*.json`
→ `~/.copilot/hooks/*.json` → inline `hooks` in `.github/copilot/settings.json` or
`settings.local.json` → **also `.claude/settings.json` and `.claude/settings.local.json`**
(since CLI 1.0.12, 2026-03-26) → `~/.copilot/settings.json` → plugins. All sources are
combined.

**VS Code Copilot harness.** Source, `copilotSessionLauncher.ts` (1.137.0), passes
`enableFileHooks: true` to the SDK. A comment in `copilotAgent.ts` names
`.claude/settings.json` among the hook sources that discovery recognizes. Inferred: file
hooks there follow CLI semantics.

**Native format:**

- `{ "version": 1, "hooks": { "preToolUse": [ { "type": "command", "bash", "powershell",
  "command", "cwd", "env", "timeoutSec" } ] } }`.
- Also `exec` + `args` entries, `http` hooks, and `prompt` hooks (sessionStart only).

**Events:** `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `userPromptTransformed`,
`preToolUse`, `postToolUse`, `postToolUseFailure`, `permissionRequest`, `agentStop`,
`subagentStart`, `subagentStop`, `preCompact`, `errorOccurred`, `notification`.

**Two payload styles:**

- camelCase event name (`preToolUse`) → camelCase input (`toolName`, `toolArgs`).
- PascalCase event name (`PreToolUse`, the Claude/VS Code name) → snake_case input
  (`tool_name`, `tool_input`).
- For PascalCase `PreToolUse` and `PermissionRequest`, **Claude matcher semantics apply** and
  `tool_name` is reported as the Claude name:

  | Copilot runtime tool | Claude name reported |
  |---|---|
  | `bash`, `powershell` | `Bash` |
  | `create` | `Write` |
  | `edit` | `Edit` |
  | `view` | `Read` |
  | `web_fetch` | `WebFetch` |
  | `task` | `Agent` |

- Other matchers (`postToolUse` and the rest) are regexes anchored as `^(?:PATTERN)$` against
  the runtime tool name. The docs do not say whether PascalCase `PostToolUse` also gets
  Claude semantics: UNVERIFIED.
- The keys inside `tool_input` (for example `file_path` vs `path`) are not documented:
  UNVERIFIED.

**Exit codes:**

- `preToolUse` is **fail-closed**. Exit 2, a crash, or any other non-zero exit denies the tool
  call, even if stdout says `allow`. Timeouts are fail-open.
- For `agentStop` / `Stop`, exit 2 is only a warning. To force the agent to keep going,
  print `{"decision":"block","reason":...}` on stdout. The CLI gives up after 8 consecutive
  blocks.

**Environment.** Open issue github/copilot-cli#4001 (filed 2026-07-01, confirmed by a second
user 2026-07-07): "`$CLAUDE_PROJECT_DIR` is not provided, and hooks run from cwd `/`" for
`.claude/settings.json` hooks. The CLI changelog (1.0.12) says only **plugin** hooks receive
`CLAUDE_PROJECT_DIR`. The report is from Windows; the macOS behavior is UNVERIFIED.
Workaround from the issue: read `cwd` from the stdin JSON.

**Prompt mode (`-p`).** Repo hooks load only if the folder is trusted, `COPILOT_ALLOW_ALL` is
set, or `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS=true`.

**Kill switch.** `disableAllHooks: true` in a hooks file or in repo `settings.json`.

#### A.5.3 Cloud agent

- Reads only `.github/hooks/*.json` from the cloned repo.
- Runs in Linux with `bash`/`command` only. `ask` is treated as `deny`. No user-level hooks,
  no `settings.json`.
- **`.claude/settings.json` hooks are not read.**

#### A.5.4 VS Code Claude harness

Source, `claudeHookScan.ts` (1.137.0): the Claude Agent SDK loads hooks via
`settingSources: ['user','project','local']`, meaning `.claude/settings.json`,
`.claude/settings.local.json` and `~/.claude/settings.json`. Hooks "already fire at runtime".
Inferred: Claude Code semantics apply (matchers, `CLAUDE_PROJECT_DIR`, exit 2). UNVERIFIED by
experiment.

### A.6 MCP configuration

| File / place | Format | Read by |
|---|---|---|
| `.vscode/mcp.json` | `{ "servers": { name: { "type": "stdio"\|"http"\|"sse", command, args, env, envFile, cwd, dev, sandboxEnabled } }, "inputs": [ promptString\|pickString\|command ] }`; variables `${input:id}`, `${workspaceFolder}`, `${userHome}`, `${env:X}` | VS Code. The Agent Host does not read it directly; VS Code forwards these servers "except servers that require interactive input (`${input:...}`)" |
| user `mcp.json` (per VS Code profile) | same | VS Code |
| **`.mcp.json` (workspace root)** | Claude format `{ "mcpServers": { ... } }` | Copilot CLI (cwd up to git root; folder must be trusted). VS Code Agent Host "reads natively". **VS Code workbench in 1.137.0** via `WorkspaceDotMcpDiscovery`, registered unconditionally unless `chat.mcp.access` is `none` or `registry`; trust prompt on first start (Source). VS Code Claude harness. |
| `.github/mcp.json` | `mcpServers` | Copilot CLI |
| `~/.copilot/mcp-config.json` | `mcpServers` | Copilot CLI (lowest priority); VS Code Agent Host |
| `chat.mcp.discovery.enabled` (default `false`) | — | VS Code: imports from Claude Desktop, Copilot CLI, Windsurf, Cursor global/workspace (Source enum). **Claude Code's `~/.claude.json` is not in the list.** |
| Repo Settings → Copilot → MCP servers (github.com) | JSON `mcpServers`, **required `tools` allowlist**, `type` `local`/`stdio`/`http`/`sse`, secrets only via `COPILOT_MCP_*` | Cloud agent + code review. Tools only (no resources or prompts); no OAuth remotes; tools run **without approval**. |
| `mcp-servers:` in `.agent.md` | YAML version of the above | GitHub Copilot surfaces only; "Not used in VS Code" |
| Extension API | `contributes.mcpServerDefinitionProviders` + `vscode.lm.registerMcpServerDefinitionProvider` (`McpStdioServerDefinition`, `McpHttpServerDefinition`) | VS Code. Minimum engine version UNVERIFIED. |

**Limits and tool naming:**

- VS Code: 128 tools per chat request. Setting `github.copilot.chat.virtualTools.threshold`
  (default `128`) groups tools to go past that.
- VS Code tool sets: `.toolsets.jsonc`. Agents and prompts reference MCP tools as `server/*`
  or `server/tool`.
- Copilot CLI names MCP tools `serverName-toolName` (max 64 characters, sanitized), not
  Claude's `mcp__server__tool`.
- VS Code Copilot harness: "can currently access only local MCP servers that don't require
  authentication".

### A.7 Plugins and marketplaces

**VS Code agent plugins:**

- `chat.plugins.enabled` (default `false`).
- `chat.plugins.marketplaces` default: `github/copilot-plugins`, `github/awesome-copilot`.
- Auto-detects four formats: Agent Plugins 1.0 (`plugin.json` with `$schema`), Copilot
  (`plugin.json`), **Claude (`.claude-plugin/plugin.json`)**, legacy OpenPlugin.
- Expands `${CLAUDE_PLUGIN_ROOT}` for Claude-format plugins.
- Plugin skills are namespaced `/plugin:skill`.

**Copilot CLI:** `copilot plugin install <name>@<marketplace>`; plugin hooks receive
`CLAUDE_PROJECT_DIR`, `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT`.

**Skills from the command line:** `gh skill` (GitHub CLI 2.90+, public preview) and
`copilot skill add|list|remove`.

---

## Part B — Conversion mapping, Claude -> Copilot

| Claude Code | Copilot equivalent | Carries over as-is? | What is lost or different |
|---|---|---|---|
| `CLAUDE.md` (root) | `AGENTS.md` (read everywhere) or `.github/copilot-instructions.md` (the only one github.com **code review** reads) | VS Code, CLI and cloud agent read `CLAUDE.md` directly | `@import` expansion is CLI only (≥1.0.66). VS Code gives no order guarantee. Code review and GitHub.com chat ignore `CLAUDE.md`. Claude-specific wording ("invoke the Skill tool", `mcp__x__y` names) becomes inaccurate. |
| `.claude/CLAUDE.md` | same | VS Code and CLI read it | same |
| `~/.claude/CLAUDE.md` | `~/.copilot/copilot-instructions.md` (CLI); VS Code reads `~/.claude/CLAUDE.md` | VS Code yes; CLI no (not in its list) | — |
| `.claude/rules/*.md` (Claude rules with `paths:`) | `.github/instructions/*.instructions.md` with `applyTo:` | VS Code reads `.claude/rules` | CLI and cloud agent do not list `.claude/rules`. `.mdc` files (Cursor format) are not documented anywhere: UNVERIFIED. |
| `.claude/skills/<name>/SKILL.md` | same file; optionally `.github/skills/` or `.agents/skills/` | **Yes** on VS Code, CLI, cloud agent | Claude-only frontmatter (`model`, `context: fork` + `agent`, `paths`, `hooks`, `effort`, `arguments`) is ignored or partly supported. VS Code loads extra files only if linked. `~/.claude/skills` is not read by the CLI. |
| `.claude/commands/*.md` | a skill (`.github/skills/<name>/SKILL.md`); `.prompt.md` only for the Local harness (deprecated) | CLI reads `.claude/commands/`; VS Code: UNVERIFIED | `$ARGUMENTS` placeholder semantics: UNVERIFIED on Copilot. |
| `.claude/agents/*.md` (subagents) | `.github/agents/<name>.agent.md` | VS Code and CLI read `.claude/agents/`; cloud agent reads only `.github/agents/` | Claude `tools` names are mapped by alias. `model` values need Copilot model names. Claude `permissionMode`, `hooks` and `skills` fields: no documented mapping (UNVERIFIED). `handoffs` is VS Code only. |
| `.claude/settings.json` → `hooks.PreToolUse` with `matcher`, exit 2 = block, JSON stdin | `.github/hooks/<name>.json` in Copilot format, **or** keep the Claude file but make the scripts runtime-neutral | Partly. CLI and the VS Code Copilot harness read it. VS Code Local reads it only with `chat.useClaudeHooks: true` and **ignores matchers**. Cloud agent does not read it. | No `CLAUDE_PROJECT_DIR` (CLI issue #4001; VS Code executor sets none). VS Code Local tool names and camelCase `tool_input` differ; the matcher has to move into the script. CLI PreToolUse is fail-closed on **any** non-zero exit, so a broken path denies every call. |
| `PostToolUse` (`Write\|Edit`) | same event | as above | VS Code Local: runs after every tool. CLI: regex against runtime names (`create`, `edit`) is case-sensitive, so `Write\|Edit` may never match (UNVERIFIED). |
| `SessionStart` | `SessionStart` / `sessionStart` (`additionalContext`) | yes | VS Code fires on the first prompt, not at startup. |
| `Stop` (exit 2 = keep going) | VS Code `Stop` with `hookSpecificOutput.decision:"block"`; CLI `agentStop` with `decision:"block"` | partly | **CLI: exit 2 on Stop is only a warning.** Blocking needs JSON on stdout. |
| `UserPromptSubmit` (exit 2 blocks and erases the prompt) | `UserPromptSubmit` / `userPromptSubmitted` | event exists | CLI drops command-hook output for this event. No documented prompt blocking on either surface. |
| `.mcp.json` | keep it; add `.vscode/mcp.json` (`servers` + `type`) only for VS Code configurations that do not discover `.mcp.json` | **Yes** for CLI, VS Code Agent Host, VS Code 1.137 workbench | Cloud agent needs repo-settings JSON with a `tools` allowlist. CLI tool names become `server-tool`, so any text or hook matcher naming `mcp__server__tool` goes stale. |
| `~/.claude.json` `mcpServers` (user MCP) | `~/.copilot/mcp-config.json` (CLI + Agent Host); VS Code user `mcp.json`; or the extension API provider | No | — |
| `permissions.allow` / `deny` (settings.json, settings.local.json) | VS Code settings `chat.tools.terminal.autoApprove` (command or `/regex/`), `chat.tools.urls.autoApprove`, `chat.tools.edits.autoApprove`, `chat.tools.global.autoApprove`. CLI flags `--allow-tool='shell(git:*)'`, `--deny-tool=...`, `--available-tools`, `--excluded-tools`, plus per-location `~/.copilot/permissions-config.json`. Skill `allowed-tools`. Cloud agent: MCP `tools` list. | **No file equivalent** | VS Code: a `false` rule only requires approval; "to block a terminal tool call, use a PreToolUse hook". CLI `permissions-config.json` has no deny rules and is not repo-shared; deny rules live only in flags. Cloud agent pre-approves every tool. |
| Claude plugins (`.claude-plugin/plugin.json`) | VS Code agent plugins (reads Claude format); CLI plugins | Mostly | `chat.plugins.enabled` defaults off. |
| `claude --continue -- '<prompt>'` launch | `copilot --continue`; `copilot -i PROMPT` starts an interactive session with a prompt | n/a | — |

**Conversion tooling:**

- **Official:** no Claude→Copilot converter in `github/awesome-copilot` (tree checked at its
  2026-09-15 commit). VS Code has a built-in prompt-file→skill migration. VS Code
  `/create-hook` and `/create-agent` can generate Copilot-format files.
- **Official one-liner (CLI docs):** `.vscode/mcp.json` → `.mcp.json`
  (`jq '{mcpServers: .servers}'`).
- **Community (not evaluated):** `haiyang-dev/converting-claude-plugins-to-copilot-plugins`,
  `euxx/claude-skills-for-copilot`, `ejtx16/claude-code-copilot-cli-agentic-coding-skill`.

---

## Part C — What this team actually has, and how each piece converts

### C.1 Repo-level (developing the extension)

Root: `.claude/`

| Item | Count / shape (current behavior) | Converts how | Lost / risk |
|---|---|---|---|
| `CLAUDE.md` (repo root) + nested `src/**/CLAUDE.md` | Large always-on file. Nested ones load on demand in Claude Code. | Read as-is by VS Code, CLI, cloud agent. Nested `CLAUDE.md` in subfolders: CLI discovers instruction files "in directories nested in the path of a file it is working on"; VS Code nested discovery is documented only for `AGENTS.md` (UNVERIFIED for `CLAUDE.md`). | Text references Claude tools and "invoke the skill". Code review on github.com reads only `.github/copilot-instructions.md` / `AGENTS.md`. |
| `skills/*/SKILL.md` | **39** skills (all tracked). Frontmatter uses only `name` + `description`. All names match their folder, match `[a-z0-9-]`, and descriptions are 187–574 characters (script check with control; see below). Some folders carry scripts (`backlog-item/backlog.mjs`, `dogfood.sh`; `webview-visual-baseline` has 7 files). | **Read as-is** by VS Code, CLI and cloud agent from `.claude/skills/`. | In VS Code, helper scripts load only if linked from `SKILL.md`. 24 skills mention `.claude/` paths and 10 mention `CLAUDE.md` (still true on disk, so harmless). 1 skill uses `mcp__` tool naming. |
| `settings.json` hooks | **Stop** runs 6 scripts: `eslint-changed.sh`, `doc-drift.sh`, `deletion-scan-router.sh` (exit 2, once per session), `component-reuse-check.sh`, `rptc-record-drift.sh`, `backlog-claim-drift.sh`. **PreToolUse** matcher `Bash\|Edit\|Write\|WebFetch\|WebSearch\|mcp__adobe-exl__.*\|...` → `router.sh`. **PostToolUse** `Edit\|Write` → `format-on-edit.sh`. Every command is `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/<x>.sh"`. | See the rows below. | — |
| `hooks/router.sh` + `hooks/rules/*.rule` | **25** rules (plus 25 `.proof.sh`). The router reads stdin, pre-filters on substrings, parses `tool_name`, `tool_input.command`, `tool_input.file_path`, `tool_input.content`/`new_string` and `session_id` with python3, sources each rule, prints the message to stderr and **exits 2 to block**. It also re-runs rules for paths written via Bash (`writtenPaths.py`). Documented to FAIL OPEN. | **Copilot CLI / VS Code Copilot harness:** the file is read and the matcher tokens (`Bash`, `Edit`, `Write`, `WebFetch`) match Claude names. But `$CLAUDE_PROJECT_DIR` is likely empty (#4001), so bash exits 127 and preToolUse is fail-closed: **every matched call denied** (UNVERIFIED on macOS; cheap to test). Even with the path fixed, rules keyed on `tool_input.file_path` may never match if Copilot's `edit`/`create` args use other keys (UNVERIFIED). **VS Code Local:** skipped unless `chat.useClaudeHooks` is on. If on: runs on every tool (matcher ignored), `TOOL` is never `Bash`/`Write`/`Edit`, keys are camelCase, cwd is home, so rules silently never fire; the empty-path failure is a non-blocking warning per call. **Cloud agent:** not read. **Claude harness:** works as today (inferred). | Deterministic guard rails (jest pipe, unquoted glob, secret files, push `--no-verify`, reuse-first routing...) disappear or misfire. The "once per session" marker needs `session_id`, which both runtimes provide. Messages telling the agent to use the "Skill tool" (12 rules) need rewording. |
| `hooks/format-on-edit.sh` (PostToolUse) | Reads `tool_input.file_path`; prettier + eslint --fix | CLI: may not match (`Edit\|Write` vs `edit`/`create`, UNVERIFIED) and key names may differ. VS Code Local (if enabled): runs after every tool, finds no `file_path`, exits 0 (harmless no-op). | Auto-format on edit is lost until rewritten. |
| Stop hooks (6) | Advisory, except `deletion-scan-router.sh` which exits 2 | CLI `agentStop`: exit 2 becomes a warning, not a block. VS Code Local (if enabled): exit 2 is a "blocking error" shown to the model; whether that keeps the agent running like Claude's Stop is UNVERIFIED. The same `CLAUDE_PROJECT_DIR` problem applies (non-preToolUse failures are fail-open). | Drift checks become silent. |
| `settings.local.json` `permissions.allow` | 26 allow entries (`Bash(git log:*)`, `Bash(npx jest:*)`, `mcp__...`) | VS Code: `chat.tools.terminal.autoApprove` regex entries. CLI: `--allow-tool='shell(git log:*)'` etc. or saved approvals. | Not repo-shareable in CLI. File is gitignored anyway. |
| `rules/security-*/*.mdc` | 18 `.mdc` files + `manifest.json`, **not git-tracked** | VS Code reads `.claude/rules` as instructions, but `.mdc` extension support is UNVERIFIED | — |
| `agents/`, `commands/` | none present | n/a | — |

Checks behind the counts:

- Skills and rules counted with `ls` / `git ls-files`.
- Frontmatter validated by a Python script over `.claude/skills/*/SKILL.md` and
  `src/features/project-creation/templates/skills/*.md`: 0 issues, max description 574
  characters.
- Claude-specific references counted with grep. Positive control: `mcp__` found 2 hits in
  `agentsMdSections.ts`.

### C.2 What the extension GENERATES into each demo project

Writers live in
`src/features/project-creation/services/aiBundle/`.
All per-project writes go through the ADR-013 hash-and-skip seam (`generatedFileWriter.ts`);
the home root writer bypasses it by design.

| Generated path (per project) | Writer | Content (current behavior) | Copilot reads it? | Convert / lose |
|---|---|---|---|---|
| `AGENTS.md` | `aiContextWriter.ts` `writeAgentsMd` (sections in `agentsMdSections.ts`) | Project context: endpoints, storefront, tool servers, "Try asking Claude", doc routing | **Yes**, every surface | Keep. Claude-specific text needs neutral wording: section "Try asking Claude"; "See `.claude/skills/`"; "MCP tools via .claude/mcp.json"; `mcp__dropins__` naming. Any change needs an `AI_CONTEXT_VERSION` bump plus the regenerate path. |
| `CLAUDE.md`, `.claude/CLAUDE.md` | same | one line: `see @AGENTS.md` | VS Code (as literal text) and CLI (expands `@`) | Harmless in VS Code. In CLI the `AGENTS.md` body may be included up to 3 times (direct + 2 imports); CLI de-dupes "identical" files, but after import expansion: UNVERIFIED. |
| `.claude/skills/<name>/SKILL.md` | `skillsWriter.ts` | 14 always-on first-party skills (`DEMO_BUILDER_ALWAYS_ON_SKILLS`); 3 Playwright skills gated on the `playwright` MCP tool; 1 conditional (`extend-app-builder-app`); Adobe bundle copies `aem-*` / `appbuilder-*` with `name:` rewritten to match the folder | **Yes**: VS Code, CLI, cloud agent | No conversion. Name-equals-folder already holds (the rewrite guarantees it for bundles). Alternative for static first-party skills: extension `contributes.chatSkills`, but per-project gating would be lost. |
| `.mcp.json` | `mcpConfigWriter.ts` `writeMcpConfigs` | `mcpServers`: `demo-builder` (node + `dist/mcp-proxy.js`, env `DEMO_BUILDER_MCP_SOCKET`) plus gated `commerce-extensibility`, `playwright`, `dropins` from `ai-defaults.json` (absolute paths into `.demo-builder-mcp/`) | **Yes**: CLI (trusted folder), VS Code Agent Host, VS Code 1.137 workspace discovery (root folder only, trust prompt) | Works if the project folder is the opened workspace root. Tool names change (`demo-builder-get_project_status` in CLI), so skills and `AGENTS.md` that name `mcp__...` go stale. 128-tool cap in VS Code (dropins alone is 21 tools). |
| `.claude/mcp.json` | same | duplicate of `.mcp.json` | No Copilot reader found | No change needed. |
| `.claude/settings.json` (MERGED with user content) | `mcpConfigWriter.ts` → `claudeSettingsWriter.ts` | `PostToolUse` `Write\|Edit` git-sync (node extracts first `file_path` from stdin; auto-add, commit and push the storefront repo); `PreToolUse` matcher `^mcp__commerce-extensibility__(aio-configure-global\|aio-app-use\|aio-where)$` → `echo "..." >&2; exit 2` | CLI + VS Code Copilot harness: yes. VS Code Local: only if `chat.useClaudeHooks` (VS Code prompts "Enable"). Cloud agent: no. | **VS Code Local with Claude hooks enabled:** matcher ignored, so **the aio guard blocks every tool call in the session**; git-sync runs after every tool but finds no `file_path` (camelCase), so it does nothing. **CLI:** the aio guard regex is tested against Claude or runtime names, but Copilot MCP tools are named `commerce-extensibility-aio-...`, so the guard never fires (silently inert). git-sync matcher and key names are likely non-matching (UNVERIFIED), so the storefront auto-push stops. |
| `.gitignore` entries | `mcpConfigWriter.ts` | `.mcp.json`, `.claude/mcp.json`, `.claude/settings.json` | n/a | A Copilot-format `.github/hooks/*.json` would need the same treatment if it carries machine paths. |
| `.demo-builder-mcp/` | `aiDefaultsInstaller.ts` | isolated npm install of MCP packages | n/a | unchanged |

Other surfaces that write the same kind of files:

| Path | Writer | Notes | Copilot |
|---|---|---|---|
| Home root `~/.demo-builder/projects/`: `.mcp.json`, `.claude/mcp.json`, `.claude/settings.json` (unconditional aio guard + project-aware git-sync), `AGENTS.md`, `CLAUDE.md` ×2, `.claude/skills/*/SKILL.md` (all first-party) | `homeAiContextWriter.ts` `ensureHomeAiContext` | Written with plain `writeFile` (outside ADR-013 by design) | Same reading and same hazards as the per-project rows. The aio guard is unconditional here, so the VS Code Local "block everything" risk applies to every home chat that enables Claude hooks. |
| `~/.claude.json` → `mcpServers['demo-builder']` (opt-in "Register Global MCP") | `globalMcpRegistration.ts` | — | Not read by Copilot. Equivalents: `~/.copilot/mcp-config.json` (CLI + Agent Host) or the VS Code provider API. |
| `claude --continue` terminal launch | `src/commands/openInClaude.ts` | — | Copilot CLI equivalent: `copilot --continue` / `copilot -i PROMPT`. |

### C.3 What a conversion would have to touch (inferred from project rules, not researched further)

- Any change to generated files must reach all four AI-bundle gate seams: `buildMcpConfig`,
  `installAiDefaultsMcpTools`, `componentInstallationOrchestrator`, `handleRegenerateAiFiles`.
  It also needs an `AI_CONTEXT_VERSION` bump (currently 32, `src/core/constants.ts`) so
  existing projects refresh.
- A Copilot-format hooks file would be a new generated file. It would need the ADR-013 seam
  and a reversal (removal) path.

---

## Open questions (each has a cheap falsifying test)

1. **Does Copilot CLI on macOS set `CLAUDE_PROJECT_DIR`, and which cwd do
   `.claude/settings.json` hooks get?** Test: in this repo, run `copilot` and ask it to run
   `git --version`. Then check `~/.copilot/logs/process-*.log` for
   `Denied by preToolUse hook ... (hook errored)`.
2. **What keys does Copilot put in `tool_input` for `edit`/`create`/`bash`, for PascalCase
   hooks?** Test: a temporary `.github/hooks/probe.json` PreToolUse hook that appends stdin to
   a scratch file.
3. **Does PascalCase `PostToolUse` get Claude matcher semantics in the CLI?** Same probe with
   matcher `Write|Edit`.
4. **VS Code Local, `chat.useClaudeHooks: true`: does Stop exit 2 keep the agent running?**
   What exact `tool_name` values appear? Test: Developer: Show Agent Debug Logs.
5. **Does the org's Copilot Business/Enterprise policy allow the VS Code Claude harness?**
   It governs the decision in §0.5. Hooks can also be disabled by enterprise policy. Owner:
   the Copilot admin.
6. **Is `mcpServerDefinitionProviders` available at the extension's `engines.vscode`
   (`^1.84.0`)?** Almost certainly not; the minimum version is UNVERIFIED. Do extension-
   contributed MCP servers and `chatSkills` reach Agent Host sessions? The docs only say
   extension tools are "only available in chats in an editor window where the extension is
   running".
7. **Does VS Code expand `@AGENTS.md` in `CLAUDE.md`, and read nested `CLAUDE.md` or
   `.claude/commands/`?** Test: Chat → Diagnostics view lists loaded instruction files.

---

## Sources

VS Code docs. The pages carry `DateApproved: 9/9/2026`. Raw markdown was read from
`microsoft/vscode-docs` main at commit `81d76c22e9` (2026-09-14).

- Customization overview — https://code.visualstudio.com/docs/agent-customization/overview (old URL https://code.visualstudio.com/docs/copilot/customization/overview redirects)
- Customization concepts — https://code.visualstudio.com/docs/agents/concepts/customization
- Custom instructions — https://code.visualstudio.com/docs/agent-customization/custom-instructions
- Prompt files — https://code.visualstudio.com/docs/agent-customization/prompt-files
- Custom agents — https://code.visualstudio.com/docs/agent-customization/custom-agents
- Agent Skills — https://code.visualstudio.com/docs/agent-customization/agent-skills
- Hooks — https://code.visualstudio.com/docs/agent-customization/hooks
- Hooks reference — https://code.visualstudio.com/docs/agents/reference/hooks-reference
- MCP servers — https://code.visualstudio.com/docs/agent-customization/mcp-servers
- MCP configuration reference — https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- Agent plugins — https://code.visualstudio.com/docs/agent-customization/agent-plugins
- Agent harnesses — https://code.visualstudio.com/docs/agents/run/agent-harnesses
- Agent Host concept — https://code.visualstudio.com/docs/agents/concepts/agent-host
- Approvals — https://code.visualstudio.com/docs/agents/run/approvals
- Subagents — https://code.visualstudio.com/docs/agents/run/subagents
- AI settings reference (defaults quoted above) — https://code.visualstudio.com/docs/agents/reference/ai-settings
- MCP extension API — https://code.visualstudio.com/api/extension-guides/ai/mcp
- VS Code 1.137 release notes (2026-09-09) — https://code.visualstudio.com/updates
- GitHub Changelog, "GitHub Copilot in VS Code, August 2026 releases" (2026-08-31) — https://github.blog/changelog/2026-08-31-github-copilot-in-vs-code-august-2026-releases/

VS Code source, `microsoft/vscode` tag `1.137.0` (commit `645f29cc31`, released 2026-09-09):

- `chat.useClaudeHooks` default false; `chat.useHooks` default true — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts
- Claude hook files skipped when disabled — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.ts
- "Claude Code hooks are available for this workspace" notice — https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatDisabledClaudeHooksContentPart.ts (read at main `bf98feb428`, 2026-09-15)
- Hook executor env/cwd/exit codes — https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/platform/chat/node/hookExecutor.ts (main)
- Claude hook compat layer — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/chat/common/promptSyntax/hookClaudeCompat.ts
- Tool names — https://github.com/microsoft/vscode/blob/1.137.0/extensions/copilot/src/extension/tools/common/toolNames.ts
- Workspace `.mcp.json` discovery + registration — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/mcp/common/discovery/workspaceDotMcpDiscovery.ts and https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/mcp/browser/mcp.contribution.ts
- MCP discovery sources — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/workbench/contrib/mcp/common/mcpConfiguration.ts
- Agent Host Copilot harness (`enableFileHooks`) — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/platform/agentHost/node/copilot/copilotSessionLauncher.ts and `copilotAgent.ts`
- Agent Host Claude harness hook and MCP scan — https://github.com/microsoft/vscode/blob/1.137.0/src/vs/platform/agentHost/node/claude/customizations/scan/claudeHookScan.ts and `claudeMcpScan.ts`

GitHub docs. Article bodies were fetched 2026-09-15; the pages carry no version stamp.

- Support for custom instruction types — https://docs.github.com/en/copilot/reference/custom-instructions-support
- CLI custom instructions — https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
- About agent skills — https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- CLI skills — https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- Cloud agent skills — https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
- About hooks — https://docs.github.com/en/copilot/concepts/agents/hooks
- Hooks reference (CLI + cloud agent) — https://docs.github.com/en/copilot/reference/hooks-reference
- CLI hooks how-to — https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
- Custom agents configuration — https://docs.github.com/en/copilot/reference/custom-agents-configuration
- Create custom agents (cloud agent) — https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents
- Cloud agent MCP — https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/extend-cloud-agent-with-mcp and https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent
- CLI command reference (MCP loading, skills, commands, agents, permission patterns, env vars) — https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- CLI config directory reference (settings sources incl. `.claude/settings.json`) — https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- Allowing and denying tool use — https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools
- About plugins — https://docs.github.com/en/copilot/concepts/agents/about-plugins
- Third-party coding agents / Anthropic Claude — https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents and https://docs.github.com/en/copilot/concepts/agents/anthropic-claude

Copilot CLI:

- Changelog (entries 1.0.6 2026-03-16 through 1.0.83 2026-09-04) — https://github.com/github/copilot-cli/blob/main/changelog.md
- Issue #4001, `.claude/settings.json` hooks and `CLAUDE_PROJECT_DIR` (open, 2026-07-01) — https://github.com/github/copilot-cli/issues/4001

Standards, Anthropic and community:

- Agent Skills specification — https://agentskills.io/specification
- Claude Code hooks — https://code.claude.com/docs/en/hooks
- Claude Code skills (commands merged into skills) — https://code.claude.com/docs/en/skills
- github/awesome-copilot (tree checked at 2026-09-15 commit) — https://github.com/github/awesome-copilot
- Community converters (not evaluated) — https://github.com/haiyang-dev/converting-claude-plugins-to-copilot-plugins, https://github.com/euxx/claude-skills-for-copilot, https://github.com/ejtx16/claude-code-copilot-cli-agentic-coding-skill
- Secondary, background only — https://ecorpit.com/vscode-1-129-agent-host-platform-team-rollout-2026/

Local files read (read-only):

- `.claude/settings.json`
- `.claude/settings.local.json`
- `.claude/hooks/router.sh`
- `.claude/hooks/rules/`
- `.claude/skills/`
- `src/features/project-creation/services/aiBundle/aiContextWriter.ts`
- `src/features/project-creation/services/aiBundle/skillsWriter.ts`
- `src/features/project-creation/services/aiBundle/mcpConfigWriter.ts`
- `src/features/project-creation/services/aiBundle/claudeSettingsWriter.ts`
- `src/features/project-creation/services/aiBundle/homeAiContextWriter.ts`
- `src/features/project-creation/services/aiBundle/globalMcpRegistration.ts`
- `src/features/project-creation/config/ai-defaults.json`
- `src/types/ai.ts`
