# Audit: project-level facts stored per-component in `componentConfigs`

**Filed:** 2026-08-11, during the duplicated-Commerce-scope fix.

## Provenance

`componentConfigs` is keyed by **who consumes a value**, not by **what the value is**:
`{ componentId → { envVar → value } }`. When several components declare the same env var,
the same fact is stored once per component. Configure renders ONE field per key and fans its
value out to every declaring component on save
(`useConfigureFieldValues.ts` → `writeToComponents(prev, field.componentIds, …)`).

That is fine for values that genuinely differ per component. It is a single-source-of-truth
violation for values that are **project-level** — and it has already failed once in the
textbook way. On 2026-08-10 a user moved a project to the `citisignal` website, only the
backend's copy updated, and the answer then depended on which copy a resolver happened to
read: the mesh deployed against the previous website, PDPs returned 200 with an empty product
block, and both republish and mesh deploy reported success.

`BACKEND_OWNED_SCOPE_KEYS` + `backendOwnedScope.ts` is the **mitigation** for that one family
— a rule saying "when the copies disagree, believe the backend." Its own docstring records
that three resolvers hand-rolled the rule and the third got it wrong. The scope family is
being fixed properly (write to the backend only, plus a migration). **This item is the
general case: which OTHER facts sit in the same shape.**

Corroborating, from a different angle:
`.rptc/complete/pdp-prerender-validation/HANDOFF.md:98` — "12 of the detector's 13 watched keys
are declared by more than one component."

## Goal / Scope

Decide, per multi-owner env var, whether it is a project-level fact that should have ONE
stored copy — and fix the ones that are.

### Measured surface (2026-08-11, from `components.json`)

- **25** env vars declared across all components
- **17** declared by more than one component
- **6** of those already covered by `BACKEND_OWNED_SCOPE_KEYS` (being fixed separately)
- **11** not covered — this item

| Env var | Declaring components |
|---|---|
| `ADOBE_COMMERCE_URL` | `adobe-commerce-paas`, `eds-commerce-mesh`, `headless`, `headless-commerce-mesh` |
| `ADOBE_CATALOG_API_KEY` | `adobe-commerce-paas`, `eds-commerce-mesh`, `headless`, `headless-commerce-mesh` |
| `ADOBE_COMMERCE_ENVIRONMENT_ID` | `adobe-commerce-paas`, `eds-commerce-mesh`, `headless`, `headless-commerce-mesh` |
| `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` | `adobe-commerce-paas`, `eds-commerce-mesh`, `headless-commerce-mesh` |
| `ADOBE_CATALOG_SERVICE_ENDPOINT` | `eds-commerce-mesh`, `headless-commerce-mesh` |
| `ACCS_GRAPHQL_ENDPOINT` | `adobe-commerce-accs`, `eds-accs-mesh` |
| `ACO_API_KEY` / `ACO_API_URL` / `ACO_ENVIRONMENT_ID` / `ACO_TENANT_ID` | `adobe-commerce-aco`, `commerce-demo-ingestion` |
| `MESH_ENDPOINT` | `eds-storefront`, `headless` |

Reproduce the table by walking `requiredEnvVars` + `optionalEnvVars` in
`src/features/components/config/components.json` and counting owners per key.

### The precise question to ask of each

Not "is it duplicated" — they all are.

**A first pass asked "is there a second writer that updates fewer than all copies?" and that
question is WRONG.** Answered 2026-08-11: there is no such writer. Only two things write
`project.componentConfigs` — `configure.ts:305` (whole-map replace) and `executor.ts:1179`
(creation reset) — and `MESH_ENDPOINT` is not stored per-component at all; it resolves at
render time from the keyed mesh entry (`configGenerator.ts:280`, `envFileGenerator.ts:175`),
which is already the single-source model. By that test none of the 17 can drift, yet the scope
keys demonstrably did.

