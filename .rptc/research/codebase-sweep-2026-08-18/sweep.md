# Codebase sweep — 2026-08-18

Run at the `v1.0.0-beta.133` cut, on `develop` at `74f60228`. Propose-only: no code
was changed by this pass.

## Movement since last sweep (2026-08-11)

| Scan | Last | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **3 groups** | Improved. No group grew; none is a shared shell |
| code-duplication (jscpd, `scan.sh`) | 64 clones / 0.70% | **71 clones / 0.66%** | Count up 7, density DOWN. One real cross-feature finding below |
| circular-dependency | 13 cycles | **14 cycles** | +1, but the two sampled are `import type` in one direction — erased at compile time |
| dead-code doc-drift | 0 | **0** | One hit found earlier this session and fixed in `74f60228`; back to zero |

Note on the jscpd number: `scan.sh`'s own thresholds give 71. An ad-hoc
`--min-lines 5` run gives 142 — **not comparable to the baseline**, and recorded here
only because the cross-feature slice below was derived from it.

## Findings

### 1. `createHandlerContext()` is copy-pasted into six webview commands

- Sites (all `private createHandlerContext(): HandlerContext`):
  - `src/features/dashboard/commands/showDashboard.ts:527`
  - `src/features/dashboard/commands/configure.ts:885`
  - `src/features/dashboard/commands/showIntegrations.ts:172`
  - `src/features/dashboard/commands/openAi.ts:156`
  - `src/features/projects-dashboard/commands/showProjectsList.ts:212`
  - `src/features/data-installer/commands/showDataInstaller.ts:124`
- Shape: **byte-identical bodies**, differing only in comment wording (four carry the
  same "ONE complete context from the shared factory" comment verbatim; two are
  reworded). Each delegates to `createPanelHandlerContext` with the same five fields:
  `context`, `panel`, `stateManager`, `communicationManager`, `sendMessage`. Every one
  of the six is a subclass of `BaseWebviewCommand`, which does **not** define the
  method — verified: `grep createHandlerContext src/core/base/baseWebviewCommand.ts`
  returns nothing.
- Why it is a finding rather than six legitimate uses: there is no per-command
  variation to justify. The method takes no arguments, reads only inherited fields,
  and returns the factory's result unchanged. Six copies of a nullary method over
  inherited state is one method on the base class that never got moved up.
- It also crosses a feature boundary four ways (`dashboard`, `projects-dashboard`,
  `data-installer`, and `core` via the base class), which is the shape that drifts:
  a new field on `createPanelHandlerContext` has to be threaded six times, and
  missing one produces a panel whose handlers see an incomplete context — the exact
  failure the comments in these very methods say the factory exists to prevent.
- ~~Proposal: move it to `BaseWebviewCommand` as `protected createHandlerContext()`.~~
  **WITHDRAWN 2026-08-18 — the fix would create an import cycle.** `BaseWebviewCommand`
  would have to import `createPanelHandlerContext` from `@/commands/handlerContextFactory`,
  and that module already reaches `baseWebviewCommand` transitively:

  ```
  commands/handlerContextFactory → core/di/index → core/di/serviceLocator
    → features/sidebar/index → features/sidebar/providers/sidebarProvider
    → core/base/index → core/base/baseWebviewCommand
  ```

  Measured with `madge --json` on `handlerContextFactory.ts` (339 modules reachable) and
  a shortest-path search, not inferred. Adding the edge closes the loop.

- **Why the alternatives do not work either.** Moving `handlerContextFactory` into `core/`
  is worse — it imports `@/features/prerequisites/services/PrerequisitesManager`, so core
  would then depend on a feature. A structurally-typed helper taking the five values
  cannot be handed `this` from a subclass, because the fields are `protected` and do not
  satisfy a public interface from outside the class; every command would still write the
  same object literal, which is the actual duplicated text.

- **Standing verdict:** the duplication is real and the cost of leaving it is real — a new
  field on `createPanelHandlerContext` must be threaded six times, and missing one yields
  a panel whose handlers see an incomplete context. But there is no cheap fix that does
  not either invert the layering or close a cycle. Leaving it, deliberately and on the
  record, is the correct call until someone untangles
  `serviceLocator → features/sidebar`, which is the edge that makes this impossible.

- **Lesson for this skill:** this proposal named a mechanism without checking the import
  graph, and the mechanism was unavailable. A sweep finding that proposes "move X to Y"
  should run `madge` on Y's would-be import BEFORE writing the proposal, not when someone
  tries to apply it.

## Considered and rejected

### `page-container-padded` (5 files) — layout utility
`FullScreenSurface`, `AiOverviewScreen`, `DashboardStatusHeader`, `OrgContextNotice`,
`DataInstallerScreen`. Five unrelated surfaces applying one padding utility. This is
the scan's documented false-positive shape (a utility doing its job), not one shell
rendered five times. Same verdict as 2026-08-05 and 2026-08-11.

### `status-text` (4 files) — utility
`StatusCard`, `OrgContextNotice`, `DaLiveServiceCard`, `GitHubServiceCard`. A text
style, not a component. No accompanying set of co-occurring classes.

### `icon-label` (4 files) — utility, but worth watching
`ActionGrid`, `DashboardTile`, `AiZone`, `UtilityBar`. Two dashboard files and two
sidebar files. The pair-of-pairs shape is what the skill warns about, but the two
sides render different things — a grid tile with a status dot versus a bare icon
button — so extracting now would produce a component with a props union wider than
either caller. Re-check next sweep: if a third surface grows an `icon-label`, the
balance flips.

### The 14 circular dependencies — not a regression
Cycle 1 (`appBuilderComponentMigration` ↔ `projectFileLoader`) and cycle 14
(`ReviewStep` ↔ `reviewStepHelpers`) are both `import type` in one direction, so
they do not exist at runtime. The remaining twelve match the previously-triaged
same-feature handler/phase pairs (`storefrontSetupHandlers`/`Phases`/`Phase1-3`,
`allowedDomain`/`ensureMeshApiSubscribed`).

**Process gap this exposed:** the baseline records a cycle COUNT but not the cycle
LIST, so a +1 cannot be attributed without re-triaging all fourteen. Next sweep
should record the list, not the number.

### `architecture-duplication-scan` "mirrors" signals — no action
Twenty-one comments saying one module mirrors another. Each is a claim worth
checking eventually, but none was verified this pass and none should be treated as a
finding on the strength of its own comment. Deliberately left for a dedicated run.

## Baselines to carry forward

| Scan | Baseline (2026-08-18) | What movement means |
|---|---|---|
| component-extraction | 3 groups | a NEW group, or one growing past 3 files |
| code-duplication (`scan.sh`) | 71 clones, 0.66% lines | a jump, or any clone crossing a feature boundary |
| circular-dependency | 14 cycles — **record the list next time** | any new RUNTIME cycle; type-only ones are harmless |
| dead-code doc-drift | 0 | any hit is real — confirmed against `git log` |
