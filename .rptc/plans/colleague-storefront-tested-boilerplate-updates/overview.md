# EDS-56: a colleague's storefront gets the tested boilerplate updates, when it qualifies

Backlog: `.rptc/backlog/2026-10-20-colleague-storefront-tested-boilerplate-updates.md`.
Research: a code trace on 2026-10-20 (findings cited inline below, paths from the repo root).

## The outcome

A project made from a colleague's storefront that qualifies shows two update rows when each
has something new:

| Row | Source | Today |
|---|---|---|
| "Changes from kmanns/justrite" | the colleague's repository, its branch head | exists, worded "EDS template" |
| "Adobe boilerplate, tested version" | Adobe's B2B template at the patches repo's last-known-good (LKG) | new |

The second row applies Adobe's change between the storefront's recorded Adobe base and the
current LKG onto the SC's repository, keeping the SC's (and the colleague's) edits, and
stops naming the files when they collide. It never goes to Adobe's untested main and never
resets.

## Qualifies

1. Built on a template the daily gate tracks (one of our patched templates' Adobe source).
2. Its Adobe base commit is known: `project.demo.builtWith.lkg` + `builtWith.template`
   (description file version 2), a 40-hex commit of that template.
3. No collision with Adobe's change, checked at Apply.

## What the code does today (the facts the steps rest on)

- A colleague's demo records the colleague's repository as `templateOwner/templateRepo`,
  its branch head as `lastSyncedCommit`, and no `lkgSource`
  (`src/features/components/services/storefrontResolver.ts:138-152`,
  `src/features/project-creation/handlers/executorEdsPhase.ts:79-121`).
- `builtWith` IS persisted, as `project.demo.builtWith` (`executor.ts:153`,
  `src/types/base.ts:117`), but `builtWith.lkg` is read nowhere.
- The check has one template entry per project, `{ project }`, and drops the commits
  (`src/features/updates/services/updateSelections.ts:41,162-177`); the path is chosen by
  whether `lkgSource` exists (`templateUpdateChecker.ts:76-83`).
- `applyTemplateChangeSince` applies `base..target` of a source repository onto the SC's
  repository with `git apply --3way`, no shared history needed; base and target must be
  commits of that source (`templateMergeBase.ts:78-88,136-160`). It reads the source only
  from storefront metadata (`templateSyncService.ts:113-131`).
- Apply records `lastSyncedCommit` (`updateApplyTemplate.ts:81`). Writing an Adobe commit
  there would break the colleague track; setting `lkgSource` would flip the whole project
  to thin-layer behaviour. So the Adobe track needs its own recorded base.
- On a conflict, a project without `lkgSource` is offered a reset
  (`updateApplyTemplate.ts:58-62`). The Adobe track must never be.

## Decisions

| # | Decision | Who | Status |
|---|---|---|---|
| D1 | Two rows, one per source | owner, 2026-10-20 | approved |
| D2 | This extends the 2026-10-04 ruling ("fork sync only for forks, never reset a generated repository onto the current boilerplate"). That ruling assumed a generated repository could only be modernised by a reset (`step-05-version-gap.md:29-31`); the 3-way apply (`5d805a57a`, 2026-09-15) is a fourth option the owner was not shown. It is not a reset, so the ruling's letter holds | owner, 2026-10-20 | confirmed |
| D3 | The Adobe base lives in its own storefront metadata field (`boilerplateBase: { template, commit, lkgFile }`), never in `lastSyncedCommit` or `lkgSource` | plan | proposed |
| D4 | Keeping the base honest when the colleague updates their own boilerplate: A (re-read the colleague's description file) where it records a base, else B (let the 3-way apply absorb the replay). Where the file lives was checked (step 05) | owner, 2026-10-20 | approved |
| D5 | Storefronts with no recorded base (JustRite) are out of scope; working the base out by matching files is a follow-up item | plan | proposed |
| D6 | The opt-in fixes are not re-applied by this update; the storefront report keeps offering them | plan | proposed |

## Steps

1. `step-01-record-the-base.md`: the base field, seeded at creation and lazily for existing projects
2. `step-02-check.md`: the second check and its selection entry
3. `step-03-rows.md`: the two rows, worded for the SC
4. `step-04-apply.md`: applying the Adobe track without touching the colleague track
5. `step-05-keep-the-base-honest.md`: reset, change source, save as package, the colleague's own boilerplate moves
6. `step-06-agent-surface.md`: `apply_updates` and `get_storefront_report`
7. `step-07-docs-and-test-plan.md`

## The five properties (root CLAUDE.md)

1. **Undo.** A boilerplate update has no undo in either track today; the way back is Reset
   (which returns to the colleague's head and the recorded `builtWith.lkg`, step 05) or the
   repository's git history. Stated, not built.
2. **Edits never overwritten.** The 3-way apply stops on a collision and pushes nothing
   (`templateSyncService.ts:214-221`); step 04 removes the reset offer for this track.
3. **Existing projects.** A project made before this ships gets the base from
   `project.demo.builtWith` the first time it is checked (step 01): creation and the lazy
   path call the same function.
4. **Public repo.** Nothing new.
5. **Cloud writes.** Apply pushes to the SC's own storefront repository only, ticked in the
   Updates window. Never the colleague's repository (see the finding below).

## A finding outside this plan

The fork-sync check runs against `getTemplateSource(project)`
(`src/features/updates/services/updateSelections.ts:141-153`), which for a colleague's
demo is the colleague's repository. If that repository is a fork and behind its parent,
the Updates window offers to merge upstream into it (`updateApplyService.ts:79`): a write
to a repository the SC does not own. No ownership check was found. Owner, 2026-10-20: fix
now. Fixed on `fix/fork-sync-own-repos`: the sync is offered only for a repository the
signed-in account administers (GitHub's `permissions.admin` on the read the check already
makes), so an SC's own fork, including a pre-2026-09-14 copy, keeps it.
