# AI Layer Pivot — Implementation Plan

**Captured**: 2026-05-19
**Origin**: `/rptc:research` audit of the `feature/ai-layer` AI implementation against working examples
**Status**: Draft plan — iterating before implementation begins
**Predecessor**: Phase 1 AI work on `feature/ai-layer` (commits `3db978c3` through `eb7df59b`)
**Working reference**: `/Users/kukla/Documents/Clients/TEC/presentation/te-eds-mock/` — a storefront mirror built in 30 minutes using Claude Code (CLI) + Adobe's official MCPs and skills.

---

## Context

The audit confirmed the AI architecture works. `~/.claude/.mcp.json` correctly registers the Demo Builder MCP server, and Claude Code (CLI) discovers it from any project directory. The seven lifecycle tools are functional.

The audit also surfaced three structural mismatches between what Demo Builder ships and what works in practice:

1. **Duplicate MCP registrations.** Our generated `.claude/mcp.json` adds `da-live` (URL) and `adobe-commerce-dev` (`@rafaelcg/adobe-commerce-dev-mcp`, third-party). Claude Code already has better, authenticated, official versions at the session level (`mcp__claude_ai_AEM_DA_-_Prod`, `Adobe Commerce MCP Stage`). The project-level duplicates fail silently — only `demo-builder` was loading in the user's audit.

2. **Skills duplication.** Our 13 skill templates compete with Adobe's official skill agents bundled via `@adobe-commerce/commerce-extensibility-tools` v3.4.0. Adobe's six agents (block-developer, dropin-developer, content-modeler, project-manager, researcher, tester) use a sophisticated delegation protocol and have been validated end-to-end on real storefront work. Our skills are flat recipes.

3. **The dormant `@demo-builder` chat participant.** Phase 2 deferred wiring it into `vscode.chat`. The audit confirms Claude Code (CLI) is the right harness — not VS Code Chat. Phase 2 should be canceled, not deferred.

The Configure screen's AI Setup tab also needs upgrading. Today it only verifies that generated files exist and parse correctly. Users need to see what AI capabilities — skills, MCPs, tools — are actually wired into their project, and what to do when something's missing.

---

## Scope Decisions (User-Confirmed)

| Question | Answer |
|---|---|
| Primary AI harness | Claude Code (CLI) — not VS Code Chat |
| External MCPs in project config | Removed — Adobe ships authenticated versions at session level |
| Skills source | Adobe's via `@adobe-commerce/commerce-extensibility-tools` + a thin Demo-Builder layer |
| Top-level context file | `AGENTS.md` (universal) + one-line `CLAUDE.md` pointer |
| Chat participant | Removed (was dormant) |
| AI Setup tab | Renamed to **AI Configuration** — capability inventory: status rollups, installed skills, installed MCPs |

---

## What Gets Built

### 1. MCP Config Writer — Slimmed to `demo-builder` Only

`mcpConfigWriter.ts` stops writing external MCP entries. Generated `.claude/mcp.json` and root `.mcp.json` contain a single `mcpServers` entry: `demo-builder`. The `demoBuilder.ai.externalMcpServers` setting is removed from `package.json` (Cycle B). The `.claude/settings.json` PostToolUse git-sync hook stays as-is — that's a Claude Code project-config concern, not an MCP entry.

**Why**: Users get better Adobe MCPs at session level through Claude Code's official catalog. Our project-level entries duplicate or conflict.

**Backward compatibility**: Existing projects keep their `.claude/mcp.json` until regenerated. The Regenerate AI Files action in the AI Configuration tab rewrites them to the new shape.

**Global registration bug fix (Cycle B)**: The current `writeGlobalMcpConfig` writes to `~/.claude/.mcp.json` — a file Claude Code does not read. Empirical verification (2026-05-20) confirmed Claude Code's user-scope MCPs live in `~/.claude.json`'s top-level `mcpServers` field. Cycle B replaces silent global writes with a **consent-gated upsert** (`ensureGlobalMcpRegistration`):

1. **Track registration state in `globalState`**: `'registered'` | `'declined'` | `undefined`.
2. **Prompt timing**: after the user's first project creation completes (when global discovery becomes useful). Skip on subsequent activations if state is already set.
3. **The prompt** uses `vscode.window.showInformationMessage` with three buttons:
   > *"Demo Builder can register its MCP server with Claude Code so AI agents can discover your projects from any directory. This adds a `demo-builder` entry to your Claude Code user config (`~/.claude.json`). Register now?"*
   >
   > `[Register]` `[Not Now]` `[Don't Ask Again]`
