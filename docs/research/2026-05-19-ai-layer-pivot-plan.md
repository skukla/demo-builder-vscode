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

`mcpConfigWriter.ts` stops writing external MCP entries. Generated `.claude/mcp.json` and root `.mcp.json` contain a single `mcpServers` entry: `demo-builder`. The `demoBuilder.ai.externalMcpServers` setting is deprecated (still accepted, ignored). The `.claude/settings.json` PostToolUse git-sync hook stays as-is — that's a Claude Code project-config concern, not an MCP entry.

**Why**: Users get better Adobe MCPs at session level through Claude Code's official catalog. Our project-level entries duplicate or conflict.

**Backward compatibility**: Existing projects keep their `.claude/mcp.json` until regenerated. The Regenerate AI Files action in the AI Configuration tab rewrites them to the new shape.

### 2. Adobe Commerce Skills + MCP via npm devDependency

EDS projects gain `@adobe-commerce/commerce-extensibility-tools` (latest stable, currently v3.4.0) as a devDependency. The package ships:

- An MCP server (referenced via `node_modules/@adobe-commerce/commerce-extensibility-tools/index.js`)
- Six skill agents in `.claude/skills/` (block-developer, dropin-developer, content-modeler, project-manager, researcher, tester)
- Per-tool rules in `node_modules/.../rules/{Claude,Copilot,Cursor,Gemini}/`

Installation flow:
1. `package.json` mutation during project finalization adds the devDep to the storefront repo's `package.json`
2. `npm install` runs (already part of project creation)
3. Adobe's onboarding command (`npx commerce-extensibility-tools onboard --tool=claude` or equivalent — research spike confirms the exact CLI) copies skills into `.claude/skills/`
4. `mcpConfigWriter.ts` adds a second entry to `.claude/mcp.json`:
   ```json
   "commerce-extensibility": {
     "command": "node",
     "args": ["node_modules/@adobe-commerce/commerce-extensibility-tools/index.js"]
   }
   ```

**Headless/non-EDS projects** skip this step — Adobe's skills are EDS-storefront-specific.

### 3. AGENTS.md as Universal Context

`aiContextWriter.ts` generates `AGENTS.md` instead of `.claude/CLAUDE.md`. The content mirrors today's eight sections (header, endpoints, storefront info, block libraries, Adobe I/O project, example prompts, notes for AI agents). A one-line `CLAUDE.md` at the project root reads `see @AGENTS.md`. This matches Adobe's pattern in `te-eds-mock` and works across Claude/Copilot/Cursor/Gemini without per-tool divergence.

The `demoBuilder.ai.mcpConfigTargets` setting is deprecated. Cursor and Codex pick up `AGENTS.md` and `.mcp.json` natively — no per-tool config writes needed.

### 4. AI Configuration Tab (Repurposed + Expanded)

