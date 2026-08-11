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

**Skills are invoked, not transcribed.** A backticked skill name in a plan, doc, or step (e.g. "run `gate`") is an instruction to INVOKE that skill — not a shell command to reproduce from memory. Reproducing the steps by hand silently skips the rules in the skill's body; the 2026-07-30 dream run found a whole feature delivered this way, hand-running a scoped lint and missing `gate` §6's whole-repo lint that CI enforces.

- `gate` — inner-loop quality gate (scoped jest + tsc + eslint) · `cut-release` — VSIX beta release
- `worktree-setup` — create/relocate a worktree correctly + copy the one still-ignored .claude file (settings.local.json — permissions; hooks/skills/settings.json now travel via git) + start the preview loop
- `adobe-org-context` — canonical IMS org/auth model; use for ANY org guard or org-mismatch work
- `eds-publish-and-config` — Helix/DA.live/Config Service auth+scoping traps · `eds-dropin-vendoring` — dropin delivery / import map / B2B template rules
- `webview-command-handler` — add an extension↔webview message end-to-end · `wizard-step-authoring` — add/modify wizard steps and Build-Your-Project areas
- `appbuilder-component-authoring` — App Builder catalog entries + the deploy/subscribe spine (axis-filter semantics, full-union subscription PUT, guard chain, moving test pins)
- `ai-context-authoring` — change the generated AI bundle (skills/AGENTS.md/.mcp.json/ai-defaults) without stranding existing projects: the four gate seams + the AI_CONTEXT_VERSION bump discipline
- `mcp-tool-authoring` — add an in-extension MCP tool (headless-safe handler + descriptor row, no writes-hiding-in-reads, count-pinned tests, mcp-server.md sync)
- `spectrum-webview-ui` — load-bearing Spectrum/webview UI gotchas (dimension-token scale, Menu sections/submenus, Flex-450px, box-sizing, dashboard notices)
- `webview-test-authoring` — write/fix a React/Spectrum webview test: mock preamble, `advanceTimers` contract, hoist-safe `.testUtils` extraction, div-role card queries, mocked-vs-bundled-JSON trap (test-side counterpart to `spectrum-webview-ui`)
- `dream` — out-of-band curation pass over memory/skills/CLAUDE.md: mine transcripts for recurring failures + staleness, propose evidence-backed changes (runs at release cuts; proposes, never applies)
- `codebase-sweep` — dream's sibling for the CODE: runs the four scans together, triages against measured baselines, proposes cleanups (runs at release cuts; proposes, never applies). Duplication is the one defect class with no automatic hook, because deciding whether two things SHOULD be one needs judgment — this is where that judgment gets scheduled.
- `debug-log-triage` — parse a pasted Debug Logs dump: the structured stdout/stderr block above a blank error carries the truth; benign-noise catalog; channel→feature map
- `adobe-docs-lookup` — route an Adobe docs question to the source that has it (App Builder concepts live on developer.adobe.com, which NO doc MCP indexes) + recover from `-32002` / 401 MCP session failures
- `component-extraction-scan` — find UI markup duplicated across ≥3 sites that should be one component (inverse of the SOP God-file scan)
- `code-duplication-scan` — find copy-paste LOGIC duplication (jscpd) that should be one shared function (logic counterpart to component-extraction-scan)
- `dead-code-scan` — find unused exports (ts-prune) + abandonment markers; serves "no soft deprecation"
- `circular-dependency-scan` — find import cycles (madge) and how to break them
- `architecture-duplication-scan` — guided review for competing/parallel implementations (same job solved twice); resolve by deleting one
- `decompose-god-file` — split an oversized multi-responsibility file into single-responsibility units without breaking its public API (the fix to the scan skills' find)

## Verified duplication gets FIXED, not reported

When a scan or hook surfaces duplication, the default is to fix it in the same turn —
not to file it, not to ask. Reporting it back is what made the user the detection
layer for months.

**Two conditions, both required:**

1. **Verified** — you opened BOTH implementations and confirmed they do the same job.
   A name match, a shared class, or a scan hit is NOT verification. The 2026-08-05
   run scored 3 real of 6 on names alone; reading the files was what separated them.
   If they turn out to be variants (different props, different behaviour, one has an
   affordance the other must not), say so and move on — that is a finding too.
2. **In reach** — the duplication is in code this turn already touches, or one import
   away from it. Duplication discovered elsewhere gets mentioned, not chased; that is
   scope creep wearing a tidy hat.

**When both hold, just do it**: use the existing component, run the consumer's tests
unchanged (a behaviour-preserving refactor proves itself by not moving them), and say
what you did. `ServiceGroupList` → `ConfigSection` is the reference — 78 tests, zero
edits to any of them.

**When only the first holds**, state the finding with file:line and the verdict, and
let the user choose. Do not file a backlog item for a two-line fix.

The judgement call is whether two things are the same job — not whether to bother.

## Verifying

**A check whose exit code passes through `head`/`tail`/`wc`/`grep` is not a check.**
Those exit 0 on empty input, so `|| echo "none"` prints "none" whether the command
found nothing or never ran at all. Capture the count into a variable and assert on
it instead.

**Pair every "nothing found" verification with a positive control** — the same
command against something you know is present. Two wrong all-clears on 2026-08-07
were both caught by the control and neither by reading the output: a zsh glob error
made `grep` never run while `0 remaining` printed ten times, and a `grep -c … | head`
reported three skills as lacking coverage they might well have had.

**Quote glob arguments in zsh.** `--include=*.css` is expanded by the shell before
`grep` ever sees it, and the command dies with "no matches found" — printing a zero
that reads exactly like a result. Write `--include='*.css'`. This is the specific
error behind both of the 2026-08-07 all-clears, and it recurred twice on 2026-08-11.

**A control proves the tool works, not that you aimed it right.** Run it at the same
scope as the question — same tree, same shell, same flags — or it inherits the mistake
and passes with you. Before trusting a negative, say where the answer would be if it
existed, then confirm your command actually reads there. Five wrong answers on
2026-08-11 were all a correct command pointed at the wrong place, and no control caught
any of them because each shared the wrong scope:

- grepped `src/features/components/config/`; the catalog is in `project-creation/config/`
  → "that plan is unmerged", wrong
- grepped `.claude/skills/`; the App Builder skills are global in `~/.claude/skills/`
  → "12 of 13 facts are in no skill", wrong
- `${PIPESTATUS[0]}` is bash and this shell is zsh (`$pipestatus`, 1-indexed), so the
  exit code came back **empty** and blank output read as "passed"
- wrote an eslint control to `/tmp`, outside the base path — eslint skipped the file and
  exited 0, proving nothing

**Never publish an identifier you have not read from the source.** Same day, a setting
name written from memory into release notes — `demoBuilder.eds.defaultDaLiveOrg` — was
wrong; the real key is `demoBuilder.daLive.defaultOrg`. Caught only by diffing
`package.json` against the previous tag. Setting keys, env vars, command ids, file paths
and function names are cheap to grep and expensive to get wrong in something users read.

## Gotchas (verified, load-bearing)

- **Adobe Spectrum Flex constrains width** (450px): use a standard HTML div with flex styles for critical wizard layouts.
- **Layout components accept Spectrum design tokens**: `GridLayout`/`TwoColumnLayout` take `DimensionValue` props (`gap="size-300"`). See `docs/development/ui-patterns.md` and `docs/development/styling-guide.md`.
- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes it look hung. Redirect to a file instead (enforced by a PreToolUse hook; details in `tests/README.md`).
- **Webview communication** uses a handshake protocol with message queuing (`src/core/communication/`); async handlers must be awaited or the UI receives Promise objects.

---

For detailed information about specific areas, navigate to the CLAUDE.md file in the relevant directory (they load on demand when you work there).

## RPTC Verification Configuration
verification-agent-mode: automatic