4. **On `Register`**: read `~/.claude.json` (72 KB file with Claude Code's full user-level state), parse JSON, upsert ONLY `mcpServers['demo-builder']`, preserve every other field exactly, write back. Set `globalState` to `'registered'`.
5. **On `Not Now`**: leave state `undefined` — re-ask on next activation after another project creation completes.
6. **On `Don't Ask Again`**: set `'declined'` — never prompt again. Project-scope MCPs still work; only global discovery is lost.
7. **Recovery**: the Cycle D AI Configuration tab's Status section gets a row for global registration with a `[Register]` button that calls the same `ensureGlobalMcpRegistration` helper. Users who declined can opt in later from there.

**Why consent-gated rather than silent**: `~/.claude.json` is Anthropic's file, not Demo Builder's. It holds user-curated MCP entries (e.g., `MCP_DOCKER`, `adobe-exl`, `fluffyjaws`, `lucid` in the verifier's home directory). Modifying that file without asking puts Demo Builder's entry into the user's curated list as if it came from Claude Code's official setup. Matches Demo Builder's existing pre-flight-auth pattern: ask before changing shared resources.

**Stop writing `~/.claude/.mcp.json`**: the file is read by no consumer. Drop the write in `mcpConfigWriter.ts`. Existing instances of the file on disk from prior installs are harmless dead data; Cycle B's regenerate cleanup pass can optionally remove them.

### 2. Adobe App Builder MCP + Component-Mapped Skill Bundles

Two layers ship from the npm package `@adobe-commerce/commerce-extensibility-tools` (v3.4.0):

- **The Adobe App Builder MCP** (the package itself) — universal. Every Demo Builder project gets the MCP server registered in `.claude/mcp.json` alongside `demo-builder`. The MCP exposes App Builder tooling: `aio-app-deploy`, `aio-app-dev`, `aio-app-use`, `aio-configure-global`, `aio-dev-invoke`, `aio-login`, `aio-where`, `commerce-event-subscribe`, `onboard`, `search-commerce-docs`, `upload-chat-history`. The package name says "commerce-extensibility-tools"; the tool surface is App Builder operations.

- **Three skill bundles** (inside `node_modules/.../dist/`) — project-specific. Each bundle teaches AI agents how to work with a specific Adobe codebase template:

  | Bundle | Audience | Skills (with namespace prefix) |
  |---|---|---|
  | `aem-boilerplate-commerce/skills/` | EDS storefronts | `aem-block-developer`, `aem-content-modeler`, `aem-dropin-developer`, `aem-project-manager`, `aem-researcher`, `aem-tester` |
  | `integration-starter-kit/skills/` | App Builder backend webhooks (Commerce ↔ CRM/PIM/ERP sync) | `isk-architect`, `isk-developer`, `isk-devops-engineer`, `isk-product-manager`, `isk-technical-writer`, `isk-tester`, `isk-tutor` |
  | `checkout-starter-kit/skills/` | App Builder checkout webhooks (payment/shipping/tax) | `csk-architect`, `csk-developer`, `csk-devops-engineer`, `csk-product-manager`, `csk-technical-writer`, `csk-tester` |

  Six skill names collide across bundles (`tester` exists in all three; `architect`/`developer`/`devops-engineer`/`product-manager`/`technical-writer` in two each), and the colliding skills declare the same frontmatter `name:` field with different scopes. The install pass copies each skill to a prefixed folder and rewrites the `name:` field to match, so Claude Code can resolve all 22 skills independently.

**Configuration-driven install via two existing patterns:**

Demo Builder's components are configuration-driven (`components.json` declares every selectable component with its metadata, dependencies, env vars). This cycle extends that pattern in two places:

1. **`ai-defaults.json` (new)** — declares the always-installed MCP servers. The Adobe App Builder MCP is the first (and currently only) entry:

   ```json
   {
     "mcpServers": [
       {
         "id": "commerce-extensibility",
         "package": "@adobe-commerce/commerce-extensibility-tools",
         "version": "^3.4.0",
         "command": "node",
         "args": ["node_modules/@adobe-commerce/commerce-extensibility-tools/index.js"],
         "description": "Adobe App Builder MCP — aio-app-deploy, commerce-event-subscribe, search-commerce-docs, etc."
       }
     ]
   }
   ```

   `mcpConfigWriter.ts` reads this file and adds each entry to the generated `.claude/mcp.json` alongside `demo-builder`. The storefront repo's `package.json` gets each declared `package` as a devDep before `npm install` runs.

   **Version pinning**: caret (`^3.4.0`) — matches Demo Builder's overall npm posture (61 caret across `package.json`). First project creation resolves the specific 3.x release; `package-lock.json` then freezes it per project. Cycle D adds an `AdobeMcpUpdateChecker` so users can opt into newer 3.x versions through the existing Check for Updates flow alongside extension and component updates.

2. **`aiSkillBundle` field on components in `components.json`** — components that scaffold an Adobe codebase template declare their skill bundle inline:

   ```json
   {
     "id": "eds-storefront",
     "...": "...",
     "aiSkillBundle": {
       "path": "aem-boilerplate-commerce/skills",
       "prefix": "aem"
     }
   }
   ```

   `skillsWriter.ts` walks `project.componentInstances`, looks up each component's full definition, and for those with an `aiSkillBundle` field copies + namespaces the bundle from `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/{path}/` → `<projectPath>/.claude/skills/{prefix}-{skill-name}/`.

**What ships per project today:**

| Stack | App Builder MCP | Skill bundles |
|---|---|---|
| EDS + PaaS | Yes (universal) | aem (from `eds-storefront` component) → 6 namespaced skills |
| EDS + ACCS | Yes | aem → 6 namespaced skills |
| Headless | Yes | None additional (no component declares a bundle) → 3 Demo Builder lifecycle skills only |

**Future flexibility:**

- Adding a Demo Builder component for the Integration Starter Kit means one new entry in `components.json` declaring `aiSkillBundle: { path: "integration-starter-kit/skills", prefix: "isk" }`. Same for Checkout Starter Kit. No `skillsWriter.ts` code changes.
- Adding a new universal MCP means one new entry in `ai-defaults.json`. No `mcpConfigWriter.ts` code changes.
- The AI Configuration tab (Cycle D) can later expose "Additional skill bundles to include" as an opt-in escape hatch for users who want bundles their components don't strictly require.

### 3. AGENTS.md as Universal Context

`aiContextWriter.ts` generates `AGENTS.md` instead of `.claude/CLAUDE.md`. The content mirrors today's eight sections (header, endpoints, storefront info, block libraries, Adobe I/O project, example prompts, notes for AI agents). The `CLAUDE.md` files (root and `.claude/`) are one-line pointers that import `AGENTS.md` via Claude Code's `@` syntax. This matches Adobe's pattern in `te-eds-mock` and works across Claude/Copilot/Cursor/Gemini without per-tool divergence.

The pointer files include a one-line HTML comment above the import explaining the pattern so a developer inspecting the file knows why it's so short:

```markdown
<!-- This project uses AGENTS.md as the universal AI context file (works across Claude, Cursor, Copilot, Gemini). The @-import below resolves AGENTS.md's content into Claude's context. -->
see @AGENTS.md
```

The comment doesn't affect Claude's behavior (Markdown comments are ignored during context loading); it's purely human-readable documentation.

The `demoBuilder.ai.mcpConfigTargets` setting is removed from `package.json` (Cycle B). Cursor and Codex pick up `AGENTS.md` and `.mcp.json` natively — no per-tool config writes needed.

### 4. AI Configuration Tab (Repurposed + Expanded)

The Configure screen's "AI Setup" tab is renamed **AI Configuration** and gains four sections on a single page:

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Configuration                                                │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Status                                                          │
│  ● Demo Builder MCP                          Ready · 7 tools     │
│  ● Demo Builder MCP (global)                 Not registered [Register]│
│  ● Adobe Commerce Extensibility Tools        Ready · 12 tools    │
│  ● Session-level Adobe MCPs                  3 detected          │
│                                                                  │
│  [Regenerate Files]                                              │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Skills Installed                                  9 skills      │
│  ▾ Adobe skills (6)                                              │
│     • block-developer       Develops and customizes EDS blocks   │
│     • dropin-developer      Integrates drop-in components        │
│     • content-modeler       Models authoring structures          │
│     • project-manager       Phased dev workflows                 │
│     • researcher            Finds docs and patterns              │
│     • tester                Validates implementations            │
│  ▾ Demo Builder skills (3)                                       │
│     • add-component         Add a component to this project      │
│     • sync-changes          Push code changes to GitHub          │
│     • update-credentials    Update .env credentials              │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  MCP Servers                                                     │
│  Project (from .claude/mcp.json)                                 │
│     ▾ demo-builder                    Ready · 7 tools            │
│         list_projects        List all Demo Builder projects      │
│         get_project          Read a project's manifest           │
│         sync_storefront      Commit and push storefront changes  │
│         …                                                        │
│     ▸ commerce-extensibility          Ready · 12 tools           │
│  Session (from Claude Code)                                      │
│     • Adobe Commerce MCP              Authenticated              │
│     • AEM DA - Prod                   Authenticated              │
│     • AEM Content - Prod              Authenticated              │
│                                                                  │
│  Don't see Adobe MCPs? Set them up in Claude Code ↗              │
└─────────────────────────────────────────────────────────────────┘
```

**Section breakdown:**

- **Status** — three rollup rows naming the AI capabilities available to the project. Each row reports a state — "Ready", "Not installed", "Needs attention" — derived from underlying detections: Demo Builder MCP (file presence + JSON validity + binary built + skills shipped), Adobe Commerce Extensibility Tools (devDep installed + skills directory populated), session-level Adobe MCPs (parsed from `~/.claude/.mcp.json` and any user-level Claude Code MCP config).

  **The four current verifications are absorbed, not dropped.** Today's `verify-ai-setup` runs four file-and-parse checks (CLAUDE.md present + non-empty, `.claude/mcp.json` valid JSON, MCP server binary built, skills present). After the pivot they roll into the "Demo Builder MCP" row. Clicking a row that isn't Ready expands inline to show what's missing in plain language ("MCP server binary not built — run `npm run build`", "Skills folder empty — click Regenerate Files"). The Adobe Commerce row adds two more underlying detections (devDep installed, skills directory populated). Net effect: cleaner default view, full detail on demand.
- **Regenerate Files** — standalone button below the Status section. The action brings older projects up to the new shape (slim `.claude/mcp.json`, Adobe's skills installed, `AGENTS.md` written). It's the only configuration action native to this tab; no "Quick Actions" group header — one button doesn't need a category. The current "Verify Now" button is dropped — Status auto-refreshes on mount, and re-mounting the tab gives the same effect with less UI. "Open in Claude Code" is **not** in this tab — its placements are the per-project dashboard ActionGrid tile (primary) and the project card kebab menu (cold-start entry from the projects list).
- **Skills Installed** — collapsible groups. Each skill row reads frontmatter from the `SKILL.md` or `*.md` file: `name`, `description`. Source badge is computed from path (Adobe skills come from `.claude/skills/{block-developer,dropin-developer,...}` per Adobe's onboarding; Demo Builder skills are detected by name). Clicking a row expands inline to show the skill content.
- **MCP Servers** — two groups. Project group lists each entry from `.claude/mcp.json` with state label and tool count. Each project-level row is **expandable** (same affordance as Skills): clicking reveals the tool inventory — tool name in monospace plus the first line of the MCP-reported `description`, one tool per row, truncated with ellipsis if the description runs long. **Hover (or keyboard focus) on a truncated description reveals the full text via Spectrum `Tooltip`** — relieves the truncation pain for long descriptions without replacing the primary expand affordance. Tooltips fire only on truncated rows, so short descriptions stay quiet. Session group lists detected `mcp__claude_ai_*` MCPs from Claude Code's session-level config; these rows are **not expandable** in v1 because the extension can't introspect session-level MCPs (they're managed by Claude Code, not by us — we'd need to spawn `claude` to call their `tools/list`). State labels match the Status section: `Ready` (responds to handshake), `Authenticated` (session-level), `Needs auth`, `Failed`. No search across tools — at v1 scale (~3 MCPs, ~30 tools) the inventory fits on one screen when expanded.

**Data sources:**
- `verify-ai-setup` handler is extended to return: skills list (name, description, source, path), MCP list (name, type, tool count, status), session MCP list (name, authenticated boolean)
- A new `inspect-mcp` handler runs lightweight MCP introspection per project-level server (spawns the configured command, calls `tools/list`, kills the process) — cached for the session

### 5. "Open in Claude Code" — Dashboard-First Action

**Two placements, each serving a distinct entry path:**

- **Per-project dashboard ActionGrid tile** *(primary, for users already in a project)*. Sits at the top of the action grid alongside Start/Stop, Configure, Deploy Mesh, etc. Daily-use surface for users who've navigated into a project and want to launch Claude.
- **Project card kebab menu** *(cold-start, for users browsing the projects list)*. Sits alongside the existing "Open Project" and "Copy Path" items in the per-card kebab. One-click launch from the projects home screen — saves the user from navigating into the project dashboard first.

Both call the same `demoBuilder.openInClaude` command. The AI Configuration tab does NOT include this action — that tab's purpose is inventory and readiness, and "launch Claude" doesn't fit that surface (see Section 4).

Clicking either:

1. Verifies the `claude` CLI is on PATH — if not, shows an install prompt
2. Opens an integrated VS Code terminal at the AI-context root (`storefront/` for EDS projects, project root otherwise)
3. Runs `claude` in that terminal

This is the harness — it puts the user one click away from the experience their `te-eds-mock` example demonstrates. No re-implementation of MCP discovery, no chat-participant work.

#### Behavioral details

**Two launch pathways: Claude Code VS Code extension OR terminal.** When the official `anthropic.claude-code` extension is installed, Demo Builder uses its documented URI handler (`vscode://anthropic.claude-code/open`) to launch in the extension's chat panel — same Claude Code engine, richer UI. When the extension is not installed, Demo Builder falls back to launching `claude` in a VS Code integrated terminal. A new setting (`demoBuilder.ai.harness`: `"auto" | "extension" | "terminal"`, default `"auto"`) lets users override the auto-detect.

| Setting | Extension installed | Behavior |
|---|---|---|
| `auto` (default) | yes | URI handler — extension chat panel |
| `auto` (default) | no | Terminal launch — current plan |
| `extension` | yes | URI handler — extension chat panel |
| `extension` | no | Error notification via `vscode.window.showErrorMessage`: "Claude Code extension not installed. Install from the marketplace or set `demoBuilder.ai.harness` to `terminal`." |
| `terminal` | (irrelevant) | Terminal launch (extension bundles the `claude` binary on PATH if installed) |

**Extension detection.** `vscode.extensions.getExtension('anthropic.claude-code')` returns the extension or `undefined`. If installed but not yet activated, call `extension.activate()` before invoking the URI handler.

**URI handler call.** `vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open'))`. Documented in the extension since v2.1.72. We don't pass `?prompt=...` — let the user write their own first question. We don't pass `?session=...` — each click starts a fresh conversation. (Users who want to resume can pick from the extension's own sessions list in the Activity Bar.)

**First-time placement tip.** When we detect the extension is installed AND `globalState.get('demoBuilder.ai.placementTipShown')` is falsy, show a one-time notification: *"Demo Builder works best when Claude Code is docked on the right side of VS Code. Drag the Claude Code panel to the secondary side bar so it doesn't conflict with Demo Builder's primary side bar."* Buttons: `[Got it]` (sets the flag) and `[Learn more]` (opens VS Code's view-placement docs). We cannot programmatically dock the extension — VS Code's secondary side bar contribution API is still proposed (microsoft/vscode #264346) — so this is guidance only.

**AI-context root resolution.** EDS projects have their AI context (`AGENTS.md`, `.claude/`, `.mcp.json`, `node_modules/@adobe-commerce/...`) inside the component clone at `~/.demo-builder/projects/<name>/components/eds-storefront/`, not the Demo Builder project root. Resolution: if `project.componentInstances[COMPONENT_IDS.EDS_STOREFRONT]` is present, use `edsInstance.path`. Otherwise fall back to `project.path`. Other stack types can be added by extending this lookup — but the AI files have to exist at the path or Claude Code launches into an empty context. Applies to both pathways: the URI handler opens the extension in the focused VS Code window's workspace; the terminal launch sets `cwd` directly.

**`claude` CLI detection (terminal path only).** Reuses the existing cross-platform pattern from `src/core/shell/environmentSetup.ts:148`: `process.platform === 'win32' ? 'where' : 'which'`, executed via `execFile` with a short timeout (~2 seconds). If the call throws (binary not found) or returns empty stdout, treat as "not installed." Note: when the extension is installed, it bundles the `claude` binary on PATH, so the terminal pathway works without a separate Claude Code install.

**Install prompt when `claude` is missing.** `vscode.window.showInformationMessage` with two buttons:
- "Install Claude Code" → `vscode.env.openExternal(vscode.Uri.parse('https://docs.anthropic.com/claude-code'))` opens the official install docs in the user's browser
- "Cancel" → no-op

No auto-install — Claude Code's install path varies by platform (Homebrew, npm, direct download), and the official docs are the right pointer.

**Terminal lifecycle.** Look up existing terminals by name using `vscode.window.terminals.find(t => t.name === ...)` (same pattern as `stopDemo.ts:88-99`). If a terminal named `Claude — <project-name>` already exists, call `terminal.show()` and return — don't create a new one. Otherwise, create new via `BaseCommand.createTerminal(name, cwd)` passing the resolved AI-context root, then `terminal.show()` followed by `terminal.sendText('claude')`.

**First-time authentication.** Not handled by Demo Builder. Claude Code's CLI prompts the user through `claude login` on first run; we don't intercept the flow.

**Initial prompt.** None for v1. Plain `claude` opens the interactive REPL; `AGENTS.md` auto-loads from `cwd`; the user types their first prompt. The "Try asking Claude" section in `AGENTS.md` already lists starter prompts statically — no need to pre-populate one.

**Icon and label.** Spectrum `MagicWand` icon (verified to exist in `@spectrum-icons/workflow/`; signals AI without being Claude-branded). Label: "Open in Claude Code". Position: top of the ActionGrid — this is the daily-use action and should be the first tile the user sees.

**Logging.** `logger.info('[OpenInClaudeCode] Opened claude for ${project.name} at ${cwd}')` after successful terminal launch. Matches existing dashboard-action logging conventions.

**Edge cases.** Terminal creation failures (rare VS Code internal error), project path doesn't exist, etc. are handled by `BaseCommand`'s existing error wrapping — failures surface via `this.showError()` (which calls `vscode.window.showErrorMessage`). No special handling needed in the command itself.

#### Reference implementation shell

```typescript
// src/commands/openInClaudeCode.ts
import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { promisify } from 'util';
import { BaseCommand } from '@/core/base';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

const execFile = promisify(childProcess.execFile);
const CLAUDE_DOCS_URL = 'https://docs.anthropic.com/claude-code';
const CLAUDE_EXT_ID = 'anthropic.claude-code';
const CLAUDE_OPEN_URI = 'vscode://anthropic.claude-code/open';
const PLACEMENT_TIP_KEY = 'demoBuilder.ai.placementTipShown';
const WHICH_TIMEOUT_MS = 2000;

type Harness = 'auto' | 'extension' | 'terminal';

export class OpenInClaudeCodeCommand extends BaseCommand {
    async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) return;

        const harness = vscode.workspace
            .getConfiguration('demoBuilder.ai')
            .get<Harness>('harness', 'auto');
        const ext = vscode.extensions.getExtension(CLAUDE_EXT_ID);

        const useExtension =
            harness === 'extension' ||
            (harness === 'auto' && ext !== undefined);

        if (useExtension && !ext) {
            await vscode.window.showErrorMessage(
                "Claude Code extension not installed. Install it from the marketplace or set " +
                "`demoBuilder.ai.harness` to `terminal`.",
            );
            return;
        }

        if (useExtension && ext) {
            await this.launchInExtension(project, ext);
        } else {
            await this.launchInTerminal(project);
        }
    }

    // ── Extension pathway ────────────────────────────────────────────────────

    private async launchInExtension(
        project: Project,
        ext: vscode.Extension<unknown>,
    ): Promise<void> {
        if (!ext.isActive) await ext.activate();
        await vscode.env.openExternal(vscode.Uri.parse(CLAUDE_OPEN_URI));
        await this.maybeShowPlacementTip();
        this.logger.info(`[OpenInClaudeCode] Launched Claude Code extension for ${project.name}`);
    }

    private async maybeShowPlacementTip(): Promise<void> {
        if (this.context.globalState.get<boolean>(PLACEMENT_TIP_KEY)) return;

        const choice = await vscode.window.showInformationMessage(
            "Tip: Demo Builder works best when Claude Code is docked on the right side of VS Code. " +
            "Drag the Claude Code panel to the secondary side bar so it doesn't conflict with " +
            "Demo Builder's primary side bar.",
            'Got it',
            'Learn more',
        );
        if (choice === 'Learn more') {
            await vscode.env.openExternal(vscode.Uri.parse(
                'https://code.visualstudio.com/api/ux-guidelines/sidebars',
            ));
        }
        await this.context.globalState.update(PLACEMENT_TIP_KEY, true);
    }

    // ── Terminal pathway ─────────────────────────────────────────────────────

    private async launchInTerminal(project: Project): Promise<void> {
        if (!(await this.isClaudeOnPath())) {
            await this.promptToInstallClaude();
            return;
        }

        const cwd = this.resolveAiContextRoot(project);
        const terminalName = `Claude — ${project.name}`;

        const existing = vscode.window.terminals.find(t => t.name === terminalName);
        if (existing) {
            existing.show();
            return;
        }

        const terminal = this.createTerminal(terminalName, cwd);
        terminal.show();
        terminal.sendText('claude');
        this.logger.info(`[OpenInClaudeCode] Opened claude for ${project.name} at ${cwd}`);
    }

    private resolveAiContextRoot(project: Project): string {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        return edsInstance?.path ?? project.path;
    }

    private async isClaudeOnPath(): Promise<boolean> {
        const which = process.platform === 'win32' ? 'where' : 'which';
        try {
            const { stdout } = await execFile(which, ['claude'], { timeout: WHICH_TIMEOUT_MS });
            return stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    private async promptToInstallClaude(): Promise<void> {
        const choice = await vscode.window.showInformationMessage(
            'Claude Code CLI not found on PATH. Install it to enable AI workflows in your project.',
            'Install Claude Code',
            'Cancel',
        );
        if (choice === 'Install Claude Code') {
            await vscode.env.openExternal(vscode.Uri.parse(CLAUDE_DOCS_URL));
        }
    }
}
```

Roughly 100 lines. Composes from existing `BaseCommand.createTerminal`, the cross-platform `which`/`where` pattern from `environmentSetup.ts:148`, the `vscode.window.terminals` lookup from `stopDemo.ts:88-99`, `vscode.extensions.getExtension`, `vscode.env.openExternal`, `vscode.window.showInformationMessage`, and `globalState` for the one-time placement tip. Zero new infrastructure.

### 6. Chat Participant Code Removal

Delete `src/features/ai/vscodeChatParticipant.ts`, update `src/features/ai/index.ts` to drop the `registerChatParticipant` export and `ProjectResolver` type, update `src/features/ai/README.md` to remove the "Phase 2" section. No `package.json` `contributes.chatParticipants` entry was ever added, so nothing to remove there.

The `aiSetupVerifier.ts` stays — it's used by the AI Configuration tab.

### 7. Non-AI Sync UX (Cycle B Storefront Sync + Cycle E Library Promotion)

The sync gap fixes (6e–6h) refactor into service-first shape so both the MCP and a non-AI VS Code surface can call the same underlying logic. **No new UI patterns are required.** Every interaction below uses existing helpers from `BaseCommand` (`src/core/base/baseCommand.ts:98-179`) and standard `vscode.window` APIs already in use throughout the codebase.

#### Service-first refactor (Cycle B)

The sync logic extracts into vscode-free services that both the MCP and the extension import:

| Service | Where | Wraps |
|---|---|---|
| `storefrontSyncService` | `src/features/eds/services/storefrontSyncService.ts` | Git push + Helix preview/publish chain + `GitHubTokenService` auth |
| `libraryPromotionService` | `src/features/eds/services/libraryPromotionService.ts` (Cycle E) | Atomic-tree-commit reversed: storefront → library |

Each service has two wrappers:

| Service | MCP wrapper | VS Code wrapper |
|---|---|---|
| `storefrontSyncService.syncAndPublish()` | `sync_storefront` tool (existing, extended) | `SyncStorefrontCommand extends BaseCommand` (new in Cycle B) |
| `libraryPromotionService.promoteBlocks()` | `promote_block` tool (Cycle E) | `PromoteBlocksCommand extends BaseCommand` (Cycle E) |

The MCP and the extension are separate processes, but `src/mcp-server.ts:26` already imports from `@/core/validation` — proving vscode-free modules can be shared. Both services are vscode-free; both wrappers are thin.

#### Storefront Sync UX (Cycle B)

**Entry points** (both call `SyncStorefrontCommand.execute()`):
- Dashboard ActionGrid tile: "Sync Storefront" with Spectrum `Refresh` icon, positioned alongside "Open in Claude Code"
- Command palette: `Demo Builder: Sync Storefront`

**The click flow**:

1. **Pre-flight inspection** (silent): `git status --porcelain` for uncommitted changes; `git log @{upstream}..HEAD` for unpushed commits.

2. **Branch on state**:
   - **Nothing to commit and nothing to push**: skip to Helix publish only. `this.showSuccessMessage('Storefront is in sync. Refreshing preview...')`. After publish: `vscode.window.showInformationMessage('Preview updated. View at <url>', 'Open')`.
   - **Changes to commit and/or unpushed commits**: continue to step 3.
   - **Storefront not initialized as git repo**: `this.showError('Storefront repository not initialized.')`. Stop.

3. **Commit message prompt** (only when uncommitted changes exist):
   ```ts
   const message = await this.showInputBox({
       prompt: 'Commit message',
       value: 'Demo Builder: sync local changes',
   });
   if (!message) return; // user cancelled
   ```
   If only unpushed commits exist (no new changes), skip this step.

4. **Execute with progress**:
   ```ts
   await this.withProgress('Syncing storefront', async (progress) => {
       progress.report({ message: 'Committing changes...' });
       await service.commit(message);
       progress.report({ message: 'Pushing to GitHub...' });
       await service.push();
       progress.report({ message: 'Publishing to Helix...' });
       await service.publish();
   });
   ```

5. **Result** — branch on outcome:
   - Success: `vscode.window.showInformationMessage('Storefront synced. Live at <url>', 'Open', 'View Commit')` returns the label; act on it.
   - Auth failure: `vscode.window.showErrorMessage('GitHub push failed: authentication.', 'Re-authenticate')` → triggers the existing re-auth flow if clicked.
   - Push rejected (remote ahead): the service runs `git pull --rebase` automatically. If the rebase is clean, it continues to push without showing the user anything. If conflicts emerge, see "Conflict resolution" below.
   - Helix publish failed: `vscode.window.showWarningMessage('Pushed to GitHub but Helix publish failed.', 'Retry')`.

**Conflict resolution (non-technical user flow)**: when `git pull --rebase` produces conflict markers, the user never sees a terminal. The service:

1. Calls `vscode.commands.executeCommand('workbench.view.scm')` to open VS Code's Source Control view automatically. Conflicted files appear in the list; the user clicks any of them to open VS Code's built-in 3-way merge editor with "Accept Incoming" / "Accept Current" / "Accept Both" buttons on each conflict block.
2. Replaces the running progress notification with: *"Combining changes... 2 of 3 files resolved. [Cancel and Reset]"*. The message updates as the user clears conflict markers from each file.
3. Polls via `PollingService.pollUntilCondition` (the same primitive `startDemo.ts:58` uses for port-waiting and `FileWatcher.waitForFileSystem` uses internally). Condition: no file contains `<<<<<<<`/`=======`/`>>>>>>>` markers. Exponential backoff; existing timeout config.
4. When the condition is met, runs `git rebase --continue` programmatically, then continues with push + Helix publish. The user sees the success notification as if nothing unusual happened.
5. If the user clicks "Cancel and Reset" at any point, the service runs `git rebase --abort` to restore the working tree to its pre-sync state. Their local changes are intact. They can try again later.

No "Open in Terminal" button. No git commands typed. The user clicks "Accept" buttons in VS Code's merge editor and Demo Builder handles every git operation in the background.

**Typical user experience**: 3 clicks (sync tile → confirm commit message → wait ~5 seconds → notification shows the live URL).

#### Library Promotion UX (Cycle E)

**Entry points** (all call `PromoteBlocksCommand.execute()` with optional pre-selection):
- Dashboard ActionGrid tile: "Promote Blocks..." with Spectrum `Upload` icon
- Command palette: `Demo Builder: Promote Blocks to Library...`
- Configure screen action: "Promote local changes..." in a new "Block Libraries" panel section
- Right-click context menu on `blocks/<name>/` in VS Code Explorer → "Promote to Library..." (pre-selects the block; nice-to-have, not blocking)

**The click flow**:

1. **Enumeration** (silent): cross-reference storefront `blocks/` directory with `installedBlockLibraries[].blockIds` to identify blocks that originated from a library AND have changed since install.

2. **Multi-select block list**:
   ```ts
   const items: vscode.QuickPickItem[] = [
       { label: 'My Blocks (theirorg/my-blocks)', kind: vscode.QuickPickItemKind.Separator },
       { label: 'hero', description: '3 files changed' },
       { label: 'cta', description: '1 file changed' },
       { label: 'Isle5 Block Collection (stephen-garner-adobe/isle5)', kind: vscode.QuickPickItemKind.Separator },
       { label: 'header', description: '1 file changed' },
   ];
   const selected = await this.showQuickPick(items, { canPickMany: true, placeHolder: 'Select blocks to promote' });
   ```

3. **Per-library sequential prompts** (no custom modal). For each library in the selection:

   **For libraries the user owns** — branch model + commit message:
   ```ts
   const branchModel = await this.showQuickPick([
       { label: 'Push directly to main', description: 'Use for trusted libraries' },
       { label: 'Push to feature branch and open PR', description: 'Recommended', picked: true },
   ], { placeHolder: 'How should we promote to theirorg/my-blocks?' });

   const commitMessage = await this.showInputBox({
       prompt: 'Commit message',
       value: 'Hero and CTA improvements',
   });
   ```

   **For third-party libraries** — info confirmation + PR title:
   ```ts
   const proceed = await vscode.window.showInformationMessage(
       "You don't have write access to stephen-garner-adobe/isle5. Demo Builder will fork it and open a PR.",
       'Continue', 'Cancel',
   );
   if (proceed !== 'Continue') return;
   const prTitle = await this.showInputBox({ prompt: 'PR title', value: 'Improvements to header block' });
   ```

4. **Combine-and-Promote when library has moved** — if Demo Builder detects the library has moved since install:
   ```ts
   const choice = await vscode.window.showInformationMessage(
       'This library has updates. theirorg/my-blocks has 8 new commits since you installed it. ' +
       'Demo Builder will combine those changes with yours, then promote.',
       'Combine and Promote', 'Cancel',
   );
   ```
   No "Promote Anyway" button — there is no destructive single-click path. Clicking "Combine and Promote" runs the Cycle B Step 6h library re-install (which performs a 3-way merge into the storefront's `blocks/` directory), then continues automatically to the promotion step.

   **If the 3-way merge produces conflicts** (the user edited the same lines the library author did), the same non-technical resolution flow as storefront sync runs: VS Code's Source Control view opens, a progress notification shows "N of M files resolved", and `PollingService.pollUntilCondition` (`src/core/shell/pollingService.ts`) polls the conflict-marker state until the user finishes via VS Code's built-in merge editor. On "Cancel and Reset", the in-progress merge is unwound via `git merge --abort` and the promotion is abandoned cleanly. No terminal commands surfaced.

5. **Execute with progress**:
   ```ts
   await this.withProgress('Promoting blocks', async (progress) => {
       progress.report({ message: 'Reading library state...' });
       await service.fetchLibraryTree();
       progress.report({ message: 'Composing commit...' });
       await service.composeTree();
       progress.report({ message: 'Pushing to feature/promote-hero-cta...' });
       await service.pushBranch();
       progress.report({ message: 'Opening PR...' });
       await service.openPullRequest();
   });
   ```

6. **Result** — one notification per library (no summary webview):
   - Direct push: `vscode.window.showInformationMessage('Promoted 2 blocks to theirorg/my-blocks (main).', 'View Commit')`.
   - PR opened: `vscode.window.showInformationMessage("PR #42 opened: 'Hero and CTA improvements'", 'Open PR')`.
   - Auth failure: `vscode.window.showErrorMessage('GitHub access failed for theirorg/my-blocks.', 'Re-authenticate')`.
   - Network failure: `vscode.window.showErrorMessage('Promotion failed. Check connection and try again.', 'Retry')`.

**Typical user experience**: 6 clicks for the multi-step flow (promote tile → check 2 blocks → continue → branch model → commit message → confirm → wait ~10 seconds → notification with the PR link).

#### Opinionated UX defaults

- **Storefront sync prompts for a commit message** with a default value rather than auto-using a static message. Reason: users want explicit control over what they push. The default makes the common case one-keypress.
- **Library promotion requires explicit selection.** No "promote all changed blocks" shortcut. Blocks come from multiple libraries; bulk promotion would create cross-library noise.
- **Library promotion's default branch model is "feature branch + PR"** for libraries the user owns. Direct-push-to-main is available but not the default. Reason: safer default; users who don't care can change the QuickPick selection.
- **Third-party library promotion always uses fork+PR.** No special "request collaborator access" UX.
- **Both surfaces honor the same GitHub token** (via `GitHubTokenService`). No separate sync credentials.
- **No auto-sync-on-save in this cycle.** A `demoBuilder.eds.autoSync` setting could be added later if users ask for it; not a Cycle B requirement.

#### Configurable: `demoBuilder.blockLibraries.syncBehavior`

Block library sync is opt-in/opt-out at the user-settings level, matching the existing `demoBuilder.cleanupBehavior` pattern that governs GitHub/DA.live deletion (`package.json:135-149`). Adds a single new entry under the existing **Block Libraries** settings group:

```jsonc
"demoBuilder.blockLibraries.syncBehavior": {
  "type": "string",
  "enum": ["ask", "enabled", "disabled"],
  "enumDescriptions": [
    "Prompt before applying upstream library updates or promoting local changes to a library",
    "Apply library updates automatically when newer commits are detected; allow promotion actions without an extra confirmation",
    "Never touch block library remotes — promotion actions are hidden and library updates are skipped (the storefront stays on the install-time block files)"
  ],
  "default": "ask",
  "description": "How to handle two-way block library sync: applying upstream library updates to your storefront (Cycle B) and promoting your local block changes back to the library repo (Cycle E)."
}
```

**Behavior matrix:**

| Setting | Library re-install on update (Step 6h) | Promote Blocks action (Cycle E) |
|---|---|---|
| `ask` (default) | Detection still runs; before applying, show `vscode.window.showInformationMessage('Library "<name>" has N new commits. Update your storefront block files?', 'Update', 'Skip')`. "Skip" advances the recorded SHA without copying files (current bug-fixed behavior is gated behind the answer) | "Promote Blocks..." tile + command + context menu items remain visible; the existing "Combine and Promote" confirmation already satisfies the per-action prompt |
| `enabled` | Detection runs and applies automatically — exactly as Step 6h describes today | Tile/command/context menu visible; promotion flow runs without an extra opt-in (per-library prompts in Section 7 still apply for branch model, commit message, etc.) |
| `disabled` | Detection still records the new upstream SHA in `installedBlockLibraries[].commitSha` so the update tracker reflects reality, but **does not** copy files. The unified Check for Updates UI shows the library in a "Sync disabled" state with a link back to the setting | "Promote Blocks..." tile is hidden from the dashboard ActionGrid, the command is removed from the command palette via `when` clause, the right-click context menu entry on `blocks/<name>/` is hidden, and the Configure screen's Block Libraries panel shows "Promotion disabled — change `demoBuilder.blockLibraries.syncBehavior` to enable" instead of the action |

**Why one setting governs both directions**: pulling library updates and promoting local edits are halves of the same trust relationship — both modify the relationship between the storefront and the library remote. A user who doesn't want Demo Builder writing to library repos almost certainly also doesn't want it silently rewriting their storefront from a library remote. Splitting the setting risks the user opting out of one direction and being surprised by the other.

**Why not `localOnly` (matching `cleanupBehavior`'s naming)**: `cleanupBehavior` uses `localOnly` because there's a third axis (whether to delete external resources at all). Library sync has only two axes — sync or don't sync — so `enabled`/`disabled` reads more naturally. `ask` matches across both settings.

**Default rationale**: `ask` matches `cleanupBehavior`'s default. Demo Builder never modifies a library remote (in either direction) without an explicit prompt out of the box. Power users who want sync to be transparent can flip to `enabled`; conservative users (e.g., shared demos for external customers) can flip to `disabled`.

**Where the setting is read**:
- `storefrontSyncService` is unaffected — storefront sync is the storefront's own repo, not a library remote.
- `libraryPromotionService` (Cycle E E1) reads the setting at construction time and refuses to operate when it's `disabled`, returning a structured "promotion disabled by user setting" error that the MCP tool can surface.
- `performAddonUpdates` library re-install (Cycle B Step 6h) reads the setting before calling `installBlockCollections` and follows the matrix above.
- The dashboard ActionGrid uses the existing `when`-condition pattern (via a derived context key set by `useDashboardActions`) to hide the "Promote Blocks..." tile when `disabled`.
- The right-click Explorer context menu uses a `contributes.menus` `when` clause referencing the same context key.

**Discoverability**: AGENTS.md's Block Libraries section gets a one-line note when the setting is `disabled` so the AI agent doesn't suggest promotion actions that will fail. The Cycle D AI Configuration tab's MCP Servers section badges the `promote_block` tool as "Disabled by setting" when the setting is `disabled`.

### 8. Skill Templates — Trimmed to Demo-Builder-Specific

`src/features/project-creation/templates/skills/` shrinks from 13 files to 3:

| Keep | Drop |
|---|---|
| `add-component.md` | `add-block.md` (Adobe's block-developer handles this) |
| `sync-changes.md` | `add-custom-block.md` (Adobe's block-developer) |
| `update-credentials.md` | `create-block.md` (Adobe's block-developer) |
| | `configure-eds.md` (Adobe's project-manager) |
| | `edit-block-library.md.template` (Adobe's block-developer) |
| | `modify-content.md` (Adobe's content-modeler) |
| | `update-styles.md` (Adobe's block-developer) |
| | `use-aem-content-mcp.md` (session-level MCP is self-documenting) |
| | `use-commerce-dev-mcp.md.template` (replaced by Adobe's MCP + skills) |
| | `use-da-live-mcp.md.template` (session-level MCP) |

`skillsWriter.ts` becomes much simpler — three static templates, no conditional template interpolation, no addon-gated installations. The `demoBuilder.ai.includeBoilerplateSkills` setting is removed (the three kept skills are always installed).

---

## Reuse Map

Before any new code is written, every visual or behavioral element in this plan must be checked against existing patterns. This map is the answer for each one.

### UI primitives

| Plan element | Existing component to use | Location |
|---|---|---|
| Three Status rollup rows | `StatusCard` (with `color` variants) | `src/core/ui/components/feedback/StatusCard.tsx` |
| Status indicator dot | `StatusDot` (used internally by StatusCard) | `src/core/ui/components/ui/StatusDot.tsx` |
| Section containers (Status, Skills, MCP Servers) | `ConfigSection` (used in the Configuration tab) | `src/core/ui/components/forms/ConfigSection.tsx` |
| Tab structure (Configuration \| AI Configuration) | Existing Tabs/TabList/TabPanels in `ConfigureScreen.tsx:528-617` — swap the panel content only | `src/features/dashboard/ui/configure/ConfigureScreen.tsx` |
| Expand/collapse chevron | `ChevronDown` / `ChevronRight` from `@spectrum-icons/workflow` | (same icons NavigationPanel uses) |
| Tooltip for truncated descriptions | Spectrum `Tooltip` | `@adobe/react-spectrum` (already imported) |
| Collapsible row pattern (chevron + button + conditional children) | Inline the pattern from `NavigationPanel.tsx:81-115` directly in `AiConfigurationTab.tsx`. Extract a shared `ExpandableRow` only after a third consumer appears (Rule of Three) | `src/core/ui/components/navigation/NavigationPanel.tsx` |

### Hooks and utilities

| Plan element | Existing hook/utility | Location |
|---|---|---|
| Open/closed Set state for expanded rows | `useSetToggle` | `src/core/ui/hooks/useSetToggle.ts` |
| Async inspection calls (skills, MCPs) | `useAsyncOperation` or `useAsyncData` | `src/core/ui/hooks/useAsyncOperation.ts`, `useAsyncData.ts` |
| Webview request/response | `webviewClient.request` (already used by `AiSetupTab` for `verify-ai-setup`) | `src/core/ui/utils/WebviewClient.ts` |
| YAML frontmatter parsing | `yaml` package (already in deps, no install needed) | `package.json` v2.3.4 |
| Handler dispatch | Add new handlers to existing `configureHandlers` map | `src/features/dashboard/handlers/configureHandlers.ts` |

### Commands and dashboard actions

| Plan element | Existing infrastructure | Location |
|---|---|---|
| Terminal creation for "Open in Claude Code" | `BaseCommand.createTerminal(name, cwd)` — same pattern `startDemo` uses to launch the dev server | `src/core/base/baseCommand.ts:200`; precedent at `src/features/lifecycle/commands/startDemo.ts:292-296` |
| Dashboard action handler | Add `handleOpenInClaude` to existing `useDashboardActions` hook | `src/features/dashboard/ui/hooks/useDashboardActions.ts` |
| Dashboard ActionGrid tile | Add one `ActionButton` + handler prop to existing `ActionGrid` component | `src/features/dashboard/ui/components/ActionGrid.tsx` |
| Webview message protocol | Existing `webviewClient.request` from the tab side; existing handler map on the extension side | (see Hooks row above) |

### What's genuinely new (the only files actually added)

Every new artifact below MUST compose from existing primitives wherever possible. The "Built from" column is non-optional — implementers should treat it as a reuse contract.

| New artifact | Why it's new | Built from (existing pieces it composes) |
|---|---|---|
| `mcpInspector` service (extension-side) | No prior code spawns project-local MCP servers to call `tools/list` | `fs/promises` for reading `.claude/mcp.json` (same as `aiSetupVerifier.ts`); existing `ExternalCommandManager` or `child_process.spawn` (same approach `meshDeployment.ts` uses to invoke `aio`); existing cache utilities (`src/core/cache/cacheUtils.ts`) for the per-server result cache |
| `skillInspector` service (extension-side) | No prior code reads `.claude/skills/` and parses frontmatter | `fs/promises` (same as `aiSetupVerifier.ts`); existing `yaml` package (already in `package.json`); path classification by glob pattern (same string-matching approach used in `aiContextWriter.ts`) |
| Session-level MCP detection helper | No prior code reads Claude Code's user-level MCP catalog | `fs/promises`; existing JSON-parse-with-guards pattern from `mcpConfigWriter.ts:129-157` |
| `ai-defaults.json` config file | First always-installed-MCP declaration; matches Demo Builder's existing JSON-config pattern but for AI infrastructure rather than user-selectable components | Same JSON-config pattern as `wizard-steps.json`, `logging.json`, `stacks.json`, `components.json`, `block-libraries.json`; loaded by `mcpConfigWriter.ts` using the same import-and-parse pattern other config files use |
| `aiSkillBundle` field on the component schema | New optional metadata on components — declares which Adobe skill bundle (from `node_modules/.../dist/`) the component scaffolds | Extends the existing `Component` type in `src/types/`; declared inline on `eds-storefront` in `components.json` alongside other component metadata; consumed by `skillsWriter.ts` via the existing project-state walk in `project.componentInstances` |
| Adobe Commerce devDep install + skill copy + namespace pass | New integration with `@adobe-commerce/commerce-extensibility-tools`; new responsibility for `skillsWriter.ts` to copy + rename skills | Existing `projectFinalizationService.ts` phase pattern (extends Phase 6); existing `package.json` mutation pattern from project creation; `fs/promises.cp` for the recursive copy (no new dependency); existing `yaml` package to parse and rewrite the `name:` frontmatter field during the rename pass |
| `AdobeMcpUpdateChecker` service (Cycle D, Step 17) | Surfaces Adobe MCP package updates through Demo Builder's unified Check for Updates flow | Modeled on existing `addonUpdateChecker.ts` / `templateUpdateChecker.ts`; reuses shared `githubApiClient.ts` for the GitHub API call; integrates into existing `CheckUpdatesCommand` orchestration alongside the other six checkers. Apply flow reuses the existing Regenerate AI Files handler to re-run the namespacing pass after `npm update` |
| `regenerate-ai-files` cleanup helper | Existing handler doesn't currently delete obsolete files | Extends existing `handleRegenerateAiFiles` in `configureHandlers.ts:104`; uses `fs/promises.rm` like the existing snapshot/rollback code in `componentUpdater.ts` |
| `demoBuilder.openInClaude` command | Wraps both launch pathways behind a single command + setting | `BaseCommand.createTerminal(name, cwd)` (existing); cross-platform `which`/`where` pattern from `environmentSetup.ts:148`; `vscode.extensions.getExtension` + `vscode.env.openExternal` for the URI handler path; `vscode.window.terminals.find` lookup matching `stopDemo.ts:88-99`; `globalState` for the placement tip (same mechanism as the consent-gated global MCP registration prompt) |
| `ensureGlobalMcpRegistration` helper | Consent-gated upsert into `~/.claude.json`; bug fix replacing the broken `writeGlobalMcpConfig` write to `~/.claude/.mcp.json` | `fs/promises` read/write (same pattern as `writeGlobalMcpConfig` today); `vscode.window.showInformationMessage` with three buttons (same as existing pre-flight auth prompts); `globalState` for three-state tracking (`registered`/`declined`/`undefined`); JSON-parse-with-guards pattern from existing global-config code |
| `sync_storefront` Helix publish chain | Closes the AI-edits → preview-URL loop | `previewAndPublishPage` (existing `helixService.ts:910`); same pattern `configSyncService.syncConfigToRemote` already uses for `config.json` |
| `sync_storefront` GitHub auth wiring | Eliminates silent push failures from expired/missing ambient credentials | `GitHubTokenService.getToken()` (existing); `injectTokenIntoUrl` from `githubHelpers.ts` (existing); same auth path as `cloneRepository` |
| Hardened PostToolUse hook | Replaces fragile grep/sed parser; supports paths with spaces; surfaces failures | `jq` for JSON parsing (binary on PATH; widely available; fallback chain to python3 then grep/sed for portability); existing `SHELL_METACHAR_RE` (with whitespace removed from the reject set); existing project-local logging conventions for the failure log |
| Block library re-install on update | Fixes the "update lies" bug — files actually change | `installBlockCollections` from `blockCollectionHelpers.ts:62-264` (existing); existing `updateCommitShaWithRollback` pattern (call install before bumping SHA) |
| `storefrontSyncService` (Cycle B) | Vscode-free service for sync logic; shared by MCP and extension | `fs/promises` + `child_process.execFile` for git ops (same pattern as existing `mcp-server.ts` git calls); existing `GitHubTokenService.getToken()` for auth; existing `injectTokenIntoUrl` for git URL credential injection; existing `previewAndPublishPage` from `helixService.ts:910` for Helix chain; existing `PollingService.pollUntilCondition` (`src/core/shell/pollingService.ts`) for conflict-marker polling — same primitive `startDemo.ts:58` uses for port-waiting and `FileWatcher.waitForFileSystem` uses internally; existing `vscode.commands.executeCommand('workbench.view.scm')` to open Source Control + the built-in 3-way merge editor (no new UI) |
| `SyncStorefrontCommand` (Cycle B) | Non-AI dashboard surface for storefront sync | `BaseCommand` (existing base class with `withProgress`/`showInputBox`/`showSuccessMessage` helpers, lines 98-179); existing `ActionGrid` tile + `useDashboardActions` hook patterns; Spectrum `Refresh` icon already imported in dashboard; same wiring pattern as `demoBuilder.openInClaude` (Cycle D) |
| `libraryPromotionService` (Cycle E) | Vscode-free service for promotion logic | `installBlockCollections` (existing, used as the reverse-direction template, ALSO called pre-promotion for Combine-and-Promote reconciliation); existing `githubFileOps` from EDS feature; `GitHubTokenService` (existing); Octokit's `pulls.create` and `repos.createFork` (existing, used elsewhere in EDS code); `PollingService.pollUntilCondition` for conflict-marker polling during the 3-way merge phase (same primitive `storefrontSyncService` uses) |
| `PromoteBlocksCommand` (Cycle E) | Non-AI dashboard surface for library promotion | `BaseCommand` helpers only — `showQuickPick(canPickMany)`, `showInputBox`, `withProgress`, `showWarningMessage`, `showInformationMessage` (all existing, lines 98-179); Spectrum `Upload` icon; same wiring pattern as existing dashboard tiles |
| `demoBuilder.blockLibraries.syncBehavior` setting + gating | Opt-in/opt-out for two-way library sync; matches the existing `demoBuilder.cleanupBehavior` pattern for GitHub/DA.live resource deletion | Existing `package.json` contributes pattern (`cleanupBehavior` declaration at `package.json:135-149` is the template); `vscode.workspace.getConfiguration('demoBuilder.blockLibraries').get('syncBehavior')` (standard VS Code API); existing `when`-clause + context key pattern already used for other conditional menu items; existing `vscode.window.showInformationMessage` for the `ask` prompt (same helper as `cleanupBehavior`'s confirmation prompts) |
| `AiConfigurationTab.tsx` component | New file — composed view | `StatusCard`, `ConfigSection`, `ChevronDown`/`ChevronRight`, Spectrum `Tooltip`, `useSetToggle`, `useAsyncOperation`, `webviewClient.request` — **zero new UI primitives**; collapsible row pattern inlined from `NavigationPanel.tsx:81-115` |
| ADR-004 (harness decision) | New documentation | Follows existing ADR template at `docs/architecture/adr/003-multisite-architecture-seam.md` |

**Net effect**: twenty new artifacts, every one of them assembled from existing primitives. No new UI components, no new dependencies (`jq` is widely available; the implementation includes python3 + grep/sed fallback for portability), no new UI patterns. Two new JSON config files extend Demo Builder's existing configuration-driven approach (`ai-defaults.json` for always-installed MCPs, `aiSkillBundle` field added to existing `components.json`). The `AdobeMcpUpdateChecker` (Cycle D) folds into Demo Builder's existing update-tracking pattern alongside the six existing checkers. The `ensureGlobalMcpRegistration` helper (Cycle B) replaces a broken silent write with a consent-gated upsert matching Demo Builder's existing pre-flight-auth pattern. Cycle B's sync-gap fixes (Helix publish chain, GitHubTokenService auth, hardened PostToolUse hook, real block library update apply) all compose from existing Demo Builder primitives. The new service-first sync surfaces (`storefrontSyncService` + `SyncStorefrontCommand` in Cycle B, `libraryPromotionService` + `PromoteBlocksCommand` in Cycle E) use only existing `BaseCommand` helpers (`withProgress`, `showInputBox`, `showQuickPick(canPickMany)`, `showInformationMessage`, etc.) and existing `ActionGrid` extension patterns — no new VS Code interaction patterns introduced. Implementers should never need to write something they could have imported.

### Rules of thumb for implementation

1. **New components are allowed for genuinely new functionality — but every new component must compose from existing primitives wherever possible.** The "Built from" column in the table above is a reuse contract, not a suggestion. Before writing anything new, check whether what you need exists.
2. **Don't extract a shared component until it has a second consumer.** The collapsible row pattern is the only obvious candidate, and it appears only inside `AiConfigurationTab.tsx`. Inline it from `NavigationPanel.tsx:81-115`.
3. **`StatusCard` covers every status row in this tab.** Don't build a parallel "AICapabilityCard" or similar. The color variants (`green` / `yellow` / `red` / `gray`) map cleanly to Ready / Needs attention / Failed / Not installed.
4. **Reuse `useDashboardActions` for `handleOpenInClaude`.** Don't create a separate AI-only hook.
5. **`yaml` is already installed.** No frontmatter library needed.
6. **Shell commands use `ExternalCommandManager`.** Don't reach for `child_process.exec` directly — the existing manager handles queuing, exclusivity, timeouts, and error formatting.
7. **Polling and file-system waiting use `PollingService.pollUntilCondition` and `FileWatcher.waitForFileSystem`.** Both live in `src/core/shell/`. Use them for any "wait until X is true" loop (conflict-marker resolution, port-in-use, file-watch-with-condition) — they handle exponential backoff, timeout, and cancellation. Don't write custom `setInterval` loops.

---

## UX Touchpoints

Every surface touched by the pivot.

### 1. Project Creation

| What changes | Type | Key file |
|---|---|---|
| `mcpConfigWriter.ts` writes only `demo-builder` to project MCP configs (Cycle A) — extended in Cycle B to also read `ai-defaults.json` and add each declared MCP server | Trim then extend | `src/features/project-creation/services/mcpConfigWriter.ts` |
| New `ai-defaults.json` declaring the always-installed MCP servers (App Builder MCP via `@adobe-commerce/commerce-extensibility-tools@^3.4.0`) | New config file | `src/features/project-creation/config/ai-defaults.json` |
| New optional `aiSkillBundle: { path, prefix }` field on the component schema; declared on `eds-storefront` in `components.json` | Schema extension | `components.json` + `src/types/components.ts` |
| `projectFinalizationService.ts` mutates the storefront `package.json` to add each declared MCP package as a devDep before `npm install` | New step | `src/features/project-creation/services/projectFinalizationService.ts` |
| `skillsWriter.ts` reads each component's `aiSkillBundle`, copies + namespaces matching bundles from `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/{path}/` → `<projectPath>/.claude/skills/{prefix}-{skill-name}/`, rewriting `name:` frontmatter to match | Extend existing | `src/features/project-creation/services/skillsWriter.ts` |
| `aiContextWriter.ts` writes `AGENTS.md` instead of `.claude/CLAUDE.md`; `.claude/CLAUDE.md` becomes a one-line pointer (and root `CLAUDE.md` does the same) | Rewrite content | `src/features/project-creation/services/aiContextWriter.ts` |
| `skillsWriter.ts` ships only 3 templates; drops conditional logic | Trim existing | `src/features/project-creation/services/skillsWriter.ts` |
| `package.json` contributes section removes `mcpConfigTargets`, `externalMcpServers`, `includeBoilerplateSkills` settings | Remove settings | `package.json` |
| `package.json` contributes section adds `demoBuilder.ai.harness` setting (`auto` \| `extension` \| `terminal`, default `auto`) | New setting | `package.json` |
| `package.json` contributes section adds `demoBuilder.blockLibraries.syncBehavior` setting (`ask` \| `enabled` \| `disabled`, default `ask`) under the existing **Block Libraries** group, matching the `demoBuilder.cleanupBehavior` pattern | New setting | `package.json` |
| `mcpConfigWriter.ts`: replace silent `writeGlobalMcpConfig` with consent-gated `ensureGlobalMcpRegistration`; write to `~/.claude.json` top-level `mcpServers` (canonical); stop writing `~/.claude/.mcp.json` | Bug fix + new helper | `src/features/project-creation/services/mcpConfigWriter.ts` |
| First-project-completion hook in `executor.ts` triggers the global registration prompt (gated by `globalState`) | New trigger | `src/features/project-creation/handlers/executor.ts` |
| `sync_storefront` MCP tool extended to chain `previewAndPublishPage` after successful `git push` so AI edits propagate to `.aem.page` preview URLs without manual Republish | Extend existing tool | `src/mcp-server.ts:261-288` + `helixService.ts:910` |
| `sync_storefront` MCP tool uses `GitHubTokenService.getToken()` for git push auth (no more ambient credential dependency) | Auth wiring | `src/mcp-server.ts` |
| PostToolUse hook bash command rewritten with `jq` (with python3 + grep/sed fallback chain); permits paths with spaces; logs failures to a project-local file the AI Configuration tab surfaces | Harden existing hook | `src/features/project-creation/services/mcpConfigWriter.ts:217-253` |
| `performAddonUpdates` actually re-installs block files when a library update is applied (not just a SHA bump) | Bug fix | `src/features/updates/commands/updateExecutor.ts:287-330` |
| Remove unimplemented-feature references from `aiContextWriter.ts` ("Promote my hero-cta changes back to the Isle5 library") and the `sync-changes.md` skill template (`sync_content` MCP tool) | Doc cleanup | `aiContextWriter.ts:235-244` + skill template |

### 2. AI Configuration Tab

| What changes | Type | Key file |
|---|---|---|
| Rename tab label from "AI Setup" to "AI Configuration" | Label change | `src/features/dashboard/ui/tabs/AiSetupTab.tsx` → renamed `AiConfigurationTab.tsx` |
| Three-section layout: Status, Skills Installed, MCP Servers | Replace existing | `AiConfigurationTab.tsx` |
| New Status section: three capability rollup rows with state labels (Ready / Not installed / Needs attention); four current file-and-parse verifications absorbed as drill-down details under the Demo Builder MCP row | Refactor existing into rollups | `AiConfigurationTab.tsx` |
| New Skills Installed section: collapsible groups parsing frontmatter from `.claude/skills/*` | New within tab | `AiConfigurationTab.tsx` + new `skillInspector` service |
| New MCP Servers section: lists project MCPs (with tool counts) and session-level Adobe MCPs; project rows expand to show per-tool name + description from `tools/list` introspection; session rows are not expandable in v1 | New within tab | `AiConfigurationTab.tsx` + new `mcpInspector` service |
| `verify-ai-setup` handler returns extended payload (skills + MCP inventory) | Extend handler | `src/features/dashboard/handlers/configureHandlers.ts` |
| New `inspect-mcp` handler for lightweight MCP introspection | New handler | `configureHandlers.ts` |
| Drop standalone "Verify Now" button — Status section auto-verifies on mount | Remove existing | `AiConfigurationTab.tsx` |
| Single "Regenerate Files" button below the Status section (no "Quick Actions" group — one button doesn't need a category) | Refactor existing | `AiConfigurationTab.tsx` |
| Status section adds a fourth row for global MCP registration ("Demo Builder MCP (global): Registered / Not registered"); when not registered, an inline `[Register]` button calls the same `ensureGlobalMcpRegistration` helper used at first-project-completion | New within tab | `AiConfigurationTab.tsx` |

### 3. Per-Project Dashboard

| What changes | Type | Key file |
|---|---|---|
| ActionGrid gains "Open in Claude Code" tile — **primary placement for the daily-use action** | Add tile | `src/features/dashboard/ui/hooks/useDashboardActions.ts` |
| New `demoBuilder.openInClaude` command: detect `claude` CLI on PATH, open terminal at project root, run `claude` | New command | `src/commands/` (new file) + `extension.ts` registration |
| ActionGrid gains "Sync Storefront" tile (Spectrum `Refresh` icon) — non-AI parallel to AI-driven `sync_storefront` | Add tile | `src/features/dashboard/ui/components/ActionGrid.tsx` + `useDashboardActions.ts` |
| New `demoBuilder.syncStorefront` command (`SyncStorefrontCommand extends BaseCommand`): uses `showInputBox` for commit message, `withProgress` for phased progress, `showSuccessMessage`/`showInformationMessage` for results. Wires to `storefrontSyncService.syncAndPublish` | New command | `src/commands/syncStorefront.ts` |
| (Cycle E) ActionGrid gains "Promote Blocks..." tile (Spectrum `Upload` icon) | Add tile | `src/features/dashboard/ui/components/ActionGrid.tsx` |
| (Cycle E) New `demoBuilder.promoteBlocks` command using existing `BaseCommand` helpers only — `showQuickPick(canPickMany: true)` for selection, `showQuickPick` for branch model, `showInputBox` for messages, `showWarningMessage` for conflicts, `withProgress` for execution, `showInformationMessage` per library for results | New command | `src/commands/promoteBlocks.ts` |
| (Cycle E) Dashboard ActionGrid "Promote Blocks..." tile + right-click Explorer entry + Configure screen panel action all gated on `demoBuilder.blockLibraries.syncBehavior !== 'disabled'` via `when` clauses and a derived context key | Conditional visibility | `package.json` contributes.menus + `useDashboardActions.ts` |

### 4. Projects Home Screen (Card Grid)

| What changes | Type | Key file |
|---|---|---|
| `ProjectActionsMenu` gains "Open in Claude Code" item alongside existing "Open Project" and "Copy Path" entries — **cold-start entry from the projects list** | Extend existing kebab menu | `src/features/projects-dashboard/ui/ProjectActionsMenu.tsx` |
| Handler delegates to the same `demoBuilder.openInClaude` command — no new logic, just a new dispatch | Reuse | (uses Step 14's command) |

### 5. AI Feature Module

| What changes | Type | Key file |
|---|---|---|
| Delete `vscodeChatParticipant.ts` | Remove file | `src/features/ai/vscodeChatParticipant.ts` |
| Update `index.ts` to drop chat participant exports | Trim | `src/features/ai/index.ts` |
| Update `README.md` to remove Phase 2 references; document the Claude Code (CLI) harness | Rewrite | `src/features/ai/README.md` |
| `aiSetupVerifier.ts` gains skill enumeration and MCP introspection helpers used by the tab | Extend | `src/features/ai/aiSetupVerifier.ts` |

### 6. Regeneration (Existing Projects)

| What changes | Type | Key file |
|---|---|---|
| `regenerate-ai-files` handler runs the new flow: slim MCP config, add Adobe devDep + skills, write AGENTS.md, trim Demo-Builder skills | Extend existing | `configureHandlers.ts::handleRegenerateAiFiles` |
| Cleans up obsolete files: old `.claude/CLAUDE.md`, dropped skill templates, `.cursor/mcp.json`, `.codex/mcp.json` | New cleanup step | New helper in `projectFinalizationService.ts` |

### 7. Documentation

| What changes | Type | Key file |
|---|---|---|
| Update `README.md` to describe the Claude Code (CLI) harness and what's installed | Rewrite section | Root `README.md` |
| Update `src/features/ai/README.md` to reflect the post-pivot architecture | Rewrite | `src/features/ai/README.md` |
| New ADR documenting the harness decision and Adobe-ecosystem alignment | New file | `docs/architecture/adr/004-claude-code-harness.md` |

---

## Implementation Steps

| Step | What | Effort | Cycle |
|---|---|---|---|
| 1 | Slim `mcpConfigWriter.ts` to write only `demo-builder` to project MCP configs (Cycle A). Cycle B Step 7 hard-deletes the `externalMcpServers` and `mcpConfigTargets` settings from `package.json` (no soft deprecation) | Small | A |
| 2 | Switch `aiContextWriter.ts` to emit `AGENTS.md` plus one-line `CLAUDE.md` pointer | Small | A |
| 3 | Trim `skillsWriter.ts` to three Demo-Builder-specific templates; remove conditional/interpolation paths | Small | A |
| 4 | Delete `vscodeChatParticipant.ts`; update `src/features/ai/index.ts` and README | Tiny | A |
| 5 | ~~Research spike: confirm Adobe's onboarding CLI command~~ ✅ DONE (2026-05-19) — no CLI exists; installation is a `cp -r` from `node_modules/.../dist/aem-boilerplate-commerce/skills/`. See Open Questions #1 for the full install flow. | Small | A |
| 5b | Drop unimplemented-feature references from generated AI context: remove "Promote my hero-cta changes back to the Isle5 library" example prompt from `aiContextWriter.ts:235-244` (reverse promotion isn't implemented); remove `sync_content` MCP tool references from the `sync-changes.md` skill template and AGENTS.md prose (tool doesn't exist in `mcp-server.ts`). Stops Demo Builder from promising features that don't ship. | Tiny | A |
| 6a | Create `src/features/project-creation/config/ai-defaults.json` declaring the always-installed MCP servers (App Builder MCP via `@adobe-commerce/commerce-extensibility-tools@^3.4.0` — caret pin, matching Demo Builder's overall npm posture; per-project `package-lock.json` freezes the resolved version after first install). Add the corresponding TypeScript type to `src/types/`. `mcpConfigWriter.ts` reads this file and adds each entry alongside `demo-builder` in the generated `.claude/mcp.json` and `.mcp.json`. Mutate the storefront repo's `package.json` to add the declared npm packages as devDeps before `npm install` runs. | Medium | B |
| 6b | Extend the component schema with an optional `aiSkillBundle: { path, prefix }` field. Declare it on `eds-storefront` in `components.json` (path: `aem-boilerplate-commerce/skills`, prefix: `aem`). `skillsWriter.ts` walks `project.componentInstances`, looks up each component's definition, and for those with an `aiSkillBundle` entry copies + namespaces the skill folders from `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/{path}/` → `<projectPath>/.claude/skills/{prefix}-{skill-name}/`. The rename pass also rewrites the `name:` frontmatter field to match the new folder name. | Medium | B |
| 6c | Add type definitions for the schema additions: `AiDefaults` for the new `ai-defaults.json` file, and the optional `aiSkillBundle` field on the `Component` type. Update related JSON schema docs. | Small | B |
| 6d | Replace silent `writeGlobalMcpConfig` with consent-gated `ensureGlobalMcpRegistration` in `mcpConfigWriter.ts`: targets `~/.claude.json` top-level `mcpServers` (canonical user-scope file, verified 2026-05-20). Three-state `globalState` tracking (`registered` / `declined` / `undefined`). Prompt trigger fires from `executor.ts` after first project creation completes. Stop writing the obsolete `~/.claude/.mcp.json`. | Small-Medium | B |
| 7 | Add `demoBuilder.ai.harness` setting (`auto` \| `extension` \| `terminal`, default `auto`) to `package.json` contributes section | Tiny | B |
| 6e | (Moved into Step 6L during Cycle B execution.) `helixService.ts` imports `vscode`, so chaining `previewAndPublishPage` directly from `mcp-server.ts` violates the vscode-free constraint. The Step 6L service extraction unlocks this — both `mcp-server.ts` and `SyncStorefrontCommand` call the vscode-free `storefrontSyncService`, which itself talks to a vscode-free `helixApiClient` for the preview/publish HTTP calls. | (Absorbed by 6L) | B |
| 6f | (Moved into Step 6L during Cycle B execution.) Same root cause as 6e: `GitHubTokenService` is vscode-dependent. The Step 6L service accepts a token provider as input; the MCP and extension wrappers each obtain the token through their respective contexts and pass it in. Eliminates silent push failures uniformly. | (Absorbed by 6L) | B |
| 6g | Replace PostToolUse hook's grep/sed parser of `$CLAUDE_TOOL_INPUT` with `jq` (with python3 + grep/sed as fallback chain). Allow paths with spaces by using proper quoting — `SHELL_METACHAR_RE` should reject injection characters but accept whitespace. Write hook failures to a project-local log file the AI Configuration tab can read and surface. | Medium | B |
| 6h | Fix `performAddonUpdates` in `src/features/updates/commands/updateExecutor.ts:287-330` to actually re-install block files when bumping `commitSha`. Today it advances the SHA without copying new files — a state lie. Call `installBlockCollections` (the same atomic-tree-commit install path used during project creation) before recording the new SHA. **Gated by `demoBuilder.blockLibraries.syncBehavior`** (see Section 7 "Configurable"): `enabled` re-installs and bumps SHA; `ask` prompts before copying files; `disabled` keeps both files AND SHA frozen, records a `syncDisabledMarker` (`{ upstreamSha, lastCheckedAt }`) on the `InstalledBlockLibrary` entry so the AI Configuration tab (Cycle D) can surface "Sync disabled — N commits behind upstream". **Shipped in Cycle B Group 1b (2026-05-20)**: the setting gate, the re-install via `installBlockCollections`, and the `syncDisabledMarker`. **Deferred from this step**: the 3-way merge for local edits. The merge requires fetching the install-time block content from the upstream library at the previously-recorded `commitSha`, which depends on the GitHub-API + token-provider infrastructure that Step 6L (B7) introduces. Until 3-way merge ships, the re-install overwrites local edits — users who modify block files must promote their changes (Cycle E) or set `syncBehavior` to `disabled` before accepting a library update. The conflict-resolution flow (Source Control + `PollingService.pollUntilCondition`) is also deferred to the 3-way merge follow-up. | Small-Medium (shipped) + Small-Medium (3-way merge follow-up) | B |
| 6i | Extend `aiContextWriter.ts` to enumerate per-component GitHub repos (any `componentInstance.metadata.githubRepo` value), not just the storefront. AGENTS.md gains a clean per-component repo listing. | Tiny | B |
| 6j | Augment `list_blocks` MCP tool to return `{ name, originLibrary?: { name, owner, repo } }` per block by cross-referencing `installedBlockLibraries`. No new MCP tool — just richer output from an existing one. | Tiny | B |
| 6k | Add a "Read-only sources" note to AGENTS.md's Block Libraries section ("Block libraries are read-only sources — edits to copied block files live in this storefront's repo. Library promotion is a planned future Demo Builder feature."). Sets accurate expectations for the AI agent and the user. | Tiny | B |
| 6L | Service-first refactor: extract `storefrontSyncService.syncAndPublish(projectName, commitMessage, tokenProvider)` in `src/features/eds/services/`. Vscode-free module; both the MCP and the extension import it. The service accepts a `tokenProvider` callback so it stays vscode-free while each surface supplies the token through its own channel (the extension uses `GitHubTokenService`; the MCP uses `process.env.GITHUB_TOKEN` or a credentials file written by the extension). Also extract a vscode-free `helixApiClient` for the `previewAndPublishPage` HTTP calls. `sync_storefront` MCP tool becomes a thin wrapper. The service chains commit (if needed) + push (with token injected via `injectTokenIntoUrl`) + Helix preview/publish (via the new client). Absorbs Steps 6e + 6f's intent into a single shared service. Non-technical-user conflict resolution: when `git push` is rejected (remote ahead), the service runs `git pull --rebase` automatically. If the rebase conflicts, the service emits conflict markers, opens VS Code's Source Control view via `vscode.commands.executeCommand('workbench.view.scm')`, then waits for resolution using the existing `PollingService.pollUntilCondition` (`src/core/shell/pollingService.ts`) — polls the conflicted files for absence of `<<<<<<<`/`=======`/`>>>>>>>` markers with exponential backoff. On user cancellation, the service runs `git rebase --abort` to leave the working tree exactly as it was. No "Open in Terminal" path; the entire flow is mouse-driven via VS Code's built-in merge editor. The Source Control / merge-editor orchestration lives in the extension wrapper, not in the vscode-free service. | Large | B |
| 6m | New `SyncStorefrontCommand extends BaseCommand` in `src/commands/syncStorefront.ts`. Uses existing helpers: `showInputBox` for commit message, `withProgress` for phased progress, `showSuccessMessage` for sync-only case, direct `showInformationMessage(msg, 'Open')` for result with action button. No new UI patterns. Wires to the same `storefrontSyncService.syncAndPublish` as the MCP tool. Full spec in Section 7 "Storefront Sync UX". | Small-Medium | B |
| 6n | Register the `demoBuilder.syncStorefront` command in `package.json` contributes + `extension.ts`; add "Sync Storefront" tile to existing `ActionGrid` component with Spectrum `Refresh` icon positioned alongside "Open in Claude Code"; add `handleSyncStorefront` to existing `useDashboardActions` hook. No new files for the dashboard tile — extends existing components. | Small | B |
| 8 | `regenerate-ai-files` cleanup pass: remove obsolete files from existing projects on regeneration (old `.claude/CLAUDE.md`, dropped skill templates, `.cursor/mcp.json`, `.codex/mcp.json`, `~/.claude/.mcp.json` if present) | Small | B |
| 9 | New `skillInspector` service: parse frontmatter from `.claude/skills/**/*.md` using existing `yaml` package, classify Adobe vs Demo Builder by path, return name/description/path | Small | C |
| 10 | New `mcpInspector` service: read `.claude/mcp.json`, run `tools/list` per server with timeout + cache, return per-server status plus per-tool `{ name, description }` | Medium | C |
| 11 | Session-level MCP detection: parse user-level Claude Code MCP config, list `mcp__claude_ai_*` entries with auth state | Medium | C |
| 12 | Extend `verify-ai-setup` handler payload with skills + MCP inventory; new `inspect-mcp` handler for on-demand introspection — both added to existing `configureHandlers` map | Small | C |
| 13 | Create `AiConfigurationTab.tsx` (replaces `AiSetupTab.tsx`); compose from existing `StatusCard` for the three rollup rows, `ConfigSection` for each section container, `ChevronDown`/`ChevronRight` + `useSetToggle` for collapsible rows (inline pattern from `NavigationPanel.tsx:81-115` — do not extract until a second consumer appears), Spectrum `Tooltip` for truncated description hover, `useAsyncOperation` for inspection calls; four current file-and-parse verifications become drill-down detail under the Demo Builder MCP row; drop standalone "Verify Now" button | Large | D |
| 14 | "Open in Claude Code" command — full spec in Section 5 "Behavioral details" and "Reference implementation shell". Two pathways: (a) Claude Code VS Code extension via URI handler `vscode://anthropic.claude-code/open` when `anthropic.claude-code` is installed; (b) Terminal launch with `claude` otherwise. Pathway selection driven by `demoBuilder.ai.harness` setting (`auto`/`extension`/`terminal`). Includes one-time placement tip via `globalState` when extension is detected. `MagicWand` Spectrum icon. Action-level logging. | Small-Medium | D |
| 14b | AI Configuration tab Status section gains a fourth row for global MCP registration, with inline `[Register]` button when not registered. Reuses `ensureGlobalMcpRegistration` from Step 6d. | Tiny | D |
| 15 | Add `handleOpenInClaude` to existing `useDashboardActions` hook; add one `ActionButton` tile to existing `ActionGrid` component (primary placement). Add "Open in Claude Code" item to `ProjectActionsMenu.tsx` (project card kebab — cold-start entry from the projects list). Same command, two dispatch points. | Small | D |
| 16 | Documentation: update root `README.md`, write ADR-004 (Claude Code harness decision), update `src/features/ai/README.md` | Small | D |
| 17 | New `AdobeMcpUpdateChecker` service in `src/features/updates/services/` modeled on `addonUpdateChecker.ts` and `templateUpdateChecker.ts`. Queries GitHub for the latest tag on `adobe-commerce/commerce-extensibility-tools` via the existing `githubApiClient.ts`. Integrates into `CheckUpdatesCommand` alongside the existing six checkers. Apply flow: `npm update @adobe-commerce/commerce-extensibility-tools` in the storefront repo, then trigger Regenerate AI Files to re-run the namespacing pass against the new version. Surface in the existing update QuickPick UI — no separate flow. | Medium | D |
| E1 | New `libraryPromotionService.promoteBlocks(projectName, librarySelections, options)` in `src/features/eds/services/`. Vscode-free service implementing atomic-tree-commit reversed: read library's current tree via GitHub API, compose new tree with the user's edited block files, create commit, push to chosen branch (or open PR). Mirrors `blockCollectionHelpers.installBlockCollections` in reverse. Uses existing `githubFileOps`, `GitHubTokenService`, and Octokit primitives. Before any push, the service ALWAYS runs the library re-install flow (Step 6h) first to reconcile the library's current state into the storefront — never proceeds with promotion against a stale install. **Gated by `demoBuilder.blockLibraries.syncBehavior`**: when `disabled`, the service short-circuits with a structured `PromotionDisabledError` that the MCP tool and the dashboard command both surface as "Promotion disabled in settings." | Medium | E |
| E2 | Conflict detection helper: compare library's current HEAD `commitSha` against the install-time `commitSha` recorded in `installedBlockLibraries[i].commitSha`. Reuses logic from `addonUpdateChecker.ts:57-102`. Returns `{ commitsBehind, hasMoved }`. Used to inform the user that a Combine-and-Promote will occur, not to gate destructive operations (there are no destructive operations in this flow). | Small | E |
| E3 | Wrap the service with the `promote_block` MCP tool in `src/mcp-server.ts`. Signature: `promote_block(projectName, libraryId, blockNames[], options?)`. Returns commit URL or PR URL. AI surface for promotion. | Small | E |
| E4 | New `PromoteBlocksCommand extends BaseCommand` in `src/commands/promoteBlocks.ts`. Uses existing helpers only: `showQuickPick(items, { canPickMany: true })` for block selection, `showQuickPick` for branch model, `showInputBox` for commit message / PR title, `showInformationMessage` for "Combine and Promote" confirmation, `withProgress` for execution, `showInformationMessage` per library for results. Non-technical-user conflict resolution: when the pre-promotion library re-install produces conflicts (Step 6h emits conflict markers), the command opens VS Code's Source Control view and uses `PollingService.pollUntilCondition` (`src/core/shell/pollingService.ts`) to wait for the user to finish resolving via the built-in merge editor. `withProgress` notification stays open with running "N of M files resolved" status. On user cancellation, the service unwinds (`git merge --abort` or equivalent) and the promotion is abandoned cleanly. Full spec in Section 7 "Library Promotion UX". | Medium-Large | E |
| E5 | Branch model handling: for libraries the user owns, supports direct push to main OR push to feature branch + open PR (PR creation via Octokit `pulls.create`). For third-party libraries (no write access), forks via Octokit `repos.createFork` then opens PR against the source. No "Force Promote" — the only path is Combine-and-Promote, which always reconciles upstream changes before pushing, eliminating the need for destructive operations from the UI. | Medium | E |
| E6 | Register `demoBuilder.promoteBlocks` command in `package.json` contributes + `extension.ts`. Add "Promote Blocks..." tile to existing `ActionGrid` (Spectrum `Upload` icon). Add `handlePromoteBlocks` to existing `useDashboardActions` hook. Optional: add right-click context menu entry on `blocks/<name>/` folder in VS Code Explorer via `contributes.menus.explorer/context` (pre-selects the block). Add a "Promote local changes..." action to the Configure screen's Block Libraries panel. **`when`-clause gating on `demoBuilder.blockLibraries.syncBehavior !== 'disabled'`**: the command palette entry, the dashboard tile (via a derived context key set by `useDashboardActions`), and the Explorer context menu entry are all hidden when the setting is `disabled`. The Configure screen panel renders an inline "Promotion disabled — open settings" link instead of the action when `disabled`. | Small-Medium | E |
| E7 | Update `aiContextWriter.ts` to remove the "Block libraries are read-only sources — library promotion is a planned future feature" note added in Step 6k. Replace with documentation of the new promotion capability. Add a new skill (`promote-blocks.md`) explaining when and how AI agents should call `promote_block`. | Small | E |

**`/rptc:feat` grouping:**

- **Cycle A** — Steps 1–5 (shipped 2026-05-19) plus Step 5b (doc cleanup of unimplemented-feature references discovered in the 2026-05-20 sync gap audit). Each generated project ships fewer files; existing projects unaffected until regenerated.
- **Cycle B** — Steps 6a–6n + 7 + 8: install the App Builder MCP universally via `ai-defaults.json`, copy + namespace skill bundles per component via `aiSkillBundle` field on `components.json`, add type definitions, fix the consent-gated global MCP registration (`~/.claude.json` upsert), close the AI-edit → preview-URL sync loop by chaining Helix publish after `git push`, wire GitHubTokenService into the MCP's git auth, harden the PostToolUse hook (jq parser + path-with-spaces support + failure surfacing), fix the block library update bug, add multi-component repo enumeration in AGENTS.md, surface block origin libraries via `list_blocks`, add the read-only-sources note (6k), refactor sync logic into `storefrontSyncService` (vscode-free, shared between MCP and extension), add the `SyncStorefrontCommand` dashboard tile + command palette entry (6L/6m/6n), add the `demoBuilder.ai.harness` setting, and handle regeneration cleanup. EDS projects gain Adobe's full skill agent set; future component additions ship their own bundles by declaration only. After Cycle B, the AI-edits-a-block-and-user-sees-it-on-preview loop closes end-to-end (matching the `te-eds-mock` 30-minute storefront experience) AND users have a non-AI sync surface for the same operation.
- **Cycle C** — Steps 9–12: skill and MCP inspection services + handler extensions. Backend data ready for the new tab.
- **Cycle D** — Steps 13–17: AI Configuration tab UI, Open in Claude Code action, documentation, and Adobe MCP update checker. User-visible surface lands; Adobe package updates flow through the existing unified update UI alongside extension, components, templates, block libraries, and Inspector SDK.
- **Cycle E** — Steps E1–E7: Library Promotion. Extracts `libraryPromotionService` (atomic-tree-commit reversed) shared between the MCP `promote_block` tool and the new `PromoteBlocksCommand` dashboard action. Supports both direct push and feature-branch + PR for libraries the user owns; forks-and-PRs for third-party libraries. Conflict detection via `commitSha` comparison. All promotion surfaces honor `demoBuilder.blockLibraries.syncBehavior` (the new setting introduced in Cycle B Section 7): when set to `disabled`, the dashboard tile, command-palette entry, Explorer context menu, and Configure screen action are all hidden via `when` clauses; the service short-circuits with `PromotionDisabledError`. Closes the "edit a block in storefront → promote to library" loop with both AI and non-AI surfaces. After Cycle E, the AGENTS.md note added in Step 6k flips from "planned future feature" to documented working capability (unless `syncBehavior` is `disabled`, in which case the note documents the disabled state).

---

## Open Questions

1. ~~**Adobe onboarding command — exact CLI invocation.**~~ ✅ RESOLVED (Cycle A.5, 2026-05-19).

   **Finding**: There is no onboarding CLI for installing skills into `.claude/skills/`. The package ships skills as static files inside `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/`, grouped by project type. The README's only install guidance is a manual `cp -r` step.

   **Recommended Cycle B install flow** (file copy, no CLI, configuration-driven):
   1. Mutate the storefront repo's `package.json` to add each `mcpServers[].package` from `ai-defaults.json` as a devDep (today: `@adobe-commerce/commerce-extensibility-tools@^3.4.0`)
   2. Run `npm install` (already part of project creation)
   3. For each component in `project.componentInstances`, look up its definition in `components.json`. If the component has an `aiSkillBundle: { path, prefix }` field, copy each skill folder from `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/{path}/` → `<projectPath>/.claude/skills/{prefix}-{skill-name}/`, and rewrite the `name:` frontmatter field in each copied `SKILL.md` to match the new folder name.
   4. Add each `mcpServers` entry from `ai-defaults.json` to the generated `.claude/mcp.json` and root `.mcp.json`, alongside the `demo-builder` entry already written by `mcpConfigWriter.ts`.

   **Skill bundles available** (per project type, in `dist/`):
   - `aem-boilerplate-commerce/skills/` — 6 skills: block-developer, content-modeler, dropin-developer, project-manager, researcher, tester (EDS storefront projects)
   - `integration-starter-kit/skills/` — 7 skills for App Builder backend integrations (architect, developer, devops-engineer, product-manager, tester, technical-writer, tutor)
   - `checkout-starter-kit/skills/` — skills for Checkout Starter Kit (not yet enumerated)

   **Risks**:
   - The README is out of date — recommends `git clone` instead of `npm install`. Both work; npm install is the cleaner path.
   - Pinning `^3.4.0` allows minor + patch updates. Adobe may change skills between versions — if behavioral drift becomes a concern, pin to exact (`3.4.0`) and bump deliberately.
   - The `aem-boilerplate-commerce` skill bundle assumes the project uses AEM Boilerplate Commerce. For non-EDS Demo Builder projects (headless), the integration-starter-kit bundle may be relevant but addresses a different scope (backend webhooks rather than storefront features).

   **Decision RESOLVED (2026-05-20)**: skill bundle selection is component-driven via the new `aiSkillBundle` field on `components.json`. The Adobe App Builder MCP install itself is universal via `ai-defaults.json`. EDS storefronts get the `aem` bundle through `eds-storefront`'s declaration. Headless projects get no Adobe bundle today (Demo Builder's three lifecycle skills only). Future ISK / CSK Demo Builder components declare their bundles inline — no skillsWriter code changes required.

   **Name collisions across bundles** (verified): six skill names collide. `tester` exists in all three bundles; `architect`, `developer`, `devops-engineer`, `product-manager`, and `technical-writer` exist in ISK + CSK. All colliding skills declare the same frontmatter `name:` field with different scopes. The install pass copies each skill to a `{prefix}-{name}/` folder and rewrites the `name:` frontmatter field to match — so all 22 skills become independently addressable.

2. ~~**Adobe Commerce package — pinning strategy.**~~ ✅ RESOLVED (2026-05-20).

   **Finding (research spike, 2026-05-20)**: Demo Builder has no Dependabot or Renovate configured. The `updates` feature uses GitHub APIs (Releases for components/extension, commit-based comparison for templates/addons) — npm semver tooling isn't part of the codebase's existing pattern. The single MCP-related exact pin (`@modelcontextprotocol/sdk@1.29.0`) lives in Demo Builder's own `package.json` because that SDK runs inside the extension at runtime; the Adobe MCP is consumed by generated projects, which is a different category.

   **Decision**: pin `^3.4.0` (caret) in `ai-defaults.json`. New projects resolve to the latest 3.x at first `npm install`; per-project `package-lock.json` then freezes that version. Existing projects keep their resolved version until the user explicitly upgrades. Matches Demo Builder's overall npm posture (61 caret pins, 0 tilde, 1 exact across the whole `package.json`).

   **Cycle D follow-up (Step 17)**: add `AdobeMcpUpdateChecker` to the existing `updates` feature so the Adobe MCP appears in the unified update UI alongside extension, components, templates, block libraries, and Inspector SDK. Users get the same integrated "Check for Updates" experience for the Adobe package that they have for everything else.

   **Risks accepted**:
   - Adobe could ship a minor version that changes skill folder names or frontmatter conventions, silently breaking the namespacing pass. Detectable at copy time (the pass walks the bundle structure). Recoverable by patching `ai-defaults.json` to an exact-pin temporarily until we adapt.
   - This depends on Adobe respecting semver inside the 3.x line. Same assumption as every other npm dependency Demo Builder ships.

3. **Session-level MCP detection — read access.** Where does Claude Code store its user-level MCP catalog config? Need to verify the path (likely `~/.claude/settings.json` or a subdirectory) and that we can read it without invoking the Claude Code CLI itself.

4. ~~**Multi-tool support beyond Claude.**~~ ✅ RESOLVED (2026-05-20). Verified the `rules/Claude/` contents: a single 65 KB monolithic `CLAUDE.md` focused on Adobe Commerce App Builder + Integration Starter Kit development. Content overlaps heavily with the `integration-starter-kit/skills/` bundle Adobe ships separately, and structurally conflicts with our `see @AGENTS.md` pointer in `.claude/CLAUDE.md`. **Decision**: copy nothing. Adobe is mid-migration from monolithic CLAUDE.md to decomposed skills; we already align with where they're going. `AGENTS.md` gets a one-line escape-hatch note pointing users at `node_modules/@adobe-commerce/commerce-extensibility-tools/rules/<tool>/` for the full file if they want it.

5. ~~**Headless/non-EDS projects.**~~ ✅ RESOLVED (2026-05-20). Headless projects get no Adobe skill bundle because no current Demo Builder component for headless declares an `aiSkillBundle`. The App Builder MCP still ships universally via `ai-defaults.json` — `aio-app-deploy`, `search-commerce-docs`, etc. are useful for headless work too. If a future Demo Builder component scaffolds the Adobe Integration Starter Kit or Checkout Starter Kit, it declares its own bundle and the writer picks it up automatically.

6. ~~**Regenerate-on-update behavior.**~~ ✅ RESOLVED (2026-05-20). Cycle B: Regenerate AI Files is a local-only refresh — copies + re-namespaces from the project's existing `node_modules/.../dist/`. No `npm install`, no `package.json` mutation, no network access. Adobe package version upgrades happen on first project creation only (when `npm install` runs) or via the Cycle D `AdobeMcpUpdateChecker` flow (deliberate user action). This keeps the Regenerate button fast and predictable, matching Demo Builder's existing pattern (component updates are a separate explicit action, not bundled with other operations).

7. ~~**Global MCP registration path.**~~ ✅ RESOLVED (2026-05-20). Empirical verification confirmed the bug: our `writeGlobalMcpConfig` writes to `~/.claude/.mcp.json`, which Claude Code does not read. The canonical user-scope MCP file is `~/.claude.json`'s top-level `mcpServers` field (verified in the maintainer's home directory: file exists at 72 KB, contains four entries from Claude Code's official setup mechanism, none matching `demo-builder`). **Cycle B Step 6d** replaces the silent write with a consent-gated `ensureGlobalMcpRegistration` helper that prompts the user after first project creation. Recovery path: AI Configuration tab Status row with `[Register]` button (Cycle D Step 14b).

8. ~~**Claude Code VS Code extension integration.**~~ ✅ RESOLVED (2026-05-20). Researched in `docs/research/2026-05-20-claude-code-vscode-extension-integration.md`. Detection via `vscode.extensions.getExtension('anthropic.claude-code')`. Documented public API is the URI handler `vscode://anthropic.claude-code/open` (added in extension v2.1.72). Panel docking cannot be programmatically controlled — secondary side bar contribution API is still in proposed state at VS Code. **Decision**: Cycle D Step 14 launches via URI handler when extension is installed and `demoBuilder.ai.harness` is `auto` or `extension`; terminal pathway when not installed or harness is `terminal`. One-time placement tip guides users to drag the extension panel to the right side bar.

9. ~~**MCP sync gap audit.**~~ ✅ RESOLVED (2026-05-20). Researched in `docs/research/2026-05-20-mcp-sync-gap-audit.md`. Nine distinct sync gaps identified; four critical for closing the AI-edits → preview-URL loop. **Decisions**: Cycle B gains Steps 6e–6h to fix the four critical gaps (Helix publish after `git push`, GitHubTokenService-injected auth for `sync_storefront`, jq-based PostToolUse hook with path-with-spaces support, real block library update apply that copies files instead of just bumping the SHA). Cycle A.2 follow-up (Step 5b) drops AGENTS.md references to unimplemented features (reverse promote, `sync_content`). Operational gaps (drift detection, fresh-machine clone recovery) deferred to Cycle D or later.

10. **Storefront path correction** ✅ RESOLVED (2026-05-20). Sync gap audit confirmed the correct on-disk location for an EDS storefront is `~/.demo-builder/projects/<name>/components/eds-storefront/`, not `<name>/storefront/`. Section 5 "AI-context root resolution" subsection corrected. The reference implementation shell was already correct via `COMPONENT_IDS.EDS_STOREFRONT`.

---

## Not in Scope

- VS Code Chat participant (`@demo-builder` in `vscode.chat`) — explicitly dropped
- VS Code Chat MCP tool surfacing — Claude Code (CLI) is the harness
- Per-tool MCP config files (`.cursor/mcp.json`, `.codex/mcp.json`) — replaced by universal `AGENTS.md` + project `.mcp.json`
- Adobe MCP authentication management — Claude Code handles that at session level; we link to docs if missing
- Building a Demo Builder–specific Commerce or EDS skill set — Adobe already ships better ones
- Bundling Adobe's MCP server binary inside the extension — installed per-project via npm

---

## Why This Pivot Reduces Surface Area

| Today (Phase 1 AI) | After pivot |
|---|---|
| 3 writers, 13 skill templates, 5 config file outputs, 3 multi-tool variants | 3 writers (slimmer), 3 skill templates, 2 config files |
| Custom MCP (7 tools) + 3 external project-level MCP entries (mostly broken) | Custom MCP (7 tools, unchanged) + Adobe MCP via devDep (12 tools) + session-level Adobe MCPs (3+, authenticated) |
| Dormant chat participant + unused settings (`mcpConfigTargets`, `externalMcpServers`, `includeBoilerplateSkills`) | None — pruned |
| AI Setup tab: 4 verification rows ("AI Setup" framing) | AI Configuration tab: capability inventory (3 status rollups + 9 skills + 5 MCPs) |
| User experience: unclear what's wired | User experience: "Open in Claude Code" → working storefront in 30 minutes (matches `te-eds-mock`) |
