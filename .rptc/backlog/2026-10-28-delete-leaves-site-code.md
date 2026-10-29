---
id: EDS-67
kind: fix
area: eds
needs: []
value: low
status: active
---

# Deleting a storefront leaves its code on aem.live

Found walking release row 7.4, 2026-10-28. scratch-1022-b was deleted with every box ticked:
its GitHub repository, DA.live content and every page went (home and product pages answer 404),
but `https://main--scratch-1022-b--skukla.aem.live/scripts/aem.js` still answered 200. AEM keeps
its own copy of a site's code, and nothing in the delete clears it once the repository is gone.

No page can be served, so nothing an SC or a customer sees, but it is something Demo Builder
made that the delete leaves behind (rule 1: whatever can be done can be undone).

The likely fix, unverified: before the repository is deleted, ask AEM to drop the site's code
(the admin API's code endpoint, `DELETE /code/{owner}/{repo}/main/*`, with the same sign-in the
delete already uses for pages), then confirm by fetching a script and expecting 404. Read the
`eds-publish-and-config` skill first: DELETE on that API has its own auth rules.

## Decision: no working DA.live sign-in, no repository delete (owner, 2026-10-28)

The code bus DELETE needs the DA.live sign-in, and once the repository is gone its files
can never be listed again, so a storefront deleted without a working sign-in leaves its
code on aem.live for good. So when there is no working DA.live sign-in, the repository is
KEPT, and the SC is told in one sentence: "The repository was kept so its site code can
still be removed. Sign in to DA.live and delete again."

"Working" is asked of IMS (EDS-68), not read off the token: the same day a forced Adobe
sign-in cancelled a DA.live token with 23 hours left on it (PL-84). IMS not answering keeps
the repository too, with "the DA.live sign-in could not be checked. Delete again in a
moment." A repository that is not a storefront (no `scripts/aem.js`) is deleted as before,
sign-in or not.

It is decided in the one chokepoint (`deleteStorefrontRepository`, `kept`), so every door
gets it: the dashboard delete and the agent's `delete_project` keep the project as well
(the stop EDS-65 uses), `delete_github_repo` answers `deleted:false, kept:true`, Manage
GitHub Repositories lists it as kept, and `CleanupService` (the storefront setup cancel)
reports it on the GitHub row.

## Shipped so far

- 2026-10-28  fix(eds): a storefront delete removes the site's code, and stops when DA.live is signed out (`a2072e04f`)
- 2026-10-28  docs(backlog): EDS-67, deleting a storefront leaves its code on aem.live (`bd14299c3`)
