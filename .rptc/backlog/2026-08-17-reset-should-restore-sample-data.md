# Reset should RESTORE sample data, not only remove it

**Filed:** 2026-08-17, from four live reset runs on one EDS/ACCS project.
**A design decision plus one ordering defect that should be fixed either way.**

## Provenance

The sample-data prompt only reached a working state on 2026-08-17, after four defects in
one evening (all shipped on `feature/bodea-template`):

| | |
|---|---|
| `eab4d9ed` | the prompt never appeared, for any project — `stackBackend` unmapped |
| `6ef14451` | the prompt took 2-3s to appear — credential lookup moved ahead of the first modal |
| `9c842e16` | the removal itself could not resolve credentials — same unmapped field |
| `ced64268` | the removal polled with a client that cannot report status |
| `d17a7033` | (root cause of the 2-3s) the IMS token read spawned the `aio` CLI — 2.05s measured |

So this is the first time anyone has watched the feature work end to end, and what it does
now is visible for the first time: **it deletes, and stops.**

## It only deletes — verified, against an appearance that it does not

The progress bar said otherwise. `buildSampleDataDeps` hardcoded its progress line to the
install wording, so a reset's REMOVAL reported `Installing sample data — 2 of 14 types done`
while deleting, and the poller logged `data-installer import <id>` on every poll. Read
straight, that says reset reinstalls. **It does not**, confirmed in code before this item was
trusted:

- `removeSampleData` → `runSampleDataJob(project, deps, 'remove')` → `deps.startDelete` only.
  One job, one watch, no second phase.
- `installSampleData` has exactly ONE caller in `src/`: `executor.ts`, the project-creation
  path. Nothing in the reset path calls it.

Both labels are fixed (2026-08-17): `mode` now drives the progress verb and the poller's job
name. Recorded here because the wording was very nearly taken as evidence about behaviour,
and anyone who saw the old message will remember a reinstall that never happened.

## The asymmetry

Reset restores the storefront. It does not wipe DA.live content and stop — it re-copies
from source and republishes (`EdsPipeline` copy → account-chrome overlay → bulk publish).
The data half is the odd one out: the same button means "put it back" for content and "take
it away" for the catalog.

The demo case is where this bites. An SC mangles the catalog mid-demo and wants a clean one
back. Today they get an empty Commerce instance and a storefront that renders nothing —
arguably worse than what they started with — and must then open the Data Installer and
reimport by hand. The project already records `project.datapack` (written on import by
`recordDatapackOnProject`), so the pack to restore is known.

## The ordering defect — fix this regardless of the decision

Measured in two separate runs on 2026-08-17:

```
Catalog Prewarm: Enumerated 30 SKUs; pre-warming PDP URLs in batches of 5
Catalog Prewarm: Complete: 30/30 succeeded
[EdsReset] EDS project reset successfully
… THEN the sample-data delete fires (202)
```

Reset pre-publishes PDP pages for 30 products and then deletes those products. The data step
runs *after* the whole pipeline, including prewarm. Whatever is decided below, prewarm must
follow the data step rather than precede it — otherwise the warm cache describes a catalog
that no longer exists.

## Goal / scope

Change the second prompt from a removal to a **restore**, and reorder prewarm.

- **Restore** = delete the recorded pack, then reinstall the same pack.
- **Dismissal keeps its meaning**: anything other than the explicit button leaves the data
  alone. Someone resetting code must not lose a catalog by pressing Escape — that rule
  predates this item and does not change.
- Out of scope: changing which pack a project holds. Restore reinstalls what
  `project.datapack` records; switching packs is the Data Installer's job.

## Execution plan

1. **Reorder prewarm after the data step** (separable, do first — it stands alone and is
   worth shipping even if the rest is rejected).
2. Extend `sampleDataInstall` with a restore that runs delete-then-install against the same
   request, reusing `startDelete` + `startImport` and ONE watch per phase.
3. Reword the prompt. It currently names the pack and warns about duration; restore must say
   it removes and reinstalls, and must keep naming the pack.
4. Report per-phase. A restore that deletes and then fails to reinstall is the bad outcome —
   it must say so explicitly rather than reporting a generic failure.
5. Progress: the reset is inside `withProgress`; both phases need their own messages, since
   this roughly triples the tail of the operation.

## Constraints

- **A partial reinstall is worse than cleanly empty.** The import modal already reports
  per-type outcomes; restore must too, and must not report success on a partial.
- **Time.** Measured 2026-08-17: import of the test pack ~2.5 min; storefront reset ~3 min;
  removal is minutes more. Restore turns a ~3-minute operation into closer to ten. That is
  the main argument against, and it is the reason this is a decision rather than a fix.
- **`products` needs `customer_groups`** — the 2026-08-14 trap already encoded in
  `typesToInstall`. Restore must go through that same helper, not re-derive the type list.
- **Recorded on ACCEPT, not completion** (`recordDatapackOnProject`). A restore that is
  accepted and then partially fails still leaves the record pointing at the pack, which is
  the intended direction.
- The removal path is only as of `ced64268` actually watched; do not build on the assumption
  that outcomes were ever being reported before that.

## Open question for the decider

Is restore the DEFAULT for reset, or a third button? Three coherent options — leave alone
(dismiss), remove only, restore — is one more than a modal comfortably carries, and
`showWarningMessage` with two actions plus Cancel is the practical ceiling. Recommendation:
replace "Remove Sample Data" with restore and drop remove-only, since a user who wants an
empty catalog can reset the datapack from the Data Installer.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-17-reset-should-restore-sample-data.md`, then
> `sampleDataInstall.ts` (`installSampleData` / `removeSampleData` and `typesToInstall`),
> `sampleDataInstallDeps.ts`, and `confirmSampleDataRemoval` in `edsResetUI.ts`. Do the
> prewarm reordering FIRST and separately — it is independent and shippable alone. Then
> settle the open question above before writing the restore, because the prompt wording and
> the return shape both follow from it. Every test must drive the real `resolveCommerceCredentials`
> dispatch rather than mocking it: mocking that resolver is how one defect survived at three
> call sites in this feature, and the suites here still mock it by default.
