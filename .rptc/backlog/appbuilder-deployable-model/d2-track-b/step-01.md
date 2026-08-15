# Step 01 — Catalog-driven selection model + "what user provides" classifier

**Purpose:** Build the pure, side-effect-free data backbone that BOTH the wizard picker (Step 03) and
the dashboard list (Step 05) sit on, plus the Configure-collection classifier (Step 04). No UI, no I/O.
This is the load-bearing seam: every downstream step consumes these functions, so it lands first and
stays green in isolation.

It produces two things:
1. **Catalog selection helpers** — turn `getAvailableDeployables(backend, frontend)` into a list the
   pickers render, applying the package's required/optional rule (generalize today's `requiresMesh`
   logic + mirror block-libraries' `nativeForPackages`/`onlyForPackages`).
2. **The 3-bucket env classifier** — given a deployable's `envSchema`, partition each var into
   `auto-provisioned` (skip), `auto-wired` (`providedBy` → show "connected"), or `user-provided` (ask),
   and split bucket 3 into `text` vs `secret`. This is the spec from D1 findings §"D2 UX rule".

## Prerequisites

- Step 00 complete (baseline GREEN).
- Reuse (do NOT fork): `deployableCatalogLoader.ts` (`getAvailableDeployables`,
  `getDeployableEntry`, `getDeployableEnvSchema`), `types/deployables.ts`
  (`DeployableCatalogEntry`, `DeployableEnvVar`), and the package-requirement precedent
  `getResolvedMeshRequirement` (`demoPackageLoader.ts:238`).

## Tests to write FIRST (RED)

**File:** `tests/unit/features/project-creation/services/deployableSelection.test.ts`

- [ ] `getSelectableDeployables(pkg, backendId, frontendId)` returns the catalog filtered by axis
      (delegates to `getAvailableDeployables`) annotated with a per-entry `requirement`
      (`'required' | 'optional'`), resolved from the package config.
- [ ] An entry the package marks **required** → `requirement:'required'` (auto-included, shown locked).
- [ ] An entry the package marks **optional** → `requirement:'optional'` (toggleable).
- [ ] Mesh resolves through the SAME path: a package with `requiresMesh:'optional'` yields the mesh entry
      as `optional`; `requiresMesh:true` yields `required` (proves the generalization of today's toggle).
- [ ] `nativeForPackages`/`onlyForPackages`-style scoping: an entry restricted to other packages is
      excluded; an entry native to this package is `required` (mirror block-library scoping — Boundary).
- [ ] Empty catalog / no axis match → `[]` (Edge).

**File:** `tests/unit/features/project-creation/services/envVarClassifier.test.ts`

- [ ] `classifyEnvSchema(schema)` returns `{ autoProvisioned, autoWired, userText, userSecret }`.
- [ ] A var with `providedBy` → `autoWired` (never asked); carries the provider id for the "connected" UI.
- [ ] A var with `derivedFrom` → `userText` IF not already known, else `autoProvisioned` — see decision
      note below; for Step 01 treat `derivedFrom` as `autoProvisioned` (bucket 1: derived from existing
      backend/connect-commerce config, never asked). Seed meshes are all `derivedFrom:'connect-commerce'`
      → classifier yields **zero** `userText`/`userSecret` (the documented "mesh = zero new input" case).
- [ ] `type:'secret'` with no `providedBy`/`derivedFrom` → `userSecret`.
- [ ] `type:'text'` with no `providedBy`/`derivedFrom` → `userText`.
- [ ] Empty schema → all four buckets empty (Edge).

## Implementation (GREEN)

Create:
- `src/features/project-creation/services/deployableSelection.ts`
  - `SelectableDeployable = DeployableCatalogEntry & { requirement: 'required' | 'optional' }`.
  - `getSelectableDeployables(pkg, backendId, frontendId): SelectableDeployable[]`.
  - A small `resolveRequirement(pkg, entry)` that reuses the package-config precedent (the `requiresMesh`
    semantics generalized to any deployable id; mirror `getResolvedMeshRequirement`'s
    storefront-overrides-package precedence and the block-library `nativeForPackages`/`onlyForPackages`
    scoping). Keep it under 50 lines / complexity < 10; no nested ternaries.
- `src/features/project-creation/services/envVarClassifier.ts`
  - `classifyEnvSchema(schema: DeployableEnvVar[]): ClassifiedEnvSchema`.
  - `ClassifiedEnvSchema` exported for Step 04's collection surface.

REFACTOR: extract the axis/precedence predicates only if duplicated 3×; otherwise inline.

## Files

| File | Action |
|---|---|
| `src/features/project-creation/services/deployableSelection.ts` | create |
| `src/features/project-creation/services/envVarClassifier.ts` | create |
| `tests/unit/.../deployableSelection.test.ts` | create |
| `tests/unit/.../envVarClassifier.test.ts` | create |

## Dependencies / ordering

- Blocks Steps 03, 04, 05 (all consume these helpers). No runtime dependency on Track A.

## Risks

- **`derivedFrom` ambiguity** (LOW): is a `derivedFrom` var bucket-1 (auto) or bucket-3 (ask-if-unknown)?
  D1 findings classify it as auto-provisioned for seed meshes (`connect-commerce`). DECISION: treat
  `derivedFrom` as `autoProvisioned` in Step 01 (zero-input mesh). If a future deployable needs
  "derive-or-ask", add that branch then (YAGNI). Documented in the classifier docstring.
- **Package-config schema drift** (LOW): `requiresMesh` is mesh-specific today. Generalizing the
  requirement rule must not change existing mesh behavior — the mesh tests above lock that.

## Self-critique (KISS/YAGNI)

- Two pure modules, no abstraction beyond plain functions. No new types beyond two result shapes.
- Does NOT generalize the package config schema itself (no new JSON fields) — reuses the existing
  `requiresMesh`/block-library scoping precedents. Avoids speculative "per-deployable required flag in
  every package" until a second non-mesh required deployable exists (Rule of Three).

## Acceptance criteria

- Both modules fully unit-tested (happy/edge/boundary); mesh round-trips identically through the
  generalized path; seed-mesh classification yields zero user-input fields. `tsc`/`lint`/jest green.
