# A second, dead, unwrapped mesh-creation implementation

**Filed:** 2026-08-04
**Origin:** Org-targeting audit during the mesh-read fix (`7a2bdeb0`).
**Severity:** Low today (unreachable), Medium if ever wired up — it is the unwrapped
one of the pair, and an unwrapped `aio` create is exactly the 2026-08-03 incident
where `deployMeshHeadless` deployed into a DELETED project for two days.
**Present in:** `features/mesh/handlers/createHandler.ts`, `createHandlerHelpers.ts`.

## The finding

Two implementations of "create a mesh":

| | live path | this one |
|---|---|---|
| entry | `executor.ts:1101` → `deployNewMesh` | `handleCreateApiMesh` (message `create-api-mesh`) |
| org-targeted | ✅ `withOrgContext(target, …)` | ❌ none |
| reachable | yes, the wizard runs it | **no** |

Nothing sends `create-api-mesh`: no webview references it, and the wizard executor
calls `deployNewMesh` directly. The message survives in `types/messages.ts`,
`meshHandlers.ts`, `ProjectCreationHandlerRegistry.ts:73`,
`progressCallbackConfig.ts`, the communication timeout table, and two docs —
enough registration to look alive under grep.

## Execution plan

1. **Confirm dead** before deleting: no `postMessage('create-api-mesh')` anywhere
   in `src/**/ui`, no MCP tool, no command palette entry. (Verified 2026-08-04, but
   re-verify — this is a delete.)
2. Delete `createHandler.ts` + `createHandlerHelpers.ts` and every registration:
   the `meshHandlers` row, `ProjectCreationHandlerRegistry:73`, the `messages.ts`
   union member, `progressCallbackConfig`'s `PROGRESS_CALLBACK_TYPES` entry, the
   `webviewCommunicationManager` timeout row, `mesh/index.ts`'s export.
3. Check what `getEndpoint`/`ensureAuthenticated` in `mesh/handlers/shared.ts` are
   left serving — they may go with it.
4. Sync `src/core/CLAUDE.md:192` and `core/communication/README.md:289`, which both
   show the handler as a live example.

## Constraints

- **No soft deprecation** (project rule): delete outright, do not leave a stub.
- If step 1 finds it IS reachable, this becomes the opposite task — wrap it in
  `withOrgContext` immediately and reconcile the duplication separately, because an
  unwrapped create is the incident that ADR-worthy docblock in `orgContextEnv` was
  written about.

## Kickoff prompt

> `handleCreateApiMesh` (`features/mesh/handlers/createHandler.ts`) is a second
> mesh-creation implementation: unwrapped by `withOrgContext`, and reachable from
> nothing — no webview sends `create-api-mesh` and the wizard executor calls
> `deployNewMesh` directly. Re-verify it is dead, then delete it and all six
> registration sites, and sync the two docs that use it as a live example. See
> `.rptc/backlog/2026-08-04-dead-second-mesh-create-implementation.md`.
