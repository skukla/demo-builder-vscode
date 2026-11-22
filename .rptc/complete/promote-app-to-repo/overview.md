# Promote a blank-starter app to its own GitHub repository (AB-1c)

Backlog item: `.rptc/backlog/2026-07-13-promote-app-to-repo.md`. Built to the supervised
edge by the 2026-10-05 night loop: code, tests and the confirmation are in; the first real
repository creation is the owner's.

## Staleness check (2026-10-05)

- "Add a create-empty-repo method" — DONE already: `GitHubRepoOperations.createEmptyRepository`
  (`src/features/eds/services/github/githubRepoOperations.ts`).
- "Push the local dir via git" — superseded by a better seam: the zip import already turns a
  map of files into a new repository through the GitHub API (`pushFiles`,
  `githubTreePush.ts`). No local `git push`, so no token on a command line and no change to
  the clone's own remote.
- "Origin marker on the component" — exists already in effect: a blank-starter app's
  `appBuilderComponents[id].source` IS the blank catalog entry's repository, recognised by
  `isBlankSource` (`appBuilderComponentCatalogLoader.ts`).
- Secrets: the shell's own `.gitignore` excludes `.env`, `.aio`, `dist/`, `node_modules/`
  (read with `gh api repos/skukla/app-builder-shell/contents/.gitignore`, 2026-10-05).

## Design

**What entity is this.** Not a new entity. The promoted repository becomes the app's
`source` — the field every integration already has — so a promoted app is, from then on,
exactly what an imported app is: an integration whose code lives at `owner/repo`. One new
optional field records that Demo Builder made that repository, and where the app came from:
`appBuilderComponents[id].promotion = { from: {owner, repo, branch?}, at }`.

**What owns it and where it lives.**
- The record: `AppBuilderComponentState` (`src/types/base.ts`), so the manifest schema is
  regenerated; nothing else persists it.
- The work: a dialog-free core in `src/features/app-builder/services/appRepoPromotion.ts`
  (collect the files, create, push, record; and the reverse). The human door is a dashboard
  handler (`appBuilderComponentPromote.ts`) that asks the name, confirms, then calls the core —
  the split `forgetAddedDemoHandler.ts` already uses (core for an agent's `confirm` gate later,
  door for the person).
- The card: two new card actions on the integration flyout, derived in
  `integrationCardModel.ts` like the ERP actions are.

**Why this pays off with no other change.** A project export derives each custom app's
source from `appBuilderComponents[id].source` (`settingsSerializer.ts`,
`deriveAppBuilderComponentSources`). Before promotion a blank-starter app exports as the
EMPTY shell — the receiver gets nothing the SC built. After promotion it exports as the
SC's repository, and the receiving project clones the real app. That is the item's goal
("import that repo elsewhere") with no change to export or import.

**Alternatives rejected.**
- *Push with local `git` (`git init`, `remote add`, `push`).* Needs the token in a remote
  URL or a credential helper, and rewrites the clone's own git state, which the update check
  (`integrationUpdateCheck.ts`) reads. The API push already exists and is proven by the zip
  import.
- *A separate `promotedRepos` map on the project.* A second record of the same fact that
  could drift from the component; and the component's removal would not take it along.
- *Re-point the clone's git remote at the new repository.* Then the update check would
  fetch a branch with an unrelated history and report an update that would reset the
  folder. Left alone: the local folder keeps working exactly as before.

**The undo.** "Delete its GitHub repository" on a promoted app: confirmed twice like
every other repository delete (`forgetAddedDemoHandler.ts`), it deletes the repository
Demo Builder created and puts `source` back to the blank starter, removing `promotion`.
The local app is untouched either way. If the SC removes the integration instead, the
repository stays (saving it was the point); it is then the SC's like any repository and
"Manage GitHub repositories" can delete it.

**Secrets.** Three filters, any one is enough to drop a file: the app's own `.gitignore`
(the zip import's rule, now shared), the never-shipped list every door uses
(`neverShippedFiles.ts`: every `.env*`, `.git/`, `node_modules/`), and an App Builder list
(`.aio`, `dist/`, `.parcel-cache/`) that holds even when the AI deleted the `.gitignore`.
The confirmation shows how many files go and how many were left out.

## Product-intent decisions (walkthrough queue)

1. **Public repository** — built as public, the pattern every repository Demo Builder
   creates already follows (storefront setup and the zip import default to public), and the
   only kind "Import a repo" can clone (it clones unauthenticated). The confirmation says
   "public" in words. Recommendation: keep public; add private only together with an
   authenticated import clone.
2. **After promotion** — the "Save to GitHub" action disappears and only the undo is
   offered. An "Update the repository" (push later changes) action is NOT built.
   Recommendation: add it when an SC asks; it is a second push through the same core.
3. **Agent surface** — no MCP tool yet (the item says the dashboard action first). The core
   is dialog-free so the tool is a descriptor row plus a `confirm` gate.

## Built (2026-10-05 night loop, uncommitted, staged)

- `src/features/app-builder/services/appRepoPromotion.ts` — collect files, save, undo (dialog-free core).
- `src/features/app-builder/services/promotionEligibility.ts` — the one rule the card and the handler share.
  It also refuses an app keyed by the catalog's own id (`app-builder-shell`): every deploy resolves
  that id to the catalog entry and writes its source back (`integrationOutcome` → `identityOf`), and
  an export carries catalog ids by selection, so the saved repository would be lost. Found while
  building; only NAMED blank starters (every add since shell instancing) can be saved.
- `src/core/utils/gitignoreRules.ts` — the zip import's `.gitignore` rule, now shared.
- `src/features/dashboard/handlers/appBuilderComponentPromote.ts` — the two doors (pick owner,
  name, modal confirm; modal confirm for the delete). Registered in `dashboardHandlers.ts`.
- Card: `save-to-github` / `delete-github-repo` verbs (`integrationCardModel.ts`,
  `IntegrationActionsMenu.tsx`, `FlyoutActions.tsx`, `systemCardActions.ts`), label
  "Custom · saved to GitHub" once saved.
- `AppBuilderComponentState.promotion` (`src/types/base.ts`) + regenerated manifest schema.

Not done (the owner's part): the first real save against GitHub, and a visual look at the card.
