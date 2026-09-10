# Data Installer — Stage 3 (export) probe, 2026-08-14

Moved out of `docs/systems/data-installer.md` on 2026-08-30. It is a live-probe
record of a defect in ANOTHER TEAM's service at a point in time, not a description
of how this extension works — and `.rptc/research/` is where probe writeups belong.

The contract facts our code depends on stayed in the systems doc. What follows is
the investigation: what was tried, what the service did, and the measured root cause.

**Re-verify before relying on any of it.** The finding is that the stage export path
had no `MONGO_URI`; that is an infrastructure fault on a service we do not own and
may have been fixed since.

---

## 6b. Stage 3 (export) — what the probe found, 2026-08-14

Three findings, none of which the plan anticipated. All measured against the
deployed stage service with a positive control.

### `get-export-items` — SOLVED: it needs `x-client-scope`

**Corrected 2026-08-14, second pass.** It works. The wiki's API User Guide lists
an optional `x-client-scope` header that the repo source drop does not mention,
and ACCS needs it. The working call:

```
GET  {base}/get-export-items?data_type=attribute_sets&page=1&page_size=50
     Authorization: Bearer <IMS user token>
     x-commerce-instance: <FULL Commerce REST base URL, not the tenant id>
     x-client-id / x-client-secret: the project's ACCS OAuth pair
     x-client-scope: openid,AdobeID,email,profile,
                     additional_info.projectedProductContext,
                     additional_info.roles,commerce.accs
```

Returns `{items:[{id, display_name, metadata}], pagination, excluded_count}` —
measured: 8 attribute sets with `excluded_count: 1` (the `Default` set the
exclusion rules drop). Three corrections to the source drop in one call:
`data_type` is a QUERY parameter (the path segment is not read),
`x-commerce-instance` replaces `x-base-url`, and the instance must be the full
URL because `COMMERCE_INSTANCE_URL_TEMPLATE` — documented in the Quick Start
Guide as the deployment config that enables instance-id shorthand — is not set
for this action.

The earlier note here said it was unusable. That was the missing header, not the
endpoint.

It is the endpoint that would feed a selective-export UI (which items exist, so
the user can choose). Both instance forms are refused:

| Request | Result |
|---|---|
| `commerce_instance` = tenant id (the form every other endpoint takes) | **400** — "must be a full URL (https://…) or set `COMMERCE_INSTANCE_URL_TEMPLATE` when using an instance id" |
| `commerce_instance` = the instance's full REST base URL | **400** — "Pre-flight check failed for all configured site types (accs, local)" |

**The control rules out our credentials**: the same pair and the same tenant id,
in the same script, return **200** from `process-datapack` (`validate`) and
**200** from `get-websites-and-stores`. So this is the endpoint, not the caller.

Consequence: **a selections/filter UI cannot be built against ACCS today.** An
export of everything for a data type may still work — that path was not probed,
see below.

### Export runs, authenticates, connects — and exports NOTHING

The probe the read-only findings could not reach: a real `operation_mode:
'export'` against a live ACCS instance, to a throwaway datapack name.

| Data type | Processor | Result |
|---|---|---|
| `attribute_sets` | `AttributeSetExportProcessor` | 200, `success: false`, `exported: 0`, **no message** |
| `categories` | `CategoryExportProcessor` | 200, `success: false`, `exported: 0`, **no message** |
| `customer_groups` | `CustomerGroupExportProcessor` | 200, `success: false`, `exported: 0`, **no message** |

Every run reported `pre_flight_check.authentication.success: true` and
`commerce_instance_connectivity.success: true`. The instance demonstrably holds
that data (14 categories, 130 products, the standard customer groups).

**Control, in the same script with the same credentials and instance**:
`operation_mode: 'validate'` → 200, `success: true`. So the caller, the
credentials and the instance are all fine; the export processors return nothing
and say nothing about why.

**Nothing was created.** The catalog held 40 rows before and 40 after, with zero
`demo-builder-probe-*` rows left behind (filter positive-controlled against
`bodea`, which it finds). A zero-item export writes no datapack, so there was
nothing to clean up.

**Three sources disagree about the same run.** The service's own request log
carries detail the HTTP response withheld:

