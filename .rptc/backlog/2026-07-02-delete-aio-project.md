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

## Open question (verify empirically before building step 2)
The exact field in `aio event provider list --json` that carries the **workspace id** for filtering
could not be confirmed from Adobe docs (the `provider_api/` reference variant 404'd). Run the command
against a real project that has a provider and confirm the field before relying on programmatic
provider→workspace matching. It's load-bearing: mis-filter and you either miss the blocking provider or
delete a sibling project's. **The 2026-07-02 spike could not close this** — Kukla Mesh Test is mesh-only
(no S2S credential, so no providers), so no live provider was reachable to inspect. Close it by adding an
S2S credential to a workspace (Console UI or the scripted SDK path) and creating a throwaway provider,
or during implementation against a workspace that has a real provider.

## Kickoff prompt
`/rptc:feat "Add a 'Delete project' action to AdobeProjectPicker that tears down an Adobe I/O Console
project — delete event registrations then providers via the aio CLI (workspace-filtered), then delete
the project via the Console SDK — extending projectDeletionService. Research + teardown order in
.rptc/research/delete-aio-project/research.md. Verify the provider-list workspace-id field empirically first."`
