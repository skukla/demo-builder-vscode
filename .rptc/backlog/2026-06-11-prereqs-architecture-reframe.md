# Reframe prerequisites: extension-wide tools vs project-shape requirements (Path A)

**Status:** Backlog — research complete (2026-06-11), decisions locked, awaiting `/rptc:plan` cycle.
**Filed:** 2026-06-11
**Last updated:** 2026-06-11 — folded in 16 decisions from the design-discussion thread plus 3 plan-cycle research items.
**Research note:** `.rptc/research/prereqs-architecture-reframe/research.md`
**Origin:** Discussion thread on where to surface the Claude Code CLI install. The original Claude detection plan (`claude-cli-detection-and-install/`) initially proposed putting the install on the project dashboard's AI Capabilities Modal. The conversation exposed that the modal is project-scoped — unreachable to a user who wants to start AI-first ("install the extension, drive everything via Claude from soup to nuts"). Discussion expanded to whether the broader prereq framing is right at all. Three paths surfaced (A: reframe now; B: parallel surface as a bandage; C: accept the gap). **Owner picked Path A.**

---

## The architectural insight

The wizard's prereqs step currently presents tools as "project prerequisites." Audit of `src/features/prerequisites/config/prerequisites.json` shows almost every item is actually **extension-wide** in scope:

| Prereq | What it depends on | Real scope |
|---|---|---|
| Homebrew | Nothing — needed for everything | Extension-wide |
| fnm | Nothing — needed for everything | Extension-wide |
| Git | Nothing — needed for everything | Extension-wide |
| Node.js | Per-component (specific versions per storefront) | Extension-wide tool, version is per-component |
| aio-cli | Conditional on API Mesh components | Extension-wide tool, install is component-conditional |
| api-mesh plugin | Same as above | Extension-wide tool, install is component-conditional |
| Claude Code (proposed) | Nothing — needed for AI features extension-wide | Extension-wide |

The "project prerequisites" framing is a UX shortcut driven by the wizard being the first place users encounter them. It doesn't match the underlying reality. Two different concerns are conflated:

1. **Tool installation** — "do you have this on your system?" Stateless, extension-lifetime concern, install-once-and-forget.
2. **Project-shape requirements** — "does the version of an installed tool match what THIS specific project asks for?" Per-project, conditional, can require multiple installs (e.g., multi-version Node).

