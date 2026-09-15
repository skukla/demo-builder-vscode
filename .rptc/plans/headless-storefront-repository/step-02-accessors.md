# Step 02 — Two accessors; the readers that can move without changing behaviour, moved

Item: [[EDS-13g]]. Decisions: 3 (one workflow needs one lookup). Depends on step 01.

Line numbers in files step 01 changes are `origin/develop`'s (`9dbdfbaa7`); re-read them
after the merge.

## Goal

"The project's own storefront repository" and "the storefront's source" each have one
function that answers them, for either kind. Every EDS project on disk answers exactly as
it does today, which this step proves by leaving the moved readers' tests untouched. No
headless project has a repository yet, so no headless behaviour changes either.

This is the representative slice: if the sites below fight the two accessors, stop and
revise the design before step 03.

## Facts

- The EDS repository is read in at least 19 files straight off
  `componentInstances['eds-storefront'].metadata` (overview, "Readers that move"), plus the
  two gated accessors `getEdsRepoParts` / `getEdsGithubRepo` (`src/types/typeGuards.ts:346-375`),
  which return undefined unless `selectedStack` starts `eds-` (`:289-306`).
- The update baseline has its own reader, `getTemplateSource`
  (`src/features/updates/commands/updateTypes.ts:90-97`), which does NOT require
  `githubRepo`, and five writers keyed on the EDS instance: creation
  (`executorEdsPhase.ts:94-104`, develop, plus `templateBranch` from this branch), Change
  Demo Source (`changeDemoSourceHandler.ts:45-53`), the rename follow
  (`demoSourceCheck.ts:106-109`), updates (`templateSyncService.ts:397-413`,
  `updateLastSyncedCommit`, develop) and reset (`edsResetService.ts:267-275`,
  `recordSyncedCommit`, develop).
- Where reset takes code from: EDS reads `resolveStorefrontConfig` (`edsResetParams.ts:200-206`,
  destructured `:237-248`) and, after step 01, the branch it hands `resolveTemplateCommitSha`
  (`project.demo?.source.branch`); headless reads `componentInstances[frontend].repoUrl` and
  `.branch` (`projectResetService.ts:170-181`). Creation hands the resolver
  `typedConfig.demo?.source.branch` (step 01).
- All ten storefront rows in `demo-packages.json` were read: the eight EDS rows have
  `templateOwner`/`templateRepo` equal to their `source.url` and `branch: main`; the one
  headless row (CitiSignal `headless-paas`) has neither template field,
  `url https://github.com/skukla/citisignal-nextjs`, `branch master` (`:222-229`).
- After step 01, the `storefrontResolver.ts` header (`:17-21`) is true about reset writing the
  record, but it names `getTemplateSource`, which this step deletes.

## The exact changes

### Accessor 1 — `src/types/typeGuards.ts` (after `getEdsGithubRepo`, `:375`)

- `getStorefrontInstance(project)`: `componentInstances[project.componentSelections?.frontend]`,
  else `componentInstances[COMPONENT_IDS.EDS_STOREFRONT]`. The second arm is what every EDS
  reader keys on today, so a project whose `componentSelections` is missing still answers.
- `interface StorefrontRepository` and `getStorefrontRepository(project)` as in the overview:
  undefined unless `metadata.githubRepo` splits into two non-empty halves (the rule
  `getEdsGithubRepo` already applies, `:370-374`); `branch = instance.branch ?? 'main'`;
  `kind = instance.id === COMPONENT_IDS.EDS_STOREFRONT ? 'eds' : 'headless'`.
- `getStorefrontBaseline(project)`: `{ owner, repo, branch?, commit?, lkgSource? }` from the
  same instance's `templateOwner`, `templateRepo`, `templateBranch`, `lastSyncedCommit`,
  `lkgSource`; undefined without owner and repo. Does not require `githubRepo`, matching
  `getTemplateSource`. The `lkgSource` shape check moves here from
  `templateUpdateChecker.ts:28` (`isLkgSource`, a private function today).