The Configure screen's "AI Setup" tab is renamed **AI Configuration** and gains four sections on a single page:

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Configuration                                                │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Status                                                          │
│  ● Demo Builder MCP                          Ready · 7 tools     │
│  ● Adobe Commerce Extensibility Tools        Ready · 12 tools    │
│  ● Session-level Adobe MCPs                  3 detected          │
│                                                                  │
│  [Regenerate Files]  [Open in Claude Code]                       │
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
- **Quick Actions** — two buttons. **Regenerate Files** stays — it's the action that brings older projects up to the new shape (slim `.claude/mcp.json`, Adobe's skills installed, `AGENTS.md` written). **Open in Claude Code** is present here as a convenience for users who land in this tab, but its **primary placement is the dashboard ActionGrid tile** (see Section 5). The current "Verify Now" button is dropped — Status auto-refreshes on mount, and re-mounting the tab gives the same effect with less UI.
- **Skills Installed** — collapsible groups. Each skill row reads frontmatter from the `SKILL.md` or `*.md` file: `name`, `description`. Source badge is computed from path (Adobe skills come from `.claude/skills/{block-developer,dropin-developer,...}` per Adobe's onboarding; Demo Builder skills are detected by name). Clicking a row expands inline to show the skill content.
- **MCP Servers** — two groups. Project group lists each entry from `.claude/mcp.json` with state label and tool count. Each project-level row is **expandable** (same affordance as Skills): clicking reveals the tool inventory — tool name in monospace plus the first line of the MCP-reported `description`, one tool per row, truncated with ellipsis if the description runs long. **Hover (or keyboard focus) on a truncated description reveals the full text via Spectrum `Tooltip`** — relieves the truncation pain for long descriptions without replacing the primary expand affordance. Tooltips fire only on truncated rows, so short descriptions stay quiet. Session group lists detected `mcp__claude_ai_*` MCPs from Claude Code's session-level config; these rows are **not expandable** in v1 because the extension can't introspect session-level MCPs (they're managed by Claude Code, not by us — we'd need to spawn `claude` to call their `tools/list`). State labels match the Status section: `Ready` (responds to handshake), `Authenticated` (session-level), `Needs auth`, `Failed`. No search across tools — at v1 scale (~3 MCPs, ~30 tools) the inventory fits on one screen when expanded.

**Data sources:**
- `verify-ai-setup` handler is extended to return: skills list (name, description, source, path), MCP list (name, type, tool count, status), session MCP list (name, authenticated boolean)
- A new `inspect-mcp` handler runs lightweight MCP introspection per project-level server (spawns the configured command, calls `tools/list`, kills the process) — cached for the session

### 5. "Open in Claude Code" — Dashboard-First Action

**Primary placement: ActionGrid tile on the per-project dashboard.** This is the daily-use action — users will click it every time they want to work on a project with AI assistance. It needs to live one click from the project view, not buried in a configuration tab.

**Secondary placement: button in the AI Configuration tab's Quick Actions row.** A convenience for users who happen to be in that tab. Same handler, same behavior — just discoverable from a second surface.

Clicking either:

1. Verifies the `claude` CLI is on PATH (`which claude`) — if not, shows a one-shot install hint
2. Opens an integrated VS Code terminal at the project root (`storefront/` for EDS projects, project root otherwise)
3. Runs `claude` in that terminal

This is the harness — it puts the user one click away from the experience their `te-eds-mock` example demonstrates. No re-implementation of MCP discovery, no chat-participant work.

### 6. Chat Participant Code Removal

Delete `src/features/ai/vscodeChatParticipant.ts`, update `src/features/ai/index.ts` to drop the `registerChatParticipant` export and `ProjectResolver` type, update `src/features/ai/README.md` to remove the "Phase 2" section. No `package.json` `contributes.chatParticipants` entry was ever added, so nothing to remove there.

The `aiSetupVerifier.ts` stays — it's used by the AI Configuration tab.

### 7. Skill Templates — Trimmed to Demo-Builder-Specific

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
| Adobe Commerce devDep install + onboarding | New integration with `@adobe-commerce/commerce-extensibility-tools` | Existing `projectFinalizationService.ts` phase pattern (Phase 6 is already `generateAIContextFiles` — onboarding becomes Phase 7 or a sub-step of 6); existing `ExternalCommandManager` for the `npx commerce-extensibility-tools onboard` shell call; existing `package.json` mutation pattern from project creation |
| `regenerate-ai-files` cleanup helper | Existing handler doesn't currently delete obsolete files | Extends existing `handleRegenerateAiFiles` in `configureHandlers.ts:104`; uses `fs/promises.rm` like the existing snapshot/rollback code in `componentUpdater.ts` |
| `demoBuilder.openInClaude` command | Trivial wrapper around terminal creation | `BaseCommand.createTerminal(name, cwd)` (existing); `which claude` precheck via existing `ExternalCommandManager`; pattern matches `startDemo.ts:292-296` |
| `AiConfigurationTab.tsx` component | New file — composed view | `StatusCard`, `ConfigSection`, `ChevronDown`/`ChevronRight`, Spectrum `Tooltip`, `useSetToggle`, `useAsyncOperation`, `webviewClient.request` — **zero new UI primitives**; collapsible row pattern inlined from `NavigationPanel.tsx:81-115` |
| ADR-004 (harness decision) | New documentation | Follows existing ADR template at `docs/architecture/adr/003-multisite-architecture-seam.md` |

**Net effect**: eight new artifacts, every one of them assembled from existing primitives. No new UI components, no new dependencies, no new infrastructure patterns. Implementers should never need to write something they could have imported.

### Rules of thumb for implementation

1. **New components are allowed for genuinely new functionality — but every new component must compose from existing primitives wherever possible.** The "Built from" column in the table above is a reuse contract, not a suggestion. Before writing anything new, check whether what you need exists.
2. **Don't extract a shared component until it has a second consumer.** The collapsible row pattern is the only obvious candidate, and it appears only inside `AiConfigurationTab.tsx`. Inline it from `NavigationPanel.tsx:81-115`.
3. **`StatusCard` covers every status row in this tab.** Don't build a parallel "AICapabilityCard" or similar. The color variants (`green` / `yellow` / `red` / `gray`) map cleanly to Ready / Needs attention / Failed / Not installed.
4. **Reuse `useDashboardActions` for `handleOpenInClaude`.** Don't create a separate AI-only hook.
5. **`yaml` is already installed.** No frontmatter library needed.
6. **Shell commands use `ExternalCommandManager`.** Don't reach for `child_process.exec` directly — the existing manager handles queuing, exclusivity, timeouts, and error formatting.

---

## UX Touchpoints

Every surface touched by the pivot.

### 1. Project Creation

| What changes | Type | Key file |
|---|---|---|
| `mcpConfigWriter.ts` writes only `demo-builder` to project MCP configs | Trim existing | `src/features/project-creation/services/mcpConfigWriter.ts` |
| For EDS projects: add `@adobe-commerce/commerce-extensibility-tools` to `package.json` devDeps before `npm install` | New step | `src/features/project-creation/services/projectFinalizationService.ts` |
| For EDS projects: run Adobe's onboarding command to install skills into `.claude/skills/` | New step | New helper in `aiContextWriter.ts` or `skillsWriter.ts` |
| For EDS projects: add `commerce-extensibility` entry to `.claude/mcp.json` after install completes | New step | `mcpConfigWriter.ts` |
| `aiContextWriter.ts` writes `AGENTS.md` instead of `.claude/CLAUDE.md`; `.claude/CLAUDE.md` becomes a one-line pointer (and root `CLAUDE.md` does the same) | Rewrite content | `src/features/project-creation/services/aiContextWriter.ts` |
| `skillsWriter.ts` ships only 3 templates; drops conditional logic | Trim existing | `src/features/project-creation/services/skillsWriter.ts` |
| `package.json` contributes section removes `mcpConfigTargets`, `externalMcpServers`, `includeBoilerplateSkills` settings | Remove settings | `package.json` |

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
| "Open in Claude Code" button in Quick Actions row (secondary placement — primary is dashboard ActionGrid) | New action | `AiConfigurationTab.tsx` |

### 3. Per-Project Dashboard

| What changes | Type | Key file |
|---|---|---|
| ActionGrid gains "Open in Claude Code" tile — **primary placement for the daily-use action** | Add tile | `src/features/dashboard/ui/hooks/useDashboardActions.ts` |
| New `demoBuilder.openInClaude` command: detect `claude` CLI on PATH, open terminal at project root, run `claude` | New command | `src/commands/` (new file) + `extension.ts` registration |

### 4. AI Feature Module

| What changes | Type | Key file |
|---|---|---|
| Delete `vscodeChatParticipant.ts` | Remove file | `src/features/ai/vscodeChatParticipant.ts` |
| Update `index.ts` to drop chat participant exports | Trim | `src/features/ai/index.ts` |
| Update `README.md` to remove Phase 2 references; document the Claude Code (CLI) harness | Rewrite | `src/features/ai/README.md` |
| `aiSetupVerifier.ts` gains skill enumeration and MCP introspection helpers used by the tab | Extend | `src/features/ai/aiSetupVerifier.ts` |

### 5. Regeneration (Existing Projects)

| What changes | Type | Key file |
|---|---|---|
| `regenerate-ai-files` handler runs the new flow: slim MCP config, add Adobe devDep + skills, write AGENTS.md, trim Demo-Builder skills | Extend existing | `configureHandlers.ts::handleRegenerateAiFiles` |
| Cleans up obsolete files: old `.claude/CLAUDE.md`, dropped skill templates, `.cursor/mcp.json`, `.codex/mcp.json` | New cleanup step | New helper in `projectFinalizationService.ts` |

### 6. Documentation

| What changes | Type | Key file |
|---|---|---|
| Update `README.md` to describe the Claude Code (CLI) harness and what's installed | Rewrite section | Root `README.md` |
| Update `src/features/ai/README.md` to reflect the post-pivot architecture | Rewrite | `src/features/ai/README.md` |
| New ADR documenting the harness decision and Adobe-ecosystem alignment | New file | `docs/architecture/adr/004-claude-code-harness.md` |

---

## Implementation Steps

| Step | What | Effort | Cycle |
|---|---|---|---|
| 1 | Slim `mcpConfigWriter.ts` to write only `demo-builder` to project MCP configs; deprecate `externalMcpServers` and `mcpConfigTargets` settings | Small | A |
| 2 | Switch `aiContextWriter.ts` to emit `AGENTS.md` plus one-line `CLAUDE.md` pointer | Small | A |
| 3 | Trim `skillsWriter.ts` to three Demo-Builder-specific templates; remove conditional/interpolation paths | Small | A |
| 4 | Delete `vscodeChatParticipant.ts`; update `src/features/ai/index.ts` and README | Tiny | A |
| 5 | ~~Research spike: confirm Adobe's onboarding CLI command~~ ✅ DONE (2026-05-19) — no CLI exists; installation is a `cp -r` from `node_modules/.../dist/aem-boilerplate-commerce/skills/`. See Open Questions #1 for the full install flow. | Small | A |
| 6 | Add `@adobe-commerce/commerce-extensibility-tools` to EDS storefront `package.json` devDeps during project finalization; recursively copy `node_modules/.../dist/aem-boilerplate-commerce/skills/` to `<projectPath>/.claude/skills/` after `npm install` (see Open Questions #1 for the resolved install flow, risks, and per-stack bundle decision) | Medium | B |
| 7 | Add `commerce-extensibility` MCP entry to `.claude/mcp.json` for EDS projects | Small | B |
| 8 | `regenerate-ai-files` cleanup pass: remove obsolete files from existing projects on regeneration | Small | B |
| 9 | New `skillInspector` service: parse frontmatter from `.claude/skills/**/*.md` using existing `yaml` package, classify Adobe vs Demo Builder by path, return name/description/path | Small | C |
| 10 | New `mcpInspector` service: read `.claude/mcp.json`, run `tools/list` per server with timeout + cache, return per-server status plus per-tool `{ name, description }` | Medium | C |
| 11 | Session-level MCP detection: parse user-level Claude Code MCP config, list `mcp__claude_ai_*` entries with auth state | Medium | C |
| 12 | Extend `verify-ai-setup` handler payload with skills + MCP inventory; new `inspect-mcp` handler for on-demand introspection — both added to existing `configureHandlers` map | Small | C |
| 13 | Create `AiConfigurationTab.tsx` (replaces `AiSetupTab.tsx`); compose from existing `StatusCard` for the three rollup rows, `ConfigSection` for each section container, `ChevronDown`/`ChevronRight` + `useSetToggle` for collapsible rows (inline pattern from `NavigationPanel.tsx:81-115` — do not extract until a second consumer appears), Spectrum `Tooltip` for truncated description hover, `useAsyncOperation` for inspection calls; four current file-and-parse verifications become drill-down detail under the Demo Builder MCP row; drop standalone "Verify Now" button | Large | D |
| 14 | "Open in Claude Code" command: thin wrapper around `BaseCommand.createTerminal` using the same pattern as `startDemo.ts:292-296` — `which claude` precheck, create terminal at project root, `sendText('claude')` | Small | D |
| 15 | Add `handleOpenInClaude` to existing `useDashboardActions` hook; add one `ActionButton` tile to existing `ActionGrid` component (primary placement) and a secondary button in the AI Configuration tab's Quick Actions row — no new files for either | Small | D |
| 16 | Documentation: update root `README.md`, write ADR-004 (Claude Code harness decision), update `src/features/ai/README.md` | Small | D |

**`/rptc:feat` grouping:**

- **Cycle A** — Steps 1–5: trim writers, drop chat participant, research spike. Each generated project ships fewer files; existing projects unaffected until regenerated.
- **Cycle B** — Steps 6–8: install Adobe's MCP + skills via devDep, run onboarding, handle regeneration cleanup. EDS projects gain Adobe's full skill agent set.
- **Cycle C** — Steps 9–12: skill and MCP inspection services + handler extensions. Backend data ready for the new tab.
- **Cycle D** — Steps 13–16: AI Configuration tab UI, Open in Claude Code action, documentation. User-visible surface lands.

---

## Open Questions

1. ~~**Adobe onboarding command — exact CLI invocation.**~~ ✅ RESOLVED (Cycle A.5, 2026-05-19).

   **Finding**: There is no onboarding CLI for installing skills into `.claude/skills/`. The package ships skills as static files inside `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/`, grouped by project type. The README's only install guidance is a manual `cp -r` step.

   **Recommended Cycle B install flow** (file copy, no CLI):
   1. Add `"@adobe-commerce/commerce-extensibility-tools": "^3.4.0"` to the storefront repo's `package.json` devDependencies
   2. Run `npm install` (already part of project creation)
   3. Recursively copy `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/aem-boilerplate-commerce/skills/` → `<projectPath>/.claude/skills/` (for EDS storefront projects)
   4. Add the MCP server entry alongside `demo-builder` in `.claude/mcp.json` and root `.mcp.json`:
      ```json
      "commerce-extensibility": {
        "command": "node",
        "args": ["node_modules/@adobe-commerce/commerce-extensibility-tools/index.js"]
      }
      ```

   **Skill bundles available** (per project type, in `dist/`):
   - `aem-boilerplate-commerce/skills/` — 6 skills: block-developer, content-modeler, dropin-developer, project-manager, researcher, tester (EDS storefront projects)
   - `integration-starter-kit/skills/` — 7 skills for App Builder backend integrations (architect, developer, devops-engineer, product-manager, tester, technical-writer, tutor)
   - `checkout-starter-kit/skills/` — skills for Checkout Starter Kit (not yet enumerated)

   **Risks**:
   - The README is out of date — recommends `git clone` instead of `npm install`. Both work; npm install is the cleaner path.
   - Pinning `^3.4.0` allows minor + patch updates. Adobe may change skills between versions — if behavioral drift becomes a concern, pin to exact (`3.4.0`) and bump deliberately.
   - The `aem-boilerplate-commerce` skill bundle assumes the project uses AEM Boilerplate Commerce. For non-EDS Demo Builder projects (headless), the integration-starter-kit bundle may be relevant but addresses a different scope (backend webhooks rather than storefront features).

   **Decision needed at Cycle B Step 6**: which skill bundle ships per stack type. Likely: EDS storefront projects get `aem-boilerplate-commerce/skills/`, headless projects get nothing additional (Demo Builder's three lifecycle skills only).

2. **Adobe Commerce package — pinning strategy.** Pin to a specific minor version (`^3.4.0`)? Track latest? The skill agents may change between versions — pinning protects users from surprise behavior changes but introduces a Demo Builder version bump for every Adobe release.

3. **Session-level MCP detection — read access.** Where does Claude Code store its user-level MCP catalog config? Need to verify the path (likely `~/.claude/settings.json` or a subdirectory) and that we can read it without invoking the Claude Code CLI itself.

4. **Multi-tool support beyond Claude.** Adobe's MCP ships rules for Copilot, Cursor, and Gemini in `node_modules/.../rules/`. Do we copy those into the project root automatically (Adobe's onboarding may do this), or leave it to the user?

5. **Headless/non-EDS projects.** Adobe's Commerce skills are EDS-specific. For headless projects, what AI guidance ships? Options: (a) nothing — only `demo-builder` MCP and the three Demo-Builder skills, (b) a minimal Adobe headless-commerce skill set if one exists. Default to (a) unless research surfaces a Headless equivalent.

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
