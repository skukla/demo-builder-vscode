# DI-3 spike — export a pack through the item APIs: what the service actually offers

**Date**: 2026-09-11 · **Item**: DI-3 (head of the EDS-13 program) · **Target**: the shared
datapack service's stage deployment (address in the user setting, kept out of this public
repo) and the Bodea ACCS instance the only local project points at (tenant host redacted).
**Auth**: the `aio` CLI's cached IMS user token; the ACCS OAuth pair fetched from the
discovery service's `get-commerce-credentials` action exactly as
`commerceCredentialBroker.ts` does (URL derived by swapping the `discover-stores` action for
`get-commerce-credentials`, query stripped). No credential was written to disk or printed.
**Every call was a read.** No pack was created; nothing was written to the service.

## What was measured

| Call | Result |
|---|---|
| `GET get-export-data-types` | 200; 18 types, each `{data_type, description, api_type, depends_on[], order, processor_script}` |
| `GET find-datapacks?limit=100` | 200; 40 packs; fields `_id, datapack_name, display_name, version, owner, shared, data_types, cover_image, thumbnail_image, created_at, updated_at`. Bodea entries: CoreTech's shared `bodea` (4 versions), an `aco_bodea@main` owned by `data-installer-export`, two private packs of other owners. No spike-named pack |
| `GET get-datapack-metadata?datapack_name=bodea&version=main` | 200; the real detail route (`get-datapack`, `get-datapack-detail`, `datapacks/{name}` all 404) |
| `POST batch-get-data-items {bodea, main, [customer_groups, attribute_sets]}` | 200; **one document per data type**; `data` is a JSON string whose parsed value is the LIST of rows for that type |
| Stored row shapes | `customer_groups`: `[{customer_group: {…}}]` (2); `attribute_sets`: `[{attributeSet: {…}, skeletonId}]` (4). The import processors' wrapper shapes, not raw Commerce REST entities |
| `GET get-export-items?data_type=…` with `x-commerce-instance` (REST base = GraphQL endpoint minus `/graphql`), `x-client-id`, `x-client-secret`, `x-client-scope` | 200 for every type tried. `customer_groups`: 1 item, `excluded_count: 4`; `attribute_sets`, `products`, `categories`, `b2b_companies`: items present |
| **What an export item carries** | `customer_groups`, `attribute_sets`: `{id, display_name}`; `products`: `{id, name, sku, status}`; `categories`: `{id, display_name, path}`; `b2b_companies`: `{id, company_name}`. **`metadata` is null on every type.** No entity data |

## The finding

**`get-export-items` is a picker index, not a row source.** It names what is on the instance
so a person can tick it; it never returns the entity. The rows a pack holds (the wrapped
processor shapes above) are produced inside the service by the export processors, which fetch
from Commerce REST and then store. So the route as sketched in DI-3 — read rows with
`get-export-items`, write them with `add-data-item` — has no row source on the read side.

What the item APIs DO give, and it is cheap: a pack is written per DATA TYPE, one call per
type (at most 18), each carrying the whole list as a JSON string. If the rows exist
anywhere the client can read them, writing the pack is small.

## The one confirmed write attempt (owner-approved, 2026-09-11)

`POST process-datapack` with `operation_mode: export`, `verbose: "full"`, one type
(`customer_groups`), pack `di3-spike-bodea@spike`, `commerce_instance` = the tenant id
derived with the extension's own `ACCS_ENDPOINT_PATTERN`, the ACCS pair in the body as
`credentialFields` sends it. HTTP 200 (a verdict, not a failure, as the client's contract
says):

- pre-flight: authentication `CLIENT` ok; Commerce REST reachable (200).
- `results[0]`: `processor_used: CustomerGroupExportProcessor`, `success: false`,
  `responses.customer_groups_export`: `statusCode 500`, `error: "Failed to store exported
  data: MongoDB connection URI required. Provide MONGO_URI in params or environment
  variable."`
- **No rows anywhere in the response.** `verbose: "full"` adds the per-endpoint error and
  timings; it does not return what the processor fetched.
- Spike packs in the catalog afterwards: 0. Nothing was created; nothing to reverse.

Two facts that were not in the record: the store step reads `MONGO_URI` from the request
PARAMS as well as the environment (the error text says so), and the export action's
response cannot be used as a row source.

