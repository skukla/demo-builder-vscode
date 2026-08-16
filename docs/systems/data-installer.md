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

**Reading** the service needs no credentials. The client sends the extension's
existing Adobe IMS token as `Bearer` — verified byte-identical to the token a
successful probe used — so no dedicated integration is needed. `health-check` is
the one call that sends no `Authorization` header.

**Writing does.** A datapack import, export or reset authenticates to the
Commerce instance itself, and for ACCS that means an OAuth Server-to-Server pair.
This document previously said "there are no credentials to configure" full stop,
which was true of reads and never of writes.

### Where the ACCS pair comes from — three sources, in precedence

| | Source | Configured by |
|---|---|---|
| 1 | the pair declared on the `adobe-commerce-accs` component | the user, by hand or via the "Set up credentials automatically" button |
| 2 | the shared credential service (`get-commerce-credentials`) | nobody, per project — it follows `demoBuilder.accsDiscovery.services`, already set for store discovery |
| 3 | — | nothing: the operation refuses, and offers Console provisioning only where that could succeed |

**A declared pair always wins**, so a project that has one behaves exactly as it
did before source 2 existed.

Source 2 exists because the pair can only be CREATED inside an Adobe I/O project
workspace, and a demo project that selects no App Builder components never gets
one — so before the broker it could browse the catalog and never import. The
shared pair lives in the org where the Commerce instances are and is handed out
over the guard chain that already protects `discover-stores`.

**The brokered pair is never persisted** — not to `componentConfigs`, not to
SecretStorage. It is shared rather than per-project, and it is re-fetchable, so a
stored copy would multiply one org-wide credential across project files and go
stale on rotation. See ADR-014 for the reasoning and the measured blast radius.

An unconfigured or refusing service is reported by **Diagnostics** ("Commerce
credential service"), not left as silence — the four states need three different
people to fix and otherwise arrive as one message.

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

### The Stage 4 loop — chosen in the wizard, installed here

The wizard's optional **Sample Data** area (`buildYourProjectAreas.ts` area id
`'sample-data'`, body `SampleDataStep.tsx`) records a datapack on the project as
`Project.datapack` and **never imports it**: an import needs a reachable instance
with working credentials and runs for minutes, and a failure inside creation
would leave a half-populated instance the wizard has no story for. The area's
status is unconditionally `completed`, so it can never gate Continue.

`get-datapack-import-target` reports that choice back, and the catalog shows
"&lt;project&gt; is set up for &lt;pack&gt;" with a link into its detail
(`RecordedChoiceNotice` in `DatapackCatalogView.tsx`). Nothing renders when there
is no project or no recorded choice.

There is deliberately **no datapack↔demo-package mapping table**: once the choice
is an explicit pick, an auto-map is a maintenance surface that still cannot cover
packs with no matching demo package.

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

## 5. The write path (Stage 2 — VERIFIED LIVE)

**Status: VERIFIED LIVE END TO END, 2026-08-13 — including through the modal.**
The full sequence ran against a real, populated ACCS instance twice over: once by
direct service calls with before/after snapshots, then through the extension's own
UI (modal import → per-type success; modal reset → instance diffed byte-identical
to its pre-import state, zero collateral). Dry run, credential check, import,
reset, and the detached watch have all met the service and behaved. Multi-type import and a six-type reset were exercised
2026-08-14 (see § "Reset semantics" and the run notes below). Remaining
unexercised: `partial` outcomes, and Stage 3 — which is blocked on the service,
see §6b.

