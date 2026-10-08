---
id: EDS-8
kind: chore
area: platform
needs: []
value: high
status: active
layer: G
---
# Files over the god-file threshold

> **Standing order, 2026-10-08 (owner): ALL of them.** Not only the coupled list: every
> file over its limit is split by job, one file per sitting, one commit per file, until
> `godFileCandidates` reads 0. A file a reader judges to be one job is not cut to move
> the number; it gets a dated verdict here instead. The per-file routine (re-measure,
> split, prove the move, full checks, mutation before and after, the bookkeeping list,
> commit and log) lives in the `decompose-god-file` skill. Branch:
> `refactor/eds-8-god-files`. Live checks the owner batches: the list below.

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Re-measured 2026-08-24: the candidate set rolled over.** Everything the item spent August on is cut — `executor.ts` (→ 493-line orchestrator + seven phase modules), `helixService.ts` (1845→823 over two cuts: key store, bulk-job protocol, auth seam, errors, API keys, site content), `mcp-server.ts` (1794→398 registration facade over `src/mcp/`), `adobeEntityFetcher.ts` (1769→273 facade over five services) — every cut behavior-preserving with existing suites untouched. The item's top banner carries the CURRENT table: `configure.ts` (916L, **32 non-type imports**) is the strongest candidate; `authenticationService.ts` (~42 methods) and `githubFileOperations.ts` (17) need a delegation-vs-logic read before a verdict; `projects-dashboard/dashboardHandlers.ts` is ~2× the handler threshold; and the never-examined `.tsx` tier has five components over 600 lines (`repoSelectionInline.helpers.tsx` 856 the standout). Earlier history: **re-measured 2026-08-19 and the item was pointed at the wrong files.** It was opened on `configurationService.ts` (532) and `edsResetService.ts` (343) — the two SMALLEST candidates in the repo. Ranked by the coupling signals `decompose-god-file` actually uses, the real ones are `executor.ts` (1403 code lines, **23** non-type imports, **33** functions), `adobeEntityFetcher.ts` (1232, **21** methods) and `helixService.ts` (1313, **16** methods), none of which had ever been filed. `configurationService.ts` fails the coupling test outright (2 imports, 7 methods) and should be left alone. One cut taken so far: `helixKeyStore.ts` (168 lines) lifted Admin API key persistence out of `helixService.ts` with **88 tests across 7 suites passing untouched**; the next cut there needs an auth-header provider designed rather than code moved, because `pollJobCompletion` binds to `this`. **IT IS A GATE AS OF 2026-09-10.** `tests/sop/god-file-ratchet.test.ts` pins two shrink-only numbers — `godFileCandidates` 68 and `godFileCoupled` 31 — and `.claude/hooks/rules/49-god-file.rule` states the measurement when you edit an oversized file. Until then this was the only quality rule here whose cadence was a person typing `/sop-scan`. Re-measure before picking anything up — the lesson of this item is that it tracked files somebody touched, not files measurement condemns. Filed 2026-08-15, corrected 2026-08-19.

