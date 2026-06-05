# Step 4: Content Flow Through the Existing Pipeline (config-first)

**Status: 🟡 Config gate done (2026-06-04).** ✅ `supportedFlows` added to `stacks.json` (EDS=`['commerce','content']`, headless=`['commerce']`), the `Stack` type, `stacks.schema.json`, and the alignment test's field list — 116 template/alignment tests green, lint/typecheck/SOP clean. **Remaining:** the executor content-flow integration test + the repoless satellite-creation seam.

> **2026-06-05 repivot reframe:** The config gate (`supportedFlows`) survives unchanged — it gates which stacks expose the content flow regardless of topology. **What's new under repoless:** the integration test now verifies the executor takes the **repoless satellite-creation path** instead of `GitHubRepoOperations.createFromTemplate`. Specifically, the content flow's terminal site-creation step calls `ConfigurationService.PUT /config/{contentSC-org}/sites/{site}.json` with `code.owner = <commerceSC-org>`, `code.repo = <upstream>`, and `content.source.url = <Content SC's DA.live URL>`. The existing pipeline still runs Phase 5/5b for DA.live content; the change is at the site-creation seam, not throughout the pipeline. The "no mesh / backend by URL" config-first observations below still hold — the pipeline is mostly the same; only the site-registration mechanic differs.
>
> **What remains to wire (the open work this step holds):** the executor's content branch, when it reaches the point that currently calls `createFromTemplate`, must instead call into `ConfigurationService` to create the satellite. The integration test asserts: (a) `Configuration Service PUT` invoked with expected payload shape (validated against the live test's known-good 2026-06-05 example); (b) `createFromTemplate` NOT invoked for content flow; (c) Phase 5/5b (DA.live content) still runs.

**Purpose:** Make the **content flow run end-to-end through the EXISTING creation
pipeline**, driven by **configuration + seeded data** rather than an imperative
executor branch. Three config facts do almost all the work:

- **No mesh — by config.** Mesh is an `optionalDependencies` entry in `stacks.json`
  (not a default); the content path simply doesn't include it, and `executeMeshPhase`
  **already no-ops when no mesh component is present** (`else if (meshComponent?.path && meshDefinition)`).
  So there is *nothing to skip*.
- **Backend by URL — not provisioned.** There is no separate "backend deploy" phase;
  the backend is just coordinates in `config.json` (seeded in Step 5) consumed by
  `configGenerator`. So there is *nothing to skip* there either.
- **Fork-from-master is data.** The repo is generated from the master by the existing
  storefront-setup `createFromTemplate`, sourced from `edsConfig.templateOwner/templateRepo = master`
  (set by the join resolve in Step 2). **No new pipeline phase.**

So Step 4 is mostly **verifying the existing pipeline handles content given the seeded
config**, plus the **minimal guard(s)** for any spot where the pipeline makes a
commerce-only assumption that a test actually reveals. **No strategy split; no broad
`if (isContentFlow)` skip-guards** (YAGNI / neutral-spine guardrail).

> Supersedes the earlier "branch the executor / skip mesh+backend" framing — that work
> is now config-driven, not imperative. The earlier "`resolveFrontendSource` returns the
> upstream" idea was also wrong: the local clone is from the user's generated `repoUrl`
> (same for both flows); the *master* is the **template source** via `templateOwner`,
> upstream of the executor.

**Prerequisites:**
- [ ] Steps 1 (flow/upstream), 2 (join resolve seeds `edsConfig.templateOwner=master` + coords), 3 (filtering)
- [ ] `executor.ts` understood — esp. `executeMeshPhase` no-ops without a mesh component
- [ ] mesh is `optionalDependencies` in `stacks.json` (verified)

---

## Reuse map (config-first)
- **`stacks.json` dependency set** — content path carries no mesh dependency → existing mesh no-op. No imperative skip.
- **`executeMeshPhase`** — unchanged; no-ops when no mesh present.
- **`configGenerator.generateConfigJson`** (Phase 4) — unchanged; consumes seeded coords; direct backend URL when no mesh.
- **storefront-setup `createFromTemplate`** — generates the fork from `templateOwner/templateRepo = master` (data from Step 2).
- **`ensureEdsContent`** (Phase 5b) + config sync (Phase 5) — unchanged.
- **Net-new:** only minimal guard(s) surfaced by the content integration test (expect little/none); executor already sets `flow`/`upstream` (Step 1).

## Config gating — `supportedFlows` (config + schema)
- Add `supportedFlows?: ('commerce' | 'content')[]` to `stacks.json` **and update `stacks.schema.json`** so *which stacks the content flow may use* is expressed as **data**, not a hardcoded predicate. EDS stacks support both; non-EDS (headless) support `'commerce'` only. This is the config-driven availability gate (ties to the mirroring decision).

---

## Tests to Write First

### Characterization (Risk-1 guard): `tests/.../executor-commerce-regression.test.ts`
- [ ] Commerce/EDS path still runs Phase 3 mesh **when a mesh component IS present** (capture current behavior so nothing regresses).

### Integration: `tests/.../executor-content-flow.test.ts`
- [ ] Content flow (no mesh dependency) runs the pipeline with **no mesh deployment attempted** (existing no-op; no Adobe/mesh CLI calls).
- [ ] `config.json` is generated with the **inherited coords** (seeded `componentConfigs`) via the existing `configGenerator`.
- [ ] Phase 5 config sync + Phase 5b content run for content.
- [ ] Saved content project carries `flow:'content'` + `upstream`.

### Config: `tests/.../stacks-supportedFlows.test.ts`
- [ ] EDS stacks declare `supportedFlows` including `'content'`; non-EDS stacks do not.

---

## Files to Create/Modify
- [ ] `src/features/project-creation/config/stacks.json` + `stacks.schema.json` — add `supportedFlows`
- [ ] `src/features/project-creation/handlers/executor.ts` — ONLY minimal guard(s) **if** a content test reveals a commerce-only assumption (expect little/none)
- [ ] test files above

---

## Implementation Details

### RED
Characterization (commerce mesh) passes against current code. The content integration
test fails wherever a commerce-only assumption breaks — **or passes outright**, in which
case Step 4 is verification + the `supportedFlows` config only.

### GREEN
- Run the content flow through the pipeline with seeded config (no mesh dep; coords in
  `componentConfigs`; `templateOwner=master`). Add a **narrow, predicate-named guard**
  *only* where a test shows a commerce-only assumption (e.g., a step assuming a backend/
  mesh component exists). Prefer `shouldRunMeshPhase(...)`-style helpers over inline `if`s,
  and only if actually needed.
- Add `supportedFlows` to `stacks.json` + `stacks.schema.json`.

### REFACTOR
- No strategy pattern. Keep any guard minimal. Document that "no mesh / no backend-deploy"
  is **config-driven, not imperative**.

---

## Acceptance Criteria
- [ ] Commerce characterization test green before + after.
- [ ] Content flow runs end-to-end via the existing pipeline: no mesh deployed, `config.json`
  carries inherited coords, Phase 5/5b run, project saved with `flow`/`upstream`.
- [ ] `supportedFlows` in `stacks.json` + `stacks.schema.json`; non-EDS stacks are commerce-only.
- [ ] **Minimal-to-no imperative executor branching;** full build + existing executor tests green.

**Estimated time:** 5–7 hours
