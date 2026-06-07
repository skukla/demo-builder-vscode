# Step 7: Dashboard Predicate — Minimal-Additive `(product, ownership)` Migration

**Status: ✅ Predicate + minimal routing shipped (2026-06-07).** `getProjectArchetype` in `typeGuards` (composes `getProjectFlow` + `isEdsStackId`) — 5/5 tests. The content-flow entry sites are now wired (PM decision: **badge + hide upstream-mutating actions**):
- **`ProjectCard`** (home grid) shows a "Shared from owner/repo" badge when `getProjectArchetype(project).ownership === 'content'`; commerce cards unchanged. Upstream also appended to the card aria-label.
- **`ProjectDashboardScreen`** hides the two repo-mutating EDS actions — **Sync Storefront** + **Refresh Block Library** — for a content (satellite) project (it references the upstream's code but doesn't own that repo). Threaded a new `isContentFlow` prop: `showDashboard.getInitialData` computes `getProjectFlow(project) === 'content'` → `index.tsx` → screen, reusing ActionGrid's existing `handler && ` gates (no ActionGrid change).
- The other ~18 `isEds` sites left untouched (minimal-additive, PM decision D3). 4 new tests (2 card badge, 2 action-hiding incl. commerce regression) + 1019 dashboard/predicate regression + tsc/eslint/compile green. **F5: confirm the badge renders + the two actions are absent on a joined project.**

> **2026-06-05 repivot reframe:** Survives unchanged under repoless. The predicate composes `getProjectFlow` (topology-neutral, see Step 1) with `isEdsStackId` (stack-shape, not topology). A content-flow EDS project renders the same dashboard whether it was created via fork-and-sync (old) or Configuration Service satellite (new) — same archetype, same UI surfaces. No code change required. The deferred F5 routing work proceeds as planned.

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

## Reuse map

- **`src/types/typeGuards.ts`** — add `getProjectArchetype` composing `getProjectFlow` + existing `isEds`/stack guards; leave the other ~19 `isEds` sites untouched.
- **projects-dashboard components** (`ProjectCard` / `ProjectRow` / `ProjectActionsMenu`) — route only the content-flow entry sites through the archetype predicate; reuse their existing rendering.
- **Net-new:** the archetype predicate + the minimal call-site migration.

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
  an archetype check so a content-flow project (repoless satellite) is recognized and rendered.

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
