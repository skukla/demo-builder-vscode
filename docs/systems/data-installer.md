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

## 5. The write path (Stage 2 — BUILT, never run live)

**Status, stated plainly: every piece below is unit-tested and none of it has met
the service.** The first real run writes data into a Commerce instance, and there
is no undo and no cancel. Treat this section as "built and unverified", not as
"working".

| Piece | What it does |
|---|---|
| `services/dataInstallerWriteClient.ts` | `validateImport` (sync) + `startImport` (async) + `startDelete` (async, `operation_mode: 'delete'`) + `checkCredentials`. Credentialed sibling of the read client; status polling deliberately stays on the read client, since watching needs no credentials. |
| `services/commerceCredentials.ts` | PaaS reads the admin pair from `componentConfigs`; ACCS reads an OAuth pair from **SecretStorage only**, keyed per project. Answers "is there something to try?", never "will it work?". |
| `services/importJobRunner.ts` | The state machine — grace window on the empty map, covering-set terminal rule, `partial` as a first-class outcome, the echo consulted once. |
| `handlers/importHandlers.ts` | Validate → start → DETACHED watch recording into `TransientStateManager`, so closing the panel does not abandon an import. Also `validate-datapack-import` (dry run) and `reset-datapack` (confirm-gated removal). |
| `ui/components/ImportDatapackModal.tsx` | Instance field (empty, never derived), type checkboxes limited to what the service STORES, progress, "Stop watching", and the two-press Reset. |

**There IS a dry run.** `validate-datapack-import` runs the same guard,
credentials and request body as a start and stops after the synchronous
`operation_mode: 'validate'` call — the **Validate** button beside Start in the
import modal. Both paths build that body through one shared `prepareImport`, so a
dry run cannot check something other than what a start would send.

A refusal comes back as `{valid:false, reason}` with `success: true`: the call
worked and the service answered. The reason is the service's own wording and is
the whole point of the button.

Validate answers "is this request well-formed". It does **not** answer "do these
credentials reach that instance" — so the dry run asks that first, with
`get-websites-and-stores`, a read that cannot start work by accident. A credential
gap comes back as the same `{valid:false, reason}` shape, because from the user's
side it is the same answer: this will not run.

§6 keeps the equivalent direct call, for probing without the extension open.

### The `operation_mode` axis is closed at four (probed 2026-08-13)

`import`, `validate`, `delete`, `export`. Nine other candidates (`update`, `upsert`,
`sync`, `compare`, `rollback`, `uninstall`, `reset`, plus a deliberate nonsense
string and the parameter omitted entirely) were walked against
`get-processor-order`. **Every unknown mode answers `200` with an EMPTY processor
list — it never 400s**, so the readable signal is the count, not the status. The
nonsense control behaved identically to the guesses, which is what makes the four
non-empty answers mean something.

This axis is recorded because it is what the original plan missed: the plan
enumerated ACTION names and decided each one, but `operation_mode` is a parameter
whose values were *used* (`validate`, `export`) without ever being *enumerated* —
and `delete`, the reset, lived there. Coverage has to be `action × mode`.

**This is re-checked, not trusted.** `npm run data-installer:drift` walks the four
decided modes, seven undecided candidates and the control on every run, and **exits
non-zero** when a decided mode goes empty, a candidate turns real, or the control
stops behaving. A capability the service adds later surfaces there instead of
waiting to be noticed by hand. Adding a mode to `DECIDED_MODES` requires writing the
decision here first — that coupling is the point.

**Limit, stated plainly:** this enumerates modes `get-processor-order` knows about.
A mode that exists on `process-datapack-async` but has no processor list would be
invisible to it. Omitting the parameter returns the import set, so there is no
"list the modes" endpoint to ask instead.

### The service DERIVES the site type — and there is no `paas` (measured 2026-08-13)

Nothing in `buildBody` sends a site type. The only things that go up are
`commerce_instance` and the credential pair, so the classification is server-side
inference from those.

Across **all 1063 log records** (complete, not a sample) the vocabulary is:

| `site_type` | rows | `commerce_instance` shape |
|---|---|---|
| `accs` | 933 | 21–22 char base62 nanoid |
| `local` | 70 | **a full URL** |
| `aco` | 34 | 21–22 char base62 nanoid |
| absent | 26 | mixed |

**There is no `paas` row anywhere in that set**, so no PaaS project has ever run
through this service.

What it means for a PaaS target. For ACCS the service expands a tenant id into a
base URL from its own configuration — which it can only do for instances it knows
about. The `local` rows show that when it *cannot* look an instance up, it takes a
full URL instead. A PaaS instance is equally unknown to it, so the full base URL is
the only thing it could resolve, and that is what the extension prefills from
`ADOBE_COMMERCE_URL`. The UI marks it unverified and says to dry-run it, because
"the right shape" is not "known to work".

Two details worth keeping: `get-installed-datapacks` does **not** carry `site_type`
at all (only `logs` does), and its array is keyed `datapacks`, not `items` — an
extractor written for the other endpoints silently reports zero rows against a
non-zero `total`.

### Pre-flight, and what the first live dry run proved (2026-08-13)

The first dry run that REACHED the service came back:

> Pre-flight check failed for all configured site types (accs, local). Verify
> commerce_instance and authentication.

Four facts, each measured:

