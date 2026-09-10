# Research: I/O Events provider + registration lifecycle (create / list / delete)

**Date:** 2026-08-28
**Question:** What would it take for the extension to CREATE, LIST, and DELETE Adobe I/O
Events providers and event registrations — Commerce eventing set up AND fully torn down
(idempotency is the product goal) — on both surfaces (wizard/dashboard UI and MCP tools)?
**Mode:** Three provenances — starter-kit ground truth (local clone), installed `aio` CLI
(read-only help), SDK/docs (Context7 + Perplexity-sourced developer.adobe.com citations).
Every claim is tagged with its source. No cloud writes were made.

**Headline finding:** the extension ALREADY has list + delete (teardown-scoped:
`ioEventsClient.ts`, 2026-07) and ALREADY drives the starter kit's own install/uninstall
API (`appManagementInstaller/Uninstaller`, 2026-08-27). The genuinely missing piece is
**create** (provider → event metadata → registration) and promoting the whole lifecycle
to a first-class, project-scoped surface (UI + MCP) instead of a teardown internal.

---

## 1. Ground truth — the Commerce Integration Starter Kit

Clone: `/Users/kukla/.demo-builder/projects/bodea/components/commerce-integration-starter-kit`
(v4.0.0, `package.json:3`).

### 1.1 The onboarding scripts are gone — v4 is declarative + App Management

- There is **no `scripts/` directory** and no onboarding npm scripts. `package.json:15-24`
  has only lint/test/format plus `postinstall: npx aio-commerce-lib-app hooks postinstall`.
- `README.md:34`: *"This starter kit uses App Management to install, configure, and deploy
  the application. Event subscriptions, installation, and authentication are declared in
  `app.commerce.config.ts` and managed by App Management, so the manual onboarding scripts
  are no longer needed."*
- `install.yaml` declares extension point `commerce/extensibility/1` and required APIs:
  `commerceeventing`, `CloudIntegrationSDK`, `AdobeIOManagementAPISDK`.

### 1.2 What is declared (app.commerce.config.ts)

- `eventing.commerce[]`: one provider `{ key: "commerce", label: "Commerce Provider" }`
  with 8 Commerce observer events (product/customer/customer-group/order/stock
  `observer.*_commit_after`), each with a field list and target runtime actions
  (`app.commerce.config.ts:6-163`).
- `eventing.external[]`: one provider `{ key: "backoffice" }` with 13 `be-observer.*`
  events (`:164-266`).
- `metadata`: `{ id: "commerce-integration-starter-kit", version: "1.0.2" }` (`:268-274`) —
  this id feeds the deterministic provider `instance_id` (see 1.4).
- Plus one Commerce webhook (`check_stock`) — out of scope here.

### 1.3 How install/uninstall actually runs

The generated web action `app-management/installation` (declared in
`src/commerce-extensibility-1/ext.config.yaml`, "auto-generated" block) runs in the app's
own Runtime workspace with inputs `AIO_COMMERCE_AUTH_IMS_CLIENT_ID / _CLIENT_SECRETS /
_TECHNICAL_ACCOUNT_ID / _TECHNICAL_ACCOUNT_EMAIL / _ORG_ID / _SCOPES` (an **OAuth
server-to-server credential**), `require-adobe-auth: true`, 600 s timeout.

Its HTTP routes (`node_modules/@adobe/aio-commerce-lib-app/dist/es/actions/installation/index.mjs:365-372`):

```
GET  /                              install status
POST /                              start install   body: { appData, commerceBaseUrl }
POST /validation                    pre-install validation
POST /uninstallation                start uninstall
GET  /uninstallation                uninstall status
DELETE /uninstallation              clear state only (no offboarding)
```

`appData` is schema-validated to require `consumerOrgId`, `projectId`, `workspaceId`
(+ names/titles) (`index.mjs:256-273`). So the caller — Commerce Admin's App Management
UI, or our extension — supplies the Console coordinates; the S2S credential rides in as
action inputs.

### 1.4 What install CREATES, through which calls (management-CfYDBXqP.mjs)

All I/O-side calls go through `@adobe/aio-commerce-lib-events/io-events` (see §3.1 for
the exact HTTP endpoints). Per declared provider, in order:

