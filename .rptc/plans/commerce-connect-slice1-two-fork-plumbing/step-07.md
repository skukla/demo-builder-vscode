# Step 7: Dashboard Predicate — Minimal-Additive `(product, ownership)` Migration

**Purpose:** Introduce the per-`(product, ownership)` predicate the design calls
for, and route **only the content-flow entry sites** through it — **PM decision
D3 (minimal additive)**. The other ~18 `isEds` call sites are left untouched;
`isEds` stays correct for commerce/EDS projects. This unblocks a content project
rendering correctly on the dashboard without a 20-file refactor.

**Prerequisites:**
- [ ] The ~20 `isEds` sites enumerated (from the code-walk): `typeGuards.ts` +
  ~19 sites across `projects-dashboard/`, `dashboard/`, `eds/`,
  `project-creation/`, `ai/`
- [ ] Identify the **minimal set** of sites a content project actually hits when
  created and shown: the creation/dashboard render path (e.g.
  `projects-dashboard` card/row + `dashboard` action grid entry). Confirm the
  exact sites during RED.
- [ ] Steps 1–6 complete

---

## Tests to Write First

### Unit: `tests/.../projectArchetype.test.ts`
- [ ] **`getProjectArchetype(project)`** returns a `{ product, ownership }`
  descriptor: e.g. `{ product:'storefront', ownership:'content' }` for a content
  fork, `{ product:'storefront', ownership:'commerce' }` for an EDS commerce
  project, and a sensible default for legacy/non-EDS.
- [ ] Built on the Step-1 flow predicate (content vs commerce) + existing
  `isEds`/stack signals — no new source of truth.

### Integration: `tests/.../dashboard-content-project.test.tsx`
- [ ] **A content-flow project renders** on the dashboard via the new predicate
  (no crash, correct archetype-driven labels/actions at the migrated sites).
- [ ] **Commerce/EDS projects unchanged** at the migrated sites (regression).

---

## Files to Create/Modify
- [ ] `src/types/typeGuards.ts` — add `getProjectArchetype` (composes
  `getProjectFlow` + existing EDS/stack guards)
- [ ] The **confirmed minimal** content-flow entry sites only (dashboard
  card/row + action-grid entry) — route through `getProjectArchetype`
- [ ] `tests/.../projectArchetype.test.ts`, `tests/.../dashboard-content-project.test.tsx`

**Explicitly out of scope:** migrating the remaining `isEds` sites (deferred to a
later JIT cleanup once Slice 2 confirms the predicate shape).

---

## Implementation Details

### RED
Write the archetype predicate tests + a dashboard render test for a content
project; both fail.

### GREEN
- Add `getProjectArchetype` returning `{ product, ownership }`, derived from
  `getProjectFlow` (ownership: content vs commerce) and existing product signals
  (EDS storefront vs other). Keep it a thin composition — **not** a new registry.
- At the minimal content-entry sites, replace the local `isEds`-only branch with
  an archetype check so a content fork is recognized and rendered.

### REFACTOR
- Keep `isEds` intact and unchanged elsewhere — the predicate is additive.
- Leave a short code comment + a plan note pointing at the deferred full
  migration so the half-migrated state is intentional and discoverable.

---

## Acceptance Criteria
- [ ] `getProjectArchetype` covered 100%; composes existing predicates.
- [ ] A content-flow project renders correctly at the migrated entry sites.
- [ ] All non-migrated `isEds` sites unchanged; commerce/EDS dashboard unchanged.
- [ ] Deferred-migration note recorded.

**Estimated time:** 4–6 hours