| Source | `attribute_sets` / `categories` | `customer_groups` |
|---|---|---|
| HTTP response | `success: false`, `exported: 0`, **no message** | `success: false`, `exported: 0`, **no message** |
| Request log (`/logs`) | `{"status":"fail","error":"Processing failed"}` | **`{"status":"success"}`** |
| Storage | nothing | **nothing** |

So the response swallows an error the log has, and for `customer_groups` the log
claims success for a run that stored nothing. Storage checked by TARGETED lookup,
not a list scan: `get-datapack-metadata` and `get-data-item` both 404 for the
probe pack while the same two calls for `bodea/main` return 200.

Also worth noting: **the only four `export` runs in the last 200 log records are
these probes.** Export appears simply unused on stage, which is consistent with
it never having been exercised for ACCS.

**CORRECTION, same day.** The verdict above read "the export capability is
non-functional for ACCS" — that was wrong, and it outran its own evidence. The
service author's response was "just get the payload correct", and re-reading the
service's own log shows he is right:

**`customer_groups` returned `status: success`.** Export runs. It exported zero
because `config/export_exclusions.json` excludes all five stock customer groups
(`NOT LOGGED IN`, `General`, `Default (General)`, `Wholesale`, `Retailer`) — and
the instance had been reset to baseline before the probe, so nothing else was
left to export. `attribute_sets` is the same story: the exclusion list drops
`Default`, which was the only set remaining. **Two of the three "failures" were
the exclusion rules working exactly as designed, measured on an instance with
nothing exportable on it.**

What remains genuinely unexplained: `categories`, `products` and
`attribute_sets` return `{"status":"fail","error":"Processing failed"}` in the
log — including `products` with 130 non-downloadable products present, which
rules out the exclusion explanation for that one. Ruled out by measurement:
missing `version` (it IS required — a 400 says so, though the export docs omit
it), a missing `root_category` selection (tried by both `id` and `name`), and
store scope (tried against `citisignal`/`citisignal_us`).

**Eliminated by measurement** (each tried against the live service, 2026-08-14):

| Hypothesis | Result |
|---|---|
| `version` missing | It is REQUIRED — omitting it 400s. The export docs omit it; the deployment does not. |
| `selections` / `filters` required | Sent `attribute_set_id in [10,11,12,13,14,15,16,17]` — the eight non-`Default` sets that exist on the instance. Still `exported: 0`. |
| `root_category` missing | Tried by `id` and by `name`. No change. |
| Store scope missing | Tried `website_code: citisignal` + `store_code: citisignal_us`. No change. |
| Dependency order | Sent the full `depends_on` chain for `products` in one request. No change. |
| Datapack must exist first | `create-datapack` → 201, then export. No change. |
| `EXPORT_PAGE_SIZE` unset | Sent `50` explicitly. No change. |
| `base_url` instead of `commerce_instance` | `base_url` alone 400s; `commerce_instance` is the required field. |
| The REST endpoints are unreachable | **All five return 200** with the same credentials handed to the service: `customerGroups/search`, `products`, `categories/list`, `attribute-sets/sets/list`, `products/attributes`. |

**`get-export-items` cannot resolve an ACCS instance in EITHER form.** With the
tenant id: "commerce_instance must be a full URL (https://…) or set
`COMMERCE_INSTANCE_URL_TEMPLATE`" — an env var evidently unset on stage. With the
full REST URL: "Pre-flight check failed for all configured site types". Note that
`process-datapack` accepts the tenant id and its own pre-flight passes, so the
two actions resolve the instance differently. Its documented shape is also wrong
in the drop: it is a GET with `data_type` as a QUERY parameter (the path segment
is not read) and an `x-commerce-instance` header (not `x-base-url`).

### ROOT CAUSE, measured: the export path has no `MONGO_URI` on stage

`process-datapack` accepts an optional **`verbose`** field (`true`, `"full"`,
`"errors"`, `false`) — documented in the Quick Start Guide under Step 5, and in
its troubleshooting section. The default response omits the per-endpoint error.
Sending `verbose: "full"` returns it:

```json
"responses": {
  "attribute_sets_export": {
    "error": "Failed to store exported data: MongoDB connection URI required.
              Provide MONGO_URI in params or environment variable.",
    "statusCode": 500,
    "success": false
  }
}
```

