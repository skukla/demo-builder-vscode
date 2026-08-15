# Codebase sweep — 2026-08-15

Run at the `v1.0.0-beta.129` release cut, immediately after the wizard-integration-card
work merged and the Data Installer was pulled from `develop`.

## Movement since last sweep

| Scan | 2026-08-11 | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **4 groups** | At baseline. Same four, same shapes. No finding. |
| code-duplication (jscpd) | 64 clones · 0.70% | **65 clones · 0.69%** | +1 clone but the RATIO fell. The tree grew faster than the duplication. Not movement. |
| circular-dependency | 13 cycles | **14 cycles** | +1 against the stale baseline — but see below, it predates this session. |
| dead-code doc-drift | 0 | **0** | At baseline. 64 mentions correctly classed as historical. |

### The cycle count did not move — the baseline did

The 13 in the table was measured 2026-08-11. Running the same scan against
`5d3cccf6` — `develop` before any of today's work, via the parked
`fix/leah-128-bugs` worktree — also reports **14**. So the 14th cycle arrived
between 2026-08-11 and 2026-08-14 and is nothing to do with this session.

Recording the method because the alternative was reporting a false regression: a
count that differs from a four-day-old baseline is not evidence until you measure
the same scan at the commit you are comparing to.

## Findings

### 1. `createHandlerContext()` is written out identically in five panel commands

- **Sites** (each a private method, byte-identical including its comment):
  - `src/features/dashboard/commands/showDashboard.ts:518`
  - `src/features/dashboard/commands/configure.ts`
  - `src/features/dashboard/commands/showIntegrations.ts`
  - `src/features/dashboard/commands/openAi.ts`
  - `src/features/projects-dashboard/commands/showProjectsList.ts:212`
- **Shape**: all five `extend BaseWebviewCommand`, and `BaseWebviewCommand` has no
  such method (grep: zero hits for `createHandlerContext` or
  `createPanelHandlerContext` in `src/core/base/baseWebviewCommand.ts`). The real
  logic is ALREADY shared — every copy just calls `createPanelHandlerContext({...})`
  with the same five fields. What is duplicated is the delegation wrapper, its
  section banner and its comment.

  This is the strongest possible version of the signal: not "two things that
  resemble each other", but one method pasted five times into five subclasses of a
  common base that could hold it once. jscpd surfaces it four times over because
  `showProjectsList` pairs separately with each of the other four (26, 20, 11 and
  11 lines) — four of the eight cross-boundary clones in the whole repo are this
  one method.
- **It was six this morning.** `showDataInstaller.ts` had a sixth copy; it left
  with the Data Installer removal. A shape that keeps being re-pasted as new panels
  are added is the definition of a missing base-class member.
- **Proposal**: move `createHandlerContext()` to `BaseWebviewCommand` as a
  `protected` method; delete the five copies. The base already holds `context`,
  `panel`, `stateManager`, `communicationManager` and `sendMessage`, so no new
  plumbing.
- **Cost**: small — one method up, five deleted. Behaviour-preserving, so the
  existing panel suites should pass untouched; if any needs editing, that is a
  behaviour change and wants justifying, not absorbing.

## Considered and rejected

### `page-container-padded` (5 files) — a layout utility doing its job
Spans `AiOverviewScreen`, `DashboardStatusHeader`, `OrgContextNotice`,
`IntegrationsScreen`, `ProjectsDashboard` — five unrelated screens sharing ONE
class. The extraction signal is the same SET of files sharing SEVERAL classes; this
is the opposite. Rejected in the 2026-08-05 sweep for the same reason. Left here so
sweep six does not re-litigate it.

### `status-text` (4) · `icon-label` (4) · `page-header-section` (3) — same verdict
Single shared classes across files with no other overlap. `icon-label` spans
dashboard and sidebar; `status-text` spans core, dashboard and two EDS cards. Each
is one utility, reused correctly.

### The 14 cycles — all pre-existing, none introduced
Twelve are same-feature pairs the scan's own triage calls benign (handler/phase
splits in `eds/handlers/storefrontSetup*`, `app-builder/services/*`,
`ProjectCreationHandlerRegistry ↔ index`). Verified identical at `5d3cccf6`. This
session's new module (`integration-flow/integrationCards.ts`) introduces none: it
imports one sibling and `@/core/ui/components/integrations`, neither of which
imports back.

### `types/webview.ts ↔ usePrerequisiteState.ts` (15 lines) — a type and its consumer
A shared state SHAPE, not shared logic. The hook's local state mirrors the wizard
type by design. Extracting would invert the dependency for no gain.

### `useComponentConfig ↔ useConfigureFieldValues` (12 + 8 lines) — flagged, not proposed
The one cross-boundary clone worth a second look after finding 1, and the only
other one that is not the panel-command shell. Two hooks resolving component field
values on two surfaces (component selection vs. Configure). Twelve lines is under
the threshold where extraction pays, and I did not open both closely enough to
judge whether they are the same job or two variants — that judgment is the whole
point of this pass, so recording it as unresolved rather than guessing. Next sweep:
open both, decide.

### 1,133 ts-prune lines — not triaged, and that is deliberate
The scan skill lists the false-positive classes (entry points, DI/config-registered
symbols, barrel re-exports) and the count is dominated by them. Triaging it needs a
pass of its own; a release cut is the wrong moment. The doc-drift half — the part
the skill calls reliable because it is confirmed against `git log` — is **0**.

## Baselines to carry forward

| Scan | Baseline (2026-08-15) | Movement means |
|---|---|---|
| component-extraction | 4 groups | a NEW group, or one growing past 3 files |
| code-duplication (jscpd) | 65 clones · 0.69% lines · 8 cross-boundary | a ratio jump, or a NEW cross-boundary clone |
| circular-dependency | 14 cycles | any new cycle — and measure the comparison commit, do not trust this number's age |
| dead-code doc-drift | 0 | any hit is real |

New column this sweep: **cross-boundary clone count (8)**. Total clone count barely
moves and hides the only thing that matters — a clone spanning two features. Four
of the eight are finding 1; fixing it should take this to 4.
