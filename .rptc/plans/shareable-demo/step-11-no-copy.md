# Step 11 — Remove "Keep my own copy"; a zip's repository is the only one Remove can delete

Item: [[EDS-13a]]. Decisions: D16 reversed, D18 and D28 amended, D33 new (all 2026-09-14,
`../portable-demos/overview.md`). Depends on steps 04, 06, 07 and 10.

## Why (owner, 2026-09-14)

Found while testing with Jen's AI Store. With "Keep my own copy" ticked, the card read from a
fork in the SC's account (`skukla/aistore`). The SC deleted that fork with "Manage GitHub
Repositories", and every later "create a new repository" failed about 0.2s in with
"Repository not found": creation reads the card's source first, and the card had no record
of where the fork came from.

Working through it, the copy turned out to be the wrong mechanism rather than an unfinished
one:

- **A shipped demo package has no copy either.** Isle5 reads straight from
  `stephen-garner-adobe/isle5`, a colleague's personal account. An added demo is the same
  kind of thing, and the copy was the one place the two were treated differently.
- **A fork is a weak failsafe.** GitHub deletes a private fork when the original is deleted
  or the SC loses access to it, and it cannot restore a deleted fork while the original
  still exists (GitHub docs, read 2026-09-14). The accidental delete above was permanent.
- **The copy saved code only.** The card went on reading pages from the colleague's DA.live
  site, so a colleague who removes their demo takes the pages with it anyway.
- **What actually keeps working already exists.** Every project gets its own repository and
  its own pages at creation. A demo nobody can take away is "Save as demo package" on a
  project: its card reads the project's own repository and the project's own pages
  (`demoPackageHandlers.ts`, `resolveOwnContentSource`).

Rejected on the way: a warning in "Manage GitHub Repositories", a label on the copy in the
repository lists, remembering the original and re-copying on demand, a plain (non-fork)
copy with a rebuilt update path. Each added surface to keep a mechanism that protected half
of a demo.

## The experience after this step

- **Add a demo package, link.** Stage 2 has no copy tick box and no "You already have a copy"
  note. Adding writes the card and nothing else; nothing is created on GitHub. The card
  reads from the link's repository.
- **Change source.** The same: no tick box, no fork.
- **Add from a zip.** Unchanged: the zip becomes a repository in the SC's account (it has
  nowhere else to live) and the card reads from it. The card now records that the
  extension made that repository.
- **Remove a card.**
  - Card made from a zip, repository still there, owned by the signed-in GitHub account, and
    not the storefront of a project on this computer: two buttons, "Remove" and
    "Remove and delete the repository". The second is confirmed again, as today.
  - Every other card, including one whose zip repository is already gone: "Remove" only.
  - The detail line for the delete choice names the repository and the projects built on
    it, and says they lose reset and updates until pointed at another source.
- **Check for Updates.** Unchanged. Fork sync is a general feature (added 2026-03-13, six
  months before the copy) for any project whose starting repository is a fork, and projects
  already built from a copy keep being offered it.

## Existing cards and projects

- A card that already reads from a copy keeps working while the copy exists. Nothing
  rewrites it. Remove no longer offers to delete that copy (it was not made from a zip); the
  SC deletes it on GitHub if they want it gone.
