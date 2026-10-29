---
id: EDS-19
kind: fix
area: eds
needs: []
value: high
status: built
---

# The Code Sync sub-step leaves the Storefront area; setup is the one place the App is asked about

Filed and built 2026-09-25 on `fix/eds-created-repo-selection`, from the owner's questions in the
EDS-18 thread: "does it make sense to keep the code sync step where it is?" and "what would be the
benefit of telling the user 'this gets done later'?"

## Why

Adobe's `admin.hlx.page/status` reports on a SITE, and a site is a Configuration Service record
that nothing before setup creates. So before setup the Code Sync question has no answer for a new
repository, whatever the App's state; the sub-step showed "Code Sync is checked after setup" beside
an Install button, and pressing Check Again after installing could never turn green. The owner read
it as unclear even knowing what it said, because the words and the affordance disagreed.

GitHub offers no other oracle: `GET /user/installations` answers 403 to an OAuth user token of the
kind VS Code holds ("must authenticate with an access token authorized to a GitHub App"), and even
a GitHub App of our own would list only its own installations, never AEM Code Sync's; the org-level
listing needs an org admin token and most SC repositories are personal. Measured 2026-09-25.

Setup already asks at the two moments it can be answered — phase 1 before the first write for a
repository that already has a site, and phase 3 right after the site is registered — and stops on a
definitive "not installed" with the install dialog (Install, Check Again). That is where the
verification the user wants actually happens.

## What changed

- `StorefrontSectionId` loses `'code-sync'`; the area has three sub-steps (accounts, repository,
  block-libraries); `storefrontCodeSyncValid` is gone from wizard state, the stack reset, the tile
  status and the summary.
- `RepoSelectionInline` loses its `phase` prop, the selection-time probe, Check Again and the
  install page action; `repoSelectionInline.helpers.tsx` loses `CodeSyncStatusView`,
  `resolveCodeSyncView`, `computeCodeSyncValid`, `probeRepoCodeSync`, `pollGitHubAppInstallation`
  and their types. The install script (`codeSyncInstallContent.ts`) stays for the setup dialog.
- Six test files that pinned the sub-step were deleted; the rest adapted. The test-family,
  user-facing-errors and equivalent-mutant ledgers were repaired for the removed code, and the
  file-size pin lowered by one (the picker shrank under its limit).

Follow-up: [[EDS-20]] — when the install dialog detects the App, setup should resume rather than
demand a Retry from the start.

## Shipped so far

- 2026-09-25  fix(eds): the Code Sync sub-step leaves the Storefront area; setup is the one place the App is asked about (`f5e337672`)
