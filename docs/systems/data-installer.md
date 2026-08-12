# The Data Installer

The **Data Installer API** is an Adobe App Builder service, owned by another team,
that stores Adobe Commerce sample-data "datapacks" and installs them into live
Commerce instances. Demo Builder creates the Commerce backends those datapacks go
into; this feature brings browsing and installing them inside the extension
instead of driving Postman by hand.

This document is the map of what the extension does with that service, what the
service actually does (which is not always what its docs say), and what is
deliberately withheld from AI agents.

---

## 1. Configuration

Two settings, read in exactly one place — `services/dataInstallerConfig.ts`:

| Setting | Default | Notes |
|---|---|---|
| `demoBuilder.dataInstaller.enabled` | `true` | A corrupted non-boolean reads as `true`: a broken `settings.json` should not look like a deliberate opt-out. |
| `demoBuilder.dataInstaller.apiBaseUrl` | the team's stage deployment | `https` only, ≤2048 chars, trailing slash stripped. |

**There are no credentials to configure.** The client sends the extension's
existing Adobe IMS token as `Bearer` — verified byte-identical to the token a
successful probe used — so no dedicated integration is needed. `health-check` is
the one call that sends no `Authorization` header.

A rejected URL never reaches a log verbatim: `fingerprintUrl()` reports scheme and
host only, because a URL can carry a secret in its query string. The same
reasoning guards the shipped default — see the settings-schema test.

**Action URLs**: Adobe I/O Runtime routes on the **last path segment**, so a wrong
segment is a bare 404 rather than a readable error. `actionUrl()` exists so that
rule lives in one tested function.

---

## 2. The verified contract

Everything here was measured against the live service. **The published docs are
wrong in seven places**, and fixtures captured from the real API (identifiers
scrubbed) live in `tests/fixtures/data-installer/`.

