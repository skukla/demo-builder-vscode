# Research: Deleting an Adobe I/O Console Project blocked by Event Providers

**Mode:** B (Web research, cross-verified against official Adobe sources)
**Date:** 2026-07-02
**Question:** Can an Adobe I/O Developer Console project be deleted while it has I/O Events providers? Is there an API to delete providers, or is the aio CLI the only practical path? What is the full teardown order, and how does it map onto our `withOrgContext` / `CommandExecutor` pattern?

---

> **⚠️ SPIKE CORRECTION (2026-07-02) — Q2 below was WRONG.** A live spike (Adobe Demo System org)
> proved the aio CLI does **NOT** avoid the S2S requirement: `aio event provider list` and
> `registration list` both fail with *"Workspace … has no oAuth Server-to-Server or JWT credential
> associated."* — on both Stage and Production. **CLI and REST share the same per-workspace S2S
> credential requirement.** This is **not a blocker**: our codebase already automates S2S credential
> creation — `ensureOAuthCredentialId` → `createWorkspaceCredential` →
> `client.createOAuthServerToServerCredential` (`src/features/authentication/services/adobeEntityFetcher.ts:588`),
> and `getWorkspaceCredential` (:560) detects an existing `oauth_server_to_server` cred to reuse.
> **Corrected teardown:** for each workspace, *detect-or-create* an S2S credential → run the events
> teardown (CLI or REST) → delete the project (the transient credential dies with it). A workspace
> with **no** S2S credential can hold **no** providers, so skip it. Full spike log at the end of this doc.

## TL;DR (definitive answers)

