# Step 03 — Keep the store NAMES, not just the codes

Depends on 02. This is the step that grew the plan; read the scope note at the bottom.

## Why

Configure's store pickers render `<Item key={item.code}>{item.name}</Item>`
(`StoreStructureSelector.tsx:76`). The user **chooses** "CitiSignal Store" and every
downstream surface then shows them `citisignal_store`. The flyout row from step 02 would
inherit that: it can only show what is stored, and only the code is stored.

## Why it isn't already possible

`StoreListItem` carries `{ code, name, numericId }` at the moment of selection, and it is
thrown away below the picker. The one structure that holds names —
`storeDiscoveryData: CommerceStoreStructure` — lives in **wizard state**
(`types/webview.ts:93`, commented "avoids re-fetch on back navigation"), not on the
project. Confirmed on the live project: the manifest has no store-structure key at all.

So there are only two ways to get a name onto the flyout: capture it when it is chosen, or
fetch the structure again at render time. This step takes the first. The second puts a
network call, a spinner and a failure mode behind a label, and would show names only when
Commerce happened to answer.

## Change

1. **Persist the chosen name beside the chosen code.** `StoreSelectionRow`'s handlers
   already receive the code and can reach the item's name; carry it through to a
   display-name map on the project — e.g. `project.commerceScopeNames`, keyed by env-var
   key (`ACCS_STORE_VIEW_CODE → "CitiSignal US"`).

2. **Keep names OUT of `componentConfigs`.** They are not env vars. Verified they would
   not currently leak — `generateComponentEnvFile` only walks declared keys that exist in
   the shared `envVars` dictionary (`envFileGenerator.ts:226,237`) — but "it happens not
   to leak today" is a weak reason to file display strings among deployable values.

3. **Capture into the deployed snapshot at deploy.** `recordDeployOutcome` already writes
   `envVars` from the `.env`; the names for those codes come from the map in (1). A mesh
   then carries the names it was deployed with, so the row stays truthful even if the user
   later re-picks without redeploying.

4. **Every consumer falls back to the code.** No stored name → show the code. That is not
   an edge case: it is every project that existed before this shipped.

## The honest caveat

This does **not** retroactively name anything. `demo-builder-test` — the project that
prompted the whole thread — will keep showing codes until someone re-picks a store view.
If seeing real names there matters, that needs a backfill from a one-off discovery call,
which is deliberately not in this step.

## Tests

- Selecting a store view persists its name against the right key.
- The name survives a save/reload round trip.
- Deploy captures the names alongside the codes in the snapshot.
- Names never appear in a generated `.env` (control: the codes do).
- Re-picking updates the name; clearing the selection clears it.

## Scope note

The original ask was "show what the mesh was deployed against". Step 02 answers that in
full. This step is an addition requested on 2026-08-10 after seeing the codes-only row,
and it reaches back into the wizard/Configure selection path and the project data model —
materially wider than step 02. It is separated so it can be dropped or deferred without
touching the rest of the plan.

## Done when

- A store view chosen by name is remembered by name
- No name ever reaches a `.env`
- Missing names degrade to codes everywhere
- `gate` green
