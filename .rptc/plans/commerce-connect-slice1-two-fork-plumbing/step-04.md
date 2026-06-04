# Step 4: Executor Content-Flow Branch (fork-from-upstream, skip mesh/backend-deploy)

**Purpose:** Branch the existing `executeProjectCreation` pipeline so the
**content flow forks from the upstream** and **skips the mesh phase (Phase 3) and
backend deployment**, while **reusing** component install, config generation
(Phase 4), config sync (Phase 5), and DA.live content (Phase 5b). The commerce/
EDS path is byte-for-byte unchanged when `flow` is absent or `'commerce'`.

**Prerequisites:**
- [ ] `executor.ts` pipeline fully understood — phases at lines:
  pre-flight/init (≈225–288), component install (≈329–352), Phase 3 mesh
  (`executeMeshPhase` ≈374), Phase 4 env/config (≈398), Phase 5 config sync
  (`syncEdsConfigToRemote` ≈407), Phase 5b content (`setupEdsContent` ≈411)
- [ ] `resolveFrontendSource` (≈974) — how the frontend source is chosen
- [ ] Steps 1–3 complete

---

## Reuse map

- **storefront-setup phase orchestration** (`storefrontSetupPhases.ts`) + **`GitHubRepoOperations.createFromTemplate`** — the joiner's repo is generated **from the master** via the EXISTING phases (template source = master); **no new pipeline phase**.
- **`executor.ts`** pipeline — branch additively: skip `executeMeshPhase`; **reuse** Phase 4 (`configGenerator`), Phase 5 (config sync), Phase 5b (`ensureEdsContent`), and `populateEdsMetadata`.
- **`resolveFrontendSource`** — reuse its source-shape for sourcing from `upstream`.
- **Net-new:** the content-flow skip-guards (gated on `isContentFlow`).

---

## Tests to Write First

### Characterization (write BEFORE branching — Risk 1 guard)
### Integration: `tests/.../executor-commerce-regression.test.ts`
- [ ] **Commerce/EDS path still runs Phase 3 mesh** when a mesh component is
  present (capture current behavior so the branch can't regress it).

### Integration: `tests/.../executor-content-flow.test.ts`
- [ ] **Content flow uses the upstream as the frontend source**
  (`resolveFrontendSource` returns `{owner,repo}` from `config.upstream`).
- [ ] **Content flow skips Phase 3** — `executeMeshPhase` is not invoked / no
  mesh deploy attempted (no Adobe auth/mesh CLI calls).
- [ ] **Content flow skips backend deploy** but still **runs Phase 5 config
  sync** and **Phase 5b DA.live content**.
- [ ] **Content project is saved with `flow:'content'` + `upstream`** populated.

---

## Files to Create/Modify
- [ ] `src/features/project-creation/handlers/executor.ts` — content branch
- [ ] `tests/.../executor-content-flow.test.ts` — new
- [ ] `tests/.../executor-commerce-regression.test.ts` — new

---

## Implementation Details

### RED
Characterization test for commerce first (must pass against current code), then
the content-flow tests (fail — no branch yet).

### GREEN
Introduce a single guarded segment using the Step-1 predicate:
```typescript
const isContent = isContentFlow(typedConfig); // flow === 'content'
```
- **Frontend source:** extend `resolveFrontendSource` so that when `isContent`
  and `typedConfig.upstream` is set, the source is the upstream repo
  (`{ type:'git', url: https://github.com/{owner}/{repo}.git, branch:'main' }`).
  This mirrors the existing EDS `repoUrl` branch — reuse the same shape.
- **Phase 3 (mesh):** wrap the `executeMeshPhase(...)` call so it is skipped when
  `isContent` (content forks point at the Commerce SC's backend by URL; no mesh).
- **Backend deploy:** content flow does not run any backend provisioning; it
  only writes coordinates (Step 5). Ensure no mesh/backend CLI path is reachable
  for content.
- **Phases 4 / 5 / 5b:** leave intact — content forks still generate `config.json`
  (Step 5 seeds the coords), sync it to GitHub (Phase 5), and populate DA.live
  content (Phase 5b via `ensureEdsContent`).

Keep the branch **narrow and early-exit-shaped** where possible (skip-guards),
so commerce logic is never altered — only bypassed for content.

### REFACTOR
- If the mesh-skip + backend-skip guards clutter the main function, extract a
  small `shouldRunMeshPhase(typedConfig)` predicate (returns `false` for content)
  rather than inlining conditionals.
- Do **not** restructure the pipeline into a strategy pattern (YAGNI / guardrail
  — one discriminator, not a framework).

---

## Acceptance Criteria
- [ ] Commerce/EDS characterization test green before and after the change.
- [ ] Content flow: upstream source used, mesh skipped, backend deploy skipped,
  Phase 5 + 5b still run.
- [ ] Saved content project has `flow` + `upstream`.
- [ ] Full build + existing executor tests green.

**Estimated time:** 6–8 hours