- `recordStorefrontRepository(instance, record)`: the one writer of those keys, merging into
  `instance.metadata`. Typed input: `{ githubRepo?, repoUrl?, templateOwner?, templateRepo?,
  templateBranch?, lastSyncedCommit?, lkgSource? }`; an `undefined` value leaves the stored
  key alone (the rule `recordSyncedCommit` applies today: an unresolved commit never
  overwrites the old record).

### Accessor 2 — `src/features/components/services/storefrontResolver.ts`

- `interface StorefrontSource` and `getStorefrontSource(project, packages?)` as in the
  overview, built on `resolveStorefrontForProject` (`:62-75`). Owner and repo from
  `templateOwner`/`templateRepo`, else `parseGitHubUrl(storefront.source.url)`
  (`src/core/utils/githubUrlParser.ts:87`, no imports, safe in the webview bundles).
- The header (`:17-21`) names `getStorefrontBaseline` and its five writers.

### Readers moved in this step (behaviour-preserving)

| File | Change |
|---|---|
| `updates/commands/updateTypes.ts:90-97` | `getTemplateSource` deleted; its callers (`checkUpdates.ts:370`, `updateApplyService.ts:372` on this branch, and `shouldSkipBlockLibrary` `:113`) call `getStorefrontBaseline` |
| `updates/services/templateUpdateChecker.ts:107-148` | `extractEdsMetadata` reads `getStorefrontBaseline`; the missing-field debug lines stay |
| `updates/services/templateSyncService.ts:149-172, 183, 397-413` | repository from `getStorefrontRepository`, template and base from the baseline; `updateLastSyncedCommit` writes through `recordStorefrontRepository`. Branches stay `main` here; step 07 changes them |
| `project-creation/handlers/executorEdsPhase.ts:94-104` | the metadata literal becomes `recordStorefrontRepository(edsInstance, …)` plus the EDS-only keys (`daLiveOrg`, `daLiveSite`) written beside it; the resolver's branch comes from `getStorefrontSource(typedConfig).branch` |
| `eds/services/reset/edsResetService.ts:267-275` | `recordSyncedCommit` writes through `getStorefrontInstance` + `recordStorefrontRepository` |
| `eds/handlers/changeDemoSourceHandler.ts:45-53` | the EDS block writes through the storefront instance (`getStorefrontInstance`); the headless `repoUrl` loop (`:39-44`) stays until step 07 |
| `eds/services/reset/demoSourceCheck.ts:106-109` | `followRename` writes through the storefront instance |
| `eds/services/reset/edsResetParams.ts:226-227, 237-248` | repository from `getStorefrontRepository`; template owner/repo from `getStorefrontSource`; `resolveStorefrontConfig` keeps the rest (content source, patches, brand assets) |
| `eds/services/reset/edsResetRepoHelper.ts` (the resolver call, develop `:292-297`) | the resolver's branch and the unresolved fallback come from `getStorefrontSource(project).branch` |
| `lifecycle/services/projectResetService.ts:170-181` | the frontend source from `getStorefrontSource`, not `repoUrl` (the file is deleted in step 05; moving it here keeps the ledger honest meanwhile) |
| `eds/handlers/forgetAddedDemoHandler.ts` (`projectWithStorefront`, re-read after step 01) | `getStorefrontRepository(project)?.fullName` |

Readers that move later, with the behaviour they bring: sync (04), deletion (06), updates'
zip path and branches (07), demo package (08), AI bundle (09), settings serializer (03).

## Reuse

- `resolveStorefrontForProject` is already "the one place that answers what storefront is
  this project on"; the source accessor is a projection of it, not a second lookup.
- `getEdsGithubRepo`'s well-formedness rule, `isLkgSource`, `parseGitHubUrl`,
  `recordSyncedCommit`'s leave-alone rule.
- New code is only the four typeGuards functions and one resolver function; the reason is
  that no stack-neutral reader exists (research, reuse map row "build new sibling").

## Tests (failing first)

New:

