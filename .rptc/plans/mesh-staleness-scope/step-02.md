# Step 02 — A "Commerce scope" row on the mesh flyout

Depends on 01 — not because the row reads the detector (it does not), but because until
01 lands the badge above the row can be wrong, and a correct row under a wrong badge is
worse than neither.

## Why a row, not a diff

The first draft of this plan rendered the deployed-vs-configured *difference*, conditional
on staleness. That was wrong twice over:

- **It's an attribute, not a difference.** What scope the mesh is serving is always true.
  Framed as an attribute it needs no diff, no arrows, and no label tense — it sits beside
  Destination, Endpoint and Last deploy, which are equally facts about the deployment.
- **You shouldn't need a warning to ask the question.** "What is my mesh pointed at?" was
  unanswerable in the UI until something went wrong. That is backwards.

Once it is a row, the stale case needs no special treatment: the badge says the mesh is
behind, the row says what it is behind on.

## What it costs: almost nothing

`deriveMeshCard` already holds the deployed snapshot — it reads `meshEntry.endpoint`,
`meshEntry.lastDeployed`, `meshEntry.error`. The scope codes are `meshEntry.envVars`,
the same object. **No diff to compute, nothing to plumb, no seams to widen.** The whole
"carry the changes to the webview" problem this step used to describe does not exist.

## Change

Add a `PanelRow label="Commerce scope"` to `IntegrationDetailPanel`, rendering three
sub-labelled values from `meshEntry.envVars`:

```
Commerce scope  Website      base
                Store        main_website_store
                Store View   default
```

- **Sub-labels are fixed, NOT registry-derived.** The registry gives "Website Code" /
  "Store Code" / "Store View Code"; the trailing "Code" is noise under a "Commerce scope"
  key. More importantly the underlying keys differ by backend (`ACCS_WEBSITE_CODE` vs
  `PAAS_WEBSITE_CODE`) while the concept does not — three fixed labels make the row read
  identically on ACCS and PaaS instead of leaking which backend the project is on.
- **Mesh cards only.** Integrations have no Commerce scope; the row must not appear on them.
- **Absent codes**: render the row only when at least one code is present. A mesh deployed
  before this shipped may have a partial snapshot.

## NOT Customer Group

`ACCS_CUSTOMER_GROUP` / `ADOBE_COMMERCE_CUSTOMER_GROUP` are in `BACKEND_OWNED_SCOPE_KEYS`
and in the staleness watch list, but they are **not** part of this row. The registry
describes them as *"Customer group hash for Catalog Service pricing. Leave blank for
default behavior"* — a price modifier, not a location. No component declares them, so they
reach no `.env`; verified zero occurrences in the live `eds-accs-mesh/.env` against a
control showing `ACCS_WEBSITE_CODE` present. Their place in those lists is defensive, for
if they are ever wired up.

**Consequence for step 01**: a watch-list key ABSENT from the snapshot is the normal case,
not a change. If the detector treats missing-vs-present as a difference,
`ACCS_CUSTOMER_GROUP` marks every ACCS mesh permanently stale.

## Tests

- Mesh card with scope codes → row renders, three sub-labels, correct values.
- Mesh card with no scope codes → no row (control: with codes → row).
- A non-mesh integration card → no row, regardless of what its entry holds.
- The row renders the same for a PaaS mesh (`PAAS_*` keys) as for ACCS.
- Existing panel assertions unedited.

## Done when

- The row shows what the mesh is deployed against, stale or not
- Nothing new is computed, persisted or transported
- `gate` green
