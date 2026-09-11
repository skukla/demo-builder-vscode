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
