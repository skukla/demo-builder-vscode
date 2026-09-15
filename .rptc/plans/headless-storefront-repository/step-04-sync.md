# Step 04 — Sync Storefront for both kinds

Item: [[EDS-13g]]. Decisions: 3, 5 (revised), 7 (owner, 2026-09-15). Depends on step 03.

## Goal

A headless SC edits files in their storefront and presses More → Sync Storefront: the edits
are committed and pushed to their repository, exactly as Edge Delivery does, without the
Helix publish. An agent does the same with `sync_storefront`. A headless project without a
repository (one created before this feature) gets the decision-5 sentence: "This project was
created before headless projects had a GitHub repository. Create a new project to use this."

## Facts

- `SyncStorefrontCommand.execute` reads the current project, refuses without an
  `eds-storefront` path ("Sync Storefront only applies to EDS projects", `syncStorefront.ts:59-65`),
  prompts for a message, reads a GitHub token and a DA.live token (`:84-87, 538-551`), and
  calls `syncAndPublish` (`:96-102`). Its repo read uses `edsBranch` (`:524-535`); nothing in
  `src` writes `edsBranch` (grep: three readers, `syncStorefront.ts:534`,
  `storefrontSyncHandler.ts:40`, `blockAuthoring.ts:83`).
- `syncAndPublish` publishes to Helix whenever it has a repo, a GitHub token and a DA.live
  token and `skipHelix` is not set (`storefrontSyncService.ts:113-115, 154-163`). An SC with a
  DA.live sign-in who syncs a headless project would therefore publish it to Helix unless the
  caller sets `skipHelix`.
- Rebase conflicts on `config.json` / `fstab.yaml` take the remote copy silently
  (`managedStorefrontFiles.ts:19-28`, used at `syncStorefront.ts:273-327`). A Next.js repository
  may have its own root `config.json`.
- The MCP tool resolves the clone with `resolveStorefrontPath` (`mcp/projectSecurity.ts:173-181`,
  EDS key only) and the repo with `readStorefrontGithubRepo` (`mcp/storefrontSyncHandler.ts:30-47`).
  The block tools use the same `resolveStorefrontPath` (`mcp/blockToolHandlers.ts:74, 139`)
  and must stay Edge Delivery only.
- The menu item shows only for EDS (`ActionGrid.tsx:659-661`); its message dispatches the
  command (`edsContentHandlers.ts:20-23`).
- The `.git/info/exclude` entries from step 03 exist only in clones made after it.

## The exact changes

### Shared core

- `src/features/lifecycle/commands/syncStorefront.ts`: extract
  `syncProjectStorefront(project, deps)` from `execute` (`:52-150`). `execute` keeps "No project
  loaded" and calls it with the current project; reset's "Sync first" (step 05) calls it with
  the project being reset, which on the projects list is not the current one.
  - `getStorefrontRepository(project)` gives path, repository and branch. No repository and a
    storefront instance exists: `NO_OWN_REPOSITORY`, the decision-5 sentence, exported from
    `src/features/components/services/storefrontRepositoryCopy.ts` (added in step 03, where the
    Edit notice renders it first; one home for the sentence steps 05 and 08 reuse). No
    storefront instance at all: "This project has no storefront to sync."
  - `githubRepo: { owner, site: repo, branch }`; the `edsBranch` read (`:533-534`) and the
    `storefrontMetadata` helper (`:518-526`) are deleted.
  - DA.live token read only when `kind === 'eds'`; `skipHelix: kind !== 'eds'`.
  - `autoResolveManagedConflicts` passes `kind` to `isManagedStorefrontFile`.
- `managedStorefrontFiles.ts:19-28`: `isManagedStorefrontFile(rel, kind)`; the set applies
  to `'eds'`; `'headless'` has none, so every conflict goes to the merge editor.
- `storefrontSyncService.ts`: `SyncAndPublishInput.secretFiles?: readonly string[]`. After
  `stageAll` in `syncAndPublish`, `git diff --cached --name-only`; any staged path whose basename is in
  the list throws new `SecretFileStagedError` naming the file, and the index is restored with
  `git reset -q` so nothing is left staged. Both callers pass `.env` and `.env.local` from
  step 03's constant. Covers clones made before step 03 and demo repositories whose
  `.gitignore` does not ignore them.
- `syncStorefront.ts` shows the error as: "Sync stopped: {file} holds your Commerce settings
  and would become public. Add it to the storefront's .gitignore, then sync again."

### Agent

- `mcp/projectSecurity.ts`: new `resolveOwnStorefront(projectPath)`: reads the manifest and
  returns `getStorefrontRepository` of it (typeGuards is `vscode`-free: its imports are
  `./base`, `@/core/config/envVarKeys`, `@/core/constants`, `@/core/state/appBuilderComponentState`,
  none of which import `vscode`; the mcp-server bundle must still be built once to confirm).
  Throws `NO_OWN_REPOSITORY` for a repo-less storefront. `resolveStorefrontPath`'s doc says
  "Edge Delivery block tools only".