> **ADJUDICATED 2026-08-24 (same day, after reading each candidate): the
> rolled-over set is LEFT ALONE, deliberately.** The user asked whether
> cutting them was necessary refactor or motion; the reads said motion:
>
> - **`configure.ts` — leave.** The 32-import signal misfires on a COMMAND:
>   orchestration is its job (the architecture doc licenses commands to
>   import any feature), and moving the save flow relocates the imports
>   without reducing coupling — the `edsPipeline` verdict again. Decisive:
>   four suites pin its PRIVATE seams (`republishStorefront`,
>   `showPostSaveNotifications` monkey-patch, `initializeMessageHandlers`),
>   so a cut must either leave delegation shims for every pinned method
>   (shape kept, bodies moved — cosmetic) or rewrite the tests (losing the
>   untouched-tests behavior proof). Both are the mark of unnecessary
>   refactor.
> - **`authenticationService.ts` — leave for now.** NOT a thin facade (34 of
>   44 methods carry logic; `login` is 109L), so it is a real candidate —
>   but the riskiest auth file in the repo, it just received structural
>   relief from the entity-fetcher split, and a login-flow extraction is a
>   design change, not a move. Revisit only with a concrete driver.
> - **`githubFileOperations.ts` — leave.** One domain; `resetRepoToTemplate`
>   is an orchestrator over its sibling methods (edsPipeline shape).
> - **`projects-dashboard/dashboardHandlers.ts` — leave.** A handler map
>   grows linearly by design; no helpers found hiding beyond the map rows.
> - **`.tsx` tier — leave pending a driver.** Components carry UX-regression
>   risk with weaker test safety; cut on a concrete bug or feature touch,
>   not on line count.
>
> The distinguishing test, written down so the next pass applies it: the
> shipped cuts (executor, fetcher, mcp-server, helixService) all had
> separable domains behind a STABLE PUBLIC API with tests passing through
> that public surface. A candidate without all three produces shims, not
> structure. Next input: the structural baseline (section F), not another
> size table.

> **Re-measured 2026-08-24 — the candidate set has rolled over.** The three
> files this item spent August on are all cut; what measurement condemns now
> is a different set. Verdicts per the `decompose-god-file` coupling test
> (>15 non-type imports, >10 public methods, multiple domains — threshold
> alone is not enough):
>
> | Lines | File | Signal | Verdict |
> |---|---|---|---|
> | 916 | `dashboard/commands/configure.ts` | **32 non-type imports** | The strongest candidate. Commands import widely by design, but 32 is double the signal threshold. |
> | 838 | `authentication/services/authenticationService.ts` | **~42 public methods** | Read before cutting: it is the facade over the entity services, and a facade is method-wide by design. Thin delegations → pattern, not god file; logic hiding among them → candidate. |
> | 859 | `eds/services/github/githubFileOperations.ts` | 17 public methods | Borderline — one domain; same delegation-vs-logic read. |
> | 981 | `projects-dashboard/handlers/dashboardHandlers.ts` | handler file ~2× its 500 threshold | Check for helpers hiding in the map that belong in services (helper-extraction pattern). |
>
> Big but coupling-clean or already adjudicated — leave alone:
> `daLiveContentCopy.ts` (1104: 13 imports, 8 methods, one job — the
> `edsPipeline` verdict shape), `edsPipeline.ts` (966: adjudicated below),
> `helixService.ts` (823: post-cut, page ops + delegation),
> `daLiveBlockLibraryOperations.ts` (851), `appBuilderComponentHandlers.ts`
> (806).
>
> **New: the `.tsx` tier (threshold 350) has never been examined by this
> item.** Standouts: `eds/ui/steps/repoSelectionInline.helpers.tsx` **856**,
> `ImportDatapackModal.tsx` 660, `dashboard/ui/components/ActionGrid.tsx`
> 660, `StorefrontSetupStep.tsx` 631, `RepoSelectionInline.tsx` 631. Measure
> their coupling (props count, mixed responsibilities, hook-extraction
> candidates) before cutting — component thresholds trip on doc-comment
> weight too.

