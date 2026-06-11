# Research: Prerequisites architecture reframe (Path A — two-tier)

**Date:** 2026-06-11
**Type:** Codebase (Mode A)
**Context file:** `.rptc/backlog/2026-06-11-prereqs-architecture-reframe.md`
**Status:** Research complete — awaiting owner approval before `/rptc:plan`.
**Direction:** Path A (reframe to two tiers) is **locked**. This note documents the *how*, not the *whether*. It does not propose the plan.

---

## Summary

The reframe is more feasible than it looks, for one reason the audit surfaced: **the two-tier split already half-exists in the code, just in the wrong place.** Per-project version requirements (the "project-shape" tier) are already sourced from `components.json` via `ComponentRegistryManager`, not from `prerequisites.json`. The `prerequisites.json` file already holds what are effectively extension-wide tool installs. The `componentRequirements` filtering that would make `prerequisites.json` "project-aware" is **inert today** — every prerequisite is non-optional, so the live wizard path checks all of them unconditionally.

Three facts shape everything downstream: (1) the install pipeline cleanly separates into a pure builder, a reusable core progress engine, and a wizard-bound handler; (2) the `prerequisites.schema.json` file has drifted badly from both the TypeScript types and the live data, so any migration must treat the schema as untrusted; (3) the codebase already has every UX primitive a global "Extension Setup" surface would need, plus a backend that already serves an unfiltered prerequisite list when no stack is supplied.

---

## 1. Existing prerequisites system — shape and coupling

### 1.1 The data: 5 prerequisites, all non-optional

`src/features/prerequisites/config/prerequisites.json` defines five entries: `homebrew`, `fnm`, `node`, `aio-cli` (with an `api-mesh` plugin), `git`. **All five are `optional: false`.** A `componentRequirements` map at the bottom associates component ids (`headless-commerce-mesh`, `eds-commerce-mesh`, `eds-accs-mesh`, `headless`, `integration-service`) with prerequisite/plugin ids.

### 1.2 Schema drift — three competing definitions (migration hazard)

There are three drifting sources of truth. **Trust order: `types.ts` + `prerequisites.json` + handler code are authoritative; `prerequisites.schema.json` is stale.**

| Field | schema.json | types.ts | prerequisites.json | code reads it? |
|---|---|---|---|---|
| `perNodeVersion` | ❌ absent | ✅ | ✅ (aio-cli) | ✅ heavily |
| prereq-level `requiredFor` | ❌ (only on plugin) | ✅ | ❌ (only on plugin) | ✅ |
| `multiVersion` | ✅ | ✅ | ✅ (node) | ❌ vestigial |
| `versionCheck` | ✅ | ✅ | ✅ (node) | ❌ vestigial |
| `groups` | ✅ | ❌ | ❌ | ❌ dead |
| `componentRequirements.nodeVersions` | ✅ | ❌ | ❌ | ❌ dead |
| `componentRequirements.plugins` | ✅ | ✅ | ✅ | ❌ not read |
| `install.steps` | ❌ (describes old format) | ✅ | ✅ | ✅ |
| `install.dynamic` | ✅ (different shape) | ✅ | ✅ (node) | ✅ |

The schema's `installConfig` (`oneOf` of `commandSet`/`platformSpecificInstall`/`dynamicInstall`) describes an **older install format the JSON no longer uses**. Migration cannot lean on the schema; it should be rewritten from `types.ts` + live data.

**Authoritative `PrerequisiteDefinition` fields** (`services/types.ts:76-99`): `id`, `name`, `description`, `optional`, `depends[]`, `perNodeVersion`, `requiredFor[]`, `check`, `install`, `uninstall`, `postInstall`, `multiVersion` (vestigial), `versionCheck` (vestigial), `plugins[]`. The runnable install unit is `InstallStep` (`types.ts:26-36`): `name`, `message`, `commands[]` / `commandTemplate`, `estimatedDuration`, `progressStrategy` (`exact|milestones|synthetic|immediate`), `milestones[]`, `progressParser`, `continueOnError`. Commands can carry the magic token `configureFnmShell`, special-cased in `ProgressUnifier.ts:478`.