- A card whose copy is already deleted (the owner's AI Store card) cannot be recovered: Remove
  it and add the link again. Creation still fails with GitHub's "Repository not found" for
  such a card; improving that message is out of scope here.
- A zip card added before this step has no record that the extension made its repository,
  so Remove offers no delete for it. That is the safe direction; the SC can delete the
  repository on GitHub.

## Production changes

### The zip record (new)

- `src/types/projectFile.ts` (as built: on `RememberedDemo`, see the end): `AddedDemo` gains `createdFromZip?: true`, doc: "Set when the
  extension created `source` from a zip file; the only card whose repository Remove offers
  to delete. Card-only: never written into a project's row or a description file."
- `src/features/project-creation/services/addedDemoSettings.ts` `toAddedDemo`: carry
  `createdFromZip` when it is exactly `true`. The parser rebuilds each row from known fields,
  so without this line the flag is dropped on every read.
- `renameAddedDemoSource` and `editAddedDemo` spread the row, so they keep it; tests pin both.
- Writers that set it:
  - `importStorefrontZipHandler.ts` `importDemoBundle`: both card shapes (the `cardFromZip`
    result and the fallback literal).
  - `zipStorefrontImport.ts` `cardFromZip`: set it on the card it returns.
  - The dialog's zip door (`useAddDemoFlow.ts`): the row built after `import-storefront-zip`
    succeeds carries it into `add-shared-demo`. `buildAddedDemo` takes an optional
    `{ createdFromZip: true }` rather than reading it from `SharedDemoRead`.
  - The agent's zip path (`addedDemoTools.ts`, `zipPath`): same.
  - NOT the "use the repository you already have" answer to a taken name (`zipConflict` /
    `useExistingRepo`): nothing proves the extension made that repository.
- Where a card becomes a project's row, the flag is removed:
  - `wizardHelpers.ts:671` (`demo: wizardState.demo`) → `demo: projectRowOf(wizardState.demo)`.
  - `changeDemoSourceHandler.ts:83` (`project.demo = row`) → the same helper.
  - `projectRowOf` lives in `addedDemoSettings.ts` beside the parser: returns the row without
    `createdFromZip`. A typed fixture test asserts a project row never carries it.

### The copy (removed)

- `src/features/eds/services/sharedDemoCopy.ts`: delete the file. `isAddedDemo` moves to
  `addedDemoSettings.ts` (its two importers, `addSharedDemoHandler.ts` and
  `changeDemoSourceHandler.ts`, already import that module or its neighbours); its test
  case moves to `addedDemoSettings.test.ts`.
- `addSharedDemoHandler.ts`: drop `keepCopy`, the fork block (38-49), `forkedTo`, the
  `getGitHubServices` import and the "copy" log suffix. Doc: "Remember the card." Handler
  becomes a validate-and-remember.
- `changeDemoSourceHandler.ts`: drop `keepCopy`, the fork block (74-80), `forkedTo`, the
  `getGitHubServices` import; doc line 45.
- `probeSharedDemoHandler.ts`: delete `describeViewer` (75-101) and the `viewer` spread
  (71-72), with the two type imports it alone used. The probe makes one fewer GitHub call.
- `githubRepoOperations.ts`: delete `createFork` (213-237) and `forkParent` in
  `toGitHubRepo` (67, 81). Fix the stale `setTemplateFlag` doc (199-201): its callers are the
  zip import only.
- `src/features/eds/services/types.ts`: delete `GitHubRepo.forkParent` (53-54).
- `sharedDemoProbe.ts:124`: delete the `forkParent` spread.
- `src/types/webviewRequests.ts`: delete `SharedDemoRead.forkParent` (98-99), `viewer`
  (118-123), `AddSharedDemoRequest.keepCopy` (134), `AddSharedDemoResult.forkedTo` (141),
  `ChangeDemoSourceRequest.keepCopy` (187), `ChangeDemoSourceResult.forkedTo` (268); rename
  `ForgetAddedDemoResult.deletedCopy` → `deletedRepository`; fix the three docs that say
  "fork" or "copy" (126-149, 264).
- `storefrontSetupPhase1.ts` `createRepoFromSource`: keep the `source.isTemplate` branch
  (zip repositories are flagged templates, and any owner can flag their own); drop the
  "(or it is the SC's own copy...)" parenthetical from its doc.
- `webviewCommunicationManager.ts` `REQUEST_TIMEOUTS`: `add-shared-demo` and
  `change-demo-source` no longer wait on GitHub. Remove both entries so they take the default
  budget, and update `requestTimeouts.test.ts` and its comment. `forget-added-demo` stays
  LONG: it still waits on a person through two confirmations.

### Remove (reworked)

`forgetAddedDemoHandler.ts`:

- `FORGET_AND_DELETE` → `'Remove and delete the repository'`.
- Delete `isOwnCopy`. The offer is decided by one function,
  `deletableRepository(context, demo)`, true only when all hold, cheapest first:
  1. `demo.createdFromZip === true`;
  2. `projectWithStorefront` finds no project using it as its storefront (kept, and its
     orphaned doc line at 58 fixed);
  3. the signed-in GitHub login equals `source.owner`;
  4. `getRepository(owner, repo)` answers (a 404 means already gone: no offer).
- The request carries the whole card, not `{ name, source }`, so the handler reads
  `createdFromZip`: `ForgetAddedDemoRequest` becomes `{ demo: AddedDemo }`. The one caller,
  `WelcomeStep.tsx:172`, already holds the card.
- `forgetDemo(context, demo, deleteRepository)` returns `deletedRepository` / `deleteError`.
- Detail text for the delete case: "`${projectsSentence(count)}` Deleting ${repo} would
  leave them without reset and updates until they are pointed at another source."

## Agent surface

- `add_shared_demo`: delete `keepCopy` and the fork refusal (205-217, 218-224, 232). Keep
  `confirm` for the zip path only; its description says so. Description drops the fork
  sentence. The link path needs no confirmation.
- `change_demo_source`: delete `keepCopy` (337, 341, 351, 354, 363). Description keeps "or
  your own fork" (pointing at an existing fork needs no copy).
- `create_project` (`createProjectTool.ts` 422-425, 469) and `createProjectPackage.ts`
  (42, 59-62): delete `keepCopy`. `createProjectTool-validation.test.ts:148` loses the key.
- `forget_added_demo`: `deleteCopy` → `deleteRepository`, refused unless
  `deletableRepository` holds, with the reason in one sentence ("This card's repository was
  not made from a zip file, so Remove does not delete it."). Keeps `needsAuth: ['github']`,
  `destructiveHint: true`, `confirm`. `agentAlertCopy.ts:143-149` consequence: "With
  deleteRepository, also deletes the repository made from its zip file; projects built on it
  then lose reset and updates." No tool added or removed; `tool-auth-declarations` counts do
  not move.
- `readDescriptors.ts:337-339` `probe_shared_demo`: drop "and whether you already own it or a
  fork of it".
- `responseCeilings.ts` 122-133: reword the `why` lines; byte numbers re-measured, not guessed.
- `.rptc/plans/evaluation-mode/battery/prompts.json:902`: drop "and forks when a copy is
  kept".

## UI

- `addDemoFlow.ts`: delete `AddDemoDraft.keepCopy`, `COPY.keepCopy`, `COPY.addingCopy`,
  `keepCopy` in `INITIAL_DRAFT`; `change.lead` loses "your own copy".
- `FoundStage.tsx`: delete `KeepCopyBox` (57-80), `onKeepCopyChange`, the doc mention.
  `Checkbox` stays (the update-remembered box).
- `AddDemoModal.tsx`: delete `makesCopy` and its `helperText`, the fork comment (57-58),
  `onKeepCopyChange`.
- `useAddDemoFlow.ts`: delete `setKeepCopy`, the `keepCopy` computation and both payload
  fields; add `createdFromZip` on the zip door's row.
- `add-demo.css:33`: delete `.add-demo-keep-copy` from the shared rule. Take the resting
  visual capture before and after (pre-push `check-css-baseline` needs it).
- `WelcomeStep.tsx`: send `{ demo }` to `forget-added-demo`.

## Tests

Delete: `tests/features/eds/services/sharedDemoCopy.test.ts` (after moving its
`isAddedDemo` case), `tests/features/eds/services/github/githubRepoOperations-fork.test.ts`.

Edit, per the inventory (case line numbers as of `53ccedabd`):

| Suite | Delete | Edit |
|---|---|---|
| `addSharedDemoHandler.test.ts` | 41, 59, 70, 79 | 51, 88-94, mocks 13-17/38, header |
| `changeDemoSourceHandler.test.ts` | 110 | `keepCopy: false` at 75/97/104/126/136/141; mocks 25-29 |
| `forgetAddedDemoHandler.test.ts` | 95, 123, 132 | 74, 154; new cases below |
| `probeSharedDemoHandler.test.ts` | 72, 85, 95 | — |
| `addedDemoTools.test.ts` | 138, 148, 268, 282 | 116, 128, 176, 301, 371; new zip-delete cases |
| `createProjectTool-addedDemo.test.ts` | 121 | 99 |
| `createProjectTool-validation.test.ts` | — | 148 |
| `responseSize.test.ts` | — | 133 fixture |
| `useAddDemoFlow.test.ts` | 182 | 140, 159, 192-199; zip row carries the flag |
| `AddDemoModal.test.tsx` | 146 | 105, 193-199, 242 |
| `AddDemoModal-change.test.tsx` | — | 40 |
| `AddDemoModal.testUtils.tsx` | — | 47 (`viewer` leaves `READ`) |
| `requestTimeouts.test.ts` | — | 87-104 |
| `demoPackageHandlers.test.ts` | — | 164-166 comment |

New cases (failing first):

- `addedDemoSettings.test.ts`: the parser keeps `createdFromZip: true` and drops any other
  value; rename and edit keep it; `projectRowOf` strips it.
- `forgetAddedDemoHandler.test.ts`, one per condition of `deletableRepository`: offered for a
  zip card that exists and is owned; not offered when the flag is absent, when the repository
  404s, when the owner is someone else, when it is a project's storefront. The delete still
  needs the second confirmation.
- `importStorefrontZipHandler.test.ts` and `zipStorefrontImport.test.ts`: both bundle card
  shapes and `cardFromZip` carry the flag; the taken-name path does not.
- `wizardHelpers` test: the project row built from a zip card has no `createdFromZip`.
- `addedDemoTools.test.ts`: `forget_added_demo` with `deleteRepository` refuses a link card
  with the one-sentence reason, and deletes a zip card on `confirm:true`.

## Docs and records

- `docs/systems/sharing-a-demo.md`: replace "## Copies, forks, and history" (133-142) with
  "## Keeping a demo nobody can take away" (Save as demo package, and why a project already
  has its own repository and pages); fix 146-147, 168-171 (the template-flag reason), 237.
- `docs/systems/mcp-tools.md`: regenerate (`scripts/generate-tool-catalog.mjs`).
- `docs/systems/agent-alerts.md:57`: `deleteRepository`, zip cards only.
- `package.json:282`: "projects already built on it keep their own copy" → "projects already
  built on it keep working".
- Plans: `overview.md` (experience text at 28-30, 47-51, 55-57; this step in the table; a log
  entry), `step-03-probe.md`, `step-04-door.md`, `step-06-after-creation.md`,
  `step-07-agent-surface.md`, `step-10-zip-import.md` lines named by the inventory: each
  fork/copy sentence gets "(removed 2026-09-14, step 11)" or is rewritten where it describes
  current behaviour.
- `../portable-demos/overview.md`: D16 reversed, D18 and D28 amended, D33 added.
- `../portable-demos/reuse-map.md` 91, 108, 109, 125, 139-140: same treatment.
- `../shareable-demo-patches/step-05-version-gap.md:32`: drop the copy clause.
  `step-01-provenance.md:9,15`: `forkParent` is no longer read; that step adds it back when it
  is built.
- Backlog: `2026-09-11-share-a-headless-demo.md:17-18` and
  `2026-09-11-template-update-conflict-fallback-overwrites-edits.md:22` rewritten; history
  lines in the other two items stay.

## Surfaces checked

1. Eight bundles: the add dialog renders in the wizard only; `add-demo.css` is imported there.
2. Creation vs regeneration: not touched (AI bundle unaffected).
3. AI-bundle seams: none.
4. Human and agent: every button change above has its tool change listed.
5. Config field in three places: `createdFromZip` lives in the type and the parser;
   `package.json`'s item schema is description-only, so only its wording changes.
6. Mocks of changed contracts: `GitHubRepoOperations` mocks lose `createFork`; the forget
   handler's request shape changes, so `WelcomeStep` tests' request assertions move.
7. Docs: listed above; mutation ledger has no anchor in removed code (checked).

## Acceptance

| Predicate | Evidence |
|---|---|
| No trace of the copy remains in `src/` or `tests/` | `grep -rn "keepCopy\|keepOwnCopy\|createFork\|existingFork\|forkedTo\|deleteCopy\|deletedCopy\|isOwnCopy\|forkParent" src tests` counts 0, captured into a variable, with a positive control on `setTemplateFlag` |
| Remove offers a delete only for an existing, owned zip repository | the five handler cases above |
| A project row never carries `createdFromZip` | the wizardHelpers and change-source cases |
| Gate green | `npm run gate`, pre-push |
| Live: link add makes nothing on GitHub | dev host: add `https://github.com/sayurihanki/aistore`; card source is `sayurihanki/aistore`; the SC's repository list is unchanged |
| Live: zip Remove | dev host, owner confirms each cloud write first: add from a zip; Remove offers the delete; delete the repository on GitHub; Remove offers "Remove" only |
| Live: agent | `mcp-live-probe` reads `add_shared_demo`'s schema (no `keepCopy`) and a refused `forget_added_demo` on a link card |

## As built (2026-09-14), where it differs from the above

- `createdFromZip` is on a new `RememberedDemo extends AddedDemo`, not on `AddedDemo`: the
  manifest and project-file schemas are generated from `AddedDemo`, and the gate's schema
  freshness check showed the field landing in both. The settings readers and writers, the
  zip card builders and the add request take `RememberedDemo`; `projectRowOf` answers
  `AddedDemo`, so the compiler keeps the field off every project row.
- `projectRowOf` lives in `storefrontResolver.ts`, not `addedDemoSettings.ts`: the wizard
  bundle calls it, and `addedDemoSettings.ts` imports `vscode`.
- The Remove request keeps its `{ name, source }` shape. The handler reads the zip record
  from the remembered card in settings instead of from the webview message, so the one field
  that unlocks a delete never arrives from the page. The check is
  `isDeletableZipRepository` (flag, owner, still there); the storefront refusal stays in
  `projectWithStorefront`, and the agent tool applies both.
- `buildAddedDemo` is unchanged; the dialog's hook adds `createdFromZip` when the probed
  repository is the one its zip door created, and Back clears that.
- `forgetDemo`'s third argument and result field are `deleteRepository` /
  `deletedRepository`.
- Added after the plan (owner, 2026-09-15): the Edit dialog shows the card's repository as
  a read-only Code row (one shared `SummaryRowItem`, also used by the Add dialog and the
  Build summary); Change Demo Source's box reads "Also update the <name> demo package", is
  ticked, and shows only when the Welcome step has that demo package (the dashboard payload
  carries `demoPackageName`), and it never adds one; the dashboard notice names the demo
  package, not the repository's GitHub owner, has its own title when only the pages are out
  of reach, and on an Edge Delivery project offers "Save as demo package" beside Change
  source when the repository is.

## Order

1. Zip record + `projectRowOf` + parser (tests first).
2. Remove rework (handler, request shape, `WelcomeStep`, tool).
3. Copy removal, extension side (handlers, probe, GitHub operations, types, timeouts).
4. Copy removal, UI and agent surface; CSS with visual capture.
5. Docs and records; regenerate the tool catalog; gate; live checks.