**The real mechanism is the fan-out TARGET SET.** Configure's write targets come from
`collectFields`, which walks **`selectedComponents`** — not "every component holding a copy."
A component that holds a config copy but is missing from the selection lists is invisible to
Configure's rail, so its copy is never updated while the others are. That is documented in the
loader itself: the dashboard add path "records the keyed entry and the component instance but
never wrote the selection lists, so a mesh or integration added there is invisible to
Configure's rail" — the reason `reconcileComponentSelections` exists.

That mechanism is **key-agnostic**: it applies to all 17 multi-owner keys, not just the 6 scope
ones. A drifted `ADOBE_COMMERCE_URL` or `ADOBE_CATALOG_API_KEY` is at least as damaging as a
drifted website code.

### So there are two candidate fixes — audit the second BEFORE repeating the first

1. **Per-key single-sourcing** — what shipped for `BACKEND_OWNED_SCOPE_KEYS`
   (`resolveWriteTargets` + `stripDuplicateBackendOwnedScope`). Correct, but needs repeating
   per key.
2. **Fix the fan-out** — derive write targets from components that *declare or already hold*
   the key, rather than from what is currently selected. One change, every key, and it
   dissolves the mechanism instead of the symptom.

**Do (2) first.** If it holds up it may make most of (1) unnecessary. The scope fix stands
regardless: single-sourcing a project-level fact is right on its own merits, and it is the only
one of the 17 with a demonstrated failure.

## Execution plan

1. **Reproduce the drift mechanism.** Construct a project where a component holds a config
   copy but is absent from the selection lists, edit the shared field in Configure, and
   confirm the absent component's copy goes stale. If that does not reproduce, the whole
   premise needs rechecking before any code moves.
2. **Try fix (2): widen the fan-out target set** in `collectFields` / `resolveWriteTargets` to
   include components that already hold the key, not only selected ones. Measure what it
   covers.
3. Regenerate the owner table (the numbers above drift as components change).
4. Classify what fix (2) does not cover: **project-level** (one stored copy, resolve at
   render) vs **genuinely per-component** (leave alone) vs **derived** (should not be stored
   at all).
5. For each remaining project-level key, follow the scope-key fix: single writer + read-side
   resolution + a load-time migration that strips duplicates ONLY where the owner defines the
   key.
6. Prefer extending the existing `backendOwnedScope` mechanism over inventing a second one —
   unless the owner is not the backend, in which case generalize the module rather than fork it.

### Also worth checking while in here

`updateField`'s linked-field write puts the DERIVED key's value on the SOURCE field's
component list: typing `ADOBE_COMMERCE_URL` writes `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` to
`ADOBE_COMMERCE_URL`'s four components, while only three declare it. The sets happen to be a
superset today so every declarer is covered, but it also writes the key onto `headless`, which
does not declare it. Harmless now; wrong by construction.

## Constraints

- **A migration alone fixes nothing.** The duplicates are re-written on every Configure save;
  the write side must change first. That mistake is what made the original scope item
  ("a migration dropping the duplicate copies would dissolve the bug class") unimplementable
  as written.
- **Never strip a duplicate when the designated owner does not define the key** — the value is
  then lost, not deduplicated.
- **Do not restructure `componentConfigs` wholesale.** Per-component storage is correct for
  per-component values; only the project-level subset is wrong. A general rewrite is a much
  larger change than this item scopes.
- Each `.env` still legitimately contains the value — three consumers needing one setting is
  not duplication. Only the SOURCE should be single.

## Kickoff prompt

> Audit which project-level facts are stored per-component in `componentConfigs`. Read
> `.rptc/backlog/2026-08-11-project-level-facts-stored-per-component.md` for the measured
> surface and the classification question. Regenerate the owner table first (it drifts), then
> for each multi-owner key find every writer other than Configure's `writeToComponents` — a
> key written only through Configure cannot drift, so a second direct writer is what makes one
> a real bug. Fix the project-level ones the way the Commerce scope keys were fixed: single
> writer, read-side resolution, and a load-time migration that strips duplicates only where the
> owner defines the key. Start with `MESH_ENDPOINT`, which already has a second write path.