### 1.3 The filtering logic — two paths, the live one ignores `componentRequirements`

**Path A — `PrerequisitesManager.getRequiredPrerequisites()` (`PrerequisitesManager.ts:85-120`):** the documented filter. It reads only `componentRequirements[id].prerequisites` (ignores `plugins`/`nodeVersions`), then returns `required.has(p.id) || !p.optional`. Because **all five prereqs are non-optional, this returns all five regardless of component selection** — `componentRequirements` has zero effect today. Called only by `createProject.ts` (legacy) and tests; **not** invoked by the live webview path.

**Path B — the live wizard path (`checkHandler.ts` → `initializePrerequisiteCheck`, `:260-299`):** does **not** call `getRequiredPrerequisites` and **does not consult `componentRequirements` at all.** It loads all prereqs, topo-sorts them (`resolveDependencies`), and checks every one. The component selection drives only **which Node major versions** are required — and that data comes from `components.json` `configuration.nodeVersion` via `ComponentRegistryManager` (`shared.ts:266-368`), not from `prerequisites.json`.

> **Migration crux:** "which prereqs apply to a project" is currently a no-op. The genuinely project-driven concern is **which Node versions** are needed, and that already lives in `components.json`. The two-tier model the reframe wants is, in data terms, already split — `prerequisites.json` = extension-wide tools, `components.json` = per-project version requirements. The reframe largely formalizes a separation that exists implicitly.

### 1.4 Install runner — cleanly decomposable

| Layer | File | Coupling |
|---|---|---|
| **Builder** `getInstallSteps()` | `installation/InstallStepBuilder.ts:48-88` | **Pure.** Input: definition + `{nodeVersions?, preferredMethod?}`. Output: `{steps, manual?, url?} | null`. No VS Code, no wizard. Unit-testable in isolation. |
| **Progress engine** `ProgressUnifier` | `@/core/utils/progressUnifier` | **Reusable.** Owns command execution + fnm wrapping; needs only an `onProgress` callback + `InstallStep`. Lives in core. |
| **Runner** `handleInstallPrerequisite` | `handlers/installHandler.ts:484-598` | **Wizard-bound.** Input `prereqId` is a *numeric index* into `sharedState.currentPrerequisiteStates` (requires a prior check run). Emits webview messages, reads component selection from `sharedState`. Not standalone-invocable without work. |

This matches the conclusion the Claude CLI plan independently reached (`claude-cli-detection-and-install/overview.md:120-128`): **borrow the install runner's reusable parts** (builder + ProgressUnifier), do not reuse the wizard-bound handler wholesale, and do not add new tools as `prerequisites.json` entries that pile onto every wizard run.

### 1.5 Caching, versioning, dependency resolution — reusable in isolation

- **Cache** (`prerequisitesCacheManager.ts`): in-memory `Map`, TTL+jitter, LRU eviction, per-node-version keys (`id##nodeVersion`). Zero wizard/VS Code dependency.
- **Versioning** (`versioning/*`): fnm parsing, semver satisfaction, topo-sort (`DependencyResolver`), multi-version detection. Pure.
- **Multi-Node coordination**: detection primitives are reusable; the *mapping source* depends on `ComponentRegistryManager` + `components.json`, and the *which-versions* decisions live in the handlers reading `sharedState`. This is the most wizard-entangled capability and the one most clearly belonging to the project tier.

### 1.6 Coupling surface — every external importer

Non-test `src/` importers of the prerequisites feature (the full blast radius of any interface change):

1. `project-creation/commands/createProject.ts` — **only `src/` instantiation site** (`:128`); injects `PrerequisitesManager` into `HandlerContext`.
2. `project-creation/handlers/ProjectCreationHandlerRegistry.ts:15,39-41` — wires the 3 handlers into the wizard message map.
3. `project-creation/ui/wizard/WizardContainer.tsx:45,304-305` — renders `PrerequisitesStep` as the `'prerequisites'` step.
4. `src/types/handlers.ts:18-21,84-86,142-143,176` — defines `SharedState.currentPrerequisites/currentPrerequisiteStates` and `HandlerContext.prereqManager`. **The structural contract coupling the feature to the whole handler system.**
5. `src/commands/handlers/HandlerContext.ts:12,22-24` — re-exports prereq types.
6. `core/utils/progressUnifier/ProgressUnifier.ts:23` — type-only reverse dependency (`InstallStep` leaks core→feature).

