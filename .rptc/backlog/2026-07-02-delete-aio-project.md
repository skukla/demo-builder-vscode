# Delete an Adobe I/O project from the builder (with event-provider teardown)

## Provenance
Scoped 2026-07-02 from the delete-aio-project research (`.rptc/research/delete-aio-project/research.md`).
We create Adobe I/O Console projects during project creation (Console SDK), but there's no in-app way
to delete one. The nasty prerequisite: a Console project **cannot be deleted while an Adobe I/O Events
provider is still attached to one of its workspaces** — Adobe's own I/O Events FAQ documents this
("You must delete the event provider before deleting the project"). App Builder apps frequently register
providers, so this blocks the common case.

## Goal / Scope
Add a "Delete project" action (per-row in `AdobeProjectPicker`, strong confirmation) that fully tears a
Console project down — including the event-provider prerequisite — then deletes the project.

> **Spike correction (2026-07-02):** the CLI does **not** avoid the S2S requirement. `aio event
> provider list` fails with *"Workspace … has no oAuth Server-to-Server or JWT credential associated."*
> — CLI and REST both need a per-workspace S2S credential. **Not a blocker:** we already automate it
> via `ensureOAuthCredentialId` → `createWorkspaceCredential` → `createOAuthServerToServerCredential`
> (`adobeEntityFetcher.ts:588`), with `getWorkspaceCredential` (:560) to reuse an existing one.

Either transport (aio CLI or Events REST) works once the workspace has an S2S credential.
`@adobe/aio-cli-plugin-events` ships bundled with `aio-cli` — **no new prerequisite install** (unlike
`api-mesh`). A workspace with no S2S credential can hold no providers, so it's skipped.

## Execution plan (teardown order is load-bearing)
0. **Per workspace, detect-or-create an S2S credential** — `getWorkspaceCredential` to reuse an
   existing `oauth_server_to_server` cred, else `ensureOAuthCredentialId` to create one. Required
   before any `aio event …` / Events REST call. Skip workspaces with no credential and no providers.
1. **Delete event registrations** (workspace-scoped) for each workspace:
   `aio event registration list --json` → `aio event registration delete <id>`.
2. **Delete event providers** (ORG-scoped — `aio event provider list --json` returns ALL org providers;
   **filter to the target workspace id** before deleting) → `aio event provider delete <id>`.
3. **Delete the project** via the existing Console SDK path.
4. Fold into `projectDeletionService.ts` (already tears down DA.live / GitHub / local); best-effort
   cleanup for mesh / runtime / S2S creds (not confirmed hard blockers).
5. Wrap every `aio event …` call in `withOrgContext(target, …)` (`src/core/shell/orgContextEnv.ts`) so
   `AIO_CONSOLE_*` targets the right org/project/workspace per child without mutating the global store;
   run via `commandManager.execute(… --json)`, mirroring existing `aio api-mesh:*` calls.
6. UI: per-row delete in `AdobeProjectPicker` behind a typed/confirm gate; surface the multi-step
   teardown progress (registrations → providers → project) and per-step failures.

## Constraints
- Repo PUBLIC — no secrets/PII in logs or fixtures.
- Destructive + irreversible — require explicit confirmation; never auto-select a project to delete.
- Reuse the canonical org-context approach (`withOrgContext` / token-org truth); do NOT add an org picker.
- TDD; CI lints the whole repo + enforces the 750-line test-file cap.

## ~~Open question~~ — CLOSED by the 2026-07-03 spike (full end-to-end delete executed)
**There is no workspace-id field on provider JSON.** The binding is encoded only in
`_links["rel:update"].href` = `/events/{consumerOrgId}/{projectId}/{workspaceId}/providers/{id}`,
which IS present in the org-wide list response. Validated discovery: `getAllProviders(orgId)` →
filter `provider_metadata === '3rd_party_custom_events'` → parse the href → match projectId.
Also proven live: bare S2S cred 403s until subscribed to `AdobeIOManagementAPISDK`; blocked delete =
**409 `ERR_MSG_PROJECT_DELETE_FORBIDDEN`** (opaque — never mentions providers); mesh + S2S cred do
NOT block deletion, only the provider does; post-delete the local aio console selection is stale and
must be cleared. Full log: `.rptc/research/delete-aio-project/research.md` "Spike close (2026-07-03)".

## Kickoff prompt
`/rptc:feat "Add a 'Delete project' action to AdobeProjectPicker that tears down an Adobe I/O Console
project — ensure an S2S credential subscribed to AdobeIOManagementAPISDK per workspace, delete event
registrations then providers via @adobe/aio-lib-events (discovered by parsing each provider's
rel:update href for the projectId), then delete the project via the Console SDK and clear the stale
aio console selection — extending projectDeletionService. Spike-validated flow + gotchas in
.rptc/research/delete-aio-project/research.md (see 'Spike close (2026-07-03)')."`
