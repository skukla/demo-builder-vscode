# Commands

A command is a user-facing action reachable from the palette, a UI button, or
another command. This file is about changing them; read the source for how any one
works, because each file carries a substantial header comment.

## What is here

| File | Purpose |
|------|---------|
| `commandManager.ts` | The registry — instantiates local and feature-owned commands and registers every `demoBuilder.*` id |
| `claudeCodeFootprint.ts` | On-demand `~/.claude` disk-footprint walk for Diagnostics. Report-only by design: transcripts are how `--continue` resumes, so there is deliberately no cleanup action |
| `claudeSessionStore.ts` | Probes Claude Code's per-cwd conversation store; decides whether `claude --continue` is safe at launch |
| `configure.ts` | `demoBuilder.configure` — QuickPick to edit .env, redeploy mesh, and related project configuration |
| `diagnostics.ts` | The diagnostics report (see below) |
| `manageSiteAccess.ts` | QuickPick over who holds the Configuration Service admin role on the project's storefront. UX only — logic and post-write verification live in `siteAccessManagerHeadless` |
| `repairSiteConfiguration.ts` | For a legacy project whose DA.live site name differs from the repo name: runs the storefront name migration, then re-runs the refused Configuration Service write, then republishes. Step 2 runs only when step 1 reports `repaired` |
| `migrateStorefrontNames.ts` | One-shot palette command for projects built before `164fd251`, whose DA.live site name does not match the GitHub repo name |
| `openInClaude.ts` | Launches the single "home" Claude Code chat terminal (see below) |
| `ResetAllCommand.ts` | Dev-only full reset — clears extension state, cached credentials and the DA.live auth session, so a first-time experience can be replayed. Lived under `src/core/commands/` until 2026-08-31; it was never core code, just filed there |
| `ResetAiOnboardingCommand.ts` | Dev-only reset of just the AI onboarding flag. Moved with `ResetAllCommand.ts` for the same reason |
| `openModernizationAgent.ts` | Opens the AEM Experience Modernization Agent console with a tip about the current project's repo |
| `refreshBlockLibrary.ts` | Dashboard kebab action, EDS-only — a destructive full re-sync of the DA.live block library |
| `showPromptsPicker.ts` | Prompt QuickPick; dispatches to `openInClaude` (insert) or `openAi` (manage) |

Four modules here are not commands but support them:

| File | Purpose |
|------|---------|
| `diagnosticsChecks.ts` | The collection half of Diagnostics — environment, tools, Adobe CLI, capability probes. Free functions, because none needs the command's state |
| `diagnosticsReport.ts` | The rendering half. Split from collection deliberately: the two change for different reasons |
| `handlerContextFactory.ts` | Builds a COMPLETE `HandlerContext` for a webview panel. Every panel command used to hand-roll one, and most filled it in partially |
| `orphanedSettings.ts` | Finds settings a user has set that the extension no longer reads — renaming a contributed setting does not migrate the value, so it strands silently |

## Registration

`CommandManager.registerCommands()` is the single place ids are bound —
`extension.ts` constructs the manager and calls it, and nothing registers a command
inline. Ids are `demoBuilder.*` in camelCase; there is no `demo-builder.*` form.

Adding one means four edits:

1. The command file here (or in the owning feature).
2. A `registerCommand` line in `commandManager.ts`.
3. A `contributes.commands` entry in `package.json` — **unless it is internal**, see
   below.
4. Its row in the table above.

**Step 3 is the one that fails quietly.** Miss step 2 and the command throws when
something dispatches it; miss step 3 and everything works except that nobody can
find it in the palette, which no test and no build catches.

**Internal commands are deliberately absent from `package.json`.** `navigate`,
`openAiExperience` and `showPromptsPicker` are invoked programmatically from the
sidebar, dashboard and other commands, and a palette entry for them would be noise.
Omission there is a decision, not an oversight — do not "fix" it.

## navigate

Routes sidebar clicks to the right webview command, by `payload.target`:

| Target | Routes to |
|--------|-----------|
| `overview` | `projectDashboard.execute()` |
| `configure` | `configureProject.execute()` |
| `ai` | `demoBuilder.openAiExperience` — opens the Claude Code terminal tab |
| `updates` | `checkUpdates.execute()` |

## The AI surface is chat-first

Two single-purpose internal commands back it:

- **`demoBuilder.openAiExperience`** — "Open Chat". Calls `OpenInClaudeCommand`
  with no prompt, opening or revealing the Claude Code terminal beside the Project
  Dashboard. Reached from the sidebar's Chat button, `navigate('ai')`, and the
  dashboard AI action.
- **`demoBuilder.showPromptsPicker`** — "Show Prompts". Always shows the QuickPick,
  with no state-aware branching: the merged prompt list, pinned first, plus a
  "Manage prompts…" row. Picking a prompt dispatches `openInClaude` with it;
  "Manage prompts…" opens the prompt library.

