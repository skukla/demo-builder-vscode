# Spike 01 — Live Data Installer API probe

**Date**: 2026-08-11
**Target**: the Data Installer **stage** Runtime endpoint (namespace-scoped URL kept out of this public repo — see the team's own docs)
**Auth used**: a plain Adobe IMS **user** access token from `aio login --bare`
(org context at probe time: `Adobe Demo System`).
**Method**: read-only `curl` against every documented read endpoint. Every claim below was
observed in a response body, not inferred from the Confluence docs.

Source docs converted from the Confluence MHTML exports in `docs/research/data-installer/`.

---

## Verdict

The service is live, and **the extension's IMS user token model is sufficient** — no
dedicated client-credentials integration is needed. But **the published docs diverge from
the deployed reality in six places**, three of which would have broken a client written
from the docs alone.

---

## 1. Auth — resolved, and cheaper than expected

| Probe | Result |
|---|---|
| `GET /health` (no token) | `200` `pong` |
| `GET .../health-check` (no token) | `200`, `{"success":true,...,"env_check":{"IMS_VALIDATION_ENABLED":"not set"}}` |
| `GET .../find-datapacks` (no token) | `401` `{"error":"Authentication required","error_code":"AUTH_REQUIRED"}` |
| `GET .../get-export-data-types` **with `aio` user token** | `200` + full payload |

**A generic IMS user bearer token is accepted.** The API does not require the caller to be a
specific provisioned IMS client. The Quick Start's `imsClientId`/`imsClientSecret` variables
are just Postman's way of minting *a* token — not an allowlist the caller must be on.

This matters because `accs-discovery-service` had the opposite bug (`validateCallerToken`
hardcoded the validate_token `client_id`; see the
`reference_accs_discovery_ims_client_id` memory). The Data Installer does **not** repeat it.

**Still to confirm in a later spike**: the same call using the *extension's* IMS token
(different `client_id`, different scope set) rather than the `aio` CLI's. Reaching `200`
with one user token makes it very likely, not certain.

---

## 2. Doc-vs-reality divergences (all verified)

| # | Doc says | Reality | Consequence |
|---|---|---|---|
| 1 | `get-datapack-metadata` → `{success, datapack:{...}}` | **Flat** — fields sit at the top level beside `success` | A client reading `res.datapack` gets `undefined` |
| 2 | `batch-get-data-items` → `{items:[{data_type,data}]}` | `{results:[{found, metadata, requested}], found_count, missing_count, requested_count, include_content, duration}` | Completely different shape |
| 3 | `batch-get-data-items`: "if `data_types` omitted, retrieves all" | **Broken on stage** — `400 "Collection name required. Provide <collection env var> in environment variable."` | Must always pass explicit `data_types` |
| 4 | `get-data-item` → `data` is an object | `data` is a **JSON string** that must be `JSON.parse`d | Matches the architecture note that Mongo stores stringified JSON |
| 5 | Log `scenario` ∈ `SINGLE_DB, ENTIRE_DB, SINGLE_DIRECT, MULTIPLE_DIRECT` | Real logs carry `DATAPACK_ALL_ITEMS`, `DATAPACK_SPECIFIC_ITEMS` | Never hardcode the doc's enum; treat `scenario` as an opaque string |
| 6 | `get-export-data-types` returns 10 types (doc example `"count": 10`) | **18** | Ask the API; never hardcode the type list |

Divergences 2, 3 and 4 are the ones that would break a from-the-docs client.

**Report upstream to the Data Installer service owner**: #3 is a server-side env/config defect on the stage
deployment, not a client mistake.

---

## 3. Data-type universes are asymmetric

Import-capable and export-capable type sets are **different**. Both must be read from the
API per operation mode.

- `GET get-export-data-types` → **18** types, each with `{data_type, description, api_type,
  depends_on[], order, processor_script}`. Real dependency edges, e.g. `products` depends on
  `categories, product_attributes, attribute_sets, attribute_assign_to_set, customer_groups`.
- `GET get-processor-order?operation_mode=import` → an ordered list including three types
  **absent from the export list**: `product_export`, `customers_export`, `giftcards`.
- Stored datapacks reference **25** distinct `data_type` values overall, including a
  separate **ACO** family: `aco_metadata`, `aco_categories`, `aco_products`,
  `aco_price_books`, `aco_prices`.
- `get-aco-export-data-types` → **404**. There is no ACO equivalent of the export-types
  endpoint.

---

## 4. The catalog — `shared: true` + `owner: "CoreTech"` is the curation signal

`GET find-datapacks?limit=1000` → 40 entries / 25 distinct `datapack_name` / **23 entries
`shared:true` across 11 distinct names**, every one `owner: "CoreTech"` and every one
carrying a real `thumbnail_image` + `cover_image` (e.g.
`https://<demo-host>/CitySignal.png`).

The 11 curated brands: `bodea`, `carvello`, `citisignal_new`, `citisignal_original`,
`frescopa`, `grocery`, `healthbeauty`, `luma`, `venia`, `wecafe`, `wknd`.

The remaining ~17 entries are developer scratch (`AFREEN-LG`, `afreen-test-datapack`,
`display_name: "Updated Display Name"`, `thumbnail_image: placekittens.com`). **A catalog UI
must filter** — default to `shared: true`, and treat unshared packs as an opt-in "show all".

`(datapack_name, version)` is the identity. Versions in the wild are free-form and carry
meaning: `main`, `hold`, `eds-compatible`, `tierpricingfix`, `legacySkus-20260522`,
`main-archived-20260618`, `archive_06112026`, `dev`, `test`.

### Brand mapping to Demo Builder is NOT 1:1 — do not auto-map

`demo-packages.json` ships 4 packages: `isle5`, `custom`, `citisignal`, `buildright`. Only
`citisignal` loosely corresponds (to *two* Data Installer packs, `citisignal_new` and
`citisignal_original`). `isle5` and `buildright` have no counterpart; `luma`, `venia`,
`wknd`, `bodea`, `carvello`, `frescopa`, `healthbeauty`, `grocery`, `wecafe` have no demo
package. **The Data Installer catalog is its own axis**, not a projection of the demo-package
catalog. Any "suggested datapack for this project" feature needs an explicit mapping table,
not a name match.

---

## 5. `commerce_instance` in practice is an ACCS instance id

Real values in `logs` and `get-installed-datapacks` are **21–22 character base62 nanoids**
(mixed case, no separators), with `site_type: "accs"` — six distinct instances appear across
the records sampled. The shape is what matters here, not the values: it matches an ACCS tenant
id, which is why §"Open questions" treats
`ACCS_GRAPHQL_ENDPOINT`-derivation as plausible but unproven.

Not one REST base URL appears in 35 installation records or the 5 most recent of 1060 logs.
So the extension must supply the **ACCS instance id**, and the API expands it to a REST base
URL server-side from its own configuration.

`commerce_instance` is also the join key for both tracking endpoints — it is matched by
exact string (trimmed). Whatever the extension sends on import is what it must send to read
installations back.

---

## 6. Async is mandatory, and the two status endpoints disagree

Observed: a `grocery`/`main` import on one ACCS instance reported
`overall_processing_time: 175496` ms — **~175 s, nearly 3× the ~60 s gateway timeout**. The
synchronous `process-datapack` is unusable for a whole datapack.

Polling a **real, completed** activation (`<activation-id-A>`, finished
~8 h earlier):

| Endpoint | Response |
|---|---|
| `datapack-process-status/:id` | `{activation_id, data_types:{<type>:{status}} ×7 all "success", overall_processing_time:175496}` |
| `async-process-status/:id` | `{status:"in_progress", message:"Processing in progress. Activation record not yet available. Poll again for result."}` |

**`async-process-status` reports `in_progress` for a job that finished hours ago.** It reads
OpenWhisk's activation store, which ages records out; `datapack-process-status` reads
MongoDB and is durable.

**Design rule**: terminal state must be derived from `datapack-process-status` per-type
statuses. `async-process-status` is only good for the rich final result body *while the
activation record is still warm*, and its `in_progress` must never be treated as
authoritative. A poller that waits for `async-process-status` to go terminal can hang
forever.

Activation ids are 32-char hex.

---

## 7. `202` does not mean the request was valid

| Probe | Result |
|---|---|
| `GET process-aco-datapack` (no params) | `400 "Invalid input. Must provide one of: (datapack_name), (datapack_name + data_types[]), (data_type + data), or (items[])"` |
| `GET process-aco-datapack-async` (no params) | **`202`** `{success:true, status:"pending", activation_id:"<activation-id-B>", pipeline:"aco"}` |

The async entry point **spawns the worker before validating input**. The sync twin rejects
the same request. So a `202` + `activation_id` carries no guarantee the job is well-formed —
validation failure surfaces only when polling.

That 400 message is also the authoritative statement of the four input scenarios.

*Side effect disclosure*: this probe started one no-op ACO worker activation
(`<activation-id-B>`) with no `datapack_name` and no `commerce_instance`. It
had nothing to act on and no target instance, so it fails validation inside the worker.

---

## 8. Usage scale (for sizing list UIs)

- `logs` → `total: 1060`
- `get-installed-datapacks` → `total: 35`
- `find-datapacks` → 40

Both tracking endpoints paginate (`limit` default 100 / max 1000, `skip` max 10000) and
return `{count, total, limit, skip}`. The logs list needs paging and filters; installations
comfortably fit one page today.

---

## Spike A results (2026-08-11, same day) — three corrections

Re-ran the full read surface via the extension's own token path
(`aio config get ims.contexts.cli.access_token`, the source `tokenManager` reads) and captured
15 sanitized fixtures. Those land under `tests/fixtures/data-installer/` with the
`feature/data-installer` branch; the findings are recorded here because they describe the
external service, not our code. Three of them change the design:

**1. The two status endpoints fail in OPPOSITE directions.** §6 below records that
`async-process-status` lies about a completed job. Spike A found the inverse for a job that
never started: `datapack-process-status` returns `200` with an **empty `data_types: {}`** and
`overall_processing_time: null` — indistinguishable from "still starting" — while
`async-process-status` returns the actual reason
(`{"success":false,"error":"Invalid input. Must provide one of: (datapack_name), …"}`). So
neither endpoint is sufficient alone: **the durable one decides terminal success/failure, the
OpenWhisk one explains why nothing happened.** Note also that the never-started shape is an
empty map, *not* the `{"error":"No request log found…"}` the docs describe — key on the empty
map.

**2. The `overall_processsing_time` typo is the DOC's, not the API's.** The API Reference lists
a triple-s field for `get-installed-datapacks`. The live endpoint returns
`overall_processing_time` — normal spelling — on 35/35 rows. Reading it from the doc would have
produced a parser test asserting a field that does not exist.

**3. Cover art is absent more often than present among curated packs.** 15 of the 23
`shared: true` entries have an empty `cover_image`; all 23 have a `thumbnail_image`. A card's
cover → thumbnail → placeholder fallback is the common path, not an edge case.

**Not resolvable in this environment:** whether the catalog is org-scoped. `aio console org
list` returns exactly one reachable org, which is consistent with the org-bound-token model, so
there is no second org to test against from here. Nothing in any response shape carries an org
id, which suggests the catalog is global to the service — but that is an inference, not a
measurement, and it stays open.

---

## Open questions for the next spike

1. **Extension IMS token** — repeat §1 with the extension's own token, not `aio`'s.
2. **Commerce credentials** — every write path (`import`, `export`, `delete`, `validate`,
   `get-export-items`, `get-websites-and-stores`) needs `commerce_instance` +
   (`client_id`/`client_secret` | `admin_username`/`admin_password`). Untested here: no
   credentials were used. `get-websites-and-stores` is the cheapest way to validate a
   credential pair before offering an import.
3. **`get-export-items/:data_type`** — needs Commerce creds via `x-*` headers; shape
   unverified against a live instance.
4. **A real async import end to end** — start, poll both status endpoints, observe the
   pending → processing → success transitions and a failure case. Needs a disposable ACCS
   instance.
5. **Stage vs prod** — only the `-stage` namespace was probed. Is there a prod namespace,
   and is the datapack catalog the same?