1. **Provider** — `ioEventsClient.createEventProvider({ consumerOrgId, projectId,
   workspaceId, description, instanceId, label, providerType })`
   (`management-CfYDBXqP.mjs:765-786`). `instanceId` is generated deterministically from
   app metadata + provider key + **workspaceId** (`generateInstanceId`), and creation is
   **find-or-create**: an existing provider with that `instance_id` is reused
   (`createOrGetIoEventProvider`, `:792-810`).
2. **Event metadata** — one `createEventMetadataForProvider({ …appCredentials,
   description, eventCode, label, providerId })` per event, find-or-create by
   `event_code` (`:812-847`).
3. **Registration** — one per runtime action:
   `createRegistration({ consumerOrgId, projectId, workspaceId,
   clientId: AIO_COMMERCE_AUTH_IMS_CLIENT_ID, deliveryType: "webhook", description,
   enabled: true, eventsOfInterest: [{eventCode, providerId}], name, runtimeAction })`,
   find-or-create by `(client_id, name)` where the name is deterministic from provider +
   runtime action (`:852-898`).
4. **Commerce side** (via the Commerce eventing REST module, `commerceEventsClient`):
   `updateEventingConfiguration` (enables/points the Commerce Eventing module, passing a
   workspace configuration JSON), `createEventProvider` (registers the I/O provider id in
   Commerce), and per-event `createEventSubscription` (`:900-1000`) — all find-or-create.
5. Results are persisted in the app's own storage
   (`setSystemConfigByKey('events', { providers: … })`, `:1358`).

### 1.5 Teardown EXISTS in the kit — and it is ordered

`POST /uninstallation` → `offboardIoEvents` (`management-CfYDBXqP.mjs:1176-1203`), which
deletes **in this order, best-effort (every deletion error is caught, logged, and
uninstall continues)**:

1. All registrations whose `client_id` matches the app credential and whose name matches
   the deterministic (current or legacy) registration names (`deleteIoEventRegistrations`,
   `:1085-1119`) — via `deleteRegistration({ …appCredentials, registrationId })`.
2. All event metadata on the provider (`deleteIoEventMetadata`, `:1121-1152`).
3. The provider itself (`deleteIoEventProvider`, `:1154-1175`) — found by current or
   legacy `instance_id`; if absent, skipped with a log line.

Commerce side mirrors it: `deleteEventSubscription({ name })` per event then
`deleteEventProvider({ provider_id })` (`offboardCommerceEventing`, `:1204-1266`).

**Takeaway for us:** the kit's own uninstaller treats registrations → metadata → provider
as the required order and treats "not found" as done — the exact idempotency contract the
product wants.

---

## 2. CLI surface (`aio event`, installed aio-cli 11.1.2 — help output, read-only)

`aio event --help` topics: `provider`, `registration`, `eventmetadata`. Subcommands:

| Topic | Commands | Notes (from `--help`) |
|---|---|---|
| `provider` | `create`, `delete PROVIDERID`, `get`, `list`, `update` | `create` takes **no argument flags** — it prompts interactively (unsuitable for automation). `list` supports `--providerMetadataId`, `--instanceId`, `--fetchEventMetadata`, `-j` |
| `registration` | `create BODYJSONFILE`, `delete REGISTRATIONID`, `get`, `list` | `create` takes a JSON file: `{ name, description, delivery_type: webhook\|webhook_batch\|journal, webhook_url, events_of_interest: [{provider_id, event_code}] }` |
| `eventmetadata` | `create`, `delete`, `get`, `list`, `update` | per-provider event codes |

**Auth wiring** (plugin source, `@adobe/aio-cli/node_modules/@adobe/aio-cli-plugin-events/src/BaseCommand.js:38-115`):

- Token: `getToken(CLI)` — the **signed-in user's CLI token** (comment in source: *"user
  access token, would work with JWT/OAuth Server-to-Server token too"*).
- API key: it downloads the selected workspace's JSON via the Console SDK
  (`consoleClient.downloadWorkspaceJson(org.id, project.id, workspace.id)`) and extracts
  the workspace's service-integration credential (`oauth_server_to_server` preferred),
  using its `client_id` as the `x-api-key`.
- Context: the `aio console` selected org/project/workspace (errors out if unset).
- Then `Events.init(org.code /* IMS org id */, clientId, accessToken)` — i.e. the CLI is
  a thin wrapper over `@adobe/aio-lib-events`.

**Consequence (verified live in prior in-repo research,
`.rptc/research/delete-aio-project/research.md`, 2026-07-02 spike):** the CLI fails with
*"Workspace … has no oAuth Server-to-Server or JWT credential associated"* when the
workspace has no S2S credential — CLI and REST share the same per-workspace credential
requirement. A workspace must have (or be given) an S2S credential before ANY events
management call works, create included.

