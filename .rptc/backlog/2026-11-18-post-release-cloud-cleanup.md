---
id: PL-105
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# After beta.153 ships: clear out the owner's unused demo resources

Filed 2026-11-18 (owner: "log a post-release clean up item"). Do it after the cut, with the owner
confirming each delete (cloud deletes are irreversible). Re-check every row first: a resource a
local Demo Builder project uses is kept, whatever its name.

## Already done (2026-11-18)

- `skukla/scratch-1028-copy` (the failed U3 import): 66 pages unpublished and checked down, 85
  DA.live files deleted, repository and its aem.live code removed.

## To decide and do

| Resource | Kind | Used by a local project | Note |
|---|---|---|---|
| `skukla/demo-builder-test` | GitHub repository | no | Delete was interrupted mid-call on 2026-11-18; check whether it still exists |
| `kukla-aco-citisignal` | DA.live site (+ private repository) | no | Owner declined on 2026-11-18; decide site and repository together |
| `kukla-adobe-store` | DA.live site (+ private repository) | no | As above |
| `kukla-citisignal` | DA.live site (+ repository) | no | As above |
| Kukla Scratch 1028 | Adobe Console project | the U3 re-import | Delete with that project at U3 step 4 if the walk has not already |
| Kukla Bodea Mesh | Adobe Console project | no | Likely an old Bodea mesh test |
| one more owner-created project with a three-letter title | Adobe Console project | no | Use unknown; ask the owner (not named here: the repository is public) |
| Kukla Integration Service | Adobe Console project | no | Matches the `kukla-integration-service` repository; may be used outside Demo Builder |
| Kukla CitiSignal NextJS Integration | Adobe Console project | no | Matches `citisignal-nextjs`; may be used outside Demo Builder |

Kept on purpose: `my-commerce-demo` (the bodea project's storefront), `bodea-source` (the Bodea
package's content source), and the Adobe projects the local projects use.

## Also

- The org lists 782 Adobe projects; only titles containing "Kukla" were searched. Page through all
  of them (`list_adobe_projects`, `deletable: true` means the owner created it) for others.
- Each delete leaves what EDS-73, AB-87 and EDS-74 describe (Configuration Service entry, mesh and
  integrations, publish key); clean those by hand until those items ship.