| Doc says | Reality |
|---|---|
| `get-datapack-metadata` → `{success, datapack:{…}}` | fields are **flat**, no wrapper |
| `batch-get-data-items` → `{items:[…]}` | `{results:[{found,metadata,requested}], …}` |
| omit `data_types` → "retrieves all" | **400** — a server-side defect on stage |
| `get-data-item.data` is an object | it is a **JSON string**, must be parsed |
| 10 exportable data types | **18** |
| `scenario` ∈ `SINGLE_DB`/`ENTIRE_DB`/… | live: `DATAPACK_ALL_ITEMS`, `DATAPACK_SPECIFIC_ITEMS` |
| `overall_processsing_time` (three s's) | live uses the **normal** spelling — the typo is the doc's |

**Every one of these is absorbed in `services/dataInstallerParsers.ts`**, the only
module allowed to read a `snake_case` field. No handler, MCP tool or component can
tell the upstream service is inconsistent.

Parsing is lenient by design: unknown fields ignored, an unusable row skipped
rather than failing its list, every parser survives `null`/string/array/empty. A
shape change upstream must degrade the UI, never break it — which is why this uses
hand-rolled readers rather than a schema validator that would throw on a widened
type.

### Facts that shape the UI

- **`(datapack_name, version)` is the identity, always.** A lookup by name alone
  has no answer.
- **`main` cannot be assumed to exist.** Three of the eleven curated brands
  (`citisignal_original`, `luma`, `venia`) ship only `eds-compatible` and `hold`.
  That is 27%, not an edge case — `pickDefaultVersion` handles it.
- **A pack can declare a data type the service holds no item for.** The declared
  count alone would misstate what installing gets you, which is why the detail
  handler pairs the metadata with a batch item lookup.
- **Treat `commerce_instance` as an opaque string the caller supplies.** Do not
  derive it, validate it, or format it. Most stage records hold a base62 id; a
  few hold `https://datapack-accs.test`, which is test junk in a stage database
  rather than evidence of a contract. **That distinction cost this feature a
  day**: a live read was taken as a specification, and five bad rows became a
  documented "two-shape contract" that never existed. Stage data shows what has
  been written, not what is allowed.
- **Import-capable ≠ export-capable.** The import processor order contains
  `product_export`, `customers_export` and `giftcards`, which the export list
  lacks. Ask per mode; never cache one "all types" answer.
- The catalog is 40 rows for 25 names; 23 rows are `shared` across 11 curated
  brands, and the rest is developer scratch. The UI defaults to shared only.

---

## 3. Architecture

`src/features/data-installer/`, plus a standalone webview panel.

| File | Responsibility |
|---|---|
| `types.ts` | Domain types. ISO strings, not `Date` — these cross the webview boundary, where `postMessage` serializes a `Date` to a string anyway. |
| `services/dataInstallerConfig.ts` | Settings read, https-only validation, `actionUrl()`, `fingerprintUrl()`. Returns **reasons, never messages** — the caller owns wording. |
| `services/dataInstallerErrors.ts` | Typed errors; transport classified **structurally**, never by message text. |
| `services/dataInstallerParsers.ts` | The containment layer. One normalizer per endpoint. |
| `services/dataInstallerClient.ts` | All HTTP. No `vscode`. Injected `fetchImpl` + token provider. A drift canary logs unexpected key names once per endpoint, and never fails a request. |
| `services/datapackCatalog.ts` | Grouping, version ordering, default-version pick. Pure. |
| `handlers/dataInstallerHandlers.ts` | Six read message types + `resolveDataInstallerAccess`. |
| `commands/showDataInstaller.ts` | The panel. Standalone — deliberately does NOT dispose sibling tabs, because browsing datapacks should not close what you were looking at. |
| `ui/` | The panel surface — see below. |

**Two client classes, not one.** The read client needs only a bearer. Writes need
Commerce credentials and will get a sibling, so "do we have credentials yet?" is a
*type* question rather than a runtime one.

### The guard, and why it branches

`resolveDataInstallerAccess` runs the cheap local checks first (enabled? URL
usable?), then authentication, then builds a client with a token *provider* rather
than a captured value — tokens expire mid-session.

It branches on `context.panel`. `ensureAdobeIOAuth` pops a VS Code warning: right
from a webview, wrong from an MCP tool, where it would put a modal on the user's
window and block the agent until someone clicked. The headless path checks
authentication and returns a `needsAuth` marker instead. A test asserts
`ensureAdobeIOAuth` is never called without a panel.

### The UI

`Cmd+Shift+P` → **"Demo Builder: Open Data Installer"**. The panel opens without a
project selected — the catalog is global to the service.

- **Catalog** — a card grid, one card per datapack NAME with a version picker.
  Card art walks cover → thumbnail → a CSS letter tile; all 23 curated entries
  carry a thumbnail, 8 carry a cover, and the community entries carry neither.
- **Detail flyout** — `core/ui/Drawer`, opened from a card. Shows the metadata plus
  which declared types are actually stored.
- **Installed** — a row list of what the service records as installed, and where.
- **Activity** — the service's request log, filtered by operation, paged by a
  "Load 50 more" button.

**The response envelope is the trap this feature had to close.** A handler that
RETURNS `{success:false, error, code}` does not reject: the communication manager
puts the whole `HandlerResponse` in the response payload, and `webviewClient`
rejects only when a handler THROWS. So a guard refusal arrives looking exactly like
a success. `ui/hooks/useDataInstallerRequest.ts` unwraps it, turning both failure
shapes into one `failure` — before it existed, a signed-out user was told
"Connected to the Data Installer service".

---

## 4. What agents can and cannot do

Six read tools, listed in `mcp-server.md` §9. Three groups are **held back on
purpose** — the most reviewable judgement call in this feature:

- **Datapack authoring CRUD** — `create`/`update`/`delete-datapack`,
  `add`/`update`/`delete-data-item`, `promote-datapack-version`. The catalog is
  shared infrastructure: 23 shared entries other teams depend on,
  `delete-datapack` cascades, there is no undo and no visible ownership guard. One
  agent typo removes a colleague's demo. These stay behind UI actions with a
  named-target confirm.
- **`DELETE get-installed-datapacks`** — clears tracking without uninstalling
  anything. Its only effect is to make the tracking lie.
- **`async-process-status`** — reports `in_progress` for jobs that finished hours
  ago (see §5).

Deferred rather than declined: the ACO twin (`process-aco-datapack*`, a separate
`aco_*` type family) and `compare-datapacks`, whose shape is unprobed.

No read tool needs a custom response `shape`. Measured against the captured
fixtures: the whole 40-row catalog is ~17KB of JSON, one datapack's metadata
~0.5KB, an activity row ~360 bytes. The megabyte payload is a data **item**, which
no exposed handler returns; `limit`/`skip` is the lever for the rest, and it is the
service's own.

---

## 5. Facts for the write path (Stage 2+, not yet built)

Recorded here because they were measured and are expensive to re-derive.

**The two status endpoints fail in OPPOSITE directions**, and neither is
sufficient alone:

| Case | `datapack-process-status` (Mongo) | `async-process-status` (OpenWhisk) |
|---|---|---|
| Completed job (7 types, 175s) | correct | **lies: `in_progress`** (the record aged out) |
| Never started (invalid input) | **uninformative: `200` + empty map** | **correct: the validation error** |

So the durable one decides terminal success or failure; the activation echo
explains why nothing happened. Never poll the echo in a loop.

- **`202` does not mean the request was valid.** `process-datapack-async` accepted
  an empty body with a `202` and an activation id; the sync twin `400`s the same
  request. Validation happens in the worker, so validate before every start.
- **Async is mandatory.** Real installs run 12s – **366s**; the gateway times out
  around 60s.
- **There is no cancel endpoint.** The button is "Stop watching", and it must say
  the job continues server-side.
- **`partial` is a first-class outcome.** Re-runs legitimately skip existing items.
- A job is terminal only when the status map **covers** every requested type and
  all are terminal — "all present are terminal" declares victory after the first.

Credentials are backend-conditional: PaaS reuses the admin username/password
already in `componentConfigs`; ACCS needs a user-supplied OAuth Server-to-Server
`client_id`/`client_secret` that **cannot be auto-provisioned** (it is
product-profile gated on *Commerce Cloud Manager*) and belongs in **SecretStorage**,
never in `componentConfigs`.

---

## 6. See also

- [MCP Server](./mcp-server.md) — §9 lists the six read tools
- `.rptc/plans/data-installer/overview.md` — the plan and its staging
- `.rptc/research/data-installer/spike-01-live-api.md` — the live-API probe the
  contract above came from