- **The service's own error names its complete site-type vocabulary — `accs` and
  `local`.** Independent confirmation of the axis probe: there is no `paas`
  handler configured server-side.
- **A syntactically valid OAuth S2S pair passes IMS.** A bogus pair gets
  `401 invalid_client`; the real pair proceeds to pre-flight. So `checkCredentials`
  distinguishes "pair is wrong" from "pair is entitled to nothing".
- **Pre-flight fails IDENTICALLY for a real instance and a nonsense string**, so
  the error cannot distinguish "instance unknown to the service" from "technical
  account has no access to it". Neither can we, from outside — settling it needs
  the service owner or an instance already known to work.
- **A freshly created `demo-builder-s2s` credential carries scopes
  `AdobeID,openid` only.** It authenticates and is entitled to nothing. Creating
  the credential is automatable (proven live); granting its technical account
  access to a Commerce instance is the product-profile step that is not — and that
  grant is an authorization decision, which is arguably the one step that SHOULD
  stay human.

### Reset — how a project gets reused

The service takes `operation_mode: 'delete'` on the same `process-datapack-async`
action, and `get-processor-order?operation_mode=delete` returns the **same 21
`data_type`s** as import — verified as a set, not by count — in its own dependency
order. That order is **not** the reverse of import's, so do not derive one from the
other. Read plainly: nothing importable is undeletable, and a reset is an activation
id like any other, so the runner watches it with **no changes** — the seam working
as designed.

For Stage 3: `export` lists **18** of those 21, but that is **not** a three-capability
gap. Two of the three are naming artifacts, and the service's own descriptions say so:

| Type | Import processor | What the service calls it |
|---|---|---|
| `product_export` | `JsonImportProcessor` | "Import product data via bulk import endpoint" |
| `customers_export` | `JsonImportProcessor` | "Import customer data with batch processing" |
| `giftcards` | `GiftCardImportProcessor` | "Import gift card products with loop processing" |

`product_export` and `customers_export` are **import-side input formats**, not export
capabilities — the `_export` suffix names the shape of the data being read in, not a
direction. Export already emits products and customers through `ProductsExportProcessor`
and `CustomerExportProcessor` under the plain `products` / `customers` types.

So the only genuine export gap is **`giftcards`**: it has an import processor and no
export counterpart. That is the one the Stage 3 UI must say it will skip.

**Unverified, do not build on it yet:** that an export artifact can be re-imported
through `product_export` / `customers_export` is a reasonable reading of the names,
but nothing here proves it. Confirming it means running an export and inspecting the
artifact's data types — a write, so it waits for live verification.

`reset-datapack` refuses anything without `confirm: true`, and the modal arms that
confirm with a separate press that replaces the whole footer. There is no undo, so
one mis-click must not be able to remove data.

Two other "deletes" exist and are deliberately NOT wired: `delete-datapack` removes
a pack from the shared catalog for everyone, and `DELETE get-installed-datapacks`
edits tracking only, which would make the record disagree with the instance.

**One thing the build assumes and cannot yet confirm**: what scope its auth
requests. The question was put to the service owner and declined, so the design
finds out by attempting — the first live call is the experiment. (The credential
field names are no longer a guess: `admin_username`/`admin_password` for PaaS and
`client_id`/`client_secret` for ACCS, both read off the live probe in
`.rptc/research/data-installer/spike-01-live-api.md`.)

Everything below was measured and is expensive to re-derive.

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

## 6. Verifying the write path without writing

The one call that proves the request shape and the credentials **without importing
anything**: the synchronous twin with `operation_mode: 'validate'`. It is the same
body the client builds (`services/dataInstallerWriteClient.ts`, `buildBody`).

```bash
BASE=$(python3 -c "import json;print([s['properties']['demoBuilder.dataInstaller.apiBaseUrl']['default'] for s in json.load(open('package.json'))['contributes']['configuration'] if 'demoBuilder.dataInstaller.apiBaseUrl' in s.get('properties',{})][0])")
TOK=$(aio config get ims.contexts.cli.access_token --json | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -sS -X POST "$BASE/process-datapack" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"datapack_name":"bodea","version":"main","commerce_instance":"<your-instance>",
       "data_types":["categories"],"operation_mode":"validate",
       "admin_username":"<admin>","admin_password":"<password>"}'
```

Swap the two `admin_*` fields for `"client_id"`/`"client_secret"` on ACCS.

To check the credentials alone, without a datapack in the request at all:

```bash
curl -sS -X POST "$BASE/get-websites-and-stores" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"commerce_instance":"<your-instance>",
       "admin_username":"<admin>","admin_password":"<password>"}'
```

What each answer means:

| Response | Reading |
|---|---|
| `{"success":true}` | The body shape and credentials are accepted. The import path is sound as far as this can prove. |
| `400` naming a field | The request shape is wrong — fix `buildBody`, not the caller. |
| `401`/`403` | Credentials or scope. This is the scope question the service owner declined to answer, arriving empirically. |
| `404` | Wrong action name. Runtime routes on the LAST path segment. |

**Do not paste the output anywhere tracked.** It echoes the instance id, and the
request carries credentials — this repo is public. Report the shape of the answer,
not the answer.

## 7. See also

- [MCP Server](./mcp-server.md) — §9 lists the six read tools
- `.rptc/plans/data-installer/overview.md` — the plan and its staging
- `.rptc/research/data-installer/spike-01-live-api.md` — the live-API probe the
  contract above came from
