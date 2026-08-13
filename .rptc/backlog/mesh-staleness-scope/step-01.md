# Step 01 — One backend-first scope resolver, used by all three sites

The load-bearing step. Ships value alone; if the work stops early, stop after this.

## Why

`BACKEND_OWNED_SCOPE_KEYS` documents the rule and names the reason: website / store /
store-view codes are duplicated across component configs and **only the backend's copy is
updated** when the user changes them. `4b517cfb` applied it to two resolvers. The mesh
staleness detector is a third and still lets `Object.assign` iteration order pick.

The danger is the inverse of the reported symptom. The observed case was a *correct* stale
flag reached by luck (`adobe-commerce-accs` happens to sort last). Flip the order and the
detector compares the deployed snapshot against the mesh's own stale duplicate, finds them
equal, and reports **clean** while the mesh queries a website with no products — the exact
failure `4b517cfb` was filed for, on the surface whose job is catching it.

## Change

1. Extract the backend-first lookup into a shared function. Today it exists twice:
   - `envFileGenerator.ts:135` `resolveFromComponentConfigs` — backend first for scope
     keys, then first-component-wins
   - `configGenerator.ts:269` — its own loop over `BACKEND_OWNED_SCOPE_KEYS`

   Put the shared one next to the keys it enforces (`features/components/`), so a reader
   of `BACKEND_OWNED_SCOPE_KEYS` finds the enforcement beside the rule.

2. Replace the staleness flatten with it. Keep what the flatten was FOR — the comment
   says cross-boundary vars like the PaaS GraphQL endpoint live under the backend, not the
   mesh — so non-scope keys keep their reach across all components. Only the *tiebreak for
   scope keys* changes.

3. Leave `getRelevantMeshEnvVars` alone. Per-mesh-type scoping (ACCS vs PaaS) exists to
   stop cross-backend vars producing false mismatches and is unrelated.

## Tests

New `tests/features/mesh/services/stalenessDetector-scope.test.ts`. **Two must fail
before the fix**; verify that, and verify they fail on the assertion rather than a setup
error.

| Case | Expect | Today |
|---|---|---|
| Snapshot matches the mesh's STALE copy; backend differs | stale | **passes clean — the bug** |
| Same disagreement, `componentConfigs` keys in the opposite order | same verdict both ways | **differs by order** |
| Backend and mesh agree; snapshot matches | clean | passes |
| Backend-side value changed since deploy | stale | passes |

The last two are controls: without them, "always return stale" satisfies the first two.

Also add a direct unit test for the extracted resolver — backend wins for a scope key,
first-component-wins for a non-scope key, undefined when nobody defines it.

`envFileGenerator` and `configGenerator` keep their existing suites **unedited**. That is
the proof the extraction was behaviour-preserving for them.

## Done when

- `changedEnvVars` is correct regardless of `componentConfigs` key order
- One resolver, three call sites; no fourth hand-rolled copy
- The two failing tests pass and the two controls still pass
- `envFileGenerator` / `configGenerator` suites green without edits
- `gate` green