- `tests/types/typeGuards-storefront-repository.test.ts`
  - "reads an Edge Delivery project's repository from today's metadata" (fixture: the
    `eds-storefront` instance exactly as `executorEdsPhase` writes it, typed in
    `tests/helpers/`, not inline).
  - "finds the EDS instance when componentSelections is missing".
  - "reads a headless instance's repository when one is recorded".
  - "a headless instance with only repoUrl has no repository" (today's headless shape).
  - "rejects a githubRepo without both halves".
  - "branch defaults to main".
  - "the baseline is read without a githubRepo" (keeps `getTemplateSource`'s behaviour).
  - "recordStorefrontRepository merges, keeps unrelated metadata, and never writes undefined over a key".
- `tests/features/components/services/storefrontResolver.test.ts`, new `describe('getStorefrontSource')`:
  - one case per shipped row, iterating the bundled catalog: owner/repo/branch equal the
    row's template fields (EDS) or its URL and branch (headless, `master`).
  - "an added demo answers from its row, including a non-main branch".
  - "undefined when neither the row nor the catalog knows the project".
- `tests/templates/spine-chokepoints.test.ts`, new case "storefront REPOSITORY: metadata
  githubRepo is read by the accessors and a ledger that shrinks": primitive
  `/metadata\??\.githubRepo/`; the ledger lists today's direct readers that later steps
  move, each with the step that removes it, plus the EDS-only readers from the overview.

Unchanged, and that is the proof: `templateUpdateChecker.test.ts`,
`templateUpdateChecker-plumbing.test.ts`, `templateSyncService-plumbing.test.ts`,
`templateSyncService-safety.test.ts`, `templateSyncService-recordedVersion.test.ts`,
`updateApplyService.test.ts` (it references `getTemplateSource` by name; the rename is the
only edit it gets), `updateApplyService-selections.test.ts`, `changeDemoSourceHandler.test.ts`,
`forgetAddedDemoHandler.test.ts`, `edsResetParams.test.ts`,
`edsResetRepoHelper-template.test.ts`, `edsResetRepoHelper-addedDemo.test.ts`,
`edsResetService-finalize.test.ts`, `executor-edsStandardFlow.test.ts`,
`projectResetService-componentList.test.ts`.

Mocks to audit (entry 6): `tests/helpers/edsResetParamsFake.ts` stands in for
`extractResetParams` and has drifted before (backlog PL-35); it must build its params through
the two accessors or it will keep answering the old way. Suites that
`jest.mock('@/types/typeGuards')` without `requireActual` (listed by
`grep -rln "jest.mock('@/types/typeGuards'" tests`, 43 files on this branch on 2026-09-15;
recount after step 01) break only where a moved module now imports a new export; add the
export to those mocks or switch to `requireActual` for pure accessors, per
`webview-test-authoring`.

## Docs that change

- `storefrontResolver.ts` header (above).
- `docs/systems/project-file-format.md`: one paragraph naming the storefront repository
  record and its keys (the doc does not mention them today; grep for `githubRepo` finds none).

## Acceptance

| Predicate | Evidence |
|---|---|
| EDS behaviour unchanged | the unchanged suites above pass with zero edits (`git diff --stat` on them shows only the `getTemplateSource` rename in `updateApplyService.test.ts`) |
| `getTemplateSource` gone | `grep -rn 'getTemplateSource' src tests` count captured into a variable equals 0; control: the same grep for `getStorefrontBaseline` counts 3 or more |
| One writer of the record | `grep -rn 'metadata.lastSyncedCommit = ' src` count captured equals 0 (two today: `templateSyncService.ts`, `edsResetService.ts`); control: `grep -rn 'recordStorefrontRepository' src` counts 5 or more |
| The accessor reads every shipped row | the per-row resolver case iterates all rows; its row count asserted equal to the catalog's length (10 today) |
| The ledger is honest | the new spine case fails when a reader is added outside it (checked once by adding a throwaway reader and reverting) |
| Gate green | `gate`, then pre-push |

No live check: nothing here touches GitHub.

## Reversal

Revert the commit. No data is written in a new shape: `recordStorefrontRepository` writes the
same keys the EDS literal wrote.
