# Implementation Plan: Commerce-Connect Slice 1 — Two-Fork Plumbing (DA.live content)

## Status Tracking

- [ ] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2026-06-04
**Last Updated:** 2026-06-04

---

## Executive Summary

**Feature:** The first buildable slice of the two-SC synced storefront — the
**two-fork plumbing**, exercised with **DA.live content** so it ships *without*
an AEM environment. This proves the architecture end-to-end; Slice 2 (AEM Sites
as a content source) slots into the same plumbing once the verification spike
passes.

**Design source of truth:**
- `.rptc/backlog/commerce-connect-aem-sc/overview.md`
- `.rptc/backlog/commerce-connect-aem-sc/storefront-topology.md` (locked architecture)
- `.rptc/backlog/commerce-connect-aem-sc/synthesis-and-build-order.md` (design → code)

**Approach (additive, per the guardrails):** introduce a `flow` discriminator
(`'commerce' | 'content'`) and an `upstream` reference on the project model, add
a second wizard entry for the content SC that **reuses** the existing
`WizardContainer`, filter steps by flow, and branch the existing executor to
**fork-from-upstream + skip mesh/backend-deploy** while **reusing** the existing
config-sync (Phase 5) and DA.live content (Phase 5b) machinery. Content forks
sync from the upstream via the **existing** `TemplateSyncService`.

**What we are NOT building (YAGNI guardrail):** the general compositional
framework, a plugin architecture, AEM Sites as a content source (Slice 2),
mirrored-package config (Slice 3+), two-way contribution, or a full migration of
every `isEds` call site. Each step extends an existing slot additively.

**Estimated Complexity:** Medium-Complex
**Estimated Timeline:** 4–6 days

**Key Risks:**
1. Branching `executor.ts` (a long linear pipeline) without regressing the
   commerce/EDS path.
2. The `flow` discriminator interacting with the existing stack-property step
   filtering (`requiresGitHub`/`requiresDaLive`/`requiresAdobeAuth`).
3. Cross-account backend-coordinate acquisition (PaaS vs ACCS discovery
   asymmetry).
4. Sync reliability when forks carry locally-customized (AI-authored) code.

---

## Design References

**Locked architecture:** Scenario B · Option X · two identical transacting forks
(`storefront-topology.md`). A neutral **upstream** holds shared storefront code;
both SCs **fork + sync**; each authors their own content; both transact against
the Commerce SC's backend by URL.

**Current → target diff (from `synthesis-and-build-order.md`), reconciled with a
fresh code-walk on `develop`:**

| Flow | Current (verified file) | Delta | Attach point |
|---|---|---|---|
| Wizard | `WizardContainer.tsx`, `stepFiltering.ts` | EXTEND | 2nd entry command reusing the container; flow discriminator; flow-aware filtering |
| Executor | `features/project-creation/handlers/executor.ts` (single linear pipeline, `isEdsStack` branches) | EXTEND | add `flow`; content branch = fork-from-upstream + skip mesh (Phase 3) + skip backend deploy; reuse Phase 5/5b |
| Project model | `src/types/base.ts:42` (`Project`) | EXTEND | add `flow`, `upstream{owner,repo}` |
| Content source | DA.live today (`fstabGenerator.ts`, `edsPipeline.ts`, `ensureEdsContent`) | REUSE | Slice 1 stays on DA.live |
| Sync | `features/updates/services/templateSyncService.ts` (merge w/ reset-fallback; preserves `config.json`/`fstab.yaml`) | REUSE | set `templateOwner/templateRepo` = upstream; default `reset` for content |
| Connect-Commerce | `ConnectStoreStepContent.tsx` → `discover-store-structure` → `commerceStoreDiscovery.ts` → `configGenerator.ts` | REUSE | content fork seeds coords from upstream `config.json`, confirm/override via discovery |
| Dashboard | `isEds` across ~20 files (`typeGuards.ts` + ~19 sites) | EXTEND (minimal) | per-(product, ownership) predicate; migrate only the content-flow entry sites |