## Where the rows could come from (decided by the measurement)

Option 1 below is closed. What remains:

1. ~~The export action's own response.~~ Measured: it carries no rows.
2. **Commerce REST, fetched by the client**, then wrapped into the processors' shapes per
   type. Eighteen fetchers with the dependency order `get-export-data-types` publishes. A
   build, not a spike.
3. **The service.** An endpoint that returns rows in pack shape, or the store-step fix. The
   service author's Postman collections (not in this repo) are the place to check for 1 or
   an existing variant of 3 before assuming either.

## Corrections to the record

- `get-datapack` is not a route; `get-datapack-metadata` is (the extension's client already
  knows this; the research notes did not name it).
- The DI-3 item text assumed `get-export-items` returns rows. It does not; the item is
  amended.

## The service's own documentation (read 2026-09-12; owner supplied the Confluence exports)

Eight pages: API User Guide, Architecture Summary, API Reference, Export, Export Usage
Examples, Import, Postman Collections, Quick Start. The Postman page names three collection
files (admin-auth, client-auth, ACO) and does not contain them.

What the Export page says export IS, verbatim in its step list: "Fetch Data … Apply Filters
… Apply Exclusions … Transform Data … Clean SKU Fields … Track Dependencies … Validate …
**Store: Save exported data to MongoDB datapack**." Its "Key Differences from Import" list
opens with "**No database content required** — data is fetched from Commerce API". That
sentence is about the READ side: export does not read from the service's database. Every
documented export scenario and every response example ends with `stored: N` and "exported
and stored". There is no documented mode that returns the rows without storing them, and
no request parameter for the database address; the Architecture Summary lists MongoDB as
the service's own persistence (four env-named collections) that a caller never configures.

So the phrase "export without MongoDB" describes where export reads FROM, not whether it
writes. The measurement of 2026-09-11 stands: on the stage deployment the export path
reaches its store step and cannot store, while every other write path on the same
deployment stores fine. That is the service's deployment or code, not a caller's option.

`add-data-item`, confirmed from the API Reference: body `datapack_name`, `data_type`,
`version`, `data` (any JSON; stringified by the service); ONE data type per call; 409 when
the type already exists; `update-data-item` (PUT) upserts; `validate_mode` reject / warn /
skip against the type's schema. Matches the per-type write path measured live.

**Verdict for DI-3, final:** the row source has to be the service's export path working, or
a rows endpoint the service adds. Neither is ours to build here; "Publish it now?" in Share
warns until one exists.

## The Postman collections (owner supplied 2026-09-12; three files, dated newer than the docs)

What they add to the record, with hosts and secrets left out:

- **A `datapack_type` body field** on create-datapack, promote, add-data-item, update-data-item
  and every export request: `accs` in the Commerce collections, `aco` in the ACO one. It is
  in no documentation page and the extension has never sent it.
- **The promote route is `POST promote-datapack-version`** with `datapack_name`,
  `datapack_type`, `source_version`, `target_version`, `archive_version`. The earlier research
  note's `/datapacks/{name}/promote` was wrong.
- **`add-data-item`'s `data` is the list of wrapped rows** (`[{ "product": {…} }]`), the same
  shape stored packs hold. Confirms the per-type write path.
- **An async export exists**: `process-datapack-async` with `operation_mode: export`, polled
  through `async-process-status/{activationId}` and `datapack-process-status/{activationId}`.
- The ACO collection exports "from ACCS to ACO datapack" through `process-aco-datapack`, a
  separate pipeline.

**Hypothesis tested and falsified (owner-approved second attempt, 2026-09-12).** If the export
store step selected its database by `datapack_type`, a request without it might reach the
store with no configuration and fail with exactly the measured message. Re-ran the same
export (`customer_groups`, `verbose: "full"`, the Bodea instance) with `datapack_type: "accs"`
and a fresh token with the ACCS pair present: pre-flight `authentication: true`,
`commerce_instance_connectivity: true`; result `success: false`,
`responses.customer_groups_export`: `500 "Failed to store exported data: MongoDB connection
URI required. Provide MONGO_URI in params or environment variable."` Catalog afterwards: zero
spike packs. Identical to the first attempt. The field does not change the outcome.

