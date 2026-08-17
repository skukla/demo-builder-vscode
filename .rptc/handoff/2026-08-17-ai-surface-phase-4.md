# Handoff — AI surface, phase 4 (Groups 1, 2, 4 shipped)

**Branch:** `feature/ai-surface-coverage` (worktree of the same name)
**State:** 77 tools · full suite 14,046 / 1,068 suites green · tsc, typecheck:tests, eslint clean
**Plan:** `.rptc/plans/ai-surface/phase-4-step-02-full-parity-plan.md` — carries every decision;
this file carries only what a fresh session needs that the plan does not say.

## What shipped (19 commits, 2026-08-17)

| Group | Tools |
|---|---|
| **1 — diagnosis** ✅ | `get_project_status` · `check_prerequisites` · `check_github_app` · `check_repo_readiness` · `discover_store_structure` · `get_component_requirements` · `validate_component_selection` · `get_auth_status` (enriched) |
| **2 — cloud resources** ✅ | `create_github_repo` · `create_adobe_project` · `create_adobe_workspace` · `delete_adobe_project` |
| **4 — configuration** ✅ | `configure_project` |

Every one measured live and given a ceiling in `tests/features/ai/server/responseCeilings.ts`.

## Start here

**Wave 3 — `add_integration`'s panel branch.** It is the last known DEFECT on the surface, as
opposed to missing capability. In
`src/features/dashboard/handlers/appBuilderComponentHandlers.ts` (note: **dashboard**, not
`features/app-builder` — that wrong guess cost a lookup):

```ts
355  if (needsUserInputs(entry)) {
356      await vscode.commands.executeCommand('demoBuilder.configureProject');
357      return { success: true };          // ← nothing happened
```

Replace that branch with a `needsUser` handoff. Small — one handler branch, one descriptor row —
and the convention now has three shipped uses to copy (`statusDescriptors.ts` PaaS branch,
`configureProjectTool.ts` secrets, `cloudResourceTools.ts` needsAuth).

**Then Group 5 (lifecycle)** — highest daily value: a current-project pointer, `restart_demo`,
`open_url` (today `get_project_urls` returns URLs and nothing can open them), and the
file-picker handoffs.

## Primitives now available (use these, do not reinvent)

In `toolDescriptors.ts`, all four with tests:

- `capturePayloadFrom: '<event>'` — a handler that pushes its answer and returns bare success
  becomes a tool with no handler edit. A captured `success: false` beats the handler's `true`.
- `argDefaults: {...}` — arguments FORCED onto the call, overriding the caller. For read tools
  whose handler has a write on some branch.
- `preflight: (args) => result | undefined` — answer without dispatching. This is how a
  `needsUser` handoff avoids running the handler first.
- `projectors.ts` — `leanList` / `indexDetail` / `verdictOnly` / `legend`, plus `AGENT_PAGE_SIZE`.

## Traps that cost real time today

1. **The stub server in every test file ignores the tool DEFINITION.** 20 of 22 files. It cannot
   see the input schema, and `tsc` cannot either (`server` is `any`). Two defects shipped through
   it, one of which killed the entire server for six commits. Add new registration functions to
   `tests/features/ai/server/realSdkRegistration.test.ts`. Full write-up in the
   `mcp-tool-authoring` skill.
2. **`inputSchema` must be a zod shape or schema — never raw JSON Schema**, and a raw shape
   STRIPS unknown keys. Use `z.object({...}).strict()` on anything that writes.
3. **Never write a shape you have not read** — schema fields from the handler's payload type,
   test fixtures from a real `.demo-builder.json`, and check WHICH of two similar accessors a
   caller uses. Five instances today. See `mcp-tool-authoring` and `webview-test-authoring`.
4. **The registry usually already knows.** Four problems were solved by reading a declaration
   that existed: the mesh's `requiredEnvVars`, `getWorkspaces`' `target?` shape,
   `checkGitHubApp`'s own `skipTrigger`, and `COMPONENT_SECTIONS`. Look before adding a mechanism.
5. **`mcp-live-probe` earns its keep.** It found three defects that passed jest, tsc,
   typecheck:tests and eslint. Read `info` before EVERY measurement — the `bodea-template`
   worktree's host rebinds the shared socket every few minutes, and a wrong-build answer looks
   exactly like a right one.

## Open debts

- **Unprobed:** `check_prerequisites` with `selectedOptionalDependencies: ['eds-accs-mesh']`
  (should pull Node 20 into the check), and `configure_project`'s APPLY paths. The latter writes
  real project state — point it at a throwaway project, not `demo-builder-test`.
- **`update_project_config`** is still the unguarded whole-file write. `configure_project` now
  covers the structured cases; consider narrowing or retiring it.
- **Adobe cache vs session target** is fixed for `createProject`/`createWorkspace` only. Any
  future tool over `AdobeEntityFetcher` must pass an explicit target — `select_*` writes
  `adobeTargetStore`, which the fetcher's cache never sees.

## Conventions worth keeping

- Every tool answers with something an agent can act on: the applied diff and what remains, not
  `{success: true}`. `responseSize.test.ts` classifies every row that could return `{}`.
- Irreversible actions take `confirm: true` AND an exact name echo (`delete_github_repo`,
  `delete_adobe_project`).
- Secrets are never tool arguments. Refuse with `needsUser`, apply nothing else.
- Record a ceiling from a LIVE measurement. If it cannot be measured yet, put the tool in
  `PENDING_LIVE_MEASUREMENT` rather than inventing a number.