> **2026-08-23 (second session) — the remaining three candidates are CUT.** All
> on `feature/d3-dual-flow-removal`, all behavior-preserving (existing suites
> untouched except one file-path pin; full suite 1137/1137 green; madge: no
> cycles):
>
> - **`adobeEntityFetcher.ts` 1769 → 273-line facade** + five collaborators:
>   `adobeCliFallback` (236), `adobeEntityReads` (540), `adobeWorkspaceCredentials`
>   (458), `adobeOrgServices` (255), `adobeConsoleProjectOps` (454). Constructor
>   and all 23 public signatures unchanged; the token-org fallback routes through
>   the facade's public `getOrganizationsSdkOnly` so the monolith's
>   dynamic-dispatch contract (tests spy it) still holds; the project-ops →
>   workspace-listing edge is a narrow injected function, not the reads object.
> - **`mcp-server.ts` 1794 → 398-line registration facade** + `src/mcp/`:
>   `projectSecurity` (181), `projectToolHandlers` (238), `storefrontSyncHandler`
>   (183), `blockAuthoring` (402), `blockLibraryPublish` (115),
>   `blockToolHandlers` (417), `credentials` (33). `toolHandlers` is re-composed
>   by spreading the three domain maps; `resolveProjectPath` /
>   `validateEnvContent` / the credential types re-export from `mcp-server.ts`,
>   so its public identity is unchanged. The one test edit in this whole batch:
>   `spine-chokepoints.test.ts`'s manifest-WRITE pin follows the door to
>   `mcp/projectToolHandlers.ts` (a file-path pin tracking a file move, not a
>   behavior change).
> - **`helixService.ts` 1642 → 823** (cut 3): `helixAdminAuth` (119 — the shared
>   token/header seam, incl. the bulk-job status headers), `helixAdminErrors`
>   (90 — pure Response diagnostics + the 403-as-credential-refusal),
>   `helixApiKeys` (231 — the Admin API key lifecycle), `helixSiteContent`
>   (614 — whole-site bulk publish + page-by-page fallback, with the single-page
>   preview+publish injected as a callback). The facade keeps the page ops
>   (preview/publish/delete/unpublish/status/purge/previewCode) and delegates
>   the rest; `PublishPhases` re-exposes `SITE_PUBLISH_PHASES`.
>
> Remaining over-size but single-responsibility (leave unless coupling appears):
> `helixService.ts` 823 (page ops + delegation), `helixSiteContent.ts` 614,
> `adobeEntityReads.ts` 540. No candidate in the repo now shows the coupling
> signals the skill cuts on — re-measure before believing this at the next cut.

> **2026-08-23 — the worst offender is CUT.** `executor.ts` (1716 lines, 22
> non-type imports, ~53 functions — the top of the coupling ranking) is now a
> 493-line orchestrator plus seven single-responsibility phase modules
> (`executorMeshPhase` 290, `executorEdsPhase` 350, `executorEditMode` 222,
> `executorComponentLoading` 180, `executorAppBuilderPhase` 138,
> `executorSampleDataPhase` 100, `executorPreflight` 74). Public API preserved
> via re-exports from `./executor`, so ALL 144 project-creation suites (2,198
> tests) passed with ZERO test edits — the behavior-preservation proof. Madge:
> cycle count unchanged. Remaining candidates by the same measurement (fresh
> 2026-08-23): `helixService.ts` 1845 (next cut needs the auth-header provider
> DESIGNED — `pollJobCompletion` binds to `this`), `mcp-server.ts` 1794 (48
> functions), `adobeEntityFetcher.ts` 1769 (35 methods — the facade split
> pattern already exists beside it). Re-measure again before the next cut.

> **The title used to say "Two EDS services". It was wrong** — see the
> re-measurement at the bottom, which is the current answer. The two files this
> item was opened on are the two smallest candidates in the repo; three files
> three to four times their size were never filed. Read the bottom section
> FIRST; everything above it is the original 2026-08-15 record, kept because its
> reasoning about coupling-vs-size is still correct.

**Filed:** 2026-08-15, from the `fix/leah-128-bugs` release prep.
**Severity:** low — a project guideline, not a gate. `eslint` does not flag these
and CI does not fail on them.

## The two files

Project CLAUDE.md sets the services threshold at **400 lines**. Both of these
were already over it before the branch that filed this item:

| File | at `develop` | after the branch | net |
|---|---|---|---|
| `src/features/eds/services/configService/configurationService.ts` | 444 | 532 | +88 |
| `src/features/eds/services/reset/edsResetService.ts` | 430 | 463 | +33 |

The branch's own additions were extracted back out before shipping, and the
extractions are the model for the rest:

- `siteGrantPreservation.ts` (109) — capture/restore of admin grants across the
  delete-and-re-register cycle, out of `configurationService`.
- `edsResetConfigStep.ts` (165) — reset steps 6-7, out of `edsResetService`.
- `siteConfigRegistrar.ts` (238) — the 409/401/403 registration protocol, out of
  `configServiceRegistration`.

Each was behaviour-preserving and proved it the same way: the existing suites
passed **untouched** (238 and 195 tests respectively). Any further split should
clear the same bar — if a test has to change, the extraction changed behaviour.

## Explicitly NOT in scope: `configServiceAccess.ts`

493 lines, and new on that branch, so it looks like the obvious third candidate.
It is not. Measured 2026-08-15: **207 of those lines are comments**, leaving ~286
of code, and its exports are one coherent contract — read the org roster, read
site access, probe, grant, revoke, restore, build the Code Sync setup link. The
`decompose-god-file` skill is for MULTI-RESPONSIBILITY files; this one fails that
test, and splitting it would scatter a single API across modules to satisfy a
line count that is mostly the documentation worth keeping.

Do not "fix" it without first re-checking the comment ratio and the export list.

## Why it was deferred rather than done

The branch that filed this ran a five-iteration verify loop, and three of those
iterations found regressions introduced by the previous iteration's fixes —
including one that aborted a half-completed reset after the repo had already been
wiped, and one that silently switched off three recovery paths. A structural
refactor with no user-visible benefit, at the end of that, on code that had just
been verified live, was the wrong bet.

## When to pick it up

At a release cut, via `codebase-sweep` — which is when that skill is designed to
run, and which will re-measure rather than trusting the numbers above.

## Kickoff prompt

> Read `.rptc/backlog/eds-services-over-size-threshold.md`. Re-measure both files
> first (they may have moved). Split `configurationService.ts` and
> `edsResetService.ts` along responsibility lines using `decompose-god-file`,
> following `siteGrantPreservation.ts` and `edsResetConfigStep.ts` as the model.
> The bar is that the existing suites pass UNTOUCHED — a test that has to change
> means the extraction changed behaviour. Leave `configServiceAccess.ts` alone
> unless its comment ratio and export list say otherwise; the item explains why.

## `edsPipeline.ts` was added here and then REMOVED — 2026-08-19

It was filed here on size alone (839 lines). Running `decompose-god-file`'s own
test rejected it, and the correction is worth keeping because size was the wrong
reason both times:

| Coupling signal | Threshold | `edsPipeline.ts` |
|---|---|---|
| non-type imports | >15 | **5** |
| public methods | >10 | **1** (`executeEdsPipeline`) |
| entity domains | multiple | one — the pipeline |

The skill's rule is "threshold WITHOUT coupling → leave it". The file is one
orchestrator plus eight private step helpers: cohesive, one public entry point,
one reason to change per step but all serving the same pipeline.

**And decomposing would not have fixed the thing that prompted it.** The eslint
warning is `executeEdsPipeline` at cyclomatic complexity 27 (limit 25), and every
one of those branches is step-gating INSIDE that function — `clearExistingContent`,
`skipContent`, `contentSource`, `includeBlockLibrary`, `purgeCache`, `skipPublish`,
`libraryPaths.length`, `byomOverlayUrl && project`, plus nested try/catch. Moving
the helpers to another file leaves all of them. The file shrinks; the warning stays.

Refiled as `2026-08-19-eds-pipeline-orchestrator-complexity.md`, which is a
complexity-reduction item, not a decomposition one.

## Measured 2026-08-19 — `edsResetService.ts` is the genuine candidate here

Of the three files, only this one shows the coupling the skill looks for: **440
lines with 16 non-type imports**, over the >15 signal. `configurationService.ts` is
532 lines with **2** non-type imports and 7 public methods — over on size, under on
every coupling signal, so the same "leave it" verdict applies until something else
argues otherwise.