**Reverse coupling:** the feature already reaches into `project-creation/config/stacks.json` (`checkHandler.ts:14`) and dynamically imports `components/services/ComponentRegistryManager` (`shared.ts`). So the prerequisites feature already depends cross-feature on the very data the project tier needs.

---

## 2. Where extension-wide tools should surface — three candidate surfaces

The reframe needs a global surface (reachable without a project / without the wizard) for extension-wide tools. The codebase supports all three candidates; each has a real trade-off grounded in how the code works today.

| Surface | VS Code API | In-repo pattern to copy | Persistence | Discoverability | Notes |
|---|---|---|---|---|---|
| **Activation prompt** | `showInformationMessage(msg, ...actions)` + `globalState` / `oneTimeTip` | `errorLogger.ts:79-88` (msg+action); `extension.ts:340-342` (ask-once consent) | Needs a `globalState` flag or it re-fires on **every reactivation** (activation runs on every project switch / workspace reload) | High at first run, **zero afterward** | The codebase **deliberately removed** auto-show-Welcome at activation (`extension.ts:274-277`, "sidebar now serves as the main navigation hub"). A new activation interrupt cuts against that decision. |
| **Sidebar entry** | `WebviewViewProvider` (already registered, view id `demoBuilder.sidebar`) + new button → message → handler | every `UtilityBar`/`AiZone` button → `sidebarProvider.ts:228-289` switch → `executeCommand(...)` | **Standing** surface, `retainContextWhenHidden: true` | **Highest** — always present when the activity-bar icon is selected; never dismisses away | The sidebar already hosts globally-scoped actions (AI, Tools, Help, Settings — all extension-level). "Extension Setup" fits its existing semantics. It is a **webview** (React button + message round-trip), not a declarative `package.json` TreeView item. |
| **Status bar item** | `createStatusBarItem(Left, 100)` | `errorLogger.ts:21-25` — the **only** status bar item in the codebase | Window-persistent | **Low** for setup — the existing item is hidden until there are errors | Reusing this means inventing a new always-visible convention; the one existing item follows show-on-signal/hide-on-clear, the opposite pattern. |

**Activation today (`extension.ts:95` `activate()`):** no first-run onboarding prompt exists. The only activation-time `window.*` calls are the workspace-trust warning (`:232-237`) and the activation-failure error (`:371-373`), neither with actions. A consent-gated ask-once pattern exists but fires *after first project creation*, not at activation (`:340-342`). Persistence primitives ready for "show once": `globalState` (used throughout) and `src/core/utils/oneTimeTip.ts`.

These are presented as trade-offs only. **The surface choice is a plan-cycle decision** (and the surfaces are not mutually exclusive — e.g. a standing sidebar entry plus a one-time first-run nudge).

---

## 3. Migration mechanics for `prerequisites.json`

Observations the plan will need; no decision made here.

**a. The schema must be rewritten, not extended.** `prerequisites.schema.json` is the least reliable artifact (§1.2). Any migration that adds a `scope` field should regenerate the schema from `types.ts` + live data and drop the dead fields (`groups`, `componentRequirements.nodeVersions`, `multiVersion`, `versionCheck`). Per project memory `feedback_no_soft_deprecation`, vestigial fields should be deleted outright, not left as ignored stubs.

**b. A `scope` field is one option; the data may not even need it.** Because the project-tier data already lives in `components.json` (§1.3), the reframe could express the two tiers structurally (what stays in `prerequisites.json` is *by definition* the extension-wide tier) rather than by tagging each entry. Whether to add an explicit `scope: "extension" | "project"` discriminator vs. rely on file-level separation is a design choice for the plan.

**c. The one genuine straddler is Node.** `node` is an extension-wide tool (fnm-managed runtime) whose *versions* are project-shape (driven by `components.json`). Any model must let the tool live in the extension tier while its version requirements resolve per-project. The current code already does exactly this split — `node` is in `prerequisites.json`; its required majors come from `ComponentRegistryManager`. `aio-cli` + the `api-mesh` plugin are similar: extension-wide tools whose install is component-conditional (`perNodeVersion` + plugin `requiredFor`).

