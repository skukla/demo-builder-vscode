# Handoff — AI surface, phase 4 (Groups 1, 2, 3 shipped; Group 4 started)

**Branch:** `feature/ai-surface-coverage` (worktree of the same name)
**State:** **78 tools** · full suite 14,083 / 1,070 suites green · tsc, typecheck:tests, eslint clean
**Plan:** `.rptc/plans/ai-surface/phase-4-step-02-full-parity-plan.md` — carries every decision;
this file carries only what a fresh session needs that the plan does not say.

## What shipped (20 commits, 2026-08-17)

| Group | Tools |
|---|---|
| **1 — diagnosis** ✅ | `get_project_status` · `check_prerequisites` · `check_github_app` · `check_repo_readiness` · `discover_store_structure` · `get_component_requirements` · `validate_component_selection` · `get_auth_status` (enriched) |
| **2 — cloud resources** ✅ | `create_github_repo` · `create_adobe_project` · `create_adobe_workspace` · `delete_adobe_project` |
| **3 — configuration** ✅ | `configure_project` |
| **4 — integrations** 🟡 | `add_integration` only (Wave 3, + the panel-branch defect it was blocked on). **`rename_integration`, `set_console_apis` and `set_project_destination` REMAIN.** |

Every Group 1–3 row was measured live and given a ceiling in
`tests/features/ai/server/responseCeilings.ts`. `add_integration` was NOT — see its note below.

> **Correction (2026-08-17).** An earlier version of this table labelled `configure_project`
> "Group 4 — configuration" and showed it complete. In the plan, configuration is **Group 3**;
> **Group 4 is Integrations**, and three of its four tools are unbuilt. As written, the next
> session would have read Group 4 as finished and skipped them.

**The tool count is MEASURED, not derived.** 78 = 47 bespoke registrations + 31 descriptor rows,
no overlap, enumerated from the `registerTool(` call sites in `src/features/ai/server/` and
`src/mcp-server.ts`. The previous header's 77 was carried forward by hand; it happened to be
right, which is not the same as having been checked.

## Wave 3 — DONE (`9d52a5de`, pushed)

`add_integration`'s panel branch, plus the tool itself. Three parts:

- **The handler** (`appBuilderComponentHandlers.ts`) no longer answers `{success: true}` for
  opening Configure and adding nothing. It returns `blocked` naming the missing vars — the same
  shape a guard refusal uses, so no error row is painted for work that never ran. Its SUCCESS
  path also stopped being bare: it returns `{added: {id, name, kind}}`, because `defaultShape`
  renders a bare success as the literal `"{}"` and the id is what the agent needs next (for a
  custom source it never supplied one).
- **`add_integration`** joined `ACTION_DESCRIPTORS` — catalog `id` OR custom `source`, plus
  `name`/`instanceId`/`apis`. Ungated, like `deploy_integration`.
- **Its `preflight`** returns the `needsUser` handoff, so the agent path never opens a panel in
  the user's editor for a call they did not make. Resolution and classification come from two
  new exports on the handler (`resolveAddEntry`, `userSuppliedEnvVars`) rather than a second
  copy of the rule — otherwise the tool would dispatch, the handler would refuse, and the panel
  the preflight exists to suppress would open anyway.

`HandoffReason` gained `'config-entry'`: a bucket-3 component can declare plain-text vars, and
calling a base URL a secret trains an agent to treat ordinary config as dangerous.

**MEASURED, and it changes what this fix is worth: no entry in the shipped catalog declares a
user-supplied env var.** All 5 ids across all 4 stacks (`headless-commerce-mesh`,
`eds-commerce-mesh`, `eds-accs-mesh`, `app-builder-shell`) plus a custom GitHub source come back
with empty `userText`/`userSecret`. So the bucket-3 branch cannot fire today — it is the guard
that has to exist before the first such component is authored, not a live bug being fixed. The
live half of Wave 3 is the bare-success success path, which every add hits.
`actionDescriptors.test.ts` pins the catalog's current state so the day someone authors an
`ERP_API_KEY`-style entry, it fails and points at the tool that now has a handoff to return.

An earlier `handoff.ts` paragraph blamed a GUARD failure for the defect; guards already returned
`blocked`. Corrected there.

Gate: 1070 suites / 14,083 tests (baseline 1069 / 14,070), tsc + typecheck:tests + whole-repo
eslint clean. Each new assertion was falsified by re-introducing the defect before being trusted.

**Unprobed:** `add_integration` has never run against a live server — it is in the ceiling
table's EXEMPT set with its three siblings on the shape argument (`{added: {id, name, kind}}` is
three short strings), NOT on a measurement.

## Start here

**Finish Group 4 first** — three tools, all small, and leaving them stranded is what the
mislabel above would have caused: `rename_integration` (`renameAppBuilderComponent` already
exists), `set_console_apis` (replace/remove — `add_console_apis` is add-only), and
`set_project_destination`.

**Then Group 5 (lifecycle)** — highest daily value: a current-project pointer, `restart_demo`,
`open_url` (today `get_project_urls` returns URLs and nothing can open them), and the
file-picker handoffs.

> **`select_project` is TAKEN.** The plan's Group 5 names its current-project pointer
> `select_project`, but that name already registers the **Adobe Console** project selector
> (`adobeTools.ts:236`, "Select the active Adobe Console project by id"). Registering it twice
> throws on ONE server — which `realSdkRegistration.test.ts` catches, but only after the row is
> written. Pick another name (`set_current_project`). Confirmed the underlying gap is real:
> `get_current_project` reads the pointer and nothing writes it. (Duplicate rejection verified
> against the real SDK, not taken from a comment: the second `registerTool` throws
> `Tool <name> is already registered`.)

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