**Path corrections to the design doc's file map (verified on `develop`):**
- The wizard entry is **not** `src/commands/createProjectWebview.ts`; it is
  launched via `src/commands/commandManager.ts` + `src/commands/handlers/`.
- `stateManager` lives at `src/core/state/stateManager.ts` (not `src/utils/`).
- `isEds` now spans **~20 files**, not ~10.

---

## PM Decisions

| # | Question (from synthesis "Open product questions") | Decision | Rationale |
|---|---|---|---|
| D1 | How does a content fork obtain the Commerce SC's backend coordinates? | **Both** — seed from the **upstream repo's `config.json`** (read), confirm/override website/store/store-view via the **existing `discoverStoreStructure` flow**. Reuses `commerceStoreDiscovery.ts` + `ConnectStoreStepContent`. | No manual coordination (upstream-seeded) + reuses proven machinery. PaaS discovery is URL+admin-creds (org-agnostic). **Caveat:** ACCS cross-account discovery needs the caller's IMS token + a discovery service provisioned for the Commerce org. |
| D2 | Sync conflict strategy for a content fork? | Default **`reset-to-upstream`**; keep `merge`-with-reset-fallback available; "promote to upstream" is the durable path (later slice). | Reliable *by construction*: content lives in DA.live/AEM (not the repo) and wiring files are preserved, so reset never destroys the SC's real work. Arbitrary two-way auto-merge of AI-divergent code is not reliably solvable — the model routes durable code changes through the upstream instead. |
| D3 | How much `isEds` predicate centralization in Slice 1? | **Minimal additive** — introduce the predicate helper, migrate only the content-flow entry sites (creation + dashboard render), leave the other ~18 `isEds` sites. | Guardrails ("extend additively", "neutral but thin", YAGNI). Avoids mixing a 20-site refactor with new behavior and locking the predicate shape before Slice 2 informs it. |

---

## Test Strategy

- **Framework:** Jest + ts-jest (Node), @testing-library/react (UI).
- **Coverage Goal:** 85% overall; 100% on the flow predicates and step-filtering
  logic.
- **Distribution:** Unit (75%), Integration (20%), E2E/manual (5%).

**Test categories:**
1. **Flow predicates** (unit) — `getProjectFlow`, `isContentFlow`,
   `isCommerceFlow` over commerce/content/legacy projects.
2. **Step filtering** (unit) — content flow hides prerequisites + mesh; commerce
   flow unchanged (regression).
3. **Executor branch** (integration) — content flow uses upstream as the frontend
   source, skips Phase 3 (mesh), skips backend deploy, still runs Phase 5/5b.
4. **Backend coords** (unit/integration) — seed from upstream `config.json`;
   discovery/override path; PaaS vs ACCS gating.
5. **Sync wiring** (unit) — content metadata sets `templateOwner/Repo` = upstream;
   default strategy = `reset`.
6. **Dashboard predicate** (unit) — content-flow project routes through the new
   predicate; commerce/EDS projects unchanged.

**Regression guard:** the existing commerce/EDS creation path must be untouched —
every executor/filtering/predicate change is gated on `flow === 'content'` (or a
predicate) and defaults to today's behavior when `flow` is absent.

---

## Implementation Constraints

- **File size:** <500 lines/file; **complexity:** <50 lines/function.
- **Timeouts:** use `TIMEOUTS.*` from `@/core/utils/timeoutConfig` — no magic
  numbers (SOP `code-patterns.md`).
- **Imports:** path aliases across boundaries, relative within feature (SOP).
- **Dependencies:** REUSE `TemplateSyncService`, `discoverStoreStructure`,
  `configGenerator`, `ensureEdsContent`, `WizardContainer`, `filterStepsForStack`.
  **No new npm packages.**
- **Additive only:** absent `flow` ⇒ identical to today's commerce/EDS behavior.

---

## Risk Assessment

### Risk 1 — Regressing the commerce/EDS executor path
- **Likelihood:** Medium · **Impact:** High · **Priority:** Critical
- **Mitigation:** every content branch is gated; add a characterization test of
  the existing EDS path *before* branching (Step 4 RED); default-when-absent.