(A first re-run the same morning went out without the pair because the CLI's IMS token had
expired thirteen hours earlier and the credential broker refused it; it is not counted. Worth
noting on its own: the datapack service accepted that expired token for `process-datapack`
and ran the export to its store step, while the discovery service's broker returned 401 for
the same token. The health check reports `IMS_VALIDATION_ENABLED: not set` on stage.)

**The one lead not yet tested:** the async export runs as a separate activation
(`process-datapack-async`). The August probe found thirteen actions declare `MONGO_URI` and
the sync export path is the one that cannot store; whether the async worker's store path is
configured differently is a one-call question, owner-gated like the others.

**The async export, tested (owner-approved, 2026-09-12).** `POST process-datapack-async`
with the same body returned 202 and an activation id. Polled to terminal:
`datapack-process-status`: `customer_groups: { status: "fail", error: "Processing failed" }`;
`async-process-status`: pre-flight authentication and connectivity both true, the same
all-zero counts as the sync run. Catalog afterwards: zero spike packs. The worker path stores
no better than the synchronous one.

**DI-3, closed on three measurements.** No export path on this deployment stores what it
fetches: not the synchronous action, not with `datapack_type`, not the async worker. The
service's own documentation says storing is the last step of export by design. The item APIs
write a pack per data type and work; nothing on the service reads an instance's rows into
that shape except the export processors, whose store step is what fails. The fix is in the
service (its export store path does not receive the database configuration the rest of the
same deployment has), and it belongs to the service's owner. Two things to hand them: this
file's measurements, and the observation that `process-datapack` accepted an expired IMS
token while the discovery service's broker refused it.

## Gaps found by reading every document against the collections (2026-09-12)

Corrections to this record and to the program's notes, each with where it now lives:

1. **The extension CAN set a pack's `shared` flag.** `update-datapack-metadata` (PUT) takes
   `shared` as an optional field. The program's research said "the extension has no call
   to set it"; wrong. The DECISION (D32: curation is never touched from Share) stands as
   policy, and the research note is corrected to say so.
2. **`get-export-items` is documented to carry the full item in `metadata`** ("Full item data
   is available in the metadata field", Export Usage Examples, with worked examples). The
   deployed service returned `metadata: null` for every type on 2026-09-11. That is a
   divergence between the docs and the stage deployment, not a fact about the API's design,
   and it belongs in the handover to the service owner beside the store-step failure. Even
   as documented, `metadata` is the raw REST entity, not the transformed, substituted,
   SKU-cleaned row a pack holds; the export processors do that transform.
3. **Re-importing a pack into an instance that already holds it is safe and documented**
   (Import page): items that already exist are logged as "skipped" with a reason and the run
   returns success. That answers the plan's open verification about the banner's verb.
4. **`get-installed-datapacks` is the source of truth for "is this pack on this instance"**
   (records written on successful import, removed on delete; the extension already calls
   it). The import banner and the Sample Data step should read it rather than guess.
5. **`compare-datapacks` exists** (POST; normalises ids and timestamps, returns match and
   differences). Not in the collections, not in the extension, not in the research. A ready
   verifier for "the pack I published equals the one I meant to" and for DI-1's round trips.
6. **Direct-upload import exists** (scenarios 3 and 4: `data_type` + `data`, or `items[]`,
   no stored pack). Not used by the extension. Not needed by the program (D31 records, never
   applies), but it is the mechanism a future "seed from a file" would use.
7. **Exported packs may be owned by the service, not the user.** The live catalog holds
   `aco_bodea@main` with `owner: data-installer-export`, and the export request has no owner
   field. If "Publish it now?" is ever to produce a pack the SC owns, create-datapack (with
   `owner`) probably has to precede the export, or update-datapack-metadata follow it. To
   verify when the export path works.
8. **`datapack_type` is in the collections and in no document.** Semantics unknown
   (`accs` / `aco`; the request log carries a separate `site_type`). A question for the
   service owner; it did not change the export outcome.
9. Smaller divergences between docs and the deployment, for the drift checker:
   `get-datapack-metadata` documents `data_types` as `[{data_type}]`, live returns strings;
   `batch-get-data-items` is documented as GET with `items[]`, live is POST with
   `results[]`; the docs' `pagination.total_items` is `total_count` live; the docs' 11-type
   export dependency list is 18 types live.