- **Q1 — The constraint: CONFIRMED.** A Developer Console project **cannot be deleted while an Events Provider is still associated with one of its workspaces.** The Developer Console surfaces a delete error, and Adobe's own FAQ documents the workaround: delete the conflicting provider(s) first, then retry the project delete. ([FAQ](https://developer.adobe.com/events/docs/support/faq))
- **Q2 — API vs CLI: the suspicion is HALF-right.** There **IS** a REST DELETE endpoint for providers (`DELETE .../providers/${providerId}` on the I/O Events Management API). So "there is no API" is technically **false**. BUT the REST path requires an **OAuth Server-to-Server credential provisioned inside that very workspace** plus its api-key — exactly the credential you're trying to tear down. For our extension, which authenticates as the signed-in user via `aio`, the **aio CLI (`aio event provider delete`) is the correct and practical path** (it reuses the user's IMS login + selected console context, no S2S credential required). ([Provider API](https://developer.adobe.com/events/docs/guides/api/provider-api), [CLI guide](https://developer.adobe.com/events/docs/guides/cli/))
- **Q3 — CLI commands: CONFIRMED.** `aio event provider list [-j]` (org-scoped), `aio event provider delete PROVIDERID`, `aio event registration list [-j]` / `aio event registration delete REGISTRATIONID` (workspace-scoped). ([aio-cli-plugin-events](https://github.com/adobe/aio-cli-plugin-events))
- **Q4 — Teardown order:** registrations (workspace) → providers (org, matched to the workspace) → then delete the project. Other potential blockers noted below.
- **Q5 — Prerequisite: the events plugin is ALREADY bundled with `aio-cli`** (it is a core plugin, unlike `api-mesh` which we install separately). No new prerequisite install is required. ([aio-cli package.json](https://github.com/adobe/aio-cli))

---

## Constraint (Q1)

Adobe's **I/O Events FAQ** has a dedicated entry: *"What should I do if I am unable to delete a project because of a conflicting provider?"* Verbatim points:

- *"If you see an error when deleting a project in the Developer Console, it may be due to an event provider associated with the same workspace."*
- *"You must delete the event provider before deleting the project."*

Documented workaround (from the FAQ):
1. Developer Console → Project overview.
2. **Download** the project metadata JSON.
3. Note the **Consumer org ID** (`project.org.id`), **Project ID** (`project.id`), **Workspace ID** (`project.workspace.id`).
4. Use the Provider API to fetch the org's providers.
5. **Find the provider with the matching workspace id.** Note its `id`.
6. Delete that provider.
7. Repeat for all conflicting providers, then retry the project delete.

Source: <https://developer.adobe.com/events/docs/support/faq>

**Behavior:** the block is enforced at project-delete time in the Developer Console (and by the underlying Console/Management API). The FAQ describes it as an error on the delete action; it does not quote the exact string. The block is triggered by **providers**; the FAQ explicitly ties it to a provider "associated with the same workspace." (Registrations/subscriptions are child objects of providers — clear them as part of provider teardown; see Q4.)

---

## Deletion mechanism — API vs CLI (Q2)

### There IS a REST DELETE endpoint (contra the original suspicion)

The **Adobe I/O Events Management API** (part of the I/O Management API) exposes full CRUD for **custom** providers:

- **List (org-scoped):**
  `GET https://api.adobe.io/events/${consumerId}/providers`
- **Delete:**
  `DELETE https://api.adobe.io/events/${consumerId}/${projectId}/${workspaceId}/providers/${providerId}`

Headers for both: `x-api-key: $api_key`, `Authorization: Bearer $oauth_s2s_token`, `Accept: application/hal+json`.

Source: <https://developer.adobe.com/events/docs/guides/api/provider-api>

### Why the CLI is the right path for us, not the REST API

The REST API's **prerequisites** are the catch (quoted from the Provider API page): you must *"Add the I/O Management API in your Adobe Developer Console project … create a new OAuth server-to-server credential"* and generate an **OAuth S2S token from that same workspace**, and supply that workspace's **api-key**. In other words, deleting a provider via REST requires a live S2S credential inside the very workspace/project you are about to delete. That is impractical (and often impossible) for a generic teardown flow that just has the user's IMS login.

The **aio CLI** solves this: `aio event provider delete` calls the same Management API under the hood but authenticates with the **user's IMS login token** and the **currently-selected console org/project/workspace** — no per-workspace S2S credential to provision. This is why Adobe's own FAQ and CLI guide both present the CLI as the user-facing path, and it aligns with how the rest of our extension already drives Adobe.

**Definitive answer:** Use the **aio CLI**. A REST DELETE exists but is not viable for our auth model.

> Note: There is also an SDK method `deleteProvider(...)` in `@adobe/aio-lib-events`, but it needs the same org/project/workspace/api-key inputs as the REST API; it offers no advantage over the CLI for us.

---

## aio CLI commands (exact) (Q3)

Plugin: `@adobe/aio-cli-plugin-events`. Sources: <https://github.com/adobe/aio-cli-plugin-events> and <https://developer.adobe.com/events/docs/guides/cli/>.

### Providers (ORG-scoped)
```
# List all providers for the ORGANIZATION (not filtered by workspace)
aio event provider list [-j | --json] [-y | --yml] [-v]
#   optional: --providerMetadataId <id> | -p <id>, --instanceId <id>, --fetchEventMetadata

# Get one provider (optionally with its event metadata)
aio event provider get PROVIDERID [--fetchEventMetadata]

# Delete a provider by id
aio event provider delete PROVIDERID
```
- Purpose strings (from plugin README): provider list = *"Get list of all Providers for the Organization"*; provider delete = *"Delete Provider by id"*.
- **Scope caveat:** `provider list` is **org-scoped** — it returns every provider the org is entitled to, across all projects/workspaces. To find the ones blocking a specific project you must **match on workspace id** (as the FAQ instructs). Confirm the provider objects returned by `-j` carry a workspace identifier before relying on programmatic filtering (see Open Questions).

### Registrations / subscriptions (WORKSPACE-scoped)
```
# List registrations in the SELECTED workspace
aio event registration list [-j | --json] [-y | --yml]     # aliases: :ls, :reg:list, :reg:ls

# Get / delete a registration
aio event registration get REGISTRATIONID                  # alias :reg:get
aio event registration delete REGISTRATIONID               # alias :reg:delete
```
- Registration list = *"List your Event Registrations in your Workspace"* — **workspace-scoped**, so it honors the selected/targeted org+project+workspace.

### Context requirement
Per the CLI guide, these commands operate against the **currently configured console org/project/workspace** (`~/.config/aio`). In our extension we do NOT mutate that global; we inject `AIO_CONSOLE_*` env per invocation (see Q5). `--json` is available on both `provider list` and `registration list` for machine parsing.

---

## Full teardown order (Q4)

Recommended sequence before calling project delete:

1. **Target the org + project + workspace** (per workspace, since providers are attached at the workspace level and registrations are workspace-scoped).
2. **Delete event registrations** in each workspace: `aio event registration list --json` → `aio event registration delete <id>` for each. (Registrations are consumers of providers; clear them first.)
3. **Delete the event providers** attached to the project's workspace(s): `aio event provider list --json` → filter to the project's workspace id(s) → `aio event provider delete <providerId>` for each.
4. **Delete the project**: `aio console project delete <projectId>` (or the Console SDK delete you already use). Note: the project-delete blocker is specifically the **providers**; once they're gone the delete should succeed.

### Other known / candidate blockers to project deletion
- **Events providers** — CONFIRMED blocker (this research).
- **S2S / OAuth credentials & API integrations** — the Console generally allows deleting a project with credentials attached (they're deleted with the project). Not confirmed as a hard blocker in official docs. [NEEDS VERIFICATION if we hit it.]
- **API Mesh** — a mesh lives in a workspace; our existing flow already deletes meshes (`aio api-mesh:delete --autoConfirmAction`, see `src/features/project-creation/handlers/createHandler.ts:146`). Tear the mesh down as part of project teardown for cleanliness; not documented as a project-delete blocker. [NEEDS VERIFICATION]
- **App Builder runtime namespaces** — a project/workspace maps to a Runtime namespace; undeploying the app (`aio app undeploy`, already used at `src/features/app-builder/services/appComponentManager.ts:161`) removes deployed actions. Namespace lifecycle is tied to the workspace and cleaned with it; not a documented delete blocker. [NEEDS VERIFICATION]

Only the **event provider** blocker is officially documented. The others are listed for completeness and should be treated as "clean up if present," not as confirmed hard blockers.

---

## Implications for our feature (delete flow) (Q5)

### Prerequisite: events plugin is already present
`@adobe/aio-cli-plugin-events` is a **bundled core plugin of `aio-cli`** (it appears in aio-cli's `oclif.plugins` and `dependencies`, alongside `console`, `app`, `runtime`). This is **different from `api-mesh`**, which is NOT bundled and which we install separately in `src/features/prerequisites/config/prerequisites.json:139`. **Conclusion: no new prerequisite install is needed for `aio event ...`** — if `aio-cli` is present (which our prereqs already guarantee), the events commands are available. (We may still want a light runtime guard via `aio plugins --json`, mirroring `src/features/authentication/handlers/projectHandlers.ts:254`, but a dedicated install step like api-mesh's is unnecessary.)
Source: <https://github.com/adobe/aio-cli> (package.json bundled plugins).

### Wiring into our existing pattern
Everything runs through the established stack — no new infra:

- **Org/project/workspace targeting** — wrap the teardown in `withOrgContext(target, fn)` so every `aio` child gets `AIO_CONSOLE_*` env injected by the command executor, WITHOUT mutating the shared global `aio` store. Build the target with the existing `buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg)`.
  - `src/core/shell/orgContextEnv.ts` (`withOrgContext`, `buildAioConsoleEnv`, `buildOrgTargetFromProjectAdobe`)
  - Injection point: `src/core/shell/commandExecutor.ts:98`
- **Command execution** — `commandManager.execute('aio event provider list --json', { useNodeVersion: getMeshNodeVersion() })`, mirroring existing `aio ... --json` calls (e.g. `src/features/authentication/handlers/projectHandlers.ts:254`, `:282`). Parse `--json`, filter providers to the project's `workspace` id, then `aio event provider delete <id>` per match.
- **Existing project-delete surface to extend** — `src/features/projects-dashboard/services/projectDeletionService.ts:57` (`deleteProject`) + `:171` (`deleteProjectFiles`). Today this handles DA.live/GitHub/local cleanup. The **Adobe I/O project delete + provider teardown is the new piece** to add here (or in a sibling service the deletion flow calls), gated behind the org-context wrapper.
- **Mesh teardown precedent** — `aio api-mesh:delete --autoConfirmAction` at `src/features/project-creation/handlers/createHandler.ts:146` is the exact shape to copy for the provider/registration delete loop.

### Proposed delete flow steps
1. Resolve `target` from `project.adobe` (org+project+workspace) via `buildOrgTargetFromProjectAdobe`.
2. `withOrgContext(target, async () => { ... })`:
   a. (optional) `aio plugins --json` sanity check that `events` is present.
   b. `aio event registration list --json` → delete each.
   c. `aio event provider list --json` → filter to `target.workspaceId` → `aio event provider delete <id>` each.
   d. (optional) `aio api-mesh:delete --autoConfirmAction`; `aio app undeploy` if applicable.
   e. Delete the Adobe I/O project (Console SDK or `aio console project delete`).
3. Then run the existing local/DA.live/GitHub `deleteProjectFiles` cleanup.

---

## Open questions

1. **Provider→workspace matching field.** The FAQ says "find the provider with the matching workspace id," but I could not pull the exact field name from the provider-list JSON schema (the `provider_api/` variant returned 404; the OpenAPI/swagger link wasn't parsed). **Verify empirically** what field on each provider object (`aio event provider list -j`) carries the workspace id before relying on programmatic filtering. If providers don't expose a workspace id in the org-scoped list, we may need to enumerate per-workspace context and diff, or fetch each provider's detail.
2. **Exact Console delete-error string** — not quoted in official docs; capture it at runtime if we want to detect "blocked-by-provider" specifically vs. generic failure.
3. **Non-provider blockers (S2S creds, mesh, runtime namespace)** — none confirmed as hard project-delete blockers in official docs. Only the provider blocker is documented. Treat the rest as best-effort cleanup and verify empirically if a delete fails.
4. **`aio console project delete` command surface** — confirm the exact console-plugin subcommand/flags (e.g. `--confirm`/non-interactive) vs. continuing to use the Console SDK we already call for creation.

---

## Sources

Official Adobe:
- I/O Events FAQ (the delete-blocked-by-provider entry): <https://developer.adobe.com/events/docs/support/faq>
- Provider API (REST CRUD incl. DELETE, list endpoint, S2S prereqs): <https://developer.adobe.com/events/docs/guides/api/provider-api>
- Events Plugin for Adobe I/O CLI (command reference): <https://developer.adobe.com/events/docs/guides/cli/>
- Developer Console — Projects guide: <https://developer.adobe.com/developer-console/docs/guides/projects/>

Official Adobe GitHub:
- `adobe/aio-cli-plugin-events` (exact command syntax, scopes): <https://github.com/adobe/aio-cli-plugin-events>
- `adobe/aio-cli` (confirms events plugin is bundled; api-mesh is not): <https://github.com/adobe/aio-cli>

Codebase (our reuse points):
- `src/core/shell/orgContextEnv.ts` — `withOrgContext`, `buildOrgTargetFromProjectAdobe`, `buildAioConsoleEnv`
- `src/core/shell/commandExecutor.ts:98` — `AIO_CONSOLE_*` injection
- `src/features/projects-dashboard/services/projectDeletionService.ts:57,171` — existing delete flow to extend
- `src/features/project-creation/handlers/createHandler.ts:146` — `aio api-mesh:delete` precedent
- `src/features/authentication/handlers/projectHandlers.ts:254,282` — `aio ... --json` + `aio plugins --json` precedent
- `src/features/prerequisites/config/prerequisites.json:139` — api-mesh install (events needs NO analogous step)

---

## Spike log (2026-07-02) — live validation against Adobe Demo System

Ran the `aio` CLI against **Adobe Demo System** (org `285361`) / **Kukla Mesh Test** (project
`4566206088345706102`, workspaces Production `…745404` + Stage `…745405`). Findings, in order:

1. **`aio event` is bundled** — `aio event --help` works out of the box (topics: `provider`,
   `registration`, `eventmetadata`). The "no new prerequisite install" claim holds; `aio plugins`
   lists only the separately-installed `api-mesh`, but core plugins don't appear there.
2. **Stale console context ≠ token org (again).** `aio config get console.org` returned `3397333`,
   but `aio console org list` (token) returned **only** `285361` (Adobe Demo System). Same
   stale-CLI-vs-token-org class the wizard fix addressed. Selecting the token org explicitly fixed it.
3. **❌ THE KEY FINDING — events CLI needs a workspace S2S credential.** With Stage selected,
   `aio event provider list --json` failed: *"Workspace Stage has no oAuth Server-to-Server or JWT
   credential associated."* Production failed identically. So Q2's "CLI reuses the user login, no S2S
   needed" is **false** — the CLI authenticates to the Events API via the workspace's service
   credential, same as REST. `provider list --help` has no auth-override flag.
4. **No `aio` command creates an S2S credential** — `aio console workspace` offers only
   `api / create / download / list / select`. Credentials come from the Console UI or the Console SDK.
5. **We already automate the SDK path** — `createWorkspaceCredential` (:588) →
   `createOAuthServerToServerCredential`, wrapped list-first by `ensureOAuthCredentialId`; the SDK libs
   (`@adobe/aio-lib-console`, `@adobe/aio-lib-ims`) are already dependencies. So the S2S requirement is
   an automatable step, not a wall.
6. **Kukla Mesh Test is mesh-only** → both workspaces lack S2S → it holds **no** event providers, so
   it can't reproduce the provider scenario without first adding a credential. (Reassuring for the
   feature: no-S2S ⟹ nothing to tear down.)

**Still OPEN (needs a live provider to confirm):** the exact field in `aio event provider list --json`
that ties a provider to a workspace (for filtering the org-wide list). Blocked in this session because
Kukla Mesh Test has no S2S credential / no providers. Options to close it: (a) add an S2S credential to
a workspace via the Console UI, then create a throwaway provider; (b) script `createOAuthServerToServerCredential`
the way the feature will; or (c) confirm during implementation against a workspace that has a real provider.

**Corrected feature design (supersedes the CLI-only plan above):**
1. For each workspace in the project: `getWorkspaceCredential` → reuse an existing `oauth_server_to_server`
   cred, else `ensureOAuthCredentialId` to create one (skip workspaces with no cred AND no providers).
2. Enumerate + delete registrations (workspace) then providers (org-wide list filtered to the workspace)
   via `aio event …` under `withOrgContext`, OR via the Events REST API using the credential.
3. Delete the project (Console SDK). Extend `projectDeletionService`.

---

## Spike close (2026-07-03) — full end-to-end delete executed

Completed the flow live: created an S2S credential + throwaway provider on Kukla Mesh Test / Stage,
reproduced the delete-block, tore down, and deleted the project (user-approved). All findings:

1. **Bare S2S credential 403s on the Events API.** `createOAuthServerToServerCredential` alone is not
   enough — `aio event provider list` returned 403 until the credential was subscribed to the
   **I/O Management API** (`AdobeIOManagementAPISDK` — our `BASELINE_API` in `apiSubscriber.ts`) via
   `subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration,
   [{ sdkCode: 'AdobeIOManagementAPISDK', licenseConfigs: null, roles: null }])`. After subscribing,
   the 403 cleared immediately. (The subscribe call hung once >2 min, then succeeded on retry —
   treat it as retryable/slow, like other Console SDK ops.)
2. **`aio event provider create` is inquirer-only** (no label/description flags) — unusable
   programmatically. Use `@adobe/aio-lib-events` instead: `init(orgId, credApiKey, userToken)` →
   `createProvider(orgId, projectId, workspaceId, { label, description })`. The lib ships inside the
   global aio CLI install and would be a (dev)dependency for the feature.
3. **✅ OPEN ITEM RESOLVED — there is NO workspace-id field on provider JSON.** Create/get/list all
   return the same shape; the project/workspace binding is encoded ONLY in
   `_links["rel:update"].href` = `/events/{consumerOrgId}/{projectId}/{workspaceId}/providers/{id}`,
   and that link IS present in the org-wide list response. Discovery algorithm (validated live —
   found exactly the 1 spike provider among 1,567 org providers):
   `getAllProviders(orgId)` → filter `provider_metadata === '3rd_party_custom_events'` (only 10
   existed org-wide) → parse `rel:update` href → match `projectId`.
4. **Delete-block reproduced.** With the provider attached, `deleteProject` → **409 Conflict,
   `ERR_MSG_PROJECT_DELETE_FORBIDDEN`** ("Project delete is not allowed for entity id=…"). The error
   is OPAQUE — it never mentions event providers — which is exactly why the feature must tear down
   pre-emptively rather than parse the failure.
5. **Causality proven.** `deleteProvider(orgId, projectId, workspaceId, providerId)` → retry
   `deleteProject` → **OK**. Kukla Mesh Test deleted 2026-07-03.
6. **What does NOT block deletion:** the deployed API Mesh and the S2S credential — both were still
   present at delete time. Only the event provider blocked. (No registrations existed; with
   registrations the documented order registrations → providers still applies.)
7. **Post-delete local state:** the aio console selection still pointed at the deleted project
   (`aio console where` shows it; any subsequent selected-context command would fail). The feature
   should clear/reselect console config after a successful delete.

**Feature design is confirmed as corrected above**, with one amendment: provider discovery/deletion
can run entirely on `@adobe/aio-lib-events` (no CLI dependency), keyed off the `rel:update` href.