---

## Re-measured 2026-08-19 (second pass) — this item was pointed at the wrong files

The two files in the title are the two SMALLEST candidates in the repo. Measured
across `src/` with the coupling signals the `decompose-god-file` skill actually
uses, not line count:

| File | code lines | non-type imports | public methods | filed here before? |
|---|---|---|---|---|
| `project-creation/handlers/executor.ts` | 1403 | **23** | **33** | no |
| `eds/services/helix/helixService.ts` | 1313 | 8 | **16** | no |
| `authentication/services/adobeEntityFetcher.ts` | 1232 | 9 | **21** | no |
| `mcp-server.ts` | 1291 | 11 | — | no |
| `eds/services/daLive/daLiveContentCopy.ts` | 811 | 13 | — | no |
| `eds/services/configService/configurationService.ts` | 532 | 2 | 7 | yes |
| `eds/services/reset/edsResetService.ts` | 343 | **16** | 2 | yes |

Signals over threshold in **bold** (>15 non-type imports, >10 public methods).

`configurationService.ts` is filed here and fails the coupling test — this item's
own later section already reaches that verdict. `helixService.ts` was never
filed and is an EDS service at nearly four times its size.

The pattern is that this item tracks files somebody happened to touch, not files
measurement condemns. Anyone picking work off it should re-measure first; the
table above is the current answer.

## `helixService.ts` cut 2 — bulk-job protocol extracted (2026-08-23)

**Done, on `feature/d3-dual-flow-removal`:** `helixBulkJobs.ts` (~270 lines) now
owns the 202-and-poll protocol — `parseBulkJobResponse`, `pollJobCompletion`,
the private `assertBulkResourcesSucceeded`, both job interfaces, the two
timing constants. The auth-header provider the previous entry called for is
`BulkJobDeps.getJobStatusHeaders()`: the module never sees a token; the
service injects the DA.live admin Bearer + GitHub `x-auth-token` from a
private `bulkJobDeps()` builder. `pollJobCompletion`'s `apiKey` parameter was
dropped with the move — verified zero callers in its lifetime.

Cleared the bar: **all 179 EDS suites (2,308 tests) passed with ZERO edits to
existing tests**; 12 new unit tests pin the protocol at the module seam.
Madge: no cycles. `helixService.ts` is now 1642 lines (was 1845). Remaining
candidates unchanged (page-operations split = collaborating objects, still a
design decision; `mcp-server.ts` 1794; `adobeEntityFetcher.ts` 1769).

## `helixService.ts` — one cut taken, the rest is not free

**Done:** `helixKeyStore.ts` (168 lines) now owns Admin API key persistence —
the keychain, the one-time migration off plaintext globalState, the in-memory
cache and the two expiries. That is a credential store; it knows nothing about
`admin.hlx.page`, and the class knew nothing about keychains, so they were two
responsibilities sharing a file. `HelixService`'s four public statics
(`initKeyStore`, `clearKeyStore`, `clearApiKeyCache`, `forgetApiKey`) delegate
and keep their signatures, so the three external callers did not change.

Cleared the bar this item sets: **88 tests across 7 suites passed untouched.**

**Not done, and not cheap.** The next clusters are entangled with instance
state in a way the key store was not:

- **Bulk-job protocol** (`parseBulkJobResponse`, `pollJobCompletion`,
  `assertBulkResourcesSucceeded`, the two job interfaces, ~200 lines).
  `pollJobCompletion` calls `this.tryAdminBearer()`, `this.getGitHubToken()`
  and `this.logger`. Extracting it means passing an auth-header provider in —
  doable, but it is an interface design decision, not a move.
- **Page operations** (13 of the 16 public methods) all depend on the same
  private auth/error helpers. Splitting them means splitting the class into
  collaborating objects.

The file is still 1848 lines. Size alone did not justify going further in the
same session that changed its auth behaviour — see the "why it was deferred"
section above, which is the same argument and was right the first time.