**The export processor cannot write to MongoDB.** `MONGO_URI` is not configured
for that path on the stage deployment. That single fact explains every
observation:

- **Fetch works** — no database involved, which is why `get-export-items` (a
  pure read) returns items normally.
- **Types with zero items "succeed"** — they never reach the store step. That is
  the exact correlation measured across all 18 types: `cart_rules`, `coupons`,
  `b2b_shared_catalogs` (0 items), `sources`/`stocks` (1 each, both excluded),
  `customer_groups` (5, all excluded).
- **Types with items fail** — they reach the store step and get a 500.
- **`add-data-item` works** — a different action, which does have `MONGO_URI`.
- **Nothing is ever created** — the failing step IS the write, so a failed export
  leaves no datapack row behind (confirmed: 404 on every cleanup attempt).

**This is a service deployment gap, not a payload error and not an ACCS
quirk.** The request shape was correct for most of the attempts above; the
service simply cannot store what it fetches. It will work unchanged once
`MONGO_URI` is set for the export path.

**Where `MONGO_URI` is set, and why this is a code gap rather than a missing
setting.** It is an action input in the service's `app.config.yaml`
(`MONGO_URI: $MONGO_URI`), resolved at deploy time from the deployer's own
config — `aio app config set MONGO_URI "mongodb+srv://…"` per their
the deployment notes. Thirteen actions declare it, `process-datapack` among
them. **It is the service's secret, in the service's repo and deployment. We
neither hold it nor set it, and the extension must never send it.**

And it is evidently already configured on stage, which narrows the fault
precisely:

- `add-data-item`, `create-datapack` and `delete-datapack` all write to Mongo
  successfully (measured — 201, 201, 200).
- **`process-datapack` itself writes to Mongo on every one of these failed
  export runs**: the request log is a Mongo collection, and every probe appears
  in `GET /logs`.

So the very same action, in the very same invocation, completes one Mongo write
(the request log) and fails another (the exported data) claiming the URI is
missing. That is not a deployment setting that someone forgot — the URI is there.
It is the export storage path not receiving the params the rest of the action
has. A code fix in `data-installer-api-b2b`, not a config change, and not
something this repo can do.

**Design consequence for Stage 3**: the client MUST send `verbose` on export.
Without it the service reports a bare `success: false` with an all-zero
`entity_summary` and no reason — which is what cost this investigation a day.
Note also that `MONGO_URI` can be supplied "in params" per that error text: the
extension must NEVER do that. It is the service's own secret, we do not hold it,
and putting a database URI in a request body is not something this client will
ever do.

### The export contract differs from import's in three ways### The export contract differs from import's in three ways

- **Request**: the export docs use `base_url` and no `commerce_instance`
  (`EXPORT_GUIDE.md` scenarios 1 and 2). **The deployed service rejects that
  body**: `base_url` alone returns 400 "Missing required parameter:
  commerce_instance". Export takes the same tenant id every other endpoint
  takes — an eighth doc divergence, and the opposite of what `get-export-items`
  demands.
- **`entity_summary`, not `entity_counts`**: live fields are `created, deleted,
  exported, failed, skipped, updated` — none of the documented `fetched,
  selected, exported, stored, excluded, filtered_out`.
- **Response**: `results: [{data_type, success, entity_counts: {fetched,
  selected, exported, stored, excluded, filtered_out}, dependencies, message}]`
  — a different shape from import's `data_types: {<type>: {status}}` map. The
  Stage 2 parsers do not read it.

Export also appears to write the datapack itself (`entity_counts.stored`), with
no separate `create-datapack` call in any documented scenario — contradicting
the plan's "needs `create-datapack` + `add-data-item` on the client".

### The local `data-installer-api-b2b` source drop is STALE — do not trust it alone

Dated **2026-03-06**, five months behind the deployment. The tell: the string
`commerce_instance` appears NOWHERE in that source, yet every endpoint above
accepts it live and the extension's imports have always used it.

What survived re-verification against the live service: the
`get-websites-and-stores` two-level shape (`websites[].stores[]`, admin already
stripped) and the processor vocabularies (pulled live, not read). What was
verified live independently: the `website_ids` substitution. Treat anything else
read only from that drop as a hypothesis needing a live check.

---