**d. `componentRequirements` is removable or repurposable.** It is read by only the inert Path A. The plan can delete it, or repurpose it as the explicit Tier-2 "this feature needs this tool" map (see §5). Either way it currently carries no live behavior to preserve.

**e. Backward-compat for the wizard step is a real decision.** `PrerequisitesStep` is consumed at `WizardContainer.tsx:304-305` and backed by handlers registered in `ProjectCreationHandlerRegistry`. The backend already degrades gracefully: `initializePrerequisiteCheck` skips its stack branch and **loads the full prereq list when `selectedStack` is omitted** (`checkHandler.ts:271,295-297`). So the same backend can serve both a standalone extension-setup panel (no stack) and the wizard (with stack) without forking. Whether the wizard step stays, gets gutted to project-only concerns, or gets repointed is a plan decision.

---

## 4. Existing UX primitives — reuse vs invent

**Reuse (already exist, framework-neutral):**

| Primitive | Location | Use |
|---|---|---|
| `StatusDot` | `core/ui/components/ui/StatusDot.tsx` | atomic status dot, 5 variants, hex fallbacks |
| `StatusCard` | `core/ui/components/feedback/StatusCard.tsx` | status row (dot + label + text); the dashboard's status-row primitive |
| `LoadingDisplay` | `core/ui/components/feedback/LoadingDisplay.tsx` | determinate/indeterminate progress, `role="status"` |
| Spectrum `ProgressBar` + `UnifiedProgress` | used in `PrerequisitesStep.tsx:120-131` | per-tool install progress over the existing message contract |
| `usePrerequisiteState` | `prerequisites/ui/steps/hooks/usePrerequisiteState.ts:114` | **the install engine** — load→check→install state + message listeners, talks to backend purely via `postMessage`; surface-agnostic (accepts `undefined` stack) |
| `prerequisiteRenderers.tsx` | same dir | pure render helpers (status icons, messages, progress values) |
| `BaseWebviewCommand` + `configure.ts` | `core/base/BaseWebviewCommand.ts:54`; `dashboard/commands/configure.ts` | the copy-template for a **new standalone webview panel** (singleton, revealable, own handler map) |
| install runner (builder + ProgressUnifier) | §1.4 | run brew/npm installs with the same progress UX as fnm/Node |
| `oneTimeTip` | `core/utils/oneTimeTip.ts` | post-install "you may need to sign in" hints without spam |

**Wizard-coupled — do not lift verbatim:** `PrerequisitesStep` (`extends NavigableStepProps`, takes `WizardState`, `setCanProceed`), `usePrerequisiteAutoScroll` (drives wizard Continue gating), `usePrerequisiteNavigation` (recheck keyed on wizard `currentStep`). A standalone panel reuses the *engine hook* and *renderers* but not these three wizard-nav wrappers.

**Confirmed unfit for a global "Claude/AI home": `AiCapabilitiesModal`** (`dashboard/ui/components/AiCapabilitiesModal.tsx:58`). It is project-scoped by construction — its data comes from `verify-ai-setup` over a loaded `projectPath` (`useDashboardStatus.ts:253-261`), its "Regenerate" target is the current project's `.claude/*`, and its progress channel is bound to a project. This is exactly the gap that motivated the reframe (the original Claude-install proposal lived here and is unreachable AI-first).

**Genuinely new (small):** whatever standalone surface is chosen (§2) needs its own webview bundle/entry if it's a panel, or a new sidebar button + message case if it's the sidebar. Either is an established pattern, not new infrastructure.

---

## 5. Tier 1 (required for core function) vs Tier 2 (feature-specific)

The context file asks to preserve a sub-distinction *within* the extension-wide tier. Mapping the current toolset against it:

