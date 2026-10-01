# Step 02 — the database and the store's first four actions

Status: code and tests done, deploy BLOCKED on one permission (2026-10-01). Branch
`feature/datapack-store` in `accs-discovery-service`, commit `11acaae`.

## What exists

| Piece | Where | Notes |
|---|---|---|
| Database declaration | `app.config.yaml` → `runtimeManifest.database: { auto-provision: true, region: amer }` | one database per workspace, provisioned by the deploy |
| `datapack-store` package | `app.config.yaml` | four web actions, each `include-ims-credentials: true` (the database client's sign-in) + the service's own guard |
| Caller guard, shared | `actions/lib/caller.js` | the chain the three older actions carry inline, now one module: header → IMS token → allowlist configured → domain. Email = owner |
| Store | `actions/lib/store.js` | `openStore(params)` → `{ packs, items, close }` on `@adobe/aio-lib-db` 1.0.4; validators for name/version (Data Installer charset) and type codes |
| `packs` GET | `actions/packs/index.js` | list = shared ∪ mine, newest first; one = pack + per-type row counts; absent and not-yours are one 404 |
| `save-pack` POST | `actions/save-pack/index.js` | create (201, owner = caller, private by default, `datapack_type: accs`, unique index) or owner-only update; `shared` is the promote flag |
| `save-pack-items` POST | `actions/save-pack-items/index.js` | one type per call, ≤5000 wrapped rows, replaces; records the type on the pack |
| `delete-pack` DELETE | `actions/delete-pack/index.js` | owner-only, `confirmName` must equal name; items then pack |
| Tests | `tests/datapack-store/` | 51 tests, 6 suites, against an in-memory store (`fakeStore.js`) that speaks the collection API subset the actions use. Argument assertions on every write |

The stored shape is the Data Installer's: pack = (name, version, `datapack_type`), items = one
document per data type holding the wrapped rows (`[{ "product": {…} }]`). Pushing a pack into
the Data Installer is therefore `create-datapack` + one `add-data-item` per stored type, unchanged.

## What the deploy needs, and where it stopped

1. **The workspace needs a credential the database can sign in with.** A fresh workspace has
   none; `aio app db provision` refused with "Missing required credentials:
   IMS_OAUTH_S2S_*", and the first deploy's auto-provision answered 500 for the same reason.
   Adobe's docs name the one API required: **App Builder Data Services**
   (`AppBuilderDataServicesSDK`). Done 2026-10-01 through the Console SDK with the owner's
   CLI token: credential `datapack-store-spike` (id 1044430) on `DatapackSpike`, subscribed to
   that API. One trap for the record: `getServicesForOrg` rows carry the code as `code`, not
   `sdkCode`; the first subscribe sent `undefined` and Adobe answered 400.
2. **Pull the credential into the repo's env, provision, deploy** — the three commands below,
   in the `accs-discovery-service` checkout, which `aio app use` already points at
   `DatapackSpike`. **This is where the permission classifier stopped the agent** ("Modify
   Shared Resources"); the owner runs them or grants the permission:

   ```
   aio app use --workspace DatapackSpike --no-input --merge
   aio app db provision --region amer
   aio app deploy --action datapack-store/packs --action datapack-store/save-pack --action datapack-store/save-pack-items --action datapack-store/delete-pack
   ```

3. **Then the round trip** (`curl` with the owner's CLI token as Bearer; the script is
   `step02-roundtrip.sh` beside the plan): save-pack → save-pack-items (one type, two rows) →
   packs (list shows it; one shows the type with rowCount 2) → delete-pack → packs (gone).

## For the Stage deploy, later

Stage needs the same credential + API subscription before the store's actions can open the
database there; the discovery/PDP actions never needed one, so Stage has none today. Adding it
is the same two Console calls, on Stage, before the first `npm run deploy` that carries the
package.