Today they share one UI (the wizard's prereqs step) and one config file (`prerequisites.json`). That works for point-and-click users who only encounter the extension through the wizard. It breaks down the moment we ask "what if a user wants to use an extension capability before they have a project?" — because category (1) concerns are gated on category (2)'s entry point.

The Claude detection question made this visible. The same gap exists today for Homebrew/fnm/Git — anyone landing without them has to go through the wizard to discover and install them. That hasn't been a problem because the wizard is the only path. AI-first UX changes that.

---

## What the research confirmed

The `/rptc:research` cycle landed 2026-06-11 with five findings that shaped the locked decisions below:

1. **The `componentRequirements` filtering is inert today.** All 5 prereqs are `optional: false`, so the live wizard path checks every entry unconditionally and never consults `componentRequirements`. The thing that IS project-driven — which Node versions are needed — already lives in `components.json`, not `prerequisites.json`. The reframe largely formalizes a separation that exists implicitly.
2. **The schema is drift soup.** `prerequisites.schema.json` has drifted from the TS types and live data: dead fields (`groups`, `multiVersion`, `versionCheck`, `componentRequirements.nodeVersions`) present, real fields (`perNodeVersion`, real `install.steps` shape) missing. Migration must rewrite the schema from `types.ts`, not extend it.
3. **The install runner decomposes along the right seam.** Pure builder (`InstallStepBuilder`) + reusable progress engine (`ProgressUnifier`) + wizard-bound handler (`installHandler`). Reuse the first two; the third belongs to the project tier. The Claude plan's independent conclusion matches.
4. **Every UX primitive already exists.** `StatusDot`, `StatusCard`, `LoadingDisplay`, the surface-agnostic `usePrerequisiteState` hook, `BaseWebviewCommand` as a panel template, the install runner. The backend already serves the unfiltered extension-wide list when no stack is passed.
5. **No blocker found** — migration scope is feasible.

The cross-validation between the research (independent codebase pass) and the Claude detection plan (independent architectural pass) landing on the same install-runner decomposition seam is a strong signal.

---

## Locked decisions

Sixteen decisions from the design-discussion thread, in the order they were resolved. Each is the answer the owner committed to after weighing trade-offs.

### Surfaces

**D1. First-run welcome panel — non-dismissable.** Opens automatically on first activation (or first deliberate interaction; see plan-cycle research item R3 below). Gates extension features until Tier 1 + opted-in Tier 2 are resolved. Quit-and-uninstall is the only escape if the user refuses required tooling — "skip for now" would be a lie because the wizard would block on the same prereqs five minutes later in a worse state. Auto-advances to the projects dashboard when nothing's needed (returning user with cleared local state, etc.).

**D4. Wizard prereqs step always renders.** Reuses existing UI primitives (`StatusDot`, install buttons, `ProgressUnifier` integration, status copy patterns, color vocabulary). Container adjusts — fixed 360px scrollable height drops to auto-fit since content shrinks to 0-3 items typically; auto-scroll behavior removed (not needed at the smaller size). Two render paths:

- **Healthy state**: verified-dependency summary card with auto-focused Continue. Enter advances. ~1-2s total.
- **Install-needed state**: missing items with install action. Same primitives, different action set.

The step has identity in both states — verify + show + install. Don't skip the user past it on healthy state; the transparency + diagnostic value outweigh the 1-second friction.

**D6. Welcome panel surfaces Tier 2 AI engines as opt-in radio buttons.** "Choose your AI engine" — Claude Code / Codex / Skip. Tier 1 is non-optional, no checkboxes. Handles the AI-first user at first encounter without breaking the Tier 1/Tier 2 framing. The radio choice writes `demoBuilder.ai.engine` and installs the chosen engine alongside Tier 1.

**D7. Lazy gate is the moment-of-need surface for Tier-2 tools** not opted in at welcome time. Mirrors the pattern from the Claude detection plan: try-to-use → gate detects missing → notification with install action. Users who skip AI at welcome can install later without re-running the welcome flow.

**D8. No sidebar indicator.** Three surfaces (welcome, wizard step, lazy gate) cover the user journeys. A persistent indicator would only serve a power-user "see all my tools at a glance" case we can defer to a `Manage Tools` palette command if it ever becomes a real need.

### AI engine setting + lifecycle

**D11. `demoBuilder.ai.engine` is the source of truth** for which AI engine is configured. Welcome panel reads + writes it. Lazy gate reads it. No parallel setting. Already exists in `package.json` (enum locked to `["claude-code"]` today); the Claude plan extends the enum to include `"codex"` when Codex is wired.

**D12. Engine switching happens via VS Code settings UI** (standard pattern). Extension listens for `onDidChangeConfiguration('demoBuilder.ai.engine')`. On change, verify the new engine is installed; if missing, surface an install notification immediately. User can dismiss; lazy gate catches them at first AI feature use.

**D13. No auto-uninstall** of the previous engine when switching. User cleans up via `brew uninstall` themselves. The extension respects what's on their system — installing/uninstalling is the user's call, especially for tools they may use outside the extension (Claude Code is heavily used for non-extension work).

**D14. No activation-time checks for engine availability.** Lazy gate at feature use is the catch-net for "engine setting points to an uninstalled engine." Activation checks reintroduce the interrupt pattern the codebase deliberately moved away from.

**D15. No uninstall surface in the extension** for any tool (AI engines or otherwise). All extension-installed tools are user-system tools that may be used outside the extension; we don't presume to remove them. Users uninstall via `brew uninstall` themselves. Documented in our docs for discoverability.

**D16. A `Reinstall AI engine` command** is available via the palette for the corrupted-install case. Runs `brew reinstall --cask <engine>`. Thin wrapper around the existing install runner. (Optional — can be deferred if "wait until a real corrupted-install report arrives" is preferred. Cheap addition either way.)

### Architecture

**D2. Single install runner.** Reuse existing `InstallStepBuilder` + `ProgressUnifier`. No parallel install system. All surfaces (welcome panel, wizard step, lazy gate, settings-change-triggered install, Reinstall command) invoke the same runner with different filters on the same prereqs list.

**D3. Single `prerequisites.json`** with a `scope: 'extension' | 'project'` discriminator per entry. No file split. Per-project Node version requirements stay in `components.json` (already there, already separated). Tools and validators stay singular.

**D5. `componentRequirements` repurposed** as the Tier-2 feature→tool map. Verified in conversation: shape already fits (`componentId → { prerequisites, plugins }`), live-consumed by `PrerequisitesManager`. Just becomes load-bearing instead of inert (today every entry is `optional: false` so the filter never matters; after the reframe, Tier-2 entries are conditionally required and the filter is meaningful).

### Sequencing

**D9. Schema rewrite is Plan Step 1.** Cleanup from `types.ts` (delete dead fields `groups`, `multiVersion`, `versionCheck`, `componentRequirements.nodeVersions`; add real fields `perNodeVersion`, real `install.steps` shape; add the new `scope` discriminator from D3). Self-contained, low risk of rework, gives a known-good baseline before architecture work begins. The `/rptc:plan` cycle should treat this as an independent first step.

**D10. Claude plan sequences AFTER the reframe.** With the reframe shipping the install runner, lazy gate primitive, and welcome panel opt-in slot, the Claude plan as drafted (`claude-cli-detection-and-install/`) becomes a thin "fill in the engine-specific bits" plan — engine registry, install URL constants, launch command map. Almost all the mechanics are inherited. The Claude backlog plan stays valid as currently written; only the integration shape gets smaller.

---

## Sub-distinction worth preserving in any design

Within the extension-wide tier, there's a further split that matters for UX urgency:

- **Required for core function** (Homebrew, fnm, base Node, Git) — the extension can't do anything without these. First-run blocker. Non-dismissable welcome panel is justified.
- **Required for a specific feature** (Claude Code, Codex, aio-cli, mesh plugin) — the extension works without these; the specific feature doesn't. Recommendation, not blocker. Soft surface (welcome opt-in + lazy gate + wizard-step prompt depending on the tool).

The current prereq system doesn't distinguish these. The reframe encodes this via the `scope` field (D3) and the dual welcome-panel sections (D6 — Tier 1 always installed, Tier 2 AI engines as opt-in radio).

---

## What gets researched in the plan cycle (deferred from this discussion)

Three verification items the planning cycle should resolve before architecture is committed:

**R1. `perNodeVersion` install path routes through the same install runner the welcome panel will use.** 90% confidence based on research findings; needs a hard check. If it doesn't, either the welcome panel uses a different runner (architectural compromise) or `perNodeVersion` install gets refactored to share (more scope).

**R2. Wizard prereqs step can actually auto-skip-via-Enter on healthy state** without a refactor. Might need a small new "step-ready-to-advance" state. Confirm before committing to the D4 UX shape.

**R3. Activation-interrupt removal context.** What specific work removed activation interrupts, and whether a non-dismissable welcome panel that fires on first activation contradicts that prior work. Almost certainly fine since it's first-run-only and not recurring — but worth confirming so we're not silently reversing a deliberate decision. Alternative trigger: first deliberate extension interaction (e.g., clicking the sidebar) instead of pure activation. Same effect, different trigger, no precedent conflict.

---

## Sequencing implications for in-flight work

- **AEM Assets fix** (`.rptc/plans/aem-assets-first-time-user-fix/`, PR #45) — unblocked by this work. Tactical bug fix in `daLiveContentOperations`. Lands in `.115`.
- **Discovery error detail** (PR #46) — also unblocked, lands in `.115`.
- **Claude detection plan** (`.rptc/backlog/claude-cli-detection-and-install/`) — **blocked** on this reframe. The plan as drafted stays valid; integration shape becomes smaller after the reframe ships its primitives.
- **EDS namespace picker** (`feature/eds-namespace-picker` branch, parked) — independent of this work. Merges whenever.
- **This reframe work** — research done. Plan cycle next (estimate 1 day in a fresh `/rptc:plan` session). Implementation cycles after that (estimate 3-5 days). Earliest beta target `.116`.

---

## Kickoff prompt

```
Run /rptc:plan on the prereqs architecture reframe. Context files:
- .rptc/backlog/2026-06-11-prereqs-architecture-reframe.md (this file)
- .rptc/research/prereqs-architecture-reframe/research.md (the research note)
- .rptc/backlog/claude-cli-detection-and-install/overview.md (downstream
  plan that consumes this reframe's primitives)

All 16 decisions are locked (see "Locked decisions" section above).
Plan cycle should NOT re-litigate them — focus on translating them into
concrete implementation steps.

Three research items remain (R1, R2, R3 in "What gets researched in
the plan cycle"). Resolve these as part of planning before locking
the architecture.

Sequence target:
  - Step 1: Schema rewrite (D9 — clean baseline from types.ts, add
    scope discriminator)
  - Step 2: Welcome panel surface (new, gates Tier 1 + Tier 2 opt-in)
  - Step 3: Wizard prereqs step adjustment (smaller container, auto-
    focused Continue on healthy, reuse primitives)
  - Step 4: Lazy gate primitive (extracted, reusable across surfaces)
  - Step 5: componentRequirements made load-bearing (D5)
  - Step 6: Engine setting change listener (D12)
  - Step 7: Reinstall command (D16, optional)

Output should be a step-NN.md per step under
.rptc/plans/prereqs-architecture-reframe/ with the implementation
specifics for each.

Block on owner approval before proposing implementation.
```

---

## Constraints

- **Don't re-litigate the 16 decisions.** Each one was deliberated; the plan cycle implements rather than redesigns. If a decision turns out to be technically infeasible mid-plan, surface that immediately rather than substituting a different design.
- **Preserve the Tier 1 / Tier 2 distinction** in any design. The framing reflects extension-need, not user-path-need. The welcome panel's dual-section UI is how user-path-dependence is resolved (Tier 1 forced, Tier 2 opt-in radio).
- **Reuse the existing install runner.** Don't build a parallel install system. The cross-validation with the Claude plan confirmed the seam.
- **AI-first UX is a stated goal.** Designs that surface extension-wide tools only through the wizard fail this. Designs that combine welcome panel + lazy gate + wizard step succeed.
- **No activation interrupts beyond the one-time welcome panel.** Settings-change detection (D12) does not constitute an activation interrupt — it's reactive to user action, not extension lifecycle.
