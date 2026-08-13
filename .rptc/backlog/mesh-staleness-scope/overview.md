# Mesh scope: one truth, and show the evidence

Promoted from the backlog 2026-08-10. The original investigation is `research.md` in this
directory — read it for the live reproduction and the two corrections it records.

## Step 0: RPTC re-initialization (ALWAYS FIRST)

```
/rptc:fix Plan is approved, continue to implementation — mesh staleness scope
```

Then work from this file and `step-01..05.md`.

## Goal

Two halves of one problem, done together because they share a seam:

1. **Correctness** — the mesh staleness detector is the only resolver over
   `componentConfigs` that ignores `BACKEND_OWNED_SCOPE_KEYS`, so its verdict depends on
   manifest key order and it can silently agree with the mesh's own stale copy.
2. **Legibility** — the UI never says what scope the mesh is actually deployed against.
   On 2026-08-10, answering that took a hand-read of the manifest, and the answer was the
   whole incident: the mesh was serving `base` while the project meant `citisignal`.

Doing (2) alone would show a value the defective resolver in (1) can misjudge — and a
wrong specific is worse than a wrong badge, because it looks checkable.

## What discovery established

**`BACKEND_OWNED_SCOPE_KEYS` is the decided rule, not a candidate.** Its docstring says
*"Any new resolver over `componentConfigs` must consult the backend first for these keys."*
`4b517cfb` applied it to `envFileGenerator` (:142) and `configGenerator` (:269). The
staleness detector (`stalenessDetector.ts` ~:506) is a third resolver and still flattens:

```ts
for (const config of Object.values(newComponentConfigs)) Object.assign(allConfigs, config);
```

**The deployed scope is already persisted, correct, and already in hand.**
`appBuilderComponents[id].envVars` holds what the mesh was deployed with, captured from its
`.env`, and the `.env` has been backend-first since `4b517cfb`. `deriveMeshCard` already
reads `meshEntry.endpoint` and `meshEntry.lastDeployed` — the scope codes are the same
object. Nothing on the deploy side changes, and the row needs no new transport.

**The diff IS computed and thrown away** — `detectMeshChangesImpl` returns
`changedEnvVars`, and `determineMeshStatus` (`meshStatusHelpers.ts:184`),
`showPostSaveNotifications` (`configure.ts:636`) and `dashboardHandlers.ts:96` each narrow
it away, leaving only the summary string `'stale'`. This mattered to the first draft, which
tried to surface the *difference* and therefore needed all three seams widened. Recorded
because it is true and someone will rediscover it — but this plan no longer depends on it.

**Registry labels are the wrong labels here.** `components.json` gives "Website Code" /
"Store Code" / "Store View Code". Under a "Commerce scope" key the "Code" is noise, and the
underlying keys differ by backend (`ACCS_*` vs `PAAS_*`) while the concept does not. The
row uses three fixed labels so it reads identically on both. See step 02.

**Store names exist only at the moment of picking.** Configure's picker renders
`<Item key={item.code}>{item.name}</Item>`; `StoreListItem` carries both and only the code
is kept. `storeDiscoveryData` — the one structure holding names — lives in WIZARD state
(`types/webview.ts:93`), not on the project. See step 03.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Which source wins for scope keys | **Backend**, via `BACKEND_OWNED_SCOPE_KEYS` | Already decided by `4b517cfb`; this only applies it to the third resolver |
| Where the shared resolver lives | Extracted, called by all three sites | A docstring saying "any new resolver must…" is not enforcement; three call sites is past Rule of Three |
| What the UI shows | **The deployed scope as a permanent ROW** — not a conditional diff | It is an attribute, not a difference. "What is my mesh pointed at?" should not require a warning badge to become answerable |
| How it reaches the UI | It is already there — `meshEntry.envVars`, beside the endpoint and last-deploy the row already reads | No diff to compute, nothing to transport. The earlier "carry the changes to the webview" design was an artefact of framing it as a diff |
| Store names | **Captured at selection**, shown as `Name (code)`, degrading to the code | Configure's picker already shows names; only the code was kept, so every later surface made the user translate |
| Customer Group | **Excluded** | A Catalog Service price modifier, not a location. Declared by no component, present in no `.env` |
| Storefront parity | **Out of scope, noted** | `storefrontStalenessDetector` has the identical discard |

## Steps

| Step | What | Depends on |
|---|---|---|
| `step-01` | Extract the backend-first scope resolver; make staleness use it | — |
| `step-02` | Add the "Commerce scope" row to the mesh flyout (codes) | 01 |
| `step-03` | Capture and persist store NAMES at selection | 02 |
| `step-04` | Render `Name (code)` in the row | 03 |
| `step-05` | Dev Host verification | 04 |

**Two natural stopping points.** Step 01 ships value alone — it fixes a defect that can
hide a misconfigured mesh behind a green badge. Steps 01–02 together answer the original
question ("what is this mesh deployed against?") in full. Steps 03–04 are an addition
requested after seeing the codes-only row; they reach into the wizard/Configure selection
path and the project data model, and can be dropped without touching the rest.

## Test strategy

Step 01's tests are the point of the whole plan, and two of them must fail first:

1. **The false negative** — deployed snapshot matches the mesh's *stale* copy while the
   backend differs. Must report stale. Passes today, and shouldn't.
2. **Order-independence** — the same disagreement asserted with `componentConfigs` keys in
   both orders. Same verdict both times. Fails today in exactly one order.
3. Control: backend and mesh agree, snapshot matches → clean.
4. Control: a genuine backend-side change → stale.

Controls 3 and 4 stop the fix degenerating into "always stale", which would pass 1 and 2.

## Out of scope

- The duplicate scope copies in existing manifests. Removing them dissolves the bug class
  but needs a migration; `BACKEND_OWNED_SCOPE_KEYS` is the accepted interim. Still listed
  under "Also outstanding, smaller" in `NEXT-SESSION.md`.
- The storefront detector's identical discard.
- Any change to the deploy side — it is already correct.
