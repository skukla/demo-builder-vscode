---
id: EDS-73
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Deleting a storefront leaves its AEM Configuration Service site behind

Filed 2026-11-18, verified from source after the setup-stop work (F275 in
`.rptc/complete/beta-153-release-tests/overview.md`, which noted it in passing). No live call was
made.

## What is left

Creation registers the site with the AEM Configuration Service, and nothing that removes a
storefront takes it back out.

| Direction | Where |
|---|---|
| Created | `storefrontSetupPhase3.ts:87` calls `registerConfigurationService` → `configServiceRegistration.ts:93` `registerSiteConfig` → `siteConfigRegistrar.ts:145` → `configurationService.ts:92` `registerSite`, a `PUT /config/{owner}/sites/{repo}.json` |
| Project delete | `projectDeletionService.ts:90` → `performEdsCleanup` (`edsExternalCleanup.ts:421`): DA.live teardown, then the GitHub repository. No Configuration Service step |
| Setup stop | `storefrontSetupStop.ts:92` → the same `performEdsCleanup` |
| Teardown | `tearDownStorefront` ends at `storefrontTeardown.ts:349` with `DaLiveConfigService.deleteSiteConfig`. That is DA.live's own config sheet (`content.da.live/config/{org}/{site}/`, `daLiveConfigService.ts:274`), not the Configuration Service |

The one Configuration Service delete, `ConfigurationService.deleteSiteConfig`
(`configurationService.ts:194`), has a single caller: `updateSiteConfig` at line 146, which deletes
and re-registers. Its only removal caller was `CleanupService`, which had no production caller and
was deleted on 2026-11-18.

## Why it matters

Property 1, "whatever can be done can be undone": creation does a register and no path undoes it.
The site record also holds the site's access grants and publish keys (`access/admin.json`,
`apiKeys.json` under the same path), so those stay too. An SC who deletes a demo and recreates one
on the same GitHub owner/repo name inherits the old record, which `registerSiteConfig` then has to
fight through its 409 path.

## Suggested fix

Add a Configuration Service step to `performEdsCleanup`, after the GitHub repository is deleted and
only when it was (the record is keyed by GitHub owner/repo, so a kept or shared repository keeps it;
reuse the `otherProjectsOnRepo` guard the teardown already has). Call
`ConfigurationService.deleteSiteConfig(owner, repo)`; a 404 already counts as done
(`configServiceRequest.ts:82`). Confirm by a re-read, as every Configuration Service write here is.
Add the step to `edsCleanupSteps` so the numbered progress counts it, and report a failure as a
result row so the delete and the setup stop both name it in what was left.

Both doors get it at once, since both go through `performEdsCleanup`. The agent's
`delete_project` does too.

## Kickoff prompt

Implement EDS-73: give `performEdsCleanup` a Configuration Service delete after a repository
delete, guarded for shared repositories, verified by re-read, counted in `edsCleanupSteps`. TDD
against `tests/features/projects-dashboard/services/`. No live calls without the owner.