- **Contingency:** keep the content branch as an early `if (isContentFlow) {…
  return}` segment that never falls through to commerce logic.

### Risk 2 — `flow` vs stack-property step filtering
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** model flow as an additional `StepCondition` predicate composed
  with the existing stack checks, not a replacement; unit-test both flows.

### Risk 3 — Cross-account backend coordinates (PaaS vs ACCS)
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** Slice 1 primary path is upstream-`config.json` seeding (works
  offline of the Commerce org); discovery/override is the seam. Record the ACCS
  discovery-service prerequisite; do not block Slice 1 on it.

### Risk 4 — Sync reliability with AI-customized forks
- **Likelihood:** High (long-term) · **Impact:** Medium · **Priority:** Medium
- **Mitigation:** default `reset-to-upstream` for content forks (safe — content
  is external); preserve `config.json`/`fstab.yaml` (already done); document
  "promote durable code changes to upstream" as the model, not per-fork merge.
- **Contingency:** `merge`-with-reset-fallback already exists for forks that must
  attempt to keep local code.

---

## File Reference Map

### Existing files (to modify)
- `src/types/base.ts` — add `flow`, `upstream` to `Project` (Step 1)
- `src/types/typeGuards.ts` — add flow predicates (Step 1, 7)
- `src/features/project-creation/handlers/executor.ts` — `ProjectCreationConfig` + content branch (Steps 1, 4, 5)
- `src/commands/commandManager.ts` + `src/commands/handlers/` — register content-SC entry (Step 2)
- `src/features/project-creation/ui/wizard/stepFiltering.ts` — flow-aware condition (Step 3)
- `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` — content-flow seeding/override (Step 5)
- `src/features/eds/services/configGenerator.ts` — accept upstream-seeded coords (Step 5)
- `src/features/updates/services/templateSyncService.ts` — content default strategy (Step 6, additive)
- Dashboard content-flow entry sites only (Step 7) — TBD-confirmed in step

### New files (to create)
- `src/commands/handlers/createContentScProjectWebview.ts` (or equivalent handler) — Step 2
- Test files mirroring each (see step files)

### Net-new explicitly deferred (NOT this slice)
- AEM Sites content-source service/variant (Slice 2)
- Mirrored-package config, App Builder add-flow, two-way contribution (Slice 3+)

---

## Assumptions

- [ ] **A1:** `aem-boilerplate-xcom`-style upstream is reachable as a normal Git
  template/source (Slice 1 can use any DA.live-capable boilerplate to prove
  plumbing). *Impact if wrong:* fork-from-upstream source resolution changes.
- [ ] **A2:** The upstream repo's `config.json` carries usable backend
  coordinates to seed from. *Impact if wrong:* fall back to discovery/manual
  entry only (D1 still holds via the override path).
- [ ] **A3:** `TemplateSyncService` syncing from the upstream (vs the original
  template) needs only the `templateOwner/templateRepo` metadata to point at the
  upstream. *Impact if wrong:* add an explicit `upstreamRepo` metadata field.

---

## Next Actions

**After plan approval:**
1. Step 1 — Project model: flow + upstream + predicates (`step-01.md`)
2. Step 2 — Content-SC wizard entry (`step-02.md`)
3. Step 3 — Flow-aware step filtering (`step-03.md`)
4. Step 4 — Executor content branch (`step-04.md`)
5. Step 5 — Content-fork backend coordinates (`step-05.md`)
6. Step 6 — Upstream sync wiring + reset default (`step-06.md`)
7. Step 7 — Dashboard predicate (minimal additive) (`step-07.md`)
8. Quality gates (Efficiency + Security)

**First step:** `/rptc:tdd "@commerce-connect-slice1-two-fork-plumbing/"`

---

## Plan Maintenance

Living document. Small adjustments inline + note in a "Deviations" section;
major changes via `/rptc:helper-update-plan`. Request a replan if the `flow`
discriminator proves insufficient (e.g., the executor needs a true strategy
split) or if Slice 2's content-source shape forces the predicate to change.