## Kickoff prompt (supersedes the one above)

> Read this whole file, then RE-MEASURE — the table is dated and files move.
> The candidates ranked by coupling, not size, are `executor.ts` (23 non-type
> imports, 33 functions), `adobeEntityFetcher.ts` (21 methods) and the rest of
> `helixService.ts`. `configurationService.ts` is over on size only; leave it.
> For `helixService.ts` the next cut is the bulk-job protocol, and it needs an
> auth-header provider passed in rather than `this` — design that interface
> before moving code. `helixKeyStore.ts` is the model for what a clean cut looks
> like. The bar is unchanged and non-negotiable: the existing suites pass
> UNTOUCHED. A test that has to change means the extraction changed behaviour.

## Needs a live check

The automated checks prove a move did not change what the tests constrain. What they
cannot drive is listed here, batched so the owner tests several at once. Tick with the
date and what happened; a failure becomes its own `fix` item.

- [ ] **Adobe sign-in, sign-out, and sign-in that restores a project's org** (the
      `adobeSignIn.ts` move, `46714daa5`): a forced re-login opens the browser once, the
      org list refreshes afterwards, and a project opened in the wrong org still prompts.
- [ ] **A deploy's progress reaching an open dashboard** (`projectPanelPushes.ts`,
      `df44020fe`): redeploy an integration with the Project Dashboard open and then with
      the Integrations screen open; the card flips to deploying and back, and the mesh
      card updates during a mesh deploy.

## Shipped so far

