<!-- Last verified: 2026-07-03 -->
## IMPORTANT: RPTC Workflow

This project uses the RPTC (Research → Plan → TDD → Commit) workflow.

**See `.rptc/CLAUDE.md` for the project-specific RPTC configuration.**

### Where research, plans, and completed work live

`.rptc/` is **fully tracked in git** (only `.rptc/prompt.md` is gitignored). Both Claude Code and Claude Desktop should write working RPTC artifacts to these locations rather than ad-hoc paths.

| Stage | Location | What goes there |
|---|---|---|
| Working research | `.rptc/research/<topic-slug>/research.md` | Exploratory, in-flight research generated during `/rptc:research` or equivalent |
| Working plans | `.rptc/plans/<feature-slug>/overview.md` + `step-NN.md` | Active implementation plans being executed via TDD |
| Completed work | `.rptc/complete/<feature-slug>/` | Plans whose implementation has shipped (move from `.rptc/plans/` when done) |
| Curated research | `docs/research/<date>-<topic>.md` | **Promoted only.** Landmark research cited by ADRs / CHANGELOG. Don't write here directly; promote from `.rptc/research/` once durable. |
| Backlog items | `.rptc/backlog/<slug>.md` or `.rptc/backlog/<feature>/` | Designed/proposed work that isn't active (index: `.rptc/backlog/README.md`) |

**For Claude Desktop sessions:** Desktop can't run RPTC slash commands (no plugin install), but it can — and should — write to the `.rptc/` locations above directly. Don't write research/plan files to ad-hoc locations like `docs/research/` (curated tier — promote-only) or the repo root.

---

# Adobe Demo Builder VS Code Extension

The Adobe Demo Builder is a VS Code extension that streamlines the creation of Adobe Commerce demo projects. It provides a wizard-based interface for setting up complex e-commerce demonstrations with various Adobe technologies integrated (Adobe Commerce / ACO, Edge Delivery Services storefronts, API Mesh, App Builder).

## Technology Stack

- **Extension**: TypeScript, VS Code Extension API
- **UI**: React, Adobe Spectrum
- **Build**: esbuild (`esbuild.config.js`) — NOT webpack
- **Testing**: Jest with ts-jest, @testing-library/react (~574 suites; see `tests/README.md`)

## Development Workflow

1. Install dependencies: `npm install`
2. Watch mode (extension + webviews): `npm run watch:all` — run it in the background while iterating; the user then only reloads the Extension Dev Host window (Cmd+R). F5 is only needed for extension-host restarts.
3. Full build: `npm run compile`
4. Package: `npm run package` (vsce)
5. Quality gate before pushing: the `gate` skill (scoped jest + `tsc --noEmit` + eslint). CI lints the whole repo — a scoped local lint can pass while CI fails.

## Directory Structure

```
demo-builder-vscode/
├── src/                    # Source code (→ src/CLAUDE.md: import rules, path aliases)
│   ├── extension.ts       # Entry point and command registration
│   ├── commands/          # VS Code commands (→ src/commands/CLAUDE.md)
│   ├── core/              # Shared infrastructure (→ src/core/CLAUDE.md)
│   │   # command-execution, communication, logging, state, ui (components/hooks/styles), utils, validation
│   ├── features/          # Feature modules (→ src/features/CLAUDE.md)
│   │   # ai, app-builder, authentication, components, dashboard, eds, lifecycle,
│   │   # mesh, prerequisites, project-creation, projects-dashboard, sidebar, updates
│   ├── mcp-server.ts      # MCP server exposed to Claude (→ docs/systems/mcp-server.md)
│   ├── types/             # TypeScript definitions
│   └── utils/             # Legacy location; only autoUpdater.ts remains
├── docs/                  # Documentation (→ docs/README.md index; ADRs in docs/architecture/adr/)
├── tests/                 # Jest suites mirroring src/ (→ tests/README.md)
├── dist/                  # Compiled output (never edit)
└── media/                 # Static assets
```

Feature config lives per-feature in `src/features/*/config/*.json`.

## Key Files

