# Reframe prerequisites: extension-wide tools vs project-shape requirements (Path A)

**Status:** Backlog — awaiting an `/rptc:research` cycle. Direction confirmed; no plan yet.
**Filed:** 2026-06-11
**Origin:** Discussion thread on where to surface the Claude Code CLI install. The original Claude detection plan (`claude-cli-detection-and-install/`) initially proposed putting the install on the project dashboard's AI Capabilities Modal. The conversation exposed that the modal is project-scoped — unreachable to a user who wants to start AI-first ("install the extension, drive everything via Claude from soup to nuts"). Discussion expanded to whether the broader prereq framing is right at all. Three paths surfaced (A: reframe now; B: parallel surface as a bandage; C: accept the gap). **Owner picked Path A.**

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

Claude makes this visible because it's the first extension-wide tool we'd want to surface *outside* the wizard flow. The same gap exists today for Homebrew/fnm/Git — anyone landing without them has to go through the wizard to discover and install them. That hasn't been a problem yet because the wizard is the only path. AI-first UX changes that.

## Why this matters now

If AI-first is a real UX direction (the owner has confirmed it is — soup-to-nuts via Claude is a stated goal), every future "extension-wide capability" addition will hit this same question. Examples already on the radar:

- Codex CLI alongside Claude (per the `claude-cli-detection-and-install` plan's engine-aware structure)
- Possibly other CLI agents over time
- Any new "you need this tool to use this feature" pattern

Doing the reframe once means every future addition has a clean home. Skipping it means each new tool re-litigates the "where does this go?" debate.

## Sub-distinction worth preserving in any design

Within the extension-wide tier, there's a further split that matters for UX urgency:

- **Required for core function** (Homebrew, fnm, base Node, Git) — the extension can't do anything without these. First-run blocker. Activation prompt is justified.
- **Required for a specific feature** (Claude Code, Codex, aio-cli, mesh plugin) — the extension works without these; the specific feature doesn't. Recommendation, not blocker. Soft prompt.

The current prereq system doesn't distinguish these. The reframe should.

## What the research cycle should investigate

A focused `/rptc:research` pass before any planning. Suggested scope:

1. **Existing prereq system shape** — full read of `src/features/prerequisites/`, including `PrerequisitesManager`, the install runner, the wizard prereqs step UI, the JSON schema, the `componentRequirements` filtering logic. Understand what's load-bearing and what's incidental.
2. **Where extension-wide tools should surface** — three candidate surfaces:
   - Activation prompt (one-time, dismissible, modal at first activation)
   - Sidebar entry (persistent, always-visible, click to open setup)
   - Status bar item (subtle, persistent, click to act)
   Each has trade-offs. Research should map them against actual UX moments.
3. **Migration shape** — what does `prerequisites.json` look like after the reframe? Does each entry gain a `scope: "extension" | "project"` field? Does the structure split into two files? Are there entries that genuinely straddle both (e.g., Node, where the tool is extension-wide but versions are project-shape)?
4. **Existing UX patterns to reuse** — same lens as the Claude plan's reuse map. The install runner, the progress UI, the status indicators, the StatusDot/StatusCard primitives are all already there. The reframe should reuse them, not reinvent.
5. **Tier-2 (feature-specific) tools** — how do they get installed in the new world? Claude Code at the AI-first install surface, aio-cli at the mesh deployment surface, etc. Each feature-specific tool likely surfaces at the moment the user touches that feature for the first time. Research should validate that pattern across the existing toolset.
6. **What CAN'T move** — items that look extension-wide but are tightly coupled to wizard-step internals (progress streaming, multi-Node-version coordination, etc.). Confirm migration scope is feasible.

## What the plan cycle (after research) needs to cover

When the research lands, the plan should answer:

- The two-tier model concretely (extension setup vs project requirements) — what fields change in `prerequisites.json`, what stays
- The global "Extension Setup" surface — pick one of the three candidates (or a combination)
- The migration path for each existing prereq — where does it land in the new world
- The Tier 1 (required) vs Tier 2 (feature-specific) UX distinction
- How Claude lands — first item to slot into the new tier-2 pattern
- Backward compatibility for the wizard prereqs step (does it stay, get gutted, get repointed?)
- Tests + acceptance criteria

## Sequencing implications

- **AEM Assets fix** (`.rptc/plans/aem-assets-first-time-user-fix/`) — unblocked by this work. Tactical bug fix in `daLiveContentOperations`. Lands in `.115`.
- **Claude detection plan** (`.rptc/backlog/claude-cli-detection-and-install/`) — **blocked** on this. Either reframe lands first and Claude slots into the new model, or Claude doesn't ship until both are ready. Updated note in the backlog README to reflect the dependency.
- **EDS namespace picker** (`feature/eds-namespace-picker` branch, parked) — independent of this work. Merges whenever the owner says go.
- **This reframe work** — research first (1-2 days), then plan (1 day), then implementation cycles (multi-day). Earliest beta target is `.116` or later, depending on scope decisions in the plan phase.

## Kickoff prompt

```
Run /rptc:research on the prereqs architecture reframe. Context
file: .rptc/backlog/2026-06-11-prereqs-architecture-reframe.md.

The decision (Path A — reframe to two-tier) is locked. Research
should focus on:
  - The existing prereqs system's actual shape and coupling points
  - Where extension-wide tools should surface (sidebar / activation
    prompt / status bar — trade-offs)
  - Migration mechanics for prerequisites.json
  - Existing UX primitives we can reuse vs would need to invent
  - The Tier 1 (required for core function) vs Tier 2
    (feature-specific) distinction

Output should be a research note at
.rptc/research/prereqs-architecture-reframe/research.md
sufficient to feed into /rptc:plan afterward. Don't propose the
plan in the research note — that's the next cycle.

Block on owner approval before proposing implementation.
```

## Constraints

- **Don't re-litigate Path A.** The decision is made. Research investigates the *how*, not the *whether*.
- **Preserve the Tier 1 / Tier 2 distinction** in any design that comes out. Don't conflate "extension can't function" with "AI feature can't function" — they need different UX urgency.
- **Reuse the existing install runner** (the same point that landed in the Claude plan). Don't build a parallel install system.
- **AI-first UX is a stated goal.** Designs that surface extension-wide tools only through the wizard fail this. Designs that surface them through a global surface succeed.
