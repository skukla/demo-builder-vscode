# EDS-17 — a storefront in an organization's repository

Unattended loop, 2026-10-04 (night 4, stream A). Lane: to the supervised edge. The first real
adoption of an organization repository, and the first real SSO refusal, are the owner's live
checks.

## Staleness check (re-verified against the code before building)

Most of what the item asks for already exists. Filed 2026-09-16; the code moved since.

| Item claim | Today | Evidence |
|---|---|---|
| Storefront is created in the SC's personal namespace only | Setup creates in the namespace picked in the DA.live card, org included (`POST /orgs/{org}/repos`, template `generate` with `owner`) | `storefrontSetupPhase1.ts` `executePhaseNewRepo` passes `namespace: edsConfig.daLiveOrg`; `githubRepoOperations.ts` `createFromTemplate`/`createEmptyRepository` |
| 1. Adopt an existing repository | An SC can pick an existing repo (the default mode). The list misses org repos reached through a team | `RepoSelectionInline.tsx` `repoMode: 'existing'`; `listUserRepositories` asked `affiliation: 'owner,collaborator'` |
| 1. "Empty repository in, storefront pushed to it" | **Broken.** The readiness check says `empty` and the UI promises "it will be set up from the template", but nothing sets the reset, and the reset clones `--branch main`, which an empty repo does not have | `repoSelectionInline.helpers.tsx` `describeResetOption`; `templateSyncService.ts` clone |
| 2. Site configuration keyed on owner/repo | Already so | `configurationService.ts` `/config/{owner}/sites/{repo}.json` |
| 3. Code Sync missing → say what to ask an org admin for | Already says "Installing it on a GitHub organization requires admin rights — ask your team admin" with the install link | `storefrontSetupPhase3.ts` |
| 4. Leave the personal repository alone | Nothing moves or deletes a personal repo during setup | — |
| SSO refusal handled nowhere | Still true: no `SAML` or `x-github-sso` anywhere in `src/` | grep, 2026-10-04 |

## What this slice builds

1. **The two organization refusals GitHub gives, explained.** A 403 from an organization that
   enforces SAML single sign-on, and a 403 from an organization that has not approved the OAuth
   app VS Code signs in through. Each becomes one sentence saying what to do. Also GitHub's
   own org repo-creation refusal ("You need admin access to the organization…", status 403,
   verified in octokit/rest.js#383), which is exactly the moment the item says an SC needs telling
   what to ask for: an owner creates an empty repository and grants write access, and the SC
   picks it.
2. **A repository list GitHub cut short for single sign-on is logged.** When GitHub hides an SSO
   organization's repositories it says so only in `X-GitHub-SSO: partial-results`; that is now a
   warning in the debug log. (Listing org repos reached through a team was tried and backed out —
   see D4.)
3. **An empty repository is adopted.** Setup reads the same readiness verdict the step showed;
   when it is `empty`, setup writes one first commit (so the branch exists) and then runs the
   template reset that a not-a-storefront repo gets. Nothing is lost — the repo was empty — which
   is why the step already shows this as done, not asked.

## Design gate

- **What entity is this?** No new entity. An adopted repository is the same project storefront
  repository (`metadata.githubRepo = owner/repo`) the extension already records; the owner field
  is simply an organization. The refusals are messages, not state.
- **What owns it, where does it live?** GitHub refusal wording lives beside the other GitHub
  calls: `src/features/eds/services/github/githubOrgRefusal.ts`, a pure function used by
  `githubRepoOperations.ts` in its 403 branches. Adoption of an empty repo lives in Phase 1's
  existing-repo branch, reusing `classifyRepoForStorefront` (the classifier the step already
  calls) and `createOrUpdateFile` (which GitHub's contents API accepts on an empty repository,
  creating its default branch).
- **Alternatives rejected.**
  - *An Octokit error hook that rewrites every 403.* Every caller already maps 403 to its own
    message ("Access denied…", "missing delete_repo scope"), so a hook's wording would be
    overwritten at each site; and the hook would also fire on calls that are not about an
    organization.
  - *The webview sets `resetToTemplate` when it sees `empty`.* It would fix only the wizard path,
    still fail on the clone, and leave the agent's `create_project_from_file` path broken. The
    backend reads the repo itself.
  - *Seeding via an empty-tree commit through the Git Data API.* That API refuses an empty
    repository; the contents API is the documented way to make the first commit.
- **Product-intent choices (parked for the owner, not built):**
  - **D1 — Should deleting a project delete a repository the SC adopted?** Today every delete path
    calls `DELETE /repos/{owner}/{repo}` on whatever is recorded, and nothing records that the
    repository was adopted rather than created. For an organization repository an owner made for
    the SC, deleting it is destroying someone else's resource. Recommendation: record
    `repoAdopted: true` at setup, and have delete offer "leave it" (default) or archive for an
    adopted repo, never delete. Reset already leaves the repo in place.
  - **D2 — Should the wizard's own "Create repository" button honour the namespace picker?**
    Today it always creates under the SC (`handleCreateGitHubRepo` passes no namespace; the label
    says "Will be created as `<login>/…`"), while setup's new-repo path does honour it.
    Recommendation: honour the picker, so both paths agree, and on GitHub's 403 show the new
    "ask an owner to create it" explanation.
  - **D3 — `createEmptyRepository` silently falls back to the SC's personal namespace on a 404
    from an organization.** That fallback exists for the personal-account case (`/orgs/<login>`
    is 404). For a real organization hidden by SSO, GitHub also answers 404 ("you may receive a
    404 or 403", docs.github.com/en/rest/authentication), so the repo would silently land in the
    personal namespace. Recommendation: fall back only when the target is the SC's own login.
    Left alone tonight because the login is not in hand at that call and the change is behaviour
    for every zip import.
  - **D4 — An org repository the SC reaches only through a team is not in the list.** The list
    asks `GET /user/repos` with `affiliation: owner,collaborator`; GitHub's own default adds
    `organization_member`. Adding it was the obvious fix and was backed out: in a large
    organization with base read access it fetches thousands of read-only repositories, and the
    list stops at 10 pages (1000) BEFORE the push-access filter — an SC's own older repos could
    fall off the end. Recommendation: when the namespace picker names an organization, add one
    query for that organization's repositories the SC can push to, or let the SC type
    `owner/repo` and verify it with `checkRepositoryAccess` (which already exists). A
    collaborator added directly is listed today.

**Known limit of item 3:** the first commit lands on the repository's default branch, and the
reset clones `--branch main`. An organization whose new repositories default to another branch
name fails at the clone with the reset's own error — the existing non-`main` limit
(`.rptc/complete/2026-08-20-storefront-branch-is-hardcoded-main.md`), not a new one. That item
was closed on scope: "every repo it touches is either created by us on `main` or reset from a
`main` boilerplate". Adopting a repository an organization owner created is the first case that
premise does not cover — worth the owner re-reading that decision (D5).

## Reversibility

- Explanations: nothing to undo.
- The wider repository list: read-only.
- Adopting an empty repository writes a first commit and the template into a repository that had
  nothing in it. The undo is the existing one for any storefront repo (reset, or delete the
  project). D1 is the open question about what delete should do to an adopted repo.

## Owner's live checks

1. Have an org owner create an EMPTY repository in a team organization and give the SC write
   access; confirm it appears in the wizard list, pick it, run setup, and confirm the storefront
   lands and previews.
2. Against an SSO organization with an unauthorized session, confirm the setup error now names
   single sign-on rather than "Access denied".
