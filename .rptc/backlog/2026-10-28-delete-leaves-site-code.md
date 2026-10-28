---
id: EDS-67
kind: fix
area: eds
needs: []
value: low
status: backlog
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
