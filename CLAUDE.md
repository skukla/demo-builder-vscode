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

## What this extension never compromises on

Five properties a change must not break. They are not style preferences and they
are not ranked — a change that trades one away has to be stopped and discussed,
not balanced. Each names where it is already enforced, so it can be checked
rather than believed.

**1. Whatever can be done can be undone.** Reversibility is a design principle
here, not a per-feature nicety: demos get rebuilt, reset and re-run constantly, so
an SC must be able to return to zero and start again. New capabilities ship with
their reversal — create↔delete, deploy↔undeploy, install↔uninstall — or they state
plainly why reversal is impossible. **A thing that cannot be undone is a finding.**
(Owner, 2026-08-28.)

**2. A user's own edits are never overwritten.** The extension writes files into
projects people then edit by hand. Every generated-bundle write goes through the
ADR-013 hash-and-skip seam (`generatedFileWriter.ts`): a file whose content no
longer matches its recorded hash is skipped and reported, never clobbered, and
removal requires positive proof of authorship. A writer that calls `writeFile`
directly has quietly opted out of that.

**3. Existing projects keep working.** Projects live on disk for months across
many extension versions. This is why `AI_CONTEXT_VERSION` exists
and why the activation sweep refreshes stale bundles instead of prompting. A
change that only works for newly created projects is half a change — the
regenerate path and the creation path must produce the same result.

**4. This repository is public.** No secrets, internal URLs, or PII in code,
docs, tests, fixtures, or commit messages. Values that must reach the extension
travel through user-scoped VS Code settings or SecretStorage. Rotation cost is
high and history rewriting is destructive, so the bar is "never enters", not
"removed later". Endpoints that are already public — a deployed App Builder action
URL — are fine.

**5. Cloud operations are real and consequential.** Deploys, teardowns, publishes
and repository creation touch live Adobe, GitHub and DA.live resources belonging
to actual people. They are confirmed before they run, never performed
speculatively to "check" something, and never run unattended.

One more that governs how the above are kept: **nothing is soft-deprecated.** When
a setting, field, code path or schema element becomes obsolete, it is deleted in
the same change that obsoletes it — not left accepted-but-ignored or relabelled
"(Deprecated)". Write "removed", not "deprecated". (Owner, 2026-05-20.)

## The words this repo uses

Say these back in these words. The glossary is here less so you understand the
owner — that part usually works — than so you DESCRIBE things in the same terms
he does, instead of coining a fresh label mid-session and then using it as though
it were shared.

**SC** — a Solution Consultant: the person this extension is for. They build,
reset and re-run customer demos, often several a week. Every "user" in this
codebase is an SC unless it says otherwise. The word appears in 37 files here and
was, before this entry, spelled out in exactly one of them — a test comment.

| Word | Here it means | Not to be confused with |
|---|---|---|
| **catalog entry** | A row in `components.json` — a KIND of thing that can be installed, keyed by id under `frontends`, `backends`, `mesh`, `integrations`, `addons`, `tools`, `services` | a component instance |
| **component instance** | What one project actually HAS. Lives in `componentInstances`, a `Record` keyed by id — never an array. Carries `status`, `port`, `subType` | the catalog entry it was made from |
| **stack** | A frontend+backend combination the SC picks (4 of them, a list in `stacks.json`) | a demo package |
| **demo package** | A brand/scenario bundle — the card on the Welcome step (5 of them, `demo-packages.json`) | a stack, a datapack |
| **datapack** | The unit of sample DATA, owned by the data-installer service. Exported, versioned and published there, not here | a demo package |
| **area** | One of the THREE sub-steps inside the single Build Your Project wizard step — Commerce, Storefront, Integrations. Order lives in `BUILD_AREA_DESCRIPTORS`, which is the list that decides | a wizard step; a step INSIDE an area (Commerce has its own strip, including Datapacks) |
| **surface** | Where a capability is reachable from. The **human surface** is the buttons; the **agent surface** is the MCP tools. Both dispatch into the same handlers, and the gap between them is what the coverage scans measure | a UI screen |
| **Pattern B** | A handler answers by RETURNING its result; `sendMessage` is for progress pushes only. Named in fifteen files and defined in none until 2026-08-30 — if you meet it in a plan or a code comment, this is it | a push channel; there is no "Pattern A" worth knowing |

