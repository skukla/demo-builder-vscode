# Data Installer service docs — distilled findings for the datapack authoring loop

**Source:** the service's Confluence doc exports, dropped 2026-08-23 into
`.rptc/research/*.doc` — **gitignored raw** (internal wiki exports; this repo
is PUBLIC). This file is the promoted, redacted distillation, per the standing
gitignore policy for vendor doc exports. Facts below are from the service's
own documentation unless marked otherwise.

## The authoring loop is the service's designed workflow (not a wish)

- **`create-datapack` is a first-class endpoint.** Payload:
  `datapack_name`, `display_name`, `owner`, `description`, `version`,
  **`shared`** (boolean), thumbnail. A user creates his OWN pack —
  `shared: false`, himself as owner — so publishing a personal pack never
  touches the shared ones.
- **Versions coexist by design.** "Multiple versions of the same
  `datapack_name` can coexist. The combination of (datapack_name, version)
  must be unique." Duplicate → **409**. Missing name/display_name/version →
  400. This is the atomic-update model the authoring loop needs: one pack
  identity, explicit versions.
- **Export targets any pack name** (`operation_mode: 'export'` with a
  `datapack_name` of the caller's choosing — every documented example exports
  to a fresh name) and supports **selective export**: per-type `selections`
  with filters (`in`, `not_equals`, …; e.g. SKU lists, a `root_category` by
  id or name). Entity counts come back per type: fetched / selected /
  exported / stored / excluded / filtered_out — `excluded` is the exclusion
  rules (stock rows dropped by design), `filtered_out` is the caller's own
  filters.
- **Import is the inverse** and already fully wired in the extension.

## The one blocker, unchanged (extension-side record: `docs/systems/data-installer.md` §6b)

Export's final step "stores it in MongoDB" — and the shared stage deployment
lacks `MONGO_URI` for that path, so every export with real items 500s at the
store step (root-caused 2026-08-14; re-confirmed live 2026-08-23 from a Bodea
instance whose custom customer groups cleared the exclusions, `excluded: 0`).
`MONGO_URI` is NOT a documented request parameter (it appears only in the
health check's "included if configured" note) — the fix is operational:
config-set + redeploy on the service's deployment, by its operator. The
extension never handles that secret.

## Auth model (from the service author's design conversation, paraphrased)

- Runtime API auth: IMS server-to-server — client id + secret →
  `POST ims-na1.adobelogin.com/ims/token/v3` → Bearer token per request. No
  per-user auth beyond that. (The extension implements this via the ADR-014
  shared-credential broker.)
- Commerce-instance work: the service handles Commerce auth internally; the
  caller provides either an OAuth pair or admin username/password in the
  payload (both documented on export examples).
- The hosting decision was settled in that same conversation: the service
  runs on Adobe Runtime, deliberately NOT bundled or hosted by callers —
  callers only need the endpoint URL (`demoBuilder.dataInstaller.apiBaseUrl`)
  and a token.

## The Postman collections — the FULL API map (2026-08-23, second pass)

The source drop's collections (admin-auth + client-auth variants; both point
`runtimeUrl` at the stage deployment) document a far richer surface than the
14 operations the extension exposes:

- **Data Item Operations** — add (create-only) / update (upsert) / delete /
  get a SINGLE data item in a pack, plus batch-get. Packs are editable
  row-by-row, no Commerce instance involved. **`add-data-item` is PROVEN
  working on the stage deployment** (§6b: it has its `MONGO_URI`; only the
  export processors' bulk store path lacks it).
- **`POST /datapacks/{name}/promote`** — version promotion. The designed
  atomic-update semantics: accumulate item edits on a working version,
  promote when coherent.
- Pack lifecycle: create (proven 201) / update metadata (PUT) / delete.
- **Async variants**: `process-datapack-async` + `process-datapack-status/
  {activationId}` — the pollable-progress shape the MCP tools should prefer
  for long operations.
- `get-export-data-types`, `get-processor-order`, `health-check`, a logs API
  with filters, and `get-websites-and-stores` (the store-discovery
  passthrough the extension already uses).
- Auth per the collections: IMS token v3, scope `openid AdobeID adobeio_api`.

**Consequence — two routes for the authoring loop:**

- **Route B (pack-first) WORKS TODAY on the shared deployment, nobody
  deploys anything:** batch-get the source pack's rows → write edited rows
  into a user-owned private pack via add-data-item → import to an instance
  to verify. Right for known, surgical data edits (the Bodea
  differentiation is exactly this).
- **Route A (instance-first: edit in Admin → export changed types)** is the
  general capture path and still requires a working export — the user's own
  Runtime deployment with his own MongoDB.

## What this settles for `.rptc/backlog/2026-08-23-datapack-authoring-loop.md`

- Gap 2 (own-version publishing) is **CLOSED as designed-in**: create a
  private pack (`shared: false`), export versions into it. The acceptance
  test should use a user-owned pack (e.g. a private "bodea-differentiated"),
  NOT a new version of the shared `bodea` — no shared-registry pollution,
  no `confirmName` tension.
- Gap 1 (MONGO_URI) remains the sole blocker, operational, with a known
  responsive operator.
- Selective export means the orchestration skill can capture exactly the
  changed types (e.g. `b2b_shared_catalog_categories` + `customer_groups`)
  rather than whole-instance sweeps.
