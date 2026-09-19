# Rename an Adobe I/O project — from the project picker and from an MCP tool

## Context

Bodea's Adobe project can't be fixed (its credential is locked by 103 Commerce profiles the
owner isn't a developer on), so the plan is to move Bodea onto the working "Kukla Test"
project and rename that project. Demo Builder can create and delete Adobe projects from the
UI and the agent tools, but it can't rename one: the only rename today is a quiet side
effect of renaming a demo (`syncRemoteProjectTitle` in `projectRenameService.ts`), and only
when the two names still match. The owner chose the placement: **a rename action on each row
of the Adobe project picker**, beside the existing Delete. That picker is shared by the new-
project wizard and the Integrations "Change" / Add flow, so both get it.

## Behaviour

- Each project row gets a quiet pencil button next to the trash button. Clicking it turns
  the row into the house inline rename field (`InlineRenameField`), prefilled with the
  current title. Enter saves; Escape or an empty value cancels (the field's own contract).
- **Only the title changes**, never the project's machine name or id — the same PATCH the
  existing sync uses (`editProject(org, project, { title })`). Reversible: rename it back.
- Success: the row shows the new title (the handler pushes a refreshed `get-projects`, as
  Delete does), the wizard's selected project picks up the title if it was the renamed
  one, and the open demo's stored `adobe.projectTitle` is updated when it deploys to that
  project, with a destination push so the Integrations header shows the new name.
- Failure stays inline under the field, in plain words — including Adobe's read-only 403
  ("not a developer on every product profile…", `explainAdobeAccessFailure`).
- No ownership gate (unlike Delete): a rename is reversible and Adobe itself refuses one the
  user may not make.
- **Agent surface:** `rename_adobe_project { projectId, title, confirm }` — a cloud write, so
  it declares `readOnly: false`, asks consent through `AGENT_ALERT_COPY`, and names the
  project in the dialog. Same handler underneath as the button.

## Design

1. **Operation returns its reason.** `renameRemoteProject` (`adobeConsoleProjectOps.ts`,
   passed through `adobeEntityFetcher.ts` and `authenticationService.ts`) returns
   `{ ok: true } | { ok: false; error }` instead of `boolean`, so an explicit rename can say
   why Adobe refused. The existing best-effort caller (`syncRemoteProjectTitle`) reads `.ok`.
   Its mocks are audited (the "change a contract → audit its mocks" rule).
2. **Handler** `rename-adobe-project` — new `authentication/handlers/renameAdobeProjectHandler.ts`,
   modelled on `deleteAdobeProjectHandler.ts`: validate ids (`@/core/validation`) and the
   title (trimmed, non-empty, ≤ 100, the existing display cap); org gate (`resolveOrgContext`
   / `sendOrgMismatch`); call the rename; on success push `get-projects` and sync the open
   demo's `adobe.projectTitle`. Returns `{ success, error? }` (Pattern B). Registered once in
   `addIntegrationFlowHandlers.ts`, behind `requireAdobeAuth` like its neighbours — that one
   registration reaches the wizard (`ProjectCreationHandlerRegistry`) and the Integrations
   panel (`showIntegrations.ts`). Payload typed in `@/types/webviewRequests`.
3. **Picker** (`AdobeProjectPicker.tsx`) — a `renamingId` state; the row renders
   `InlineRenameField` while renaming, else the title plus pencil and trash buttons.
4. **MCP tool** in `ai/server/adobeResourceTools.ts` beside `delete_adobe_project`, calling the
   same handler. Plus: `TOOL_NARRATION`, `AGENT_ALERT_COPY` (target `['projectId', 'title']`),
   a battery prompt, `realSdkRegistration.test.ts`, the tool counts, `docs/systems/mcp-server.md`
   and `npm run docs:tools`.

## Scope and surfaces

- **Bundles:** the picker renders in the wizard and integrations bundles; its only new
  class-free markup reuses `InlineRenameField` (already in both).
- **Out:** renaming workspaces; updating OTHER demos on disk that deploy to the same Adobe
  project (they keep their stored title until they next load their destination — noted in
  the handler).
- **Branch:** `feature/rename-adobe-project` off develop, in its own worktree.

## Verification

- Unit (TDD):
  - the operation's `{ ok, error }` results;
  - the handler: validation, org gate, success path (the `get-projects` push and the demo
    title sync, asserted by argument) and Adobe's 403 in plain words;
  - the picker: pencil → field → saved title; an error shown inline; Escape cancels;
  - the tool: consent, schema, narration, and the counts.
- `npm run gate`.
- Live (the owner, in the Extension Development Host): open Integrations → Change, rename
  "Kukla Test" to "Kukla Bodea", and check it in Developer Console. I don't run the cloud
  rename myself.

## As built (2026-09-19) — where it differs from the design above

- **No push to the Integrations header.** The handler updates the open demo's stored
  `adobe.projectTitle` but does not send `projectDestinationUpdate`: handlers answer by
  returning (Pattern B), and the push-message ratchet caught the extra send. The header
  shows the new name the next time its destination is written or the screen loads.
- **The tool takes `projectName` (the current title), not `confirm`.** Consent comes from
  the `AGENT_ALERT_COPY` dialog, which shows the old and new names — a person can check a
  title, not a 19-digit id. A rename is reversible, so it needs no name-echo gate like delete.
- **`renameRemoteProject` now returns `{ ok } | { ok: false, error }`**, and the shared
  `AuthenticationService` fake, which answered `undefined`, now answers `{ ok: true }`.
- **The list refresh after a delete is shared** (`refreshProjects`, exported from
  `deleteAdobeProjectHandler.ts`) rather than copied into the rename handler.
