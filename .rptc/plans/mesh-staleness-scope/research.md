# Mesh staleness is the third scope-key resolver, and it never got the rule

`BACKEND_OWNED_SCOPE_KEYS` exists because website / store / store-view codes are
duplicated across component configs and **only the backend's copy is updated** when the
user changes them. Its docstring is explicit:

> Any new resolver over `componentConfigs` must consult the backend first for these keys.

Two resolvers were fixed on 2026-08-10 (`4b517cfb`): `envFileGenerator`'s value lookup and
`configGenerator`. **A third was missed** — the mesh staleness detector, which flattens
every component's config with `Object.assign` and lets iteration order pick the winner.

## Provenance

Found 2026-08-10 on live `demo-builder-test`. The user asked why the mesh read
"Update available". Initial diagnosis was wrong in two ways and both corrections matter:

- First read: "deploy and staleness read different sources, pick one." **Wrong** — the
  project already decided. `BACKEND_OWNED_SCOPE_KEYS` is the rule; staleness just doesn't
  follow it.
- Second: "redeploying cannot clear it." **Wrong** — the keyed deploy runner regenerates
  the component `.env` *before* deploying (`appBuilderComponentRunner.ts:330`
  `writeComponentEnv` → `deployMesh` → `captureMeshBaseline`), and that regeneration is
  backend-first. A redeploy converges all three sources.

On that project the badge was **correct**: the mesh was deployed against `base` /
`main_website_store` / `default` while the project is configured for `citisignal` /
`citisignal_store` / `citisignal_us` — the same misconfiguration class as `4b517cfb`,
where a mesh querying a website with no products returned valid-but-empty PDPs.

## The defect

`detectMeshChangesImpl` (`src/features/mesh/services/stalenessDetector.ts` ~:506):

```ts
// Check env vars changes - merge ALL componentConfigs for cross-boundary values
const allConfigs: Record<string, unknown> = {};
for (const config of Object.values(newComponentConfigs)) {
    Object.assign(allConfigs, config as Record<string, unknown>);
}
const newEnvVars = getMeshEnvVarsImpl(allConfigs);
```

Last component in iteration order wins. For scope keys that must be the **backend**, and
here it is only by luck: `adobe-commerce-accs` happens to sort after `eds-accs-mesh` in
the manifest. Nothing pins that order.

## Why it matters — the risk is the FALSE NEGATIVE

The observed symptom (a correct stale flag) is the benign case. Invert the key order and
the detector compares the deployed snapshot against the **mesh's own stale duplicate**,
finds them equal, and reports clean — while the mesh is deployed against the wrong
website and every PDP renders empty. That is precisely the failure `4b517cfb` was filed
for, except staleness is the surface whose entire job is to *catch* it.

A detector that can silently agree with the stale copy is worse than no detector, because
it launders a real misconfiguration into a green badge.

## Goal / scope

Make the staleness detector consult the backend first for `BACKEND_OWNED_SCOPE_KEYS`,
per the contract those keys already document. This is not a design decision — it is
applying an existing rule to the one resolver that missed it.

Preferred shape: extract the backend-first lookup that `envFileGenerator`
(`resolveFromComponentConfigs`, :135) and `configGenerator` (:269) each implement, and
have all three call it. Three call sites is past the Rule of Three, and the docstring's
"any new resolver must…" is a standing invitation for a fourth to get it wrong — a shared
function is the only version of that instruction the compiler can enforce.

Keep: `getRelevantMeshEnvVars`' per-mesh-type scoping (ACCS vs PaaS), and the flatten's
stated purpose of reaching cross-boundary vars that genuinely live on the backend (e.g.
the PaaS GraphQL endpoint). Only the *tiebreak for scope keys* changes.

Out of scope: whether backend and mesh component configs should carry duplicate copies of
these keys at all. Removing the duplication would dissolve the whole bug class, but it is
a data-model change with a migration; `BACKEND_OWNED_SCOPE_KEYS` is the accepted interim.

## Constraints

- `updateMeshStateImpl` is the documented writer chokepoint for every mesh deploy path
  (ADR-011 D3 Steps 07+09). It reads the `.env`, which is already backend-first after
  `4b517cfb` — **do not change the deploy side**. The fix belongs on the read side only.
- The keyed `appBuilderComponents[id]` map is the single durable model; the legacy
  singular `meshState` write-side is retired. Do not add a second store.
- `ACCS_MESH_ENV_VARS` lists five keys but recorded ACCS snapshots carry four
  (`ACCS_CUSTOMER_GROUP` absent). Confirm whether a missing key should count as a change
  before treating it as one.

## Verification

The current tests cannot see this, so a failing test is the deliverable:

1. **Order-independence** — a fixture where the mesh component and the backend disagree on
   a scope key, asserted twice with `componentConfigs` keys in both orders. Same verdict
   both times. Fails today in exactly one of the two orders.
2. **The false negative, directly** — deployed snapshot matches the *mesh's stale copy*
   while the backend holds a different value. Must report **stale**. This is the case
   that silently passes today, and it is the one that matters.
3. **Control** — backend and mesh agree, snapshot matches: must report clean. Stops the
   fix degenerating into "always stale".
4. **Control** — a genuine backend-side change must still report stale.
5. Live: with the disagreement present, confirm the badge is raised; redeploy; confirm it
   clears and the mesh `.env` now carries the backend's scope values.

## Kickoff prompt

```
/rptc:fix The mesh staleness detector is the third resolver over componentConfigs and the
only one that doesn't honour BACKEND_OWNED_SCOPE_KEYS, so its verdict depends on manifest
key order — and in the wrong order it silently agrees with the mesh's stale duplicate and
reports clean while the mesh is deployed against the wrong website.

Read .rptc/backlog/2026-08-10-mesh-staleness-reads-a-different-source-than-deploy.md
first. The rule is already decided (see the BACKEND_OWNED_SCOPE_KEYS docstring in
features/components/config/envVarKeys.ts and commit 4b517cfb) — this is applying it, not
choosing it.

Write the false-negative test FIRST: snapshot matching the mesh's stale copy while the
backend differs must report stale. That is the case that passes today and shouldn't.
Then the order-independence pair.

Prefer extracting the backend-first lookup shared with envFileGenerator's
resolveFromComponentConfigs and configGenerator rather than adding a fourth hand-rolled
copy — the docstring's "any new resolver must consult the backend first" is an
instruction only a shared function can actually enforce.
```