The prompt library (`demoBuilder.openAi`, "Prompt Library") is the single home for
prompt CRUD, reached on demand rather than being the default AI surface. The chat
is the default.

An earlier state-aware wand-icon dispatcher was retired for these two: a two-button
sidebar makes the library discoverable on the first click instead of hiding it
behind a second click on a control whose behaviour changed underneath you.

## openInClaude

Find-or-spawn the "Claude Code" terminal at the **projects root**
(`resolveProjectsRoot()`), placed in the active editor group beside the Project
Dashboard. An existing live terminal is reused, matched by name plus
`exitStatus === undefined`.

**Always-root home model.** The chat launches at the projects root, never a project
subdirectory, and nothing anchors the VS Code workspace. One home chat addresses any
project by name through the MCP tools, because the root `.mcp.json` reaches the root
socket. Any `project` argument to `execute` is ignored; only `prompt` is used.

To resolve "the active project", the launch reads the current-project pointer and
writes the name into the home `AGENTS.md`. Launch is the only safe moment: activation
runs once and the pointer changes freely afterwards, so the activation-time write
deliberately carries no name.

**But that statement reaches almost nobody, and it matters to know why.** A resumed
conversation never re-reads `AGENTS.md`, and a conversation exists as soon as the
projects root holds one transcript — so after a user's first ever chat, every launch
resumes. The path real users take is the re-home preamble, rebuilt from the pointer on
every launch, which states the project name rather than ordering a call to discover it.
With no resolvable project both fall back to asking for `get_current_project`.

**Prompt delivery** — the two paths differ, and the difference is load-bearing:

- **Spawn**: the prompt rides the launch command as `claude --continue -- '<prompt>'`.
  Race-free, because claude runs it at startup; `--` stops a dash-leading prompt being
  read as a flag. `--continue` is added only when a prior conversation exists.
- **Reuse**: claude is already running, so the prompt is injected into the live REPL
  by bracketed paste, pre-filling the input for the user to send.

Either way the prompt is also copied to the clipboard as a silent fallback. **Do not
reintroduce a timed or delayed paste on spawn** — it was tried twice and always raced
cold start, because no "TUI ready" signal exists.

`demoBuilder.ai.engine` selects the tool; `'claude-code'` is currently the only value.

**Why there is no extension surface.** Launches once routed through the Claude Code
VS Code extension's URI handler. That was retired because the handler opens a new
chat every time and offers no way to inject a prompt into the live one, which makes
"pick a prompt, drop it into the conversation" impossible to build there.

Decision rationale: [ADR-004](../../docs/architecture/adr/004-claude-code-harness.md).

## diagnostics

Collects system and tool information, tests Adobe CLI authentication, probes the
in-extension MCP socket and tools, and logs the full report to the debug channel.

**The GitHub↔AEM triangulation is the part worth understanding.** It asks three
questions in one pass: who we are signed in as plus the scopes GitHub actually
*granted* (`x-oauth-scopes`, not the set requested); whether GitHub reports
`permissions.push` on the project's repo; and what `admin.hlx.page` returns for the
same credential. It prints a one-line verdict because no single answer is decisive —
`push: true` alongside an AEM 401 rules out both scope and permission problems and
leaves the credential itself, a branch that previously could not be told apart from
a missing AEM Code Sync install.

Probe logic lives in `@/features/eds/services/github/githubCredentialProbe` so it
stays testable outside the command shell; `diagnostics.ts` only calls and renders it.

**The credential is never printed.** Output is designed to be pasted into tickets, so
it carries the login, granted scopes, the `push` boolean, status codes, `x-error`,
and the credential's *type prefix* only. A test enforces this.

This is the command's only outbound network call. Every other check is local, and
each leg has its own timeout and degrades independently.

## Two behaviours worth knowing before you change a command

**Authentication is checked before expensive Adobe work, never triggered by
surprise.** A command that needs Adobe I/O calls `isAuthenticated()` first — a
token-only check — and on failure asks the user before starting a browser login.
`isFullyAuthenticated()` also validates the org and is materially slower, so it is
used only where org validity is the actual question. Silent browser launches are the
failure this prevents.

**An Adobe CLI timeout is not proof of failure.** The CLI is often slow rather than
broken, so a catch block that sees success text in `error.stdout` should treat the
operation as having succeeded. Timeouts come from `TIMEOUTS` in
`@/core/utils/timeoutConfig` — never a literal. Project and workspace selection no
longer runs a CLI mutation and so carries no CLI timeout; the operations that do run
(workspace download, `api-mesh get`/`deploy`) are targeted per invocation through
`withOrgContext`.

## Related

- `webview-command-handler` skill — the extension↔webview message round trip
- [`../core/CLAUDE.md`](../core/CLAUDE.md) — shared infrastructure commands reach for