**you** is the agent reading this and changing this repo. **we** and **the owner**
are Steve, who decides product intent. **the user** is the SC using the shipped
extension — not the person in this conversation.

## Technology Stack

- **Extension**: TypeScript, VS Code Extension API
- **UI**: React, Adobe Spectrum
- **Build**: esbuild (`esbuild.config.js`) — NOT webpack
- **Testing**: Jest with ts-jest, @testing-library/react (see `tests/README.md`)

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
9. `src/features/components/config/demo-packages.json` — demo packages (storefront configs, addons, content sources)
10. `src/features/components/config/stacks.json` — stacks (frontend+backend combos, global addon definitions)
11. `src/features/components/config/block-libraries.json` — EDS block library definitions

## Common Tasks

### Modifying Wizard Steps
→ See wizard steps in respective feature directories:
  - `src/features/authentication/ui/steps/` - Adobe auth steps
  - `src/features/prerequisites/ui/steps/` - Prerequisites step
  - `src/features/project-creation/ui/steps/` - WelcomeStep (demo package selection); `BuildYourProjectStep` (step id `'build-your-project'`) — the nested builder shell that renders a sub-step rail of **area bodies**: `CommerceStep` (area id `'commerce'`: a restyled `StepTabs` step strip (Backend · [Sign in] · Connection · Business Structure · Catalog) over a dedicated full-width view of the active step's body (one `ConnectStoreStepContent` for config steps), plus a persistent `CommerceSummary`; step/lock logic in `commerceSections.ts`), `StorefrontStep` (area id `'storefront'`, EDS-only: GitHub/DA.live + repo + block libraries), `IntegrationsStep` (area id `'integrations'`); `SampleDataStep` — **not an area**: it is a step INSIDE the Commerce strip, shown as "Datapacks" (`commerceSections.ts`), and records which datapack seeds this project — never imports; always complete, so it cannot gate Continue; ReviewStep, ProjectCreationStep; plus `buildYourProjectAreas.ts` (visible areas + order/status, reusing `filterStepsForStack`) and `useProjectBuilder.ts` (selection hub; `selectedAppBuilderComponents` is the single mesh authority — the dual-flow mirror was removed by D3)
  - `src/features/eds/ui/steps/RepoSelectionInline.tsx` - single-column repo choose/create body used by `StorefrontStep`
→ Note: WelcomeStep's brand card selects a demo package; backend/stack + connect, integrations, and storefront (GitHub/DA.live + block libraries) are all configured **within the single `'build-your-project'` step** via its nested Commerce/Storefront/Integrations/Sample Data area rail. The canonical step order lives in `wizard-steps.json` (a single `build-your-project` entry); the area order/visibility lives in `buildYourProjectAreas.ts`. Custom block libraries are configured in VS Code settings and selected via checkboxes (see `demo-packages.json`, `block-libraries.json`, and `src/types/blockLibraries.ts`).

### Adding a New Prerequisite
→ `src/features/prerequisites/config/prerequisites.json` and `docs/systems/prerequisites-system.md`

### Adding New Commands
→ `src/commands/CLAUDE.md`

### Debugging Issues
→ Run "Demo Builder: Diagnostics" command
→ Check "Demo Builder: Debug Logs" output channel
→ `docs/systems/debugging.md`

## The quality instruments — one registry, four cadences

`tests/sop/toolingRegistry.ts` lists every instrument this repo owns and how
often it runs. `tests/sop/tooling-registry.test.ts` fails the build when the
registry and the disk disagree **in either direction** — an unregistered skill is
red, and so is a registry entry for something deleted.

| Cadence | What runs | Who triggers it |
|---|---|---|
| per-tool-call | 10 hook rules in `.claude/hooks/rules/` | automatic |
| per-jest-run | 24 enforcer suites in `tests/sop/` | automatic |
| per-push | lint, both typecheckers, 2 validators | CI |
| periodic | 10 scripted checks + 9 guided reviews | **`npm run sweep`** |

Read a sweep by its labels, not its exit code: a `reported` row always exits 0
and its OUTPUT is the result; a failing `gate` row is a real failure; `COULD NOT
RUN` is a broken instrument rather than a finding. That distinction exists
because the first sweep printed "clean" over a scan that had just measured a 34%
agent-surface gap.

Why it exists: the 2026-08-29 audit found ~50 instruments and no index. Two scans
were in no list at all, `validate:test-guidelines` had been failing unseen on a
bug in its OWN export detector, and `docs:check` called a Python file that no
longer existed —
three failures, one cause. An instrument nothing lists and nothing runs decays
without producing a signal.

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
- `mcp-live-probe` — call the RUNNING MCP server over its socket: which BUILD is serving, a tool's real response and token cost, destructive calls refused by default. The counterpart to `mcp-tool-authoring` — that one says how to write a tool, this one proves it works against reality instead of against its own fixtures
- `spectrum-webview-ui` — load-bearing Spectrum/webview UI gotchas (dimension-token scale, Menu sections/submenus, Flex-450px, box-sizing, dashboard notices)
- `webview-test-authoring` — write/fix a React/Spectrum webview test: mock preamble, `advanceTimers` contract, hoist-safe `.testUtils` extraction, div-role card queries, mocked-vs-bundled-JSON trap (test-side counterpart to `spectrum-webview-ui`)
- `dream` — out-of-band curation pass over memory/skills/CLAUDE.md: mine transcripts for recurring failures + staleness, propose evidence-backed changes (runs at release cuts; proposes, never applies)
- `codebase-sweep` — dream's sibling for the CODE: runs the four scans together, triages against measured baselines, proposes cleanups (runs at release cuts; proposes, never applies). Duplication is the one defect class with no automatic hook, because deciding whether two things SHOULD be one needs judgment — this is where that judgment gets scheduled.
- `debug-log-triage` — parse a pasted Debug Logs dump: the structured stdout/stderr block above a blank error carries the truth; benign-noise catalog; channel→feature map
- `adobe-docs-lookup` — route an Adobe docs question to the source that has it (App Builder concepts live on developer.adobe.com, which NO doc MCP indexes) + recover from `-32002` / 401 MCP session failures
- `component-extraction-scan` — find UI markup duplicated across ≥3 sites that should be one component (inverse of the SOP God-file scan)
- `webview-visual-baseline` — prove a CSS/webview change moved exactly what it meant to: a computed-style fingerprint of every element on all eight surfaces, before and after, compared by exact string equality (not screenshots). The safety net PL-21 is gated on, and the instrument that measured ADR-018
- `reuse-first` — the same question asked BEFORE the duplicate exists: find the house component/hook/pattern that already does the job. Enforced by a PreToolUse rule (`30-reuse-first.rule`), so it fires when you create a file under a `ui/` directory rather than at a release cut
- `ai-coverage-scan` — which extension features an AGENT can actually reach: the gap between the human surface (handler types behind every webview button) and the agent surface (MCP tools), which dispatch into the same handler maps
- `agent-gap-scan` — the same gap read from the other end: what agents ACTUALLY did in real session transcripts — tools nobody calls, jobs done with Bash because no tool existed, tools that failed. No instrumentation; it reads Claude Code's own transcripts
- `test-divergence-scan` — how many DIFFERENT ways the suite builds the same fake. The sibling of the duplication scans aimed at TESTS: not copy-paste, but divergence nobody agreed to (26 StateManager fakes across 48 uses; 32 Project shapes across 38). HandlerContext is its control — 165 suites share a builder and 4 hand-roll, which is what happens when the builder exists
- `code-duplication-scan` — find copy-paste LOGIC duplication (jscpd) that should be one shared function (logic counterpart to component-extraction-scan)
- `dead-mock-scan` — jest.mock calls that do NOTHING. Two halves: a static, exact one (a bare
  automock of a module `moduleNameMapper` already redirects — the line is a no-op) and a scoped
  probe that deletes a mock and re-runs. Exists because the question was asked twice and answered
  the same way: of 28 module-mock walls, 22 needed the mock deleted rather than injected; of the
  shared setup in 11 split-suite families, **79 mocks were dead**. Probe the SET — twice, a mock
  and the line using it were both dead while each kept the other alive
- `dead-code-scan` — find unused exports (ts-prune) + abandonment markers; serves "no soft deprecation"
- `backlog-item` — READ and WRITE the backlog through one CLI (`backlog.mjs`): `list`/`next`/`show` (all take `--json`, the agent-facing form), `new`/`set`/`log` for mutations that validate BEFORE touching disk, `check`, and `sync` to regenerate the README's spans. Carries the frontmatter contract (kind/area/layer/parent/needs/value/status), the five kinds and why a `question` is not an epic. Everything hand-maintained here has rotted: the index (three items invisible for months, a reverted correction, an epic with no file) and then the second, prose copy of the list that survived it and drifted to 25 items against 32. Test any change with `dogfood.sh`, which runs the real content through the real CLI inside a temp copy
- `tool-verdicts` — per-tool verdict on the agent surface (keep/fix/investigate/find-out), from real transcript usage AND battery outcomes together. Exists because "85 tools are unused so nobody needs them" was measured and found unsupportable: 78 of 107 had been judged by nothing at all. Refuses to conclude anything about a tool no prompt has ever asked for
- `rptc-hygiene-scan` — the same idea aimed at the RECORD rather than the code: backlog index rot in BOTH directions, plans that shipped and never moved, and file:line citations pointing at deleted files (runs at release cuts; proposes, never applies)
- `circular-dependency-scan` — find import cycles (madge) and how to break them
- `architecture-duplication-scan` — guided review for competing/parallel implementations (same job solved twice); resolve by deleting one
- `unattended-loop` — the owner-away working mode: pick a backlog item, triage its lane (fully executable / to-a-supervised-edge / research), execute with the proven rails (branch commits, gate-conditional, no cloud writes), report in plain English (the 2026-08-27 standing contract)
- `ai-bundle-coherence` — do real projects' AI bundles match their shape: delivered skill sets vs composition, bundle sources that exist, .mcp.json/package agreement (live half; the static half runs every commit in `tests/templates/ai-bundle-coherence.test.ts`)
- `call-path-audit` — prove a user action has ONE definitive path: trace every door down + every occurrence of the action's ground-truth primitive up, pin the verdict in `tests/templates/spine-chokepoints.test.ts` (runs at release cuts over its own sweep worklist; the mechanical, per-action half of `architecture-duplication-scan`)
- `decompose-god-file` — split an oversized multi-responsibility file into single-responsibility units without breaking its public API (the fix to the scan skills' find)
- `mutation-test-pilot` — the only instrument that measures whether a test would CATCH a defect rather than merely execute the line: Stryker changes the source and re-runs the suite, and a surviving mutant is a defect the suite would ship. Carries both measured numbers and the gap between them — 93% on the four-module pilot, 59% on a representative sample — because the score falls almost monotonically as `await` count rises, so async, heavily-mocked code is the hard case, not the careless one
- `test-strategy-scan` — the census half of the same question: how the suite is BUILT (tier mix, mock density, hollow suites) read across every file at once, where `mutation-test-pilot` measures a few modules empirically. Use the census to pick what to mutate

## The conventions live in one place

**[docs/development/handbook.md](docs/development/handbook.md)** states every convention
this codebase holds itself to — 78 of them, 61 with an enforcer that fails the build — and
explains each one for a human reader. Read it once, start to finish.

Some rules appear both there and here, deliberately: this file is loaded into every agent
session and the handbook is not, so a rule that must steer the work has to be in both. The
pairs are pinned by `tests/sop/claude-md-handbook-agreement.test.ts`, which fails when one
copy is edited away — the duplication is allowed, the silent divergence is not.

## Architecture law — TWO documents, one per runtime

This repo is two programs. **ADR-015 governs the extension host; ADR-017 governs
the webviews.** They split 2026-08-29: ADR-015 had been applied to all 896 files
including 291 browser-bundle ones, in a document that mentions React zero times.
Each has its own enforcer (`tests/sop/architecture-rules.test.ts` and
`tests/sop/webview-architecture-rules.test.ts`) and its own ledger.

**Webview side (ADR-017)**: the composition root is the bundle entry (8 of them);
dependencies arrive as props, not context; the message channel is a RATIFIED
singleton (`acquireVsCodeApi()` is once-per-webview, so there is nothing to
vary); hooks are the service layer; and a feature stylesheet reaches only the
bundles whose entry imports it — a class can be styled on one surface and absent
on the next with no error anywhere.

### ADR-015 (extension host, owner-ratified 2026-08-28)

**Services are fetched only at the boundary** (`extension.ts`, `commands/`,
`handlers/`, MCP tool registrars); everywhere else dependencies arrive as
parameters, constructed only in `extension.ts` or a feature's `create...Deps`
file. Placement rules: `docs/architecture/where-code-goes.md` (the
when-you-want-X table). Enforced by `tests/sop/architecture-rules.test.ts` —
new violations fail the build; exemptions live in its ledger and every one
carries a reason.
Its companion **ADR-016** rules the TEST strategy: three tiers (unit =
handed-in deps + argument assertions; contract = fixtures captured from live
responses; live = journeys/verify-after-write), Jest retained, run-noise to
zero, effectiveness measured by mutation testing.

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

**This rule applies to ANALYSIS work too — an audit is not exempt because its
deliverable is a report.** On 2026-08-21 an audit read all 33 `parseJSON` call
sites, VERIFIED two improvements along the way (the same wizard-steps load ritual
pasted twice in one file; a guard parameter with zero production callers in its
lifetime), and filed both as "notes" — the user had to ask why. The mode you are
in does not change what a verified finding demands: if it is in reach, fix it in
the same turn; if it needs a decision, END THE TURN WITH THE QUESTION ("found X,
verified — fix now or defer?") rather than a sentence that files it away. A
"systemic note" in a report is the reporting-instead-of-fixing failure wearing
its third hat.

## Hit every surface

**The most common defect in this repo is a change that is correct on the path you
tested and missing everywhere else.** Not a logic bug — a completeness bug, and
the reason it keeps shipping is that every check passes: the path you changed
works, and nothing anywhere fails for the paths you did not.

Before calling a change done, walk this list and decide which entries apply. An
entry that does not apply is a one-line statement, not a silence.

**1. Eight webview bundles.** `WEBVIEW_ENTRIES` in `esbuild.config.js`: wizard,
dashboard, configure, sidebar, projectsList, aiOverview, integrations,
dataInstaller. A feature stylesheet reaches only the bundles whose entry imports
it, so a class can be styled on one surface and absent on the next **with no error
anywhere** (ADR-017). Shared UI touched → ask which of the eight render it.

**2. Creation and regeneration must agree.** Anything project creation writes,
"Regenerate AI Files" has to reproduce for a project that gains the qualifying
component later. The two paths are separate call chains; only one of them is
exercised by the flow you are probably testing.

**3. The AI-bundle gate has four seams — change all or none.**
`buildMcpConfig`, `installAiDefaultsMcpTools`, `componentInstallationOrchestrator`
and `handleRegenerateAiFiles` each apply the same predicate. Miss one and creation
and regenerate silently produce different bundles.

**4. Human surface and agent surface.** A capability reached by a button and a
capability reached by an MCP tool dispatch into the same handlers, but adding the
button does not add the tool. If a change gives a person a new action, say whether
an agent gets it too — `ai-coverage-scan` measures that gap and it is real.

**5. A config field lives in three places.** The JSON registry, its schema, and
its TypeScript type. Changing one and not the others typechecks fine and fails at
runtime, or worse, validates against a schema that no longer describes the data.

**6. Changing a contract means auditing its MOCKS, not just its callers.** `tsc`
and the callers keep each other honest; a hand-written mock is invisible to both
and keeps answering in the old shape. The suite stays green while asserting
behaviour that no longer exists.

**7. Docs that state the thing you changed.** Counts, tool lists, and step orders
are pinned by tests in several places precisely because they drift — if a pin
fails, the pin is usually right.

One trap that belongs here because it defeats the whole list: an entry point named
`index.tsx` beside an `index.ts` barrel **is never typechecked**, because tsc keeps
one file per basename. That is why the dashboard entry is `main.tsx`. A surface
that is not typechecked will not tell you it was missed.

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

- grepped `src/features/components/config/`; the catalog was then in `project-creation/config/`
  → "that plan is unmerged", wrong. (The 2026-08-24 catalog move later put it in
  `components/config/` — the lesson is scope-checking, not the path)
- grepped `.claude/skills/`; the App Builder skills were global in `~/.claude/skills/` at
  the time (family deleted 2026-08-23; those facts live in
  `.rptc/research/appbuilder-deployable-model/`) → "12 of 13 facts are in no skill", wrong
- `${PIPESTATUS[0]}` is bash and this shell is zsh (`$pipestatus`, 1-indexed), so the
  exit code came back **empty** and blank output read as "passed" — as are `${!arr[@]}`,
  `declare -A` and `local -n`. Run bash-array snippets through `bash -c` or rewrite them;
  zsh fails these with `bad substitution`, which reads like a quoting typo rather than a
  shell mismatch (`${!NAMES[@]}` cost a mid-experiment retry on 2026-08-11)
- wrote an eslint control to `/tmp`, outside the base path — eslint skipped the file and
  exited 0, proving nothing

**Before proposing a CAUSE, name the command that would falsify it — and run that
first.** Every rule above governs claims about FACTS. A claim about *why* something
happened is different: cheap to state, expensive to retract, and the user cannot check
it. On 2026-08-11 five explanations for one bug were proposed and each was killed by a
single command available before it was offered — fetch the template and scan it, write
one file through the other endpoint, read one field off the account. If no command would
falsify a proposed cause, say it is unfalsifiable from here and name who can test it,
rather than presenting it as the explanation.

**A named field in an API response is a LEAD, not a finding.** The examples above are all
shell-scope mistakes; this shape is different and slipped past the rule twice on 2026-08-16.
`ACCS-REST-API … enabled: false` was read as "this org has no entitlement" — the falsifying
check was reading the same catalog in the *other* org, one command, and it is what made the
claim safe to write down. A `400 … "Unknown Error"` was attributed to an org restriction for
two further tool calls; it was a malformed SDK call, found by reading the caller being
mirrored. A field that looks like an answer is the easiest kind of evidence to over-read.

**Never publish an identifier you have not read from the source.** Same day, a setting
name written from memory into release notes — `demoBuilder.eds.defaultDaLiveOrg` — was
wrong; the real key is `demoBuilder.daLive.defaultOrg`. Caught only by diffing
`package.json` against the previous tag. Setting keys, env vars, command ids, file paths
and function names are cheap to grep and expensive to get wrong in something users read.

**A comment describing what ANOTHER module does is a claim, not documentation.** Nothing
keeps it true — not the compiler, not the tests, not a scan — and it reads to the next
person as verified fact. Before writing one, name the code that makes it true and cite it;
if you cannot, write what you actually verified instead. Before RELYING on one, check it.
On 2026-08-15 two comments in the action repo asserted that the extension "re-registers
[publish keys] on a schedule". No schedule existed. They were false the day they were
written, and they suppressed the question that would have found a shipped bug: reset and
rename destroyed each site's publish key and never re-minted it. Chasing the claim is what
found the defect; believing it is what had already let it ship.

**A cast at a call boundary is a silenced type error.** `as never` / `as any` on an
ARGUMENT tells the compiler to stop checking the one thing it is best at. Four times in
this repo it hid a field the callee dispatches on — `stackBackend`, mapped from
`componentSelections.backend` and never persisted — and each time the result was a silent
no-op in production that every test agreed with: the import handler resolved EVERY real
project to `''` (2026-08-13), then reset never offered sample-data removal to anyone, the
removal could not resolve credentials, and the poller was handed a client with no
`getJobStatus` (all 2026-08-17). If a cast is needed to pass something, the shape is
wrong — build the object the callee declares and let it fail at compile time.

**A mock cannot see a malformed CALL.** All four of those survived because the collaborator
was mocked, and a mock answers the same whatever it is handed, so a caller passing a
wrong-shaped argument is indistinguishable from a correct one. Twelve tests stayed green
across all four. When the thing under test is HOW a collaborator is invoked — a dispatch
field, a scoped id, which client is passed — assert the ARGUMENT, or drive the real
collaborator with `jest.requireActual`. Asserting the outcome tests the mock.

**A shape written where the compiler cannot read it WILL be invented.** This is
not a discipline problem and cannot be fixed by another rule: "never write a
shape you have not read" is already in `mcp-tool-authoring`,
`webview-test-authoring` AND ADR-016 rule 3 — three documents — and on
2026-08-29 five shapes were invented anyway, in one file, in one afternoon. Each
was caught only when a surface visibly crashed: a keyed-object registry passed
where an array was expected, an invented `statusUpdate` payload that emptied two
whole screens, the wrong message envelope (`data` where the client hands over
`payload`), a manifest missing the `path` its loader adds, and a response shaped
`{type:'response', requestId}` when the client matches `isResponse` +
`responseToId` — so no request was answered for hours while everything looked
fine.

Every one of those had an exported type in `src/types/` that would have failed to
compile. The fix is mechanical, not motivational: **put the literal in a
typechecked file and type it to the real interface.** `tsconfig.test.json`
includes `tests/**`, so a shape living in `tests/helpers/` is read by
`npm run typecheck:tests` in CI. `tests/helpers/webviewFixtures.ts` is the
worked example, and both failures above were replayed against it as controls —
tsc rejects each one by name.

The corollary is the checkable part: **an object literal in a `.mjs`, a `.json`,
or a template string has opted out of the only check that works.** If a shape
crosses a boundary — a message, a payload, a fixture, a config — and it is not
in a typed file, that is the smell, whatever the comment above it claims.

**Read before you Edit.** `grep`/`awk`/`sed`/`git show` do not satisfy Edit's precondition —
Read the file, or the range, before editing anything you located with a shell command. The
format-on-edit hook can also invalidate your own read, so when an edit fails on a string you
are sure is present, re-Read rather than re-deriving it from memory.

<!-- Trimmed by the 2026-08-16 dream run. The long form (incident detail, occurrence counts)
     was added 2026-08-15 and the error rate went UP: 71 across 6 of 12 sessions before,
     85 across 6 of 7 in the two days after. The harness already errors on this — those
     occurrences ARE the enforcement — and the failure is loud and self-correcting, so it is
     friction rather than a defect. Prose was not the instrument; do not re-expand it without
     evidence that a longer form works. -->


## Gotchas (verified, load-bearing)

- **A value passed into a hook must be stable across renders.** An inline `[]`, `{}` or
  arrow literal as a prop is a NEW reference every render, so an effect depending on it
  runs every render and one that sets state loops forever. Hoist it to a module-level
  constant (`const EMPTY: never[] = [];`). **No tool catches this** — `exhaustive-deps`
  reads the dependency array inside the hook and cannot see across the prop boundary, and
  the types are identical so the compiler sees nothing either. It has already happened
  here.
- **Adobe Spectrum Flex constrains width** (450px): use a standard HTML div with flex styles for critical wizard layouts.
- **Layout components accept Spectrum design tokens**: `GridLayout`/`TwoColumnLayout` take `DimensionValue` props (`gap="size-300"`). See `.claude/skills/spectrum-webview-ui/` and `docs/development/styling-guide.md`.
- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes it look hung. Redirect to a file instead (enforced by a PreToolUse hook; details in `tests/README.md`).
- **Webview communication** uses a handshake protocol with message queuing (`src/core/communication/`); async handlers must be awaited or the UI receives Promise objects.

---

For detailed information about specific areas, navigate to the CLAUDE.md file in the relevant directory (they load on demand when you work there).

## RPTC Verification Configuration
verification-agent-mode: automatic
