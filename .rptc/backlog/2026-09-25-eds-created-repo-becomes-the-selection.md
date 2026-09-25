---
id: EDS-18
kind: fix
area: eds
needs: []
value: high
status: backlog
---

# A created GitHub repository becomes the selected repository, and the Code Sync notice centres

Filed 2026-09-25 from the owner's walk through the wizard's Storefront area on develop. Three
behaviours, one component (`RepoSelectionInline`), reported as "bad experience":

1. After creating a repository and moving to the Code Sync sub-step, the notice "Code Sync is
   checked after setup" is not centred in the pane the way the sibling states (the spinner, the
   green check) are.
2. Going back to the Repository sub-step shows the create form in its "created" state; the list
   is reachable only through Browse. Once there, the new repository is missing until the list is
   refreshed by hand.
3. Selecting it from the list and moving forward again then shows Code Sync as verified.

## What is actually happening (read 2026-09-25)

- Code Sync is asked at two moments: a cheap non-triggering probe at selection or creation
  (`probeRepoCodeSync`, `check-github-app` with `skipTrigger`), and the real check during setup
  after the site is registered (`storefrontSetupPhaseHelpers.checkGitHubAppForExistingRepo`,
  trigger + poll up to three minutes, install dialog when the App is missing). Adobe's `/status`
  reports on a SITE, which nothing before setup creates, so a fresh repository always lands on
  "checked after setup" (`resolveCodeSyncView` → `after-setup`). Behaviour 3 is the same probe
  answering later, once Adobe had indexed the repository the App was already installed on. Not
  a defect.
- Behaviour 2: creating sets `repoMode: 'new'` + `createdRepo`; the Repository phase renders
  `NewRepoForm` in its created state until Browse or New. The list lives in wizard state
  (`githubReposCache`, `useSelectionStep`), fetched only when empty; `create-github-repo` never
  touches it.
- Behaviour 1: all four Code Sync states share `CenteredFeedbackContainer fill`, and
  `shared-ui.css` (which styles `.centered-feedback--fill`) is imported by the wizard bundle, so
  it is not the missing-stylesheet trap. The asymmetry is inside: `after-setup` and
  `needs-install` render `StatusDisplay height="auto"` (wrapped in `FadeTransition`), while
  `checking` and `verified` render components that reserve their own height. To be measured
  before it is changed.

## The change

- After a successful create, put the new repository into the cached list and make it the
  selected existing repository (`repoMode: 'existing'`, `selectedRepo`, `existingRepo`, the
  locked `daLiveSite`). Returning to the step then shows the list with it selected, and the
  Code Sync probe runs the way it does for any selected repository.
- Measure the notice's render, then make it centre like its siblings.

## Verification block

Unit: after create, the cache holds the repository first and it is selected; the probe effect
runs for it; the picker's repository verdict is true without a Browse. Visual: a wizard
screenshot of the Code Sync notice centred, confirmed by the owner. Gate green.
