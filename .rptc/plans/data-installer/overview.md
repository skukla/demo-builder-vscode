# Data Installer integration — plan + handoff

**Branch**: `feature/data-installer` (worktree at
`demo-builder-vscode.worktrees/feature/data-installer`)
**State**: **Stage 1 SHIPPED** — merged to `develop` as `a3c07420` (14 commits,
fast-forward). Gate-green at merge: 17 suites / 265 tests in the feature, whole
suite 988/12,617, `tsc` clean, whole-repo lint 0 problems, `npm run compile` emits
`dataInstaller-bundle.js`. All four UI surfaces visually confirmed by the user.
**Stage 2 is unblocked** — see HANDOFF.md "Next action".

**Start here → [`HANDOFF.md`](HANDOFF.md)** for exact next actions and the traps.
This file is the design.

---

## Why

Jeff Britts' team deployed a **Data Installer API** — an Adobe App Builder service that
stores Commerce sample-data "datapacks" in MongoDB and installs them into live Commerce
instances. It holds a curated catalog of 11 demo brands and is in active use (1060+ request
logs, 35 tracked installations).

Demo Builder creates the Commerce backends those datapacks install into, but a user who
wants sample data has to leave the extension and drive Postman. This brings it inside:
browse the catalog, install into the project's Commerce instance, export an instance back
out — with the surface exposed as MCP tools so agents can do the same.

Three stages, in this order because the dependency forces it: **reads need only an IMS
token and work today; writes need Commerce credentials that ACCS projects do not store.**

Research: [`../../research/data-installer/spike-01-live-api.md`](../../research/data-installer/spike-01-live-api.md).
Source docs are the Confluence exports in `docs/research/data-installer/` (gitignored —
vendor material, public repo).

---

## The verified contract — do NOT re-derive this

Everything here was measured against the live service. **The published docs are wrong in
seven places.** Fixtures captured from the real API live in
`tests/fixtures/data-installer/` (15 files, identifiers scrubbed).

