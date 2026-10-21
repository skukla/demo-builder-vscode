---
id: EDS-56
kind: feature
area: eds
parent: EDS-13
needs: []
value: high
status: active
---

# A colleague's storefront gets the tested boilerplate updates too, when it qualifies

Filed 2026-10-20, owner: "Is there any way to ensure that a storefront built from a
colleague's code could receive the same updates if it met the right requirements?"
Plan: `.rptc/plans/colleague-storefront-tested-boilerplate-updates/`.

## Why

Storefronts Demo Builder builds follow the patches repo's last-known-good (LKG) pointer:
the daily drift gate checks Adobe's B2B boilerplate against our patches, moves the pointer
when they still fit, and publishes the release itself (EDS-48). Check for Updates offers
"EDS template, Newer version" when the pointer moves, and Apply takes the storefront to the
tested version, never to Adobe's untested main (`templateUpdateChecker.ts`
`checkThinLayerUpdates`).

A storefront added from a colleague's repository does not. Its project records the
colleague's repository as its template and no LKG source, so its updates follow that
repository's main (`checkForkedUpdates`) and the daily gate never reaches it. Seen on
2026-10-20 with JustRite (`kmanns/justrite`, boilerplate 6.0.0, no LKG source) beside
Bodea and patch-canary-b2b, which follow the pointer.

## Why it is possible

- Applying a template update does not need shared git history: it applies the template's
  change between two known commits onto the SC's repository with a 3-way apply, and stops
  naming the files when the SC's edits collide (`templateSyncService.ts`, merge strategy).
- Since EDS-13f a saved demo package (description file version 2) records `builtWith`:
  the template it was generated from and the LKG commit it was pinned to
  (`src/types/projectFile.ts` `SharedDemoBuiltWith`).
- A colleague's storefront that shows our lineage is already offered our fixes, opt-in
  (EDS-13f).

## The requirements a colleague's storefront must meet

1. Built on the boilerplate the daily gate tracks (Adobe's B2B template).
2. The exact Adobe commit it started from is known (recorded in `builtWith`, or proven
   some other way). Without it there is no "change since" to apply.
3. Its own edits do not collide with Adobe's change. Checked when Apply runs; a collision
   stops the update and names the files, never overwrites.

JustRite does not qualify today: it records the boilerplate version, not the commit.

## Recommendation (owner-approved for planning, 2026-10-20)

A qualifying storefront follows BOTH sources, as two rows in the Updates window: the
colleague's changes (their repository, as today) and the tested boilerplate (the LKG
pointer). They are different things and an SC may want one without the other.

## Owner decision this revisits

2026-10-04 (EDS-13f step 05): "report always, fix what fits, fork sync only for forks,
never refuse on age, warn below a floor". This item extends boilerplate updates to
storefronts that are not forks but meet the requirements above.

## Owner decisions, 2026-10-20

- **D2 confirmed:** this extends the 2026-10-04 ruling; the 3-way apply is not a reset.
- **D4 approved:** after a colleague-track update, re-read the base from the colleague's
  `demo.demo-builder.json` when it records one, else let the 3-way apply absorb the replay.
  The file was checked: it lives in the repository, and its base moves only when the
  colleague saves again (plan step 05).
- **Fork-sync finding: fix now.** Done on `fix/fork-sync-own-repos`.

## Shipped so far

- 2026-10-20  refactor(updates): keep two boilerplate lookup types private; check tests assert outcomes, not log wording (`91846359a`)
- 2026-10-20  docs(updates): the two tracks a colleague's storefront follows, and what was built (`70952bd29`)
- 2026-10-20  feat(updates): keep a colleague's storefront's Adobe base true through reset, their updates and a save (`cd06e7e00`)
- 2026-10-20  feat(updates): apply the Adobe boilerplate update, and say where an added demo's Adobe code stands (`0fc23afbc`)
- 2026-10-20  feat(updates): check for, and list, the Adobe boilerplate update on a colleague's storefront (`1759506b0`)
- 2026-10-20  feat(updates): find the Adobe commit a colleague's storefront was built from (`c3c454542`)
- 2026-10-20  docs(backlog): EDS-56 owner decisions, and where the description file lives (`69fb06c64`)
- 2026-10-20  docs(backlog): EDS-56, tested boilerplate updates for a qualifying colleague's storefront, with its plan (`ba3da9ac8`)