---

## 3. SDK / API surface

### 3.1 REST endpoints (ground truth: `@adobe/aio-commerce-lib-events/dist/es/io-events/index.mjs`; matches @adobe/aio-lib-events docs)

Base URL `https://api.adobe.io/events` (ingress: `https://eventsingress.adobe.io/`) —
`@adobe/aio-commerce-lib-api/dist/es/index.mjs:341-342`.

| Operation | Method + path |
|---|---|
| List org providers | `GET {orgId}/providers` (query: `providerMetadataIds`, `instanceId`, `eventmetadata`) |
| Get provider | `GET providers/{providerId}` |
| Create provider | `POST {orgId}/{projectId}/{workspaceId}/providers` body `{ label, description?, docs_url?, instance_id?, provider_metadata?, data_residency_region? }` |
| Delete provider | `DELETE {orgId}/{projectId}/{workspaceId}/providers/{providerId}` |
| Create metadata | `POST {orgId}/{projId}/{wsId}/providers/{providerId}/eventmetadata` body `{ event_code, label, description, sample_event_template? (base64 JSON) }` |
| Delete metadata | `DELETE …/providers/{providerId}/eventmetadata/{eventCode}` |
| List org registrations | `GET {orgId}/registrations` (paginated) |
| List workspace registrations | `GET {orgId}/{projId}/{wsId}/registrations` |
| Create registration | `POST {orgId}/{projId}/{wsId}/registrations` body `{ client_id, name, description, delivery_type: webhook\|webhook_batch\|journal, webhook_url?, events_of_interest: [{provider_id, event_code}], enabled? }` |
| Update / delete registration | `PUT` / `DELETE …/registrations/{registrationId}` |

Provider types (`provider_metadata`): `dx_commerce_events` or `3rd_party_custom_events`;
data residency regions `va6` / `irl1` (io-events schema, `index.mjs:204-238`).

### 3.2 SDK: `@adobe/aio-lib-events` (Context7 `/adobe/aio-lib-events`)

- `init(organizationId, apiKey, accessToken, httpOptions?)` — README: *"accessToken: JWT
  Token for the integration with **I/O Management API scope**"*; `apiKey` is the
  credential's client id (sent as `x-api-key`).
- Full CRUD mirrors §3.1: `getAllProviders`, `getProvider`, `createProvider(org, proj,
  ws, body)`, `updateProvider`, `deleteProvider(org, proj, ws, providerId)`;
  `createEventMetadataForProvider`, `deleteEventMetadata`, `deleteAllEventMetadata`;
  `createRegistration(org, proj, ws, body)`, `getAllRegistrationsForWorkspace`,
  `getAllRegistrationsForOrg`, `updateRegistration`, `deleteRegistration`.
- Deletes return 204 on success, 404 when absent (SDK docs,
  developer.adobe.com/events/docs/guides/sdk/sdk-providers via Perplexity).
- We do NOT need this SDK: our existing `ioEventsClient.ts` is a deliberate pure-fetch
  client of the same API, and extending it is 4 small methods (§5).

### 3.3 Auth contract (consolidated)

- Headers: `Authorization: Bearer <token>` + `x-api-key: <credential client_id>` +
  `Accept: application/hal+json`. (Ground truth: our `ioEventsClient.ts:274-280`; kit's
  `buildIoEventsHttpClient`; CLI plugin; Adobe docs examples per Perplexity —
  developer.adobe.com/events/docs/guides/api/provider-api shows exactly these headers
  with an OAuth S2S token.)
- Token type: docs examples use an **OAuth server-to-server token**; the CLI proves a
  **user CLI token** also works when paired with a workspace credential's client_id
  (BaseCommand.js source comment + our shipped teardown, which uses the user's IMS token
  + S2S `client_id` as apiKey and works in production — `consoleProjectTeardownEvents.ts`).
- IMS scope: the kit's lib pins `IO_EVENTS_IMS_REQUIRED_SCOPES = ["adobeio_api"]`
  (`aio-commerce-lib-api/dist/es/index.mjs:289`); aio-lib-events README says "I/O
  Management API scope". The public provider/registration doc pages do not enumerate
  scope strings (Perplexity, explicit).