| Tool | Extension-wide? | Tier | Rationale | Surfaces at |
|---|---|---|---|---|
| Homebrew | yes | **Tier 1** (core) | nothing works without it; installs everything else | first-run / extension setup |
| fnm | yes | **Tier 1** | Node version management; everything depends on it | first-run / extension setup |
| Git | yes | **Tier 1** | required for repo operations across the extension | first-run / extension setup |
| Node (base) | yes (tool) | **Tier 1** for presence; **project** for version | runtime must exist; *which versions* is per-project | extension setup (tool) + project tier (versions) |
| aio-cli | yes (tool), install component-conditional | **Tier 2** | only needed for App Builder / API Mesh features | the mesh / App Builder feature moment |
| api-mesh plugin | same | **Tier 2** | only needed for mesh components (`requiredFor` on the plugin) | mesh deployment moment |
| Claude Code CLI (proposed) | yes | **Tier 2** | only needed for AI features; extension works without it | AI surface (per the Claude plan) |

**Tier 1 = first-run blocker (hard prompt justified). Tier 2 = recommendation at the feature's first-touch (soft prompt).** The current prereq system does not encode this — it expresses required-ness only as `optional: false`, which conflates "extension can't function" with "this feature can't function." The Claude CLI plan already validates the Tier-2 pattern end-to-end: it deliberately keeps Claude *out* of `prerequisites.json`, surfaces it at the AI moment (badge + modal + lazy gate at the launch site), and borrows only the install runner (`claude-cli-detection-and-install/overview.md:101-128`). The same shape generalizes: each Tier-2 tool surfaces when the user first touches its feature, reusing the install runner — aio-cli at mesh deployment, Claude at the AI surface.

The `demoBuilder.ai.engine` registry concept in the Claude plan (engine-keyed display name / binary / version command / install command / URL) is the concrete template for how a Tier-2 tool describes itself outside `prerequisites.json`.

---

## 6. Feasibility — what can and cannot move

**Can move cleanly:** the pure builder (`InstallStepBuilder`), the core progress engine (`ProgressUnifier`), the cache, the versioning primitives, the install-engine hook (`usePrerequisiteState`), and the renderers. The backend already serves an unfiltered (extension-wide) list with no stack.

**Stays wizard-coupled (and largely *belongs* to the project tier):** the index-keyed install handler (`installHandler.ts` reading `sharedState.currentPrerequisiteStates`), multi-Node-version coordination driven by component selection, and the wizard-nav hooks. None of these block the reframe — they are the project-tier concerns the split intends to separate out.

**No blocker found.** The migration scope is feasible: the data separation already exists implicitly, the install machinery decomposes along the right seam, and the global-surface primitives are all present.

---

## Open questions for the `/rptc:plan` cycle (not answered here)

1. **Surface choice** (§2): sidebar entry, activation prompt, status bar, or a combination. Trade-offs mapped; decision deferred.
2. **Schema shape** (§3): explicit `scope` discriminator vs. structural file-level separation; whether to split into two config files or keep one with cleaned-up entries.
3. **Wizard prereq step disposition** (§3e): stays / gutted to project-version-only / repointed at the shared backend.
4. **`componentRequirements` fate** (§3d): delete vs. repurpose as the Tier-2 feature→tool map.
5. **How Claude lands** (§5): does the reframe ship first and Claude slot in, or do they co-develop? (The Claude plan is currently blocked on this per the backlog.)
6. **Schema rewrite ownership**: the `prerequisites.schema.json` cleanup is a prerequisite of any migration and is non-trivial on its own.

---

## Sources

- `src/features/prerequisites/` — full read (services, handlers, config, versioning, ui)
- `src/features/prerequisites/config/prerequisites.json` + `prerequisites.schema.json` (drift confirmed against `services/types.ts`)
- `extension.ts`, `src/features/sidebar/`, `core/logging/errorLogger.ts` (surface audit)
- `core/ui/components/` (StatusDot, StatusCard, LoadingDisplay), `core/base/BaseWebviewCommand.ts`, `dashboard/commands/configure.ts`
- `dashboard/ui/components/AiCapabilitiesModal.tsx` + `useDashboardStatus.ts` (project-scoped confirmation)
- `.rptc/backlog/claude-cli-detection-and-install/overview.md` (Tier-2 pattern + reuse map)
- `components/services/ComponentRegistryManager.ts` (per-project Node version source)
- Project memory: `feedback_no_soft_deprecation`, `project_backlog_directory`
