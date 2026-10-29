---
id: EDS-31
kind: fix
area: eds
needs: []
value: low
status: built
---

# "Manage DA.live Sites" deletes a site's content and leaves its pages published

Filed 2026-10-05 from the EDS-26 call-path audit (every delete path, traced up from the
content-deletion primitive). A reversibility finding of the same kind as AI-9.

The command `demoBuilder.cleanupDaLiveSites` (`src/features/eds/commands/cleanupDaLiveSites.ts`)
lets the SC pick DA.live sites in an org and delete them. It calls
`deleteAllSiteContent`, then removes the permission rows and the site config. It does not
go through `tearDownStorefront`, so it unpublishes nothing: the pages stay live on
aem.live with no source behind them, and so do the product pages the overlay published.

Why EDS-26 did not fix it: the Helix site is keyed by the GitHub owner/repo, and this
command only has the DA.live org and site name. Its sites may not belong to any local
project. The other three delete doors (the delete-project button, `delete_project`,
`cleanup_dalive_site` with `githubRepo`) all share the teardown and were fixed there.

## Recommendation

Route the command through `tearDownStorefront`. Find the repository from the local
project that uses the site (`getLinkedEdsProjects`, which the command already imports);
when no project uses it, try the same-named repository (the DA.live org is the GitHub
namespace and the site name is the repo name on every storefront made since the naming
migration), and say plainly when nothing could be unpublished. Change the confirmation
text to say the pages come off the live site.

Not verified: whether a site listed here can have a repository under a different name
that no local project records.

## Shipped so far

- 2026-10-05  fix(eds): Manage DA.live Sites takes pages off the live site (EDS-31) (`e97f43ddd`)
- 2026-10-05  Built, gate green (1831 suites). Not yet run live: needs a throwaway DA.live site to delete; the same-named repository fallback is unproven.
- 2026-10-05  docs: release test plan gains the page rows; EDS-31 built and logged (`8135d02d0`)