- 2026-09-10  2026-09-10  Gated: god-file-ratchet.test.ts pins 68 candidates / 31 coupled; rule 49 measures on edit (2987e8623)
- 2026-09-10  2026-09-10  First cut of the worst coupled file: spreadsheet copy out of daLiveContentCopy 1157->1082 (d412b0652)
- 2026-09-11  Second cut of daLiveContentCopy: account chrome + auth stubs out, 1081->981 (220-line daLiveAccountChrome); suites untouched
- 2026-09-10  chore(backlog): log the account-chrome cut to EDS-8 (`9c3ac64a4`)
- 2026-09-10  refactor(eds): account chrome out of daLiveContentCopy — 1081 to 981 (`b590a8993`)
- 2026-10-03  Third cut of daLiveContentCopy (981 -> 386): daLiveFileCopy 256, daLiveBatchCopy 185, daLiveCopyPaths 149, daLiveContentReferences 147, daLiveSiteCopy 82. Fourth cut of helixService (834 -> 369): helixPageContent, helixPageDeletion, helixCodeOperations. Public API unchanged; every existing suite passed untouched (31,136 tests). Pins lowered: godFileCandidates 68 -> 66, godFileCoupled 31 -> 29, cloneCeiling 42 (was 43). Ledger rows moved with the code (mutation equivalents, user-facing errors); the ratchet's known-over CONTROL now names daLiveConfigService.ts. Not done: helixService still forwards every public method (retiring the facade means moving ~25 test files onto the units).
- 2026-10-03  refactor: 41 suites use their family's mocks; the two largest EDS files split by job (PL-51, EDS-8) (`57923a158`)
- 2026-10-04  night3-b: three more files cut by job, public API unchanged, every existing assertion untouched (31,337 tests, gate green). appBuilderComponentHandlers.ts 1252 -> 147 (deploy + re-exports) over appBuilderComponentGuards 154, -Push 134, -Operation 245, -Add 407, -Remove 177, -Rename 181; the add/deploy/remove 'progress then guards' opening became one withGuardedComponentProgress (the split had exposed it to the duplication check). daLiveConfigService.ts 852 -> 368 (config-sheet store) over daLiveSiteAccess 343, daLiveContentReaders 179, daLiveConfigTypes 91. daLiveBlockLibraryOperations.ts 848 -> 342 (library build) over daLiveBlockLibrarySheet 277, daLiveBlockDocPages 347. Pins lowered: godFileCandidates 66 -> 63, godFileCoupled 29 -> 26. Bookkeeping moved with the code: 10 mutation-ledger rows, 1 progress-wording key, 2 user-facing-error keys, 3 new files added to operationStages STAGE_REPORTERS, ratchet CONTROL now names edsPipeline.ts, writtenPaths.probe HANDLER now names projects-dashboard/dashboardHandlers.ts. Not done: both daLive classes still forward their old public methods to the new units (tests construct the old classes). Found, not acted on: DaLiveConfigService.hasUserAccess, getPermissionsStatus and revokeUserAccess have no production caller (tests only) — owner call. Uncommitted on loop/2026-10-04-night3-b.
- 2026-10-03  refactor: three oversized files split by job; nine duplicate tests removed (EDS-8, PL-42) (`d672ddd0f`)
- 2026-10-04  night4-b (staged, uncommitted): two more files cut by job, every existing assertion untouched (31,457 tests, gate green). projects-dashboard/handlers/dashboardHandlers.ts 951 -> 42 (re-exports) over projectsListBrowse 307 (list/select/create/help/settings), projectsListTransfer 77 (import/copy/export), projectsListOpen 220 (start/stop/open browser, AI, live site, DA.live, Admin), projectsListLifecycle 335 (delete/edit/rename/reset/pin), projectFromPath 43. This OVERRIDES the earlier 'leave — a handler map grows by design' verdict: the file was not the map (projectsListHandlers.ts is); it held 20 handler bodies in four jobs, and the split meets the item's own test (separable domains, stable public path, tests through it). Owner may revert. aiBundle/agentsMdSections.ts 652 -> 330 over agentsMdStorefrontSections 186 and agentsMdAdobeSections 180 (generated text unchanged; no AI_CONTEXT_VERSION bump). Pins: godFileCandidates 63 -> 61, godFileCoupled 26 -> 24. Bookkeeping moved with the code: 6 mutation-ledger rows, 1 derived-fields ledger key, ai-bundle-coherence scans the two new section files, the god-file hook proof + writtenPaths probe now name prerequisites/handlers/shared.ts (677), ADR-004 file path.
- 2026-10-04  feat: save a blank-starter app to GitHub; adding is a card on every grid (`79f8ed297`)
- 2026-10-05  2026-10-04 day-b (staged, uncommitted): prerequisites/handlers/shared.ts (677 -> 71) split by job into nodeVersionRequirements.ts (which Node majors the selection needs), prerequisiteStatusMessages.ts (status values and step wording), perNodeVersionStatus.ts (the per-Node-major install check) and prerequisiteCheckError.ts (a check that threw or timed out); shared.ts keeps the dependency gate and re-exports the rest, so all 30-odd jest.mock('.../shared') sites keep intercepting. Every existing assertion untouched (prerequisites 776/776). God-file pins 61 -> 60 and 24 -> 23; 8 mutation-equivalents rows moved to the new files and lines; the god-file hook proof and writtenPaths probe now aim at installHandler.ts (714 lines).
- 2026-10-04  refactor: prerequisites shared.ts split by job; six duplicate cache tests removed (EDS-8, PL-42) (`e598c5d5e`)
- 2026-10-08  PR-1a cut app-builder/services/appBuilderComponentRunner.ts (1944 -> 370, the contract types) into add, redeploy and remove runs plus deploy steps, kind dispatch, removal cleanup and removal state; callers moved, no forwarders (`04d373365`). godFileCandidates 59 -> 58. Re-measured the work list the same day: 22 coupled files, worst authenticationService.ts (924/400, 52 public surface).
- 2026-10-08  refactor(authentication): authenticationService keeps the session; sign-in moves to adobeSignIn, forwarders deleted (`46714daa5`)
- 2026-10-08  chore(decompose-god-file): the per-file routine, with a move checker and a re-measure script; adobeSignIn gets its own suite (`7b154d557`)