- `mcp/storefrontSyncHandler.ts`: `readStorefrontGithubRepo` (`:30-47`) deleted; the handler
  (`:98-`) uses `resolveOwnStorefront`, sets `skipHelix` for headless and passes `secretFiles`.
- `mcp-server.ts:208-218` description: "Commit and push your local storefront changes to the
  project's own repository (Edge Delivery also publishes the home page)."
- `createProjectTool.ts:244-246`: the headless hint names `sync_storefront`.

### Human surface (bundle: dashboard)

- `ActionGrid.tsx:659-661`: the Sync Storefront item shows for every project; the handler
  answers `NO_OWN_REPOSITORY` for a repo-less headless project.

## Reuse

`SyncStorefrontCommand`'s whole flow (message prompt, push, rebase recovery, merge editor,
ruleset rejection), `syncAndPublish`, `rebaseOntoRemote`, `PushRejectedError`,
`isManagedStorefrontFile`, `getStorefrontRepository`. New: `syncProjectStorefront` (an
extraction, not new behaviour), `SecretFileStagedError`, `resolveOwnStorefront`.

## Tests (failing first)

- `syncStorefront.test.ts`: "syncs a headless project to its own repository without Helix"
  (assert `syncAndPublish` was called with `skipHelix: true` and no `daLiveToken`: the
  argument, not the outcome); "a headless project without a repository gets the
  decision-5 sentence and nothing runs"; "no storefront at all"; "uses the recorded branch".
- `syncStorefront-conflictFlow.test.ts`: "a headless config.json conflict opens the merge
  editor".
- `managedStorefrontFiles.test.ts`: headless set is empty; EDS unchanged.
- `storefrontSyncService.test.ts` (git is mocked at the `child_process` layer, `:7-8`):
  "a staged .env stops the sync, runs `git reset -q`, and never commits" (assert the
  `execFile` argument lists); control: "a staged `src/env.ts` does not stop it". One real-git
  case in the new `storefrontSyncService-secretFiles.test.ts` against a temp repository, so
  the `diff --cached` parsing is proven against git rather than against the mock; git runs
  with every `GIT_*` variable stripped (`homeGitSyncHook.test.ts:24-42`, from step 01).
- New `tests/mcp/projectSecurity-ownStorefront.test.ts` (no suite covers `src/mcp/` sync today): manifest shapes for EDS, headless
  with repository, headless without (sentence), none. `tests/features/ai/mcpServer-blocks.test.ts`
  unchanged (block tools still refuse headless).
- New `tests/mcp/storefrontSyncHandler.test.ts` (none exists): headless skips Helix; the
  repo-less sentence reaches the agent.
- `ActionGrid-overflow.test.tsx`: the item shows for a headless project;
  `ActionGrid.testUtils.tsx` default props lose the EDS assumption for this item.
- `createProjectTool-addedDemo.test.ts:84-85` asserts the headless hint does NOT name
  `sync_storefront`; it now expects `sync_storefront` and still not `list_blocks`.

## Docs that change

- `docs/systems/mcp-server.md` and `docs/systems/mcp-tools.md` (regenerated): `sync_storefront`
  for both kinds, Helix for EDS only, the secret-file refusal.
- `src/features/dashboard/README.md:26` mentions Sync Storefront; checked and updated if it
  says EDS only.
- The generated `sync-changes` skill still says headless projects do not use
  `sync_storefront` (`templates/skills/sync-changes.md:46-49`) until step 09. Stated in the
  CHANGELOG entry so the gap is not a surprise.

## Acceptance

| Predicate | Evidence |
|---|---|
| `edsBranch` gone from sync | `grep -rn 'edsBranch' src/features/lifecycle src/mcp/storefrontSyncHandler.ts` count 0; control: `grep -rn 'edsBranch' src/mcp/blockAuthoring.ts` counts 1 |
| Helix never called for headless | the argument assertions above |
| Block tools still EDS only | `mcpServer-blocks.test.ts` unchanged and green |
| Gate green | `gate`, pre-push |
| Live (owner confirms the push) | on the step-03 project: edit `src/app/page.tsx`, More → Sync Storefront; the commit is on GitHub; no Helix call in Debug Logs |
| Live: secret refusal (no push) | on the step-03 project, remove the `.env` line from `components/headless/.git/info/exclude` and the `.env*` line from a local, uncommitted `.gitignore` edit; Sync: stopped with the sentence; `git -C components/headless diff --cached --name-only` prints nothing; restore both files |
| Live: repo-less | a headless project created before step 03: More → Sync Storefront shows the decision-5 sentence; nothing is committed (`git -C components/headless log -1` unchanged) |
| Live: agent | `mcp-live-probe` `sync_storefront` on the repo-less project returns the sentence; on the step-03 project it pushes (owner confirms) |

## Reversal

Revert the commit. Pushes made by Sync are ordinary commits in the SC's repository; they are
undone with git, or by reset (step 05), which returns the repository to the source.