1. `src/extension.ts` — entry point, command registration
2. `src/features/project-creation/ui/wizard/WizardContainer.tsx` — wizard UI container
3. `src/features/authentication/services/authenticationService.ts` (+ `adobeEntityFetcher.ts`, `ensureOrgContext.ts`) — Adobe auth, Console SDK, org-context handling
4. `src/core/state/stateManager.ts` — project state persistence
5. `src/features/updates/services/updateManager.ts` (+ `componentUpdater.ts`) — GitHub Releases updates with snapshot/rollback
6. `src/features/prerequisites/config/prerequisites.json` — prerequisite definitions
7. `src/features/components/config/components.json` — component registry
8. `src/features/project-creation/config/wizard-steps.json` — canonical wizard step order
9. `src/features/project-creation/config/demo-packages.json` — demo packages (storefront configs, addons, content sources)
10. `src/features/project-creation/config/stacks.json` — stacks (frontend+backend combos, global addon definitions)
11. `src/features/project-creation/config/block-libraries.json` — EDS block library definitions

## Common Tasks

### Modifying Wizard Steps
→ See wizard steps in respective feature directories:
  - `src/features/authentication/ui/steps/` - Adobe auth steps
  - `src/features/components/ui/steps/` - Component selection steps
  - `src/features/prerequisites/ui/steps/` - Prerequisites step
  - `src/features/mesh/ui/steps/` - API Mesh step
  - `src/features/project-creation/ui/steps/` - WelcomeStep (demo package selection); `BuildYourProjectStep` (step id `'build-your-project'`) — the nested builder shell that renders a sub-step rail of **area bodies**: `CommerceStep` (area id `'commerce'`: a restyled `StepTabs` step strip (Backend · [Sign in] · Connection · Business Structure · Catalog) over a dedicated full-width view of the active step's body (one `ConnectStoreStepContent` for config steps), plus a persistent `CommerceSummary`; step/lock logic in `commerceSections.ts`), `StorefrontStep` (area id `'storefront'`, EDS-only: GitHub/DA.live + repo + block libraries), `IntegrationsStep` (area id `'integrations'`); ReviewStep, ProjectCreationStep; plus `buildYourProjectAreas.ts` (visible areas + order/status, reusing `filterStepsForStack`) and `useProjectBuilder.ts` (selection hub holding the mesh dual-flow mirror-write)
  - `src/features/eds/ui/steps/RepoSelectionInline.tsx` - single-column repo choose/create body used by `StorefrontStep`
→ Note: WelcomeStep's brand card selects a demo package; backend/stack + connect, integrations, and storefront (GitHub/DA.live + block libraries) are all configured **within the single `'build-your-project'` step** via its nested Commerce/Storefront/Integrations area rail. The canonical step order lives in `wizard-steps.json` (a single `build-your-project` entry); the area order/visibility lives in `buildYourProjectAreas.ts`. Custom block libraries are configured in VS Code settings and selected via checkboxes (see `demo-packages.json`, `block-libraries.json`, and `src/types/blockLibraries.ts`).

### Adding a New Prerequisite
→ `src/features/prerequisites/config/prerequisites.json` and `docs/systems/prerequisites-system.md`

### Adding New Commands
→ `src/commands/CLAUDE.md`

### Debugging Issues
→ Run "Demo Builder: Diagnostics" command
→ Check "Demo Builder: Debug Logs" output channel
→ `docs/systems/debugging.md`

## Project Skills (`.claude/skills/` — tracked; bodies load on invocation)

- `gate` — inner-loop quality gate (scoped jest + tsc + eslint) · `cut-release` — VSIX beta release
- `adobe-org-context` — canonical IMS org/auth model; use for ANY org guard or org-mismatch work
- `eds-publish-and-config` — Helix/DA.live/Config Service auth+scoping traps · `eds-dropin-vendoring` — dropin delivery / import map / B2B template rules
- `webview-command-handler` — add an extension↔webview message end-to-end · `wizard-step-authoring` — add/modify wizard steps and Build-Your-Project areas

## Gotchas (verified, load-bearing)

- **Adobe Spectrum Flex constrains width** (450px): use a standard HTML div with flex styles for critical wizard layouts.
- **Layout components accept Spectrum design tokens**: `GridLayout`/`TwoColumnLayout` take `DimensionValue` props (`gap="size-300"`). See `docs/development/ui-patterns.md` and `docs/development/styling-guide.md`.
- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes it look hung. Redirect to a file instead (enforced by a PreToolUse hook; details in `tests/README.md`).
- **Webview communication** uses a handshake protocol with message queuing (`src/core/communication/`); async handlers must be awaited or the UI receives Promise objects.

---

For detailed information about specific areas, navigate to the CLAUDE.md file in the relevant directory (they load on demand when you work there).

## RPTC Verification Configuration
verification-agent-mode: automatic