| Piece | What it does |
|---|---|
| `services/dataInstallerWriteClient.ts` | `validateImport` (sync) + `startImport` (async) + `startDelete` (async, `operation_mode: 'delete'`) + `checkCredentials`. Credentialed sibling of the read client; status polling deliberately stays on the read client, since watching needs no credentials. |
| `services/commerceCredentials.ts` | PaaS reads the admin pair from `componentConfigs`; ACCS reads its OAuth pair from **`componentConfigs`** too, keyed on the `adobe-commerce-accs` component — one storage path, whether pasted or provisioned. Export safety comes from `SECRET_ENV_KEYS`, not from a second store. Answers "is there something to try?", never "will it work?". |
| `services/importJobRunner.ts` | The state machine — grace window on the empty map, covering-set terminal rule, `partial` as a first-class outcome, the echo consulted once. |
| `handlers/importHandlers.ts` | Seven write-side message types: `start-datapack-import` (validate → start → DETACHED watch recording into `TransientStateManager`, so closing the panel does not abandon an import), `validate-datapack-import` (dry run), `reset-datapack` (confirm-gated removal), `get-datapack-import-status`, `get-datapack-import-target` (instance + project name + the recorded datapack choice), `list-datapack-import-scopes` (the target picker's websites/store views), and `provision-accs-credentials`. |
| `ui/components/ImportDatapackModal.tsx` | An explicit state machine — one view at a time (form / busy / confirm-reset / watching / result). The target is DERIVED from the project and shown as name + id with a `Change` override; type checkboxes are limited to what the service STORES; optional website/store target pickers; a `products`-without-`customer_groups` warning; progress; "Stop watching"; and the two-press Reset. |
| `services/accsCredentialProvisioner.ts` | Console-free ACCS credentials: ensure the S2S credential, subscribe `ACCS-REST-API` via the direct call, read the pair back. |
| `services/workspaceConfigDownload.ts` | The impure half of the above — targeted `aio console workspace download` into a 0700 temp dir, deleted in `finally`. Validates the three ids first: the command is shell-executed. |
| `ui/hooks/useImportScopes.ts` | The import's target scope — discovered websites/store views plus the user's choice within them. |

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

**This is re-checked, not trusted.** `DATA_INSTALLER_API_BASE_URL=<endpoint> npm run
data-installer:drift` walks the four decided modes, seven undecided candidates and the
control on every run, and **exits non-zero** when a decided mode goes empty, a candidate
turns real, or the control stops behaving. A capability the service adds later surfaces
there instead of waiting to be noticed by hand. Adding a mode to `DECIDED_MODES` requires
writing the decision here first — that coupling is the point.

**The endpoint comes from the environment, and both halves of that sentence were broken
until 2026-08-16.** This line named `npm run data-installer:drift`, which was not a script
in `package.json` at all — every other reference in the repo calls the checker by its path.
And `readBaseUrl` read the SHIPPED DEFAULT of `demoBuilder.dataInstaller.apiBaseUrl`, which
was deliberately emptied when the feature was pulled before beta.129 (a stage Runtime
endpoint in a public repo). Nothing connected the two, so the checker read an empty base and
all six endpoints failed with "Failed to parse URL" — loudly, but for the wrong reason and
with no way to pass. Both are fixed: the npm script exists, and the endpoint is read from
`DATA_INSTALLER_API_BASE_URL`, which refuses to be empty. Verified live the same day —
`6 endpoints match their fixtures`, and exit 2 with a named remedy when the variable is
unset.

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

**There is no `paas` row anywhere in that set**, so no PaaS project had ever run
through this service — until 2026-08-14, when the question was answered live:
**PaaS works, as `site_type: local`.** `get-websites-and-stores` with a PaaS
storefront base URL as `commerce_instance` plus the admin pair returned 200 with
the instance's real websites and stores. So the prefill from
`ADOBE_COMMERCE_URL` is confirmed correct, not just the right shape. (The
`validate` half was not exercised in that session; pre-flight — the half that
gated everything on ACCS — was.)

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
  `AdobeID,openid` only.** It authenticates and is entitled to nothing.
- **Subscribing `ACCS-REST-API` to the credential is the entire fix** — measured
  same day: after the subscription the scopes become `commerce.accs`,
  `additional_info.projectedProductContext`, `additional_info.roles` (+ profile,
  email, org.read), and the SAME `get-websites-and-stores` call that pre-flight
  refused returns `200 site_type:accs` with the instance's real store structure.
  No Admin Console grant, no product profile step, no human action. An earlier
  version of this section — and the original research — said the entitlement
  "cannot be auto-provisioned"; that is now disproven live. The full loop
  (create credential → subscribe → read pair from the workspace download → write
  config) is automatable end to end.
- **The extension's own subscribe path cannot do that subscription today.**
  `ACCS-REST-API` lists `platformList: [NativeApp, SinglePageApp, WebApp]` and
  `oauthServerToServerOnly: true`; the subscribe axis filter reads ONLY
  `platformList`, so the one service that is S2S-only matches neither bucket and
  is silently dropped (`add_console_apis` reported subscribing just the managed
  mesh API). The working call is the direct
  `subscribeOAuthServerToServerIntegrationToServices` with the union of existing
  codes plus `ACCS-REST-API` — which is what `accsCredentialProvisioner` now
  does. The `add_console_apis` axis-filter defect above it is still live; this
  loop routes around it rather than fixing it.

### Reset semantics — PROVEN scoped, by controlled experiment (2026-08-13)

Run live against a populated instance (14 pre-existing categories in a CitiSignal
tree, 130 products), with before/after snapshots via the instance's own REST API:

- import `bodea` `categories` → 202, per-type `success` in ~11s → **+12 nodes**:
  the 11 pack categories **plus a `Bodea` root category the import created**.
  Packs bring their own root; they do not merge into an existing tree.
- delete (same body, `operation_mode: 'delete'`) → 202, `success` → **exactly
  those 12 nodes removed**. Pre-existing categories, the CitiSignal tree and all
  130 products untouched. Category count byte-identical to the pre-import state.

Corroborated by the service's own records: all 434 historical delete runs carry a
`scenario` of `DATAPACK_ALL_ITEMS` (381), `DATAPACK_SPECIFIC_ITEMS` (8) or
`SINGLE_DIRECT` (31) — every scenario is expressed in terms of the PACK's items;
no type-wide wipe scenario exists.

Two operational facts learned the hard way:

- **`GET /V1/categories` shows only the default store group's subtree.** A
  multi-root instance (Default + CitiSignal + a pack's root) makes an import look
  like a no-op through that endpoint while `per-type: success` is telling the
  truth. Use `GET /V1/categories/list` (flat search) to see reality.
- **Bodea's `products` hard-code `website_ids: [3]` — and the service rewrites
  them.** (116 numeric references; an earlier revision of this doc called this a
  portability landmine, which was wrong.) The service source
  (`data-installer-api-b2b`, `config/data_processors_import.json`) declares
  `website_ids: replaceWebsiteIdsWithSession()` on the `products` processor:
  every `website_ids` array in the pack data is replaced with
  `[session_website_id]` before it reaches Commerce. `cart_rules` gets the same
  numeric replacement; `product_export` and `stocks` get the code-based
  equivalent (`session_website_code` / sales-channel code).

  The session values come from optional request params `website_code` +
  `store_code` (a pair — one without the other is a 400): the service validates
  both against the target instance, including that the store belongs to the
  website, then runs the whole import against them. Omitted, they default to
  **`base` / `default`** (`IMPORT_GUIDE.md` lines 21–29 — `store_code` has its
  own documented default, which is easy to miss). Consequences:

  - A pack lands on exactly ONE website per run — the substitution collapses
    every `website_ids` to one element. Multi-website fan-out needs one run per
    website.
  - **Shipped 2026-08-14**: `buildBody` sends the pair when the user picks a
    target and omits both keys when they do not (absent means the service's
    default; `""` is a value it would validate). The picker is fed by
    `list-datapack-import-scopes`, which uses the extension's OWN
    `discoverStoreStructure` — NOT `get-websites-and-stores`, which needs the
    credential pair the wizard does not have yet and returns no store groups.
    See `.rptc/plans/datapack-import-targeting/`.
  - **Observed live 2026-08-14**: a 5-type bodea import put all 56 products on
    website 1 (`base`) — pack said `[3]`, REST readback said `[1]` — and no
    phantom website appeared. The substitution is real on the deployed service.

  **The intended workflow, confirmed by Jeff (the service author), 2026-08-14:**
  *"[Create the website] before import. Then you can specify site and store on
  the data pack import. It will validate to make sure they exist."*

  So the design is a precondition, not a fallback: **the target website and
  store must already exist in Commerce before the import runs.** `websites` is
  not an importable data type and never will be — creating it is a manual
  Commerce Admin step (or another tool's job). Landing everything on `base` is
  what happens when you skip the targeting, not the intended path for a pack
  that wants its own website. This is the precondition the targeting UI must
  state — see `.rptc/plans/datapack-import-targeting/`.

Two more import facts from the same run (2026-08-14):

- **A data type imports atomically.** One bad SKU (`vrrack`) failed the whole
  `products` type — zero products imported, while the other four types in the
  same request succeeded independently.
- **`products` depends on `customer_groups` when tier prices are present.**
  Bodea's `vrrack` tier prices name the "Platinum Buyer" group; the service's
  name→id lookup (`customer_group_id: replaceWithLookup(customer_groups_search)`)
  finds nothing unless `customer_groups` was imported first. Validate cannot
  catch it (shape-only). Re-running with `customer_groups` + `products`
  succeeded. The modal warns when `products` is selected without
  `customer_groups`, and only when the pack actually stores `customer_groups` —
  a warning naming an unavailable type would be noise.
- **Delete order is its own order, observed**: the 6-type reset deleted
  `customer_groups` first while `products` was still processing — consistent
  with the earlier finding that delete's processor order is not import's
  reverse. The full reset restored the instance byte-identical (categories,
  SKUs, websites all matching the pre-import snapshot).

### Targeting has no documented convention (checked 2026-08-14)

The service's docs describe the `website_code`/`store_code` mechanism and say
nothing about when to use it: no guidance on branded-vs-`base`, and no
pack-specific naming for `bodea` anywhere in `IMPORT_GUIDE.md`,
`QUICK_START_GUIDE.md`, `USER_README.md` or `API_REFERENCE.md`.

Nor can the run history settle it. **The log schema does not record the pair** —
its fields are `activation_id, commerce_instance, data_types, datapack_name,
operation_mode, scenario, site_type, timestamp, version`. Querying it prints an
absent website code for every run, which reads exactly like "nobody targets" and
is not evidence of anything. Do not draw that conclusion from it.

What the history DOES show (1000 most recent runs): `bodea` has 121 runs across
10 distinct instances between 2026-05-12 and 2026-08-14, 67 imports / 54
deletes, and **9 of those 10 instances imported all 14 types** — full installs
are routine. Settling the codes empirically needs a real instance's
`/V1/store/websites`, not the log.

### Datapacks carry NO product images — by design

Imported products have no imagery, and that is the intended division of labour,
not a defect to chase. Three independent confirmations (2026-08-14):

- The service's pack-prep tooling strips them. `data-installer-api-b2b`
  `docs/CONVERT_CSV_EXPORT.md` §6 "Image Path Removal" clears `base_image`,
  `small_image`, `thumbnail`, `swatch_image`, `additional_images` and their
  label fields — stated rationale: "to avoid broken references".
- Image import is an OPEN QUESTION for the service, not a shipped feature —
  `TODO.md` (Low Priority): "Determine if we need to support image import".
- **Measured: 11 packs across 4 owners, zero products with
  `media_gallery_entries`.** Includes `citisignal_new@main` (130 products),
  `citisignal_original@hold` (125), all four `bodea` versions (56 each),
  `carvello`, and three third-party dev packs. The `products` JSON schema
  permits the field; nothing populates it.

**Where images actually come from**: AEM Assets. Confirmed by Jeff (the service
author), 2026-08-14 — asked whether SCs are meant to supply product images in a
pack, the answer was *"was expected to be in AEM"*. The EDS storefront's
`AEM_ASSETS_ENABLED` setting renders to `commerce-assets-enabled` in generated
`config.json` and tells the dropins to resolve product images through Assets.

Do not confuse that with `aem.repositoryId`, which is written per-site to the
DA.live config so da.live's *Library* shows an Assets panel to authors — a
different mechanism with a different consumer. See
`.claude/skills/eds-publish-and-config` for the scoping rules on the second one.

**The escape hatch, if a demo genuinely needs catalog-hosted images**: Commerce's
native product API accepts them, base64-encoded (Jeff, same conversation). That
is outside the Data Installer entirely — a separate script against
`POST /V1/products/:sku/media`, not something a datapack can carry.

### Customer segments are not supported

Jeff, 2026-08-14: *"true, api doesn't support"*. Segments cannot be imported,
exported, or seeded by any pack — same permanent-gap class as quotes and
requisition lists (no processor exists for those either; the vocabulary is 21
import / 18 export types and none of the three appear). Anything a demo needs in
those three areas is a manual post-import step, forever.

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
- **Before the worker registers an activation (~15s), `datapack-process-status`
  returns `404` "No request log found"** — measured live 2026-08-13. The spike's
  "200 with an empty map" is what an INVALID job returns; the warm-up shape is
  this 404. The client maps it to `hasRecord: false`, so both land in the grace
  logic rather than throwing five error lines into a healthy run's logs.

Credentials are backend-conditional: PaaS reuses the admin username/password
already in `componentConfigs`; ACCS needs an OAuth Server-to-Server
`client_id`/`client_secret`. **Both live in `componentConfigs`** — one storage
path whether the user pastes the pair or the extension provisions it — and
`ACCS_OAUTH_CLIENT_SECRET` is registered in `SECRET_ENV_KEYS` so exports strip
it.

An earlier revision of this section said the ACCS pair could not be
auto-provisioned and belonged in SecretStorage. Both halves were wrong:
`accsCredentialProvisioner` creates the credential and subscribes
`ACCS-REST-API` to it, proven live 2026-08-13 (recorded above).

---

## 6. Verifying the write path without writing

The one call that proves the request shape and the credentials **without importing
anything**: the synchronous twin with `operation_mode: 'validate'`. It is the same
body the client builds (`services/dataInstallerWriteClient.ts`, `buildBody`).

```bash
# The shipped default is EMPTY on purpose (public repo — see the settings-schema
# guard), so read the endpoint from your own VS Code settings, not package.json.
BASE=$(python3 -c "import json,re,os;s=re.sub(r'^\s*//.*$','',open(os.path.expanduser('~/Library/Application Support/Code/User/settings.json')).read(),flags=re.M);print(json.loads(s)['demoBuilder.dataInstaller.apiBaseUrl'].rstrip('/'))")
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
`docs/DEPLOYMENT.md`. Thirteen actions declare it, `process-datapack` among
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

## 7. See also

- [MCP Server](./mcp-server.md) — §9 lists the six read tools
- [ADR-014](../architecture/adr/014-data-installer-shared-credential.md) — why the
  ACCS pair is served from a shared service, and what one such credential reaches
- `.rptc/plans/data-installer/overview.md` — the plan and its staging
- `.rptc/complete/data-installer-credential-broker/overview.md` — the credential
  decision, its steps, and the cross-org question still open
- `.rptc/research/data-installer/spike-01-live-api.md` — the live-API probe the
  contract above came from
