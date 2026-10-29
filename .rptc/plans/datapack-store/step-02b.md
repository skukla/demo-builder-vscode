# Step 02b — the store answers the Data Installer's database API

Status: DONE 2026-10-01 — eleven routes deployed to the scratch workspace, live round trip
green, 210 tests across the service. Branch `feature/datapack-store` in `accs-discovery-service`.

## Why the API, not just the field names

The owner's direction: "base as much as is relevant on Jeff's design." The field names
alone would have made a pack pushable. Mirroring the API makes the extension's EXISTING
Data Installer client — `dataInstallerClient.ts`, its parsers, the catalog UI — read this
store with only the base URL changed, and makes a push into his registry a copy with no
translation. One client, two addresses, one library.

## What was mirrored, and from where

Contracts were extracted from his CODE (`actions/database/*.js`, `actions/utils/datapackMetadataFields.js`,
`app.config.yaml`), cross-checked against `docs/API_REFERENCE.md`, which disagrees with the
code in a dozen places (a nested `datapack` wrapper, `data_types` as objects, camelCase
timestamps, a two-field key, a `type` field the code ignores). The code is what his
deployment answers, so the code is the contract.

| Route | Method | Mirrored exactly | Notes |
|---|---|---|---|
| `create-datapack` | POST | params, validation order and sentences, document, 201 body (document under `data`), 409 | owner = caller's email; a request's `owner` must equal it |
| `add-data-item` / `update-data-item` | POST / PUT | one handler, `create_only` → 409, `data` stored as a JSON string, `$addToSet data_types`, auto-create of the pack, 201/200 body | owner-only (his 404 sentence); his per-type schema validation is accepted and NOT performed (his schemas are his; the push validates on arrival) |
| `get-datapack-metadata` | GET | FLAT body, snake_case timestamps, string `data_types`, no `_id`; 404 body; 409 when two types match and none named | visibility |
| `find-datapacks` | GET | filters, limit 1–1000 (omitted = all), skip ≤10000, sort object over his field list, row shape with `_id`, `count`, `duration`, no `total` | visibility ANDed on the filter; pages past the database's 100-row cap |
| `get-data-item` | GET | `count`, `duration`, `query`, `include_content`, `metadata` = identity, `data` string; 404 `Document not found`; 409 | his list mode (`single: false`) not offered; visibility |
| `batch-get-data-items` | POST | both request forms, `results[]` (never `items[]`), counts, legacy form scoped to the first item's pack | visibility via the pack |
| `update-datapack-metadata` | PUT | updatable set and sentences, immutable name, type is identity only, merged document under `data` | owner-only; `owner` must be a non-empty string (his stores the text "null"); no re-read |
| `delete-datapack` | DELETE | cascade metadata → items, counts in the body, 404 sentence | owner-only |
| `delete-data-item` | DELETE | two 404s, `$pull`, body | owner-only |
| `promote-datapack-version` | POST | source must exist; existing target needs `archive_version` (409) and is renamed in place; copy with fresh timestamps; `archived_version`/`items_archived` only when archived | source must be the caller's |

Not mirrored: `get-installed-datapacks` (install tracking is his service's job and ours never
installs), `compare-datapacks` (later, if a diff between a draft and the library proves
useful), the sanitizer (his is applied only by his dev server, never on Runtime; our rows are
stored as strings and never used as queries, so there is no operator to strip).

Collections: `datapack_metadata`, `datapack_data` — his names. Identity: `(datapack_name,
version, datapack_type)`; items add `data_type`. Unique indexes created on first write.

## Measured on the scratch workspace (2026-10-01)

`step02-roundtrip.sh`: create 201 → create again 409 (his sentence) → add 201 → update 200 →
find (1 row, his shape) → metadata (flat) → item (`data` a string) → batch (results) →
update-metadata 200 (`shared: true`) → promote to `main` (1 item copied) → delete-data-item
on main → delete main → delete v1 → metadata 404 (his body) → no token 401. Store empty after.

## The acceptance that matters: the extension's own parsers

`tests/features/data-installer/fixtures/datapack-store/*.json` are this store's LIVE answers
(captured by the step above, the owner's address replaced by a stand-in, `duration` pinned),
and `datapack-store-contract.test.ts` runs the real `dataInstallerParsers` over them. If the
extension can list, open and read a pack from our store with its existing client, the
"one client, two addresses" claim holds by test rather than by assertion.