- **Entitlement trap (verified in our own shipped code):** a credential not subscribed to
  the **I/O Management API** gets 401/403 on every events call; subscription entitlement
  propagates asynchronously (seconds). Our teardown already ships the recovery:
  subscribe-on-403 + retries at 2 s/5 s/10 s
  (`consoleProjectTeardownEvents.ts:31-95`).

### 3.4 Deletion constraints

- **Provider vs project:** a Console project CANNOT be deleted while a provider exists in
  one of its workspaces (Adobe Events FAQ, quoted verbatim in
  `.rptc/research/delete-aio-project/research.md` Q1 — the finding the teardown feature
  was built on).
- **Provider vs registrations:** the public docs do **not** state whether deleting a
  provider is blocked by, or cascades to, its registrations (Perplexity, checked against
  provider-api / registration-api / SDK pages / OpenAPI — "no documented
  referential-integrity or cascade-delete semantics"). The kit's uninstaller and our
  teardown both delete registrations first, then the provider — treat that order as the
  contract. DELETE of an already-gone resource returns 404; both the kit and our client
  treat 404 as success (idempotent delete).

---

## 4. What create/delete requires — the consolidated contract

To CREATE a provider + metadata + registration (per workspace):

1. **Console coordinates:** `consumerOrgId` (numeric console org id in the path; the IMS
   `…@AdobeOrg` id is what the SDK calls `orgId` — our teardown passes
   `ctx.target.orgId` and it works), `projectId`, `workspaceId`.
2. **A workspace S2S credential** — its `client_id` is both the `x-api-key` AND the
   registration's `client_id` field. We already detect-or-create these:
   `getWorkspaceCredential` / `createOAuthServerToServerCredential`
   (`adobeEntityFetcher.ts`, cited at `.rptc/research/delete-aio-project/research.md`).
3. **The credential subscribed to the I/O Management API** — reuse
   `subscribeManagementApi` + the propagation-retry wrapper.
4. **A token:** the signed-in user's IMS token works (CLI + our teardown both do this);
   no need to mint S2S tokens in the extension.
5. **Idempotency keys:** provider → deterministic `instance_id` (find-before-create via
   `GET {org}/providers?instanceId=`); metadata → `event_code`; registration →
   `(client_id, name)` with a deterministic name. This is exactly the kit's model — adopt
   it wholesale.
6. **For webhook registrations:** a public HTTPS `webhook_url` (or a Runtime action
   target); `journal` delivery needs no endpoint.

To DELETE (full teardown): list workspace registrations → delete each → delete metadata
(optional — provider delete may orphan it, undocumented; kit deletes explicitly) → delete
provider → 404s count as success. Already shipped for registrations + providers in
`ioEventsClient.ts` / `consoleProjectTeardownEvents.ts`.

To LIST: org-wide provider list is paginated (~1,600 org-wide measured; our client caps
at 200 pages) and must be filtered to the project via each provider's `rel:update` href
binding (`parseProviderBinding`) — there is no "list providers for project" endpoint.

---

## 5. Integration sketch for our two surfaces

### What already exists (do not rebuild)

| Piece | Where | State |
|---|---|---|
| List providers (org, paginated) + list/delete registrations + delete provider, 404-as-success | `src/features/authentication/services/ioEventsClient.ts` | shipped (teardown-scoped; header comment explicitly says list/delete-only, create verified absent 2026-08-27) |
| S2S credential detect-or-create + I/O Management API subscribe + 403-propagation retries | `src/features/authentication/services/consoleProjectTeardownEvents.ts`, `adobeEntityFetcher.ts` | shipped |
| Kit-managed install/uninstall (providers, metadata, ~23 registrations, Commerce config) via the app's own App Management REST API | `src/features/app-builder/services/appManagementClient.ts` + `appManagementInstaller.ts` / `appManagementUninstaller.ts` | shipped 2026-08-27 |
| Org guard chain | `ensureOrgContext` / `withOrgContext` / `detectProjectOrgMismatch` (see `adobe-org-context` skill) | shipped |
| MCP action-descriptor pattern incl. destructive confirm (`confirm:true` + `confirmName`) and select-org/project chain | `src/features/ai/server/adobeResourceTools.ts`, `toolDescriptors.ts` (see `mcp-tool-authoring` skill) | shipped |

### The two lanes

**Lane A — starter-kit (Commerce eventing) apps: drive the kit, don't reimplement.**
For any component built on `aio-commerce-lib-app` (the bodea kit), provider/registration
lifecycle IS `installAppManagementApp` / `uninstallAppManagementApp` — the kit creates
and offboards its own providers, metadata, registrations, AND the Commerce-side eventing
config (which our extension has no direct client for). Duplicating that would create a
second competing implementation of a job the app already owns.

**Lane B — generic, extension-owned providers/registrations (the missing piece).**
Extend `IoEventsClient` with `createProvider`, `createEventMetadata`,
`createRegistration`, and a workspace-scoped `listProviders` (via `?instanceId=` /
binding filter). Wrap in a small service (suggest
`features/app-builder/services/eventProviderLifecycle.ts` or a new
`features/events/`) that:
- resolves the project's org/project/workspace from project state, behind the org guard;
- detect-or-creates + subscribes the S2S credential (reuse teardown deps);
- applies the idempotency keys from §4.5 (deterministic instance_id embedding
  project+workspace, find-before-create, 404-as-success deletes);
- returns collect-don't-throw item lists like teardown does, so both surfaces render
  per-entity outcomes.

Revisit `THIRD_PARTY_PROVIDER_METADATA` ownership note in `ioEventsClient.ts:37-49` when
the create path lands — its own comment says to.

**Headless (MCP):** descriptor rows per `mcp-tool-authoring`:
`list_event_providers` / `list_event_registrations` (readOnlyHint: true),
`create_event_provider` / `create_event_registration` (readOnly false, destructive false),
`delete_event_provider` / `delete_event_registration` (destructiveHint: true, consent
copy + confirm), following the select-org/select-project chain in
`adobeResourceTools.ts`. Count-pinned tests + `docs/systems/mcp-server.md` sync.

**Headful:** dashboard is the natural home (Integrations card grid already renders per-
integration state); an "Eventing" detail in the integration drawer showing provider +
registrations with per-row delete, and setup as part of integration deploy. Wizard needs
nothing new: eventing setup belongs to post-create deploy, not project creation.

---

## 6. Open questions

1. **Cascade behavior** — does `DELETE provider` fail, succeed-and-orphan, or cascade
   when registrations still reference it? Undocumented (Perplexity, §3.4). Answerable
   only by a live spike (create throwaway provider + registration in a scratch workspace,
   delete provider first, observe). Until then: always delete registrations first.
2. **`consumerOrgId` form** — our teardown passes the same `orgId` for the path segment
   and it works in production, but kit/SDK docs distinguish console org id vs IMS org
   code. Worth one read-side check before the create path hardcodes an assumption.
3. **Metadata deletion necessity** — the kit deletes metadata explicitly before the
   provider; whether provider delete makes that redundant is part of question 1.
4. **Commerce-side config for non-kit backends** — Lane B creates I/O-side entities only.
   If a generic flow ever needs the Commerce Eventing module configured (SaaS/PaaS
   `updateEventingConfiguration`, subscriptions), that is a new Commerce REST client —
   today only the kit's deployed action does it.
5. **Journal vs webhook registrations** — which delivery types our product actually
   needs; journal needs no webhook URL and may fit agent-driven demos better.

## 7. What I could not establish

- Provider-delete cascade/blocking semantics (no doc statement; no live test allowed —
  read-only run). Source: Perplexity over developer.adobe.com provider-api /
  registration-api / SDK pages / OpenAPI spec.
- The exact IMS scope set the API enforces. `adobeio_api` is what the kit's lib requests
  (`aio-commerce-lib-api` source); public doc pages do not enumerate scopes (Perplexity).
- Whether the user-token-plus-workspace-client_id combination is *officially supported*
  (docs show S2S tokens only) — it demonstrably works (CLI source comment; our shipped
  teardown), but Adobe could tighten it.
- The interactive prompt contents of `aio event provider create` (running it would
  create a provider; not run).
- Direct reads of developer.adobe.com/events doc pages — WebFetch returned 404 for the
  URLs tried (`…/events/docs/api/`, `…/guides/api/eventsprovider_api/`); doc claims in
  §3 therefore rest on Perplexity's cited URLs, the aio-lib-events GitHub docs
  (Context7), and local package sources — which all agree with each other.
- Whether `POST /uninstallation` on the kit requires the app still be deployed (it does —
  the API is served by the app's own actions, `appManagementClient.ts` header; so
  teardown order for kit apps is: uninstall FIRST, `aio app undeploy` second — already
  encoded in `appManagementUninstaller.ts`). Listed here because I verified it only from
  our own module docs, not from a live run.
