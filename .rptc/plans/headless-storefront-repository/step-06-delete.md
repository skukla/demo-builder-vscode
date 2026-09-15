# Step 06 — Deleting a project offers its headless repository

Item: [[EDS-13g]]. Decisions: 3 (owner, 2026-09-15); principle 1. Depends on steps 02 and 03.

## Goal

A headless project created with a repository can be removed completely: Delete shows the
same choice Edge Delivery shows, with one row, "Delete Repository". Nothing else about
deleting a project changes. Manage GitHub Repositories names the headless project a
repository belongs to; a repository a failed Create Project kept (step 03) belongs to no
project and is listed there without one, where it can be deleted.

## Facts

- `deleteProject` decides "EDS" with `isEdsProject` from `resourceCleanupHelpers.ts:90-95`
  (the `eds-storefront` key is present), a different test from `typeGuards.ts:304-306`
  (the stack id). EDS projects get `showCleanupConfirmation` (`projectDeletionService.ts:261-390`,
  driven by `demoBuilder.cleanupBehavior`: `ask`, `deleteAll`, `localOnly`, `package.json:211-225`);
  everything else gets a plain modal (`:132-149`).
- The rows come from `extractEdsMetadata` (`resourceCleanupHelpers.ts:102-125`): a Repository
  row when `githubRepo` is set (`:303-310`), a DA.live row when org and site are both set
  (`:313-321`). For a project with a repository and no DA.live org, only the Repository row
  appears. The site falls back to the repository name (`:120-122`), but without an org the
  row still does not show.
- Repository deletion: token or a GitHub session with `delete_repo` (`:556-617`), then
  `deleteRepository` (`githubRepoOperations.ts:477`).
- `getLinkedEdsProjects` (`resourceCleanupHelpers.ts:132-157`) feeds Manage GitHub
  Repositories (`manageGitHubRepos.ts:104-114`) and Cleanup DA.live Sites
  (`cleanupDaLiveSites.ts:92-100`).
- The agent's `delete_project` is local only and says so (`deleteProjectTool.ts:1-10, 34-35`);
  `delete_github_repo` deletes any named repository behind a typed-name confirm
  (`cloudResourceTools.ts:232-275`).

## The exact changes

- `resourceCleanupHelpers.ts`:
  - Delete `isEdsProject` (`:90-95`). Callers use `getStorefrontRepository` for the
    repository and `getEdsDaLiveTarget` (`typeGuards.ts:322-338`) for DA.live. Verified the two
    `isEdsProject` functions answer different questions (key present vs stack id); after this
    change neither question is asked here.
  - `extractEdsMetadata` → `extractCleanupTargets(project)`:
    `{ githubRepo?: string; daLiveOrg?: string; daLiveSite?: string; backendType? }`,
    `null` when the project has neither. `EdsProjectMetadata` → `CleanupTargets`.
  - `getLinkedEdsProjects` → `getLinkedStorefrontProjects`, returning every project with any
    target. `cleanupDaLiveSites.ts:92-100` already filters on `daLiveOrg`, so headless
    projects never mark a DA.live site linked.
- `projectDeletionService.ts`:
  - `deleteProject` (`:108-213`): `const targets = extractCleanupTargets(project)`; the
    QuickPick path runs when `targets` is not null; `isEds` (`:114-115`) and its uses (`:121, 163, 192`)
    become `targets !== null`.
  - `showCleanupConfirmation`, `performEdsCleanup` → `performCloudCleanup`,
    `unpublishCdnContent`, `performDaLiveCleanup` take `CleanupTargets`. DA.live and CDN work
    stay guarded on org and site, as today.
  - The one-time settings tip (`:192-206`) shows for any project that had the QuickPick.
- `package.json:224` `demoBuilder.cleanupBehavior` description: "How to handle a project's
  cloud resources (its GitHub repository and, for Edge Delivery, its DA.live site) when
  deleting it."
- `manageGitHubRepos.ts:104-114`: variable and log names drop "EDS"; behaviour follows the
  helper.
- `deleteProjectTool.ts`: when the project records a repository, the success body adds
  `repository: "owner/repo"` and `hint: "Its GitHub repository was kept. delete_github_repo
  removes it once the user agrees."` Description unchanged (still local only).

## Reuse

The whole Edge Delivery deletion flow: `showCleanupConfirmation`, `cleanupBehavior`,
`performGitHubCleanup` with its `delete_repo` session prompt, `deleteRepository`,
`formatCleanupResults`, `showOneTimeTip`; `delete_github_repo` for the agent. Nothing new.

## Tests (failing first)

- `projectDeletionService-remoteCleanup.test.ts`: "a headless project with a repository gets
  the QuickPick with one Repository row"; "deleteAll deletes a headless repository";
  "localOnly keeps it"; "a headless project without a repository gets the plain modal"
  (today's behaviour, pinned).
- `projectDeletionService-cleanup.test.ts`: DA.live cleanup is not called for headless
  (argument assertion on the DA.live service mock: never invoked).
- `resourceCleanupHelpers.test.ts`: `extractCleanupTargets` for EDS (unchanged values),
  headless with repository, headless without (null), a project whose repository name would
  have produced a site but has no org (no DA.live target).
- `tests/features/ai/server/deleteProjectTool.test.ts`: the `repository` and `hint` fields;
  a project without one has neither.
- Mocks: any suite mocking `resourceCleanupHelpers` with `isEdsProject` or
  `extractEdsMetadata` by name (`grep -rln "extractEdsMetadata\|isEdsProject" tests` when
  implementing; the `templateUpdateChecker` private method of the same name is unrelated and
  was renamed in step 02).

## Docs that change

`package.json:224`; `docs/systems/mcp-tools.md` (regenerated, `delete_project` body);
CHANGELOG.

## Acceptance

| Predicate | Evidence |
|---|---|
| The duplicate predicate is gone | `grep -rn 'export function isEdsProject' src` count captured equals 1 (the one in `typeGuards.ts`); control: the count before the change is 2 |
| EDS deletion unchanged | the existing EDS cases in both deletion suites pass unedited |
| Gate green | `gate`, pre-push |
| Live (owner confirms the delete) | the step-03 project: Delete shows "Delete Repository · <login>/hsr-check"; ticked and Enter: the repository is gone on GitHub and the folder is gone locally |
| Live: localOnly | `demoBuilder.cleanupBehavior = localOnly` on a second test project: plain modal; repository remains |
| Live: Manage GitHub Repositories | lists the headless repository with its project name |

## Reversal

Revert the commit. A deleted repository cannot be restored by Demo Builder; that is why the
row is unticked by default and `deleteAll` is opt-in, as for Edge Delivery.