| Doc says | Reality |
|---|---|
| `get-datapack-metadata` → `{success, datapack:{…}}` | fields are **flat**, no wrapper |
| `batch-get-data-items` → `{items:[…]}` | `{results:[{found,metadata,requested}], …}` |
| omit `data_types` → "retrieves all" | **400** — live server-side defect on stage |
| `get-data-item.data` is an object | it is a **JSON string**, must be parsed |
| 10 exportable data types | **18** |
| `scenario` ∈ `SINGLE_DB`/`ENTIRE_DB`/… | live: `DATAPACK_ALL_ITEMS`, `DATAPACK_SPECIFIC_ITEMS` |
| `overall_processsing_time` (three s's) | live uses the **normal** spelling — the typo is the DOC's |

**Auth is solved.** The extension's IMS token (`aio config get
ims.contexts.cli.access_token`, what `authentication/services/tokenManager.ts` reads) is
accepted as-is. No dedicated client-credentials integration is needed. Verified
byte-identical to the token a successful probe used.

**The two status endpoints fail in OPPOSITE directions.** Neither is sufficient alone:

| Case | `datapack-process-status` (Mongo) | `async-process-status` (OpenWhisk) |
|---|---|---|
| Completed job (7 types, 175 s) | correct | **lies: `in_progress`** (record aged out) |
| Never started (invalid input) | **uninformative: `200` + empty map** | **correct: the validation error** |

So: the durable one decides terminal success/failure; the activation echo explains why
nothing happened. Never poll the echo in a loop.

**`202` does not mean the request was valid.** `process-datapack-async` accepted an empty
body with a `202` + activation id; the sync twin `400`s the same request. Validation
happens in the worker.

**Async is mandatory.** Real installs run 12 s – **366 s**; the gateway times out ~60 s.

**The catalog.** 40 entries / 25 names; 23 entries `shared: true` under `owner: "CoreTech"`
across 11 brands (bodea, carvello, citisignal_new, citisignal_original, frescopa, grocery,
healthbeauty, luma, venia, wecafe, wknd). The rest is developer scratch. Default the UI to
`shared: true`.

- `(datapack_name, version)` is the identity, always.
- **`main` cannot be assumed to exist** — 3 of 11 curated brands (`citisignal_original`,
  `luma`, `venia`) ship only `eds-compatible` + `hold`.
- **15 of 23 curated entries have an empty `cover_image`** but all have a `thumbnail_image`,
  so a card's fallback chain is the common path.
- `commerce_instance` — **an opaque caller-supplied string.** Don't derive, validate or
  format it. The original claim ("always an ACCS instance id") was over-specified, and so
  was the correction that replaced it: a stage read found a few junk rows and I wrote them
  up as a second shape. Stage data is not a spec.
- The brands do **not** map 1:1 onto `demo-packages.json` — `citisignal` corresponds to
  *two* packs; `isle5` and `buildright` to none. Any suggestion feature needs an explicit
  table, never a name match.

**Import-capable ≠ export-capable.** The import processor order contains `product_export`,
`customers_export`, `giftcards`, which the export list lacks. Ask per mode; never cache one
"all types" answer.

---

## Architecture

`src/features/data-installer/`, plus a standalone webview panel.

**The client is the containment boundary.** Every divergence above is absorbed in one named
normalizer in `dataInstallerParsers.ts` — the only module allowed to read a `snake_case`
field. No handler, MCP tool or component can tell the upstream service is inconsistent.

**Two client classes, not one.** The read client needs only a bearer. Writes need Commerce
credentials and get a sibling, so "do we have credentials yet?" is a *type* question.

**Parsing is lenient by design.** Unknown fields ignored, an unusable row skipped rather
than failing its list, every parser survives `null`/string/array/empty. A shape change
upstream must degrade the UI, never break it — which is why this uses hand-rolled readers
rather than a schema validator that would throw on a widened type.

### Built — all of Stage 1

| File | Responsibility |
|---|---|
| `types.ts` | Domain types. ISO strings not `Date` — these cross the webview boundary where `postMessage` serializes a `Date` to a string anyway. |
| `services/dataInstallerConfig.ts` | Settings read, https-only validation, `actionUrl()` (Runtime routes on the LAST segment), `fingerprintUrl()`. Returns **reasons, never messages**; caller owns wording. |
| `services/dataInstallerErrors.ts` | Typed errors; transport classified **structurally**, never by message text. |
| `services/dataInstallerParsers.ts` | THE containment layer. One normalizer per endpoint. |
| `services/dataInstallerClient.ts` | All HTTP. No `vscode`. Injected `fetchImpl` + token provider. Drift canary lives here (once per endpoint, key names only, never fails the request). |
| `services/datapackCatalog.ts` | Grouping + version ordering + default-version pick. |
| `handlers/dataInstallerHandlers.ts` | 6 read message types + `resolveDataInstallerAccess`. |
| `commands/showDataInstaller.ts` | Panel. Standalone — deliberately does NOT dispose sibling tabs. |
| `ui/DataInstallerScreen.tsx` | Page shell: header + `ViewSwitcher` + the active view. Owns no data. |
| `ui/hooks/useDataInstallerRequest.ts` | Unwraps the response envelope. A guard refusal RETURNS rather than throws, so without this it reads as a success — which is exactly what the connectivity line it replaced did. **Every view goes through this, not `useVSCodeRequest`.** |
| `ui/dataInstallerFailure.tsx` | The one failure treatment for every view. Signed-out is never a Retry. |
| `ui/components/DatapackCard.tsx` | Card: cover → thumbnail → CSS letter tile, version `Picker` (contained), opens the flyout. Promotes to `core/ui` at Stage 4. |
| `ui/components/DatapackDetailPanel.tsx` | `core/ui/Drawer`'s second consumer. Pairs metadata with the stored-item inventory. |
| `ui/components/ViewSwitcher.tsx` | Feature-local; renders nothing below two views. |
| `ui/views/` | `DatapackCatalogView`, `InstalledDatapacksView`, `DatapackActivityView`. |
| `ui/styles/data-installer.css` | Feature-scoped — reaches ONLY the `dataInstaller` bundle. |
| `ai/server/readDescriptors.ts` (rows) | Six read tools. A test pins that the exposed types EQUAL the handler map's keys. |

**The headless branch is the point of the guard.** `ensureAdobeIOAuth` pops a VS Code
warning — right from a webview, wrong from an MCP tool, where it blocks the agent on a modal
on the user's window. So the guard branches on `context.panel`; the headless path returns a
`needsAuth` marker. A test asserts `ensureAdobeIOAuth` is never called without a panel.

### Where Stage 1 diverged from this plan

Three of the components this plan named turned out to be the wrong ones when read from
source. Recorded so the same calls are not re-litigated:

- **`useSearchFilter`** (10b) — zero consumers, and its `Record<string, unknown>`
  constraint does not admit an interface. Both peers that filter lists call the underlying
  `matchesSearchFields` predicate directly, and so does this.
- **`GridLayout`** (10b) — takes a fixed column COUNT. Both shipped card grids reflow by
  width (`auto-fill` + `minmax`), so the catalog uses a CSS class like they do.
- **`SearchableList`** (11) — built for SELECTION, and its container needs a flex parent
  with a resolved height that `.page-container-padded` is not. The installed list uses
  `ProjectRowList`'s shape instead.

And one non-deviation worth stating: **no read tool needs a custom `shape`.** Measured
against the fixtures, the whole 40-row catalog is ~17KB of JSON and a datapack's metadata
~0.5KB. The megabyte payload is a data ITEM, which no exposed handler returns.

### Stage 2 — import

**Credentials are backend-conditional, and PaaS has no gap:**

- **PaaS** → the `ADOBE_COMMERCE_ADMIN_USERNAME`/`_PASSWORD` already in `componentConfigs`.
- **ACCS** → a new user-supplied `client_id`/`client_secret` from an Adobe Developer Console
  **OAuth Server-to-Server** credential in a project with the *Adobe Commerce as a Cloud
  Service* service added. ACCS REST accepts only IMS OAuth2.
  - **Cannot be auto-provisioned** — product-profile gated on *Commerce Cloud Manager*.
    Ship the Console click-path as docs, naming that profile: it is the step that silently
    hides the service.
  - **SecretStorage only.** Also keeps them out of `componentConfigs`, which matters: a
    value there is exported unless its key is in `SECRET_ENV_KEYS`
    (`components/config/envVarKeys.ts`). A guard test now enforces that, added on `develop`.
- `getWorkspaceCredential()` is **not** reusable — no secret, wrong org, wrong service.
  Do not wire it up. Also **do not delete it**: the pending `appbuilder-deployable-model` D2
  plan names it as the pattern to mirror.

**One question for the service owner**, cheaper than testing: what `scope` does
`auth/authenticate.js` send? A hardcoded `commerce.accs` makes the pair ACCS-only.

**Job runner** — extension-host, panel-independent, records in `TransientStateManager`:

1. Empty `data_types` map → `pending` for a 60 s grace window. Key on the **empty map**, not
   the documented error body.
2. Still empty after grace → `never-registered`; call the activation echo **once** for the
   reason.
3. Terminal only when the map **covers** every requested type and all are terminal. The
   covering-set rule matters — "all present are terminal" declares victory after the first.
4. All success → `success`; mixed → **`partial`, a first-class outcome** (re-runs legitimately
   skip existing items); all error → `error`.
5. **Validate before every start** — the sync twin `400`s what async accepts.
6. **No cancel endpoint exists.** The button is "Stop watching" and says the job continues
   server-side. Pin both strings.

Use `PollingService.pollUntilCondition` (`core/shell/pollingService.ts`) — it swallows check
errors and keeps polling, which the grace-window 404 needs. **Raise `maxAttempts` (default
60) AND `timeout`**: with backoff capped at `POLL.MAX` 5 s, `maxAttempts` binds first at ~5
min and the `timeout` parameter never fires. Do **not** use `usePollingWithTimeout` — zero
consumers, restarts on every render with an un-memoized caller, and dies on the first error.

**Blocking spike before any Stage 2 UI**: does `commerce_instance` equal the tenant id from
`ACCS_ENDPOINT_PATTERN` group 2 (`components/services/envVarHelpers.ts`)? Shapes match
(21–22 char base62) but this is **unverified**. Either way the instance id is a
**user-editable field pre-filled with the derived value** — importing into the wrong
instance writes sample data into someone's live demo.

Reuse (confirmed with the session that built it): **skip `readStoreStructure`** (derives from
the saved project). For PaaS, `getAdminToken` (`eds/services/commerceStoreDiscovery.ts`)
**is** the credential check. For ACCS nothing local can validate the pair — which is why
`operation_mode: 'validate'` against the Data Installer is the only real check. Reuse
`selectDiscoveryService` rather than re-reading the setting.

Store scope: **read** via `resolveBackendOwnedScopeValue`, **write** via `resolveWriteTargets`
(`components/services/componentConfigWrites.ts`) — never `writeToComponents` directly.

### Stage 3 — export

Two-step, reusing the Stage 2 runner unchanged with `operation_mode: 'export'`. **If it needs
runner changes, the Stage 2 seam was wrong** — that is the design's falsification test.
`get-export-items/:data_type` uses `x-*` headers and needs a `REQUEST_TIMEOUTS` entry. Scope
the selections builder to the `in` operator plus `root_category`; `StepRail` **is** right here
(export is genuinely forward-only).

### Stage 4 — wizard hook (seam only)

One area row in `buildYourProjectAreas.ts` rendering the catalog compact; `DatapackCard`
promotes to `core/ui` as its second consumer arrives. `wizard-steps.json` untouched — nested
area, not a step. The datapack↔demo-package mapping is an **explicit table**, and a product
decision.

---

## Deliberately not exposed to agents

The MCP ask was "every feature". Three groups are held back — **the most reviewable
judgement call in this plan:**

- **Datapack authoring CRUD** (`create`/`update`/`delete-datapack`, `add`/`update`/
  `delete-data-item`, `promote-datapack-version`). The catalog is shared infrastructure —
  23 shared entries other teams depend on, `delete-datapack` cascades, no undo, no ownership
  guard visible. One agent typo removes a colleague's demo. Stage 3 needs `create-datapack` +
  `add-data-item` on the *client*; they stay behind UI actions with a named-target confirm.
- **`DELETE get-installed-datapacks`** — clears tracking without uninstalling. Its only
  effect is to make the tracking lie.
- **`async-process-status`** — reports `in_progress` for jobs finished hours ago.

Deferred, not declined: the **ACO twin** (`process-aco-datapack*`, separate `aco_*` family,
no `get-aco-export-data-types` — 404) and `compare-datapacks` (shape unprobed).
