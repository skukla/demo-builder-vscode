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

## Loop findings (unattended run from 2026-10-08)

The owner asked for the splits to run as a loop without them (2026-10-08, 08:35):
"If anything comes up, log it and bring it to me at the end of the loop." Everything
below is for that end-of-loop walkthrough. Each line says what was found, what was done
about it, and what (if anything) the owner has to decide.

- 2026-10-08  The PL-22 mutation sample (`stryker.pl22.config.json`) still names
  `authenticationService.ts` and so no longer measures the sign-in flow, which moved to
  `adobeSignIn.ts`. Adding the new file to the sample needs a fresh 16-minute sample run
  and a baseline row from it; not done in the loop. **Decide:** add it to the sample at the
  next release cut, or accept that the sample measures the session only.
- 2026-10-08  `authenticationService.getOrganizations` / `getProjects` are kept as
  forwarders because two guards take the whole service. **Decide:** whether the org-mismatch
  guard and the ownership check should take a narrower interface (one sitting; no behaviour
  change) or stay as they are.

- 2026-10-08  Two hook rules misfired on command TEXT during the loop: the jest-concurrency
  rule (15) counted a progress-watch shell whose script text named the jest binary as a
  live run (fixed in this branch, with proof cases); the push rule (21) refuses any push
  command that also contains the two-character short flag for line count anywhere, even
  in a later "tail" over the log. Worked around by pushing in a command of its own.
  **Decide:** tighten the push rule to the git-push clause only, or leave it.

- 2026-10-08  The backup push of this branch was refused by the CSS baseline check: the
  branch inherits 10 stylesheet changes from the PR-1a base (your dashboard, integration
  card and site-access work, never pushed, so never captured). This loop changes no
  stylesheet (checked: zero CSS files in its own commits). Pushed with the hook's own
  CSS_BASELINE_BYPASS and that reason; every other gate ran. **Decide / do:** capture a
  visual baseline at HEAD (webview-visual-baseline skill) before this branch or PR-1a
  merges, so the inherited CSS changes are recorded once.

- 2026-10-09  `storefront/storefrontStalenessDetector.ts` has its OWN `mergeComponentConfigs`
  (every component flattened, last one wins), while `config.json` is rendered from
  `storefrontConfigParams.mergeComponentConfigs` (a mesh beats the rest, except the store
  scope, which the backend owns). Read both during the configGenerator split: they are not
  the same job written twice, but they can disagree. A stale store-scope copy on a mesh
  entry that iterates after the backend would hide a backend scope change from the
  "republish needed" check while config.json would pick it up. Not changed: it is outside
  the split and changing it changes when the prompt shows. **Decide:** whether the
  staleness check should read the same merge the render uses (one sitting, with a test
  for the mesh-copy case), or stay as it is.

## Triage of the untangled files (2026-10-08, read by a Sonnet agent, verdicts are LEADS)

The 36 files over their limit with no coupling signal were read by job. 19 are to be
split; 17 are one job. Each split goes through the per-file routine; each one-job
verdict is recorded here so the file stays whole on purpose, and is re-read before the
end-of-loop walkthrough. **For the owner:** with 17 files judged one job, the count
cannot reach 0 without either splitting cohesive files to move a number, or changing
the rule to count code lines rather than raw lines (several are over by 6 to 41 raw lines,
and three of them are more than 40% comments). Decide which.

**Split, in sitting order (worst first; files that share suites go in one sitting):**
1. `project-creation/helpers/envFileGenerator.ts` (701/300): env value resolution; the
   `.env` write and regenerate; config-file dispatch (json and EDS `config.json`).
2. `eds/services/reset/edsResetUI.ts` (794/400): preflight auth checks; result
   notifications; sample-data prompt and removal; the reset orchestrator.
3. `eds/ui/steps/StorefrontSetupStep.tsx` (657/350): the setup-lifecycle hook; error and
   completed views; phase and config helpers.
4. `mesh/services/stalenessDetector.ts` (688/400): env var catalog and file reader;
   deployed-config fetch; source hash; change detection; frontend env change check.
5. `eds/services/configGenerator.ts` (609/400) then `eds/services/catalogPrewarmService.ts`
   (647/400): params extraction vs `config.json` render; prewarm publish, catalog
   enumeration, sample-SKU picker, storefront identity guard.
6. `projects-dashboard/services/projectDeletionService.ts` (616/400): confirmation
   dialogs; EDS external cleanup; the delete orchestrator. Its auth checks do NOT
   duplicate the reset's (checked 2026-10-08, re-checked 2026-10-09): both already call
   the shared `ensureDaLiveAuth` in `edsHelpers` and only wrap its answer differently, and
   its GitHub check is a `delete_repo` sign-in where the reset's (`edsResetPreflight`)
   checks the Code Sync App. Nothing to fold; split it by its own jobs.
7. `eds/services/blockCollectionHelpers.ts` (593/400): discovery and install commit vs
   the merge of definition, filters and models.
8. `data-installer/services/dataInstallerWriteClient.ts` (579/400): import/validate/delete
   vs export (its suites are already split that way). A doc comment near line 166 sits
   on the wrong function; fix in the same sitting.
9. `data-installer/ui/components/ImportDatapackModal.tsx` (504/350): view-state helpers
   vs the modal component.
10. `eds/services/storefront/storefrontRepublishService.ts` (567/400): config republish vs
    full content republish.
11. `eds/ui/steps/repoSelectionInline.helpers.tsx` (440/350) then
    `eds/ui/steps/RepoSelectionInline.tsx` (490/350): pure verdict functions vs form and
    notice components; repo-creation hook, repo-readiness hook, selection component.
12. `authentication/services/adobeConsoleProjectOps.ts` (555/400): Console project
    create/rename/delete vs workspace create/delete/namespace.
13. `updates/services/updateApplyService.ts` (543/400): selection computation vs the
    appliers and apply loop.
14. `eds/handlers/daLive/daLiveAuthPrompt.ts` (666/500): token validation; input prompts;
    the sign-in flow and guard.
15. `dashboard/ui/components/ActionGrid.tsx` (451/350): `BuildZone` and `EditTile` out,
    beside the sibling zones.
16. `eds/services/errorFormatters.ts` (511/400): one pattern matcher; GitHub errors; DA.live
    and Helix tables. **Verified duplication:** `formatDaLiveError` (372 to 419) and
    `formatHelixError` (468 to 511) are the same function apart from the table and a field
    name; `formatGitHubError` was not checked. Fold them in the same sitting.
17. `core/ui/components/selection/ApiAccessPicker.tsx` (393/350): pure family and filter
    logic vs the picker and rows. Low value.

**One job, left whole (dated verdicts):**
- `eds/services/toolManager.ts` (503), 2026-10-08: **not split, pending [[DI-4]].** It is wholly
  the ACO data ingestion tool, which nothing in the extension reaches and whose data source is
  gone. DI-4 decides: delete it (one fewer oversized file, with `CleanupService.cleanupBackendData`
  and the `components.json` entry) or revive it (then split it). A split was started and stopped
  at 19:34 before any tracked file changed.
- `eds/services/edsPipeline.ts` (976): confirmed; one entry looping a step table of
  private helpers tested only through it.
- `core/utils/timeoutConfig.ts` (436): one registry of constants, about 100 code lines.
  Its header promises "deprecated aliases" that do not exist; the sentence is stale
  (fix in passing).
- `authentication/services/adobeWorkspaceCredentials.ts` (578): every credential
  operation on one workspace; already cut once from the entity fetcher.
- `updates/services/componentUpdater.ts` (533): updating one component over private steps.
- `prerequisites/handlers/installHandler.ts` (649): one handler for one message; the only
  seam (Node target-version helpers, ~130 lines) leaves it over the limit anyway.
- `project-creation/ui/steps/IntegrationsStep.tsx` (444): one step; children already
  extracted; 290 code lines.
- `eds/services/configService/configServiceAccess.ts` (488): the 2026-08-15 verdict
  stands; 43% comments, 237 code lines.
- `project-creation/services/aiBundle/claudeSettingsWriter.ts` (461): 50% comments,
  191 code lines, one settings file.
- `project-creation/ui/steps/ReviewStep.tsx` (395): one screen; derivation already in
  `reviewStepHelpers.tsx`.
- `data-installer/ui/views/DatapackCatalogView.tsx` (391): one view, 232 code lines.
- `projects-dashboard/utils/projectStatusUtils.ts` (335): 164 code lines, 146 comment lines.
- `project-creation/services/meshSetupService.ts` (444): one job, 313 code lines.
- `lifecycle/services/projectResetService.ts` (442): one orchestrator plus its UI wrapper.
- `updates/services/templateSyncService.ts` (427): one class syncing a storefront with
  its template over git.
- `authentication/handlers/authenticationHandlers.ts` (525): two entry points sharing
  five helpers; 25 raw lines over.
- `core/ui/components/forms/FieldHelpButton.tsx` (360): 10 lines over.
- `authentication/ui/components/AdobeEntityFields.tsx` (356): 6 lines over.
- `core/ui/utils/WebviewClient.ts` (312 -> 286), 2026-10-09: **one job, not cut.** It is
  the webview end of the message channel: the handshake, the queue that holds messages
  until it completes, request/response matched by `isResponse` + `responseToId` with the
  backend's timeout hints, and subscriptions. Every method touches the same handshake flag,
  queue or pending-request map, so a split would hand that state between files for no
  reader's benefit, and ADR-017 rules it a single module-level instance. The 12 lines over
  the limit were six methods no production code called: `getState`/`setState` and four
  message helpers (validate, progress, get-projects, re-detect-context). Deleted with their
  tests and their slots on the shared test double, which took it under the limit; the
  three helpers that have callers (`requestAuth`, `createProject`, `log`) stay.
- `eds/services/daLive/daLiveAuthService.ts` (413 -> 384), 2026-10-09: **the class is one
  job, not cut.** It is the DA.live session held in `globalState`: store a token (expiry and
  email from opts or the JWT), read it back with the five-minute buffer, clear it (`logout`,
  `resetAll`), bridge it both ways with the da-auth-helper cache, fire `onDidSignIn`, and
  answer two questions about that stored token (`isServerAccepted`, the IMS profile email).
  Every method reads or writes the same five state keys; the email lookup writes the same
  `userEmail` key `storeToken` writes, so splitting the network questions off would hand that
  state between files. No method is uncalled: every one has a production caller, and the
  agent surface reaches it whole (`authTools`, `edsToolGuards`, `storefrontTools` and five
  more take the service from `getDaLiveAuthService`). What did not belong was the
  free-standing `parseJwtPayload`, a pure decoder the sign-in prompt also uses: it moved to
  `daLive/jwtPayload.ts` unchanged and the prompt imports it from there. `fetchUserEmail`'s
  `token` parameter, which no production caller ever passed, was deleted with the one test
  that exercised it.

- 2026-10-08  The owner asked whether the 40 pinned clone pairs were accounted for. They
  were not (one blanket sentence, no per-pair verdict). Read in full and filed as [[PL-69]]:
  34 EXTRACT, 5 leave, 1 variant, in 11 sittings the loop takes between splits. One
  behaviour finding for the owner lives there (publish vs preview on an expired session).

- 2026-10-08  From the daLiveContentOperations cut. The `eds-publish-and-config` skill says
  `editor.path` goes to the ORG config via `applyOrgConfig`; that method no longer exists, and
  the `daLiveSiteConfig` tests route `editor.path` through `applySiteConfig`. The memory note
  on DA.live config scope says "`editor.path` stays org-scoped, via `applySiteConfig`", which
  is itself ambiguous. Not changed by the loop. **Decide:** which scope `editor.path` belongs
  to; the skill sentence then gets corrected to match. Related: `daLiveSiteConfig.test.ts`
  still fakes the removed `applyOrgConfig`, so those assertions check nothing; delete them
  once the scope question is settled.
- 2026-10-08  `copyDaLiveSite` and `deleteSiteRoot` stay as forwarders on
  `DaLiveContentOperations` because `MigrationContentOps` spans two services. **Decide:**
  split that interface (one sitting, no behaviour change) or leave the two forwarders.

- 2026-10-08  `toolManager.ts` is the dead ACO ingestion tool, so the loop skipped it rather
  than split code that may be deleted. **Decide (DI-4):** does any SC still run the ingestion
  tool by hand, and does the Data Installer cover ACO? If both answers point to delete, deleting
  it removes an oversized file and its cleanup path in one change.

- 2026-10-08  `prerequisites/services/PrerequisitesManager.ts` (490/400, coupled) is held back,
  not judged: PR-1a ("Node versions in one place", steps 11 to 14 still open) is reshaping the
  prerequisites area this branch is built on, and a split now would collide with it. Take it
  after PR-1a merges. No decision needed from the owner; recorded so the gap is explained.

- 2026-10-08  From the ioEventsClient cut. Four client methods (`createProvider`,
  `createEventMetadata`, `createRegistration`, `deleteEventMetadata`) and their three request-body
  types have no caller outside the tests: leftovers from the event-provider creation feature
  pulled on 2026-09-09. Kept, because whether creation comes back is [[AB-8]]'s open question.
  **Decide (with AB-8):** if creation is not coming back, delete them (no soft deprecation).

- 2026-10-09  From the WebviewClient verdict. The extension still registers a
  `'re-detect-context'` handler (`handleReDetectContext` in `organizationHandlers.ts`, wired in
  `ProjectCreationHandlerRegistry.ts`), but no webview sends that message and none listens for
  its reply; the only sender was the client helper deleted today, which itself had no caller.
  The handler is unreachable. **Done the same day:** checked that no agent tool dispatches it
  either (no descriptor names it), then deleted it with its file, its tests and its registry
  row; the push-message ceiling fell 145 to 143 and its mutation row went with the file. Also: the handler
  coverage test listed `'progress'` as "handled by the base command"; nothing handled it. The
  entry went with the helper, so the guard has one hole fewer.

- 2026-10-09  From the daLiveAuthService verdict, two findings, neither changed:
  (1) **The DA.live token lives in `globalState`, not SecretStorage.** The sitting's brief
  said SecretStorage; the code says `context.globalState` for the token, its expiry, the
  email and the org. globalState is a plain store on disk, SecretStorage is the OS keychain.
  The token is short-lived (it carries its own expiry) and is also mirrored to `~/.aem/da-token.json` in
  plain text by design (the da-auth-helper bridge), so moving it would change storage for one
  copy of two. **Decide:** move the token to SecretStorage (a migration: read the old key
  once, then clear it, so existing sign-ins survive), or record that globalState is accepted
  for this token. Recommend: record it as accepted unless the helper mirror goes too.
  (2) **A second JWT decoder:** `authentication/services/imsTokenClaims.ts` `decodeImsUserId`
  decodes the same IMS payload segment (base64url, with an object check) to read `user_id`.
  Read both: same job, and `decodeImsUserId` could be written over `parseJwtPayload`. Not in
  reach (another feature, and the shared home would be `core/`), so not chased. **Decide:**
  one decoder in `core/utils`, or leave the two.

- 2026-10-09  From the envFileGenerator split. **The generated `.env` and component config
  files are written straight to disk, with no hash-and-skip.** Every writer in the split
  (`envFileGenerator.ts`, `componentConfigFiles.ts`) calls `fsPromises.writeFile`, so
  Regenerate, Configure, EDS Reset and a mesh redeploy all overwrite a hand edit to a
  component's `.env`, `.env.local`, json config or EDS `config.json` without a word. ADR-013's
  seam (`generatedFileWriter.ts`) is scoped to the AI bundle only, so this is not a breach of
  that ADR, but it does sit against "a user's own edits are never overwritten". Not changed:
  the sitting was a pure move. **Decide:** extend hash-and-skip to these files, or record that
  they are fully generated and edits belong in Configure. Recommend: record it, since Configure
  is where these values are meant to be edited and a skipped `.env` would deploy stale values.

- 2026-10-09  From the StorefrontSetupStep split, three findings, none changed (the sitting
  was a pure move):
  (1) **Fixed the same day:** the first start and Retry sent different dependency lists (the
  first start sent a mesh id twice when it was in both selections). Both now build the list in
  `startDependencies` in `useStorefrontSetup.ts`, which keeps each id once; the test that
  pinned the old behaviour now pins the fix.
  (2) **The failed and published screens are near-copies of `StatusDisplay`** (the error
  variant with Cancel/Retry; the success/warning variant with detail lines). They now live
  in `StorefrontSetupErrorView.tsx` and `StorefrontSetupCompletedView.tsx`. Moving them onto
  `StatusDisplay` adds its fade and its fixed 350px box, which fights the 2026-10-07 "every
  state centres in the pane" change, so it is a visual change and needs a look. **Decide:**
  move them (recommend, with a `height` that fills) or record them as variants.
  (3) **The completed message is still never shown.** `applyComplete` stores the pipeline's
  message (or "Storefront published successfully!") but the published screen always says
  "Storefront Published". The mutation ledger carried this as an OPEN product call; that row
  is gone because the transition is now tested directly, so the question lives here.
  **Decide:** show the pipeline's message on the published screen, or stop storing it.
  Also: the new hook is 268 lines, over the skill's 200-line hook guideline (the ratchet
  does not count hooks). It is one job, the run, so it was not cut further.

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
- [ ] **The three GitHub writes that now cross a unit boundary** (the
      `githubFileOperations.ts` split, uncommitted on `refactor/eds-8-god-files`):
      (1) Reset Storefront on a thin-layer project — the repository ends at the LKG
      template with the brand overrides, binaries intact, one commit; (2) Import
      Storefront Zip — the pushed repository has every file and the import's commit
      message; (3) Export Demo Bundle — the zip in the bundle opens and holds the
      storefront. Each drives `treeCommits` / `repoArchive` handed out by
      `getGitHubServices`, which no test constructs for real.
- [ ] **Install-step progress in the wizard's Prerequisites step** (the
      `ProgressUnifier.ts` split, uncommitted on `refactor/eds-8-god-files`): run the
      prerequisites install against a machine missing a Node major so all four reporters
      run for real — fnm's download percentages (exact, `exactProgress.ts`), a brew/npm
      step's phase messages (milestones), a step with no useful output showing the
      elapsed clock after 30 s (synthetic, `timedProgress.ts`), and "Configure fnm shell"
      completing at once (immediate). Every reporter now reaches the spawner and clock
      through `ProgressReporterDeps`, which the suites fake.
- [ ] **A whole-site publish, both paths** (the `helixSiteContent.ts` split, uncommitted on
      `refactor/eds-8-god-files`): (1) create or republish an EDS storefront whose site the
      bulk Admin API accepts — the wizard's publish step reports "Previewing", then "Publishing
      to live CDN", then the page count, and every page is live; (2) the same on a site the
      bulk API refuses (a repo Helix has never seen) — the log shows "falling back to
      page-by-page" and the pages still land. The bulk calls now run in `helixBulkPublish.ts`
      and the DA.live listing in `helixPageDiscovery.ts`; `HelixService` wires them, and no
      test drives a real `HelixAdminAuth` through the new seams.


- [ ] **The Data Installer panel end to end, after the three-file split** (importHandlers /
      dataInstallerWriteClient / dataInstallerClient, uncommitted on `refactor/eds-8-god-files`):
      (1) a dry run then a real import from the panel — the modal shows per-type progress, the
      notification keeps narrating after the modal closes, and the project records the pack
      (`runAndWatch` now lives in `importJobWatch.ts`); (2) a reset of the same pack, confirmed,
      clears the record; (3) the modal's prefill (instance, project name, scope) and its
      website/store-view picker fill (`importTargetHandlers.ts`); (4) one export list and one
      export (`dataInstallerExportClient.ts`); (5) the catalog browse, a datapack's detail and a
      job's status poll — every read now goes through `dataInstallerTransport.ts`, and a dead
      token must still produce the "sign in" refusal rather than a raw error.
- [ ] **A repository's whole life through the new unit** (the `githubRepoOperations.ts`
      split, uncommitted on `refactor/eds-8-god-files`): (1) create a storefront from the
      wizard — the repository appears under the picked namespace with Actions off, and
      setup waits for its content before pushing (`githubRepoLifecycle` built by
      `createSetupServices`); (2) Import Storefront Zip — the empty repository is created,
      populated and flagged a template; (3) delete a project with "delete the GitHub
      repository" ticked, and Forget Added Demo — both go through
      `getGitHubServices().repoLifecycle.deleteRepository`; (4) the agent's
      `create_github_repo` and `delete_github_repo`. The reads (repo picker list, the
      source check, the shared-demo probe) still go through `repoOperations`, and
      `cloneRepository` is gone — nothing called it, so there is nothing to drive.
- [ ] **The final wizard step, every phase** (the `ProjectCreationStep.tsx` split, uncommitted on
      `refactor/eds-8-god-files`): open the wizard and run a creation to the end — (1) on the
      way in, the "Initializing" body and its Cancel button are there from the first frame,
      not after a beat; (2) while it runs, the operation, its detail and the stage's
      expectation line show, and Cancel reads "Cancelling" once pressed; (3) on success,
      "Project Created Successfully" with View Projects, which shows "Loading your projects"
      and then opens the projects list; (4) on a failure, the red view with the reason and a
      Back button; (5) for an EDS stack whose repository lacks the AEM Code Sync App, the
      install dialog appears BEFORE creation starts and creation begins by itself once the
      App is installed. The phase and the pre-flight now live in two hooks
      (`useCreationProgressPhase`, `useGitHubAppPreflight`) and the body and footer in
      `projectCreationStepContent` / `projectCreationStepFooter`; every suite drives them
      through the step, so only a real run exercises the wizard bundle's render of all four.

- [ ] **The wizard shell after the WizardContainer split** (uncommitted on
      `refactor/eds-8-god-files`): open the wizard and (1) change a VS Code block-library
      setting and a custom block library while it is open — the Project Builder step's
      pre-selected libraries and the custom checkboxes follow, and a committed custom library
      the setting dropped leaves the brand tile (`useWizardSettings`); (2) add a demo from a
      link — its card appears at once and survives the host's echo; (3) open Configure on a
      project whose package is hidden — its brand still shows (`useWizardCatalog`); (4) switch
      the stack on Welcome with configs filled in — shared components keep theirs, the EDS
      fields clear, and the timeline resets to Welcome (`architectureChange`); (5) Cancel,
      Back and Continue on every step, with Continue reading "Create" on Review and
      "Save Changes" when editing (`wizardFooter`). The suites drive all five through the
      container; only the wizard bundle's real render shows the three settings pushes
      arriving from the host.

- [ ] **DA.live content work after the daLiveContentOperations cut** (uncommitted on
      `refactor/eds-8-god-files`): the class no longer forwards; every caller now calls the
      service that owns the job (`sourceOps`, `configOps`, `copyOps`, `blockLibOps`).
      (1) Create an EDS storefront — content copies, the B2B account chrome overlays on a
      hybrid package, the block library appears in da.live, and the AEM Assets panel shows
      (`applySiteConfig`); (2) Reset Storefront with "clear content" — the site empties and
      refills, and the product pages are taken out first; (3) delete a project with its
      DA.live content — the site is gone from the org list; (4) the agent's
      `promote_block_to_library` and `remove_block_from_library`, and a page read/write/delete
      through the content-authoring tools. Suites drive every one with nested fakes; only a
      real run proves the wired services are the ones reached. The token adapters moved to
      `daLiveTokenProviders.ts`, so a DA.live sign-in failing anywhere would show here too.


- [ ] **Adobe org, project and workspace lists after the adobeEntityReads cut** (uncommitted on
      `refactor/eds-8-god-files`): `EntityServices.reads` is now `orgReads`, `projectReads` and
      `workspaceReads`, sharing one `SdkEntityFetch`. (1) Sign in and open the wizard's Adobe
      steps: the org, project and workspace lists fill, and a stale `aio console` selection
      does not win over the token org; (2) open a project dashboard whose org is NOT the
      token's org: the "Switch IMS Org" warning shows, with no browser opening on its own
      (`orgReads.getOrganizationsSdkOnly`); (3) on a token that reaches zero orgs, the CLI
      context is cleared (`onNoOrgsAccessible`); (4) create a workspace and delete a Console
      project: the workspace list and the Runtime sweep (`workspaceReads.fetchWorkspaces`) are
      reached; (5) the agent's workspace tools answer. Suites drive all of it with a faked SDK
      and CLI; only a real sign-in proves the token-org fallback and org-context targeting
      reach the real Console.

- [ ] **The Integrations screen after the IntegrationsScreen split** (uncommitted on
      `refactor/eds-8-god-files`): the card list, the filter, the band and the controls' handlers
      now live in `useIntegrationCards`, `useIntegrationCardSearch`, `IntegrationsActionBand`
      and `useIntegrationsScreenActions`. Open a project's Integrations screen (only the
      `integrations` bundle renders it): (1) the mesh card comes first, then the integrations,
      and the count line reads as before; (2) type in the filter: the grid, the "N of M" count
      and the "No integrations match" line follow it, and the add card steps aside; (3) the
      "Deploys to" row shows the Adobe project and Change opens the destination flow;
      (4) Project Dashboard, refresh, Redeploy on the mesh and Add each still act. Suites stub
      the Spectrum layout, so only a real render proves the band's markup and spacing are
      unchanged.

- [ ] **Reset Storefront after the reset split** (`a8b835c1d` + `9e58ae0a8` on `refactor/eds-8-god-files`):
      the pre-flight checks now live in `edsResetPreflight`, the sample-data step in
      `edsResetSampleData`, the result messages in `edsResetNotifications`, and steps 4-5,
      8-11 and the last steps in `edsResetCodeSyncStep`, `edsResetContentStep` and
      `edsResetFinalize`. Reset touches a real repo, DA.live content and Commerce data, so
      run it on a throwaway project: (1) Reset from the project dashboard: the confirmation,
      then the progress modal names "Your DA.live sign-in", "Your Adobe sign-in", "The Adobe
      organization" and "The GitHub app on your repo" under Checking requirements; (2) on a
      project with a datapack, the "Remove Datapack / Keep Data" question appears, and Remove
      narrates the types under "Removing the sample data"; (3) the reset finishes, the site
      serves the template, and Check for Updates reads no update (the synced commit was
      recorded); (4) Reset from the projects list (a notification, not a modal): a failure
      shows its error toast there and not in the modal case; (5) the agent's `reset_project`
      tool resets the same project. Suites drive all of it with faked VS Code, Helix, DA.live
      and GitHub; only a real reset proves the steps still reach them in order.

- [ ] **Site registration after the configurationService split** (uncommitted on
      `refactor/eds-8-god-files`): the registration body is now built by
      `buildRegistrationBody` (`siteConfigParams.ts`) and every write goes through
      `requestConfigService` (`configServiceRequest.ts`). On a throwaway project:
      (1) run Repair Site Configuration on a storefront with a BYOM overlay set — the
      read-back reports the overlay live, and a product page loads; (2) edit the project so
      the config is re-registered (`updateSiteConfig`) — the site's admin list survives, read
      it in Manage Site Access; (3) delete the project with its site config — the config
      is gone and a second delete reads as already gone. Suites fake `fetch`; only a real
      call proves Adobe still accepts the body and the bearer.

- [ ] **The Configure Project screen after the ConfigureScreen split** (uncommitted on
      `refactor/eds-8-god-files`): the screen is now wiring over four hooks
      (`useProjectNameField`, `useConfigureSave`, `useConfigureSections`,
      `useConfigureFieldRow`). One ordering moved: the global-validation effect now runs
      before the store-discovery effects within a render, not after (they share no state).
      No cloud write needed beyond a save; on an ACCS project and an EDS project:
      (1) open Configure, rename the project with capitals and spaces, Save — the title
      changes and the folder slug shown under the field matches; (2) blank a required field
      in a section that is not on screen — its rail tab shows the error and Save stays
      disabled; (3) on the Commerce connection tab, the store cascade discovers and the
      Business Structure tab's fields appear; on ACCS the OAuth override fields show the
      shared-credential state; (4) start a mesh redeploy and confirm Save reads "Deploying"
      and is disabled until it ends; (5) on the EDS project, Save without touching
      Authoring keeps DA.live classic. Suites render the real hooks with Spectrum mocked;
      only the real webview proves the screen still looks and behaves the same.

- [ ] **Deleting an Adobe project that has event providers** (the `ioEventsClient.ts`
      split, uncommitted on `refactor/eds-8-god-files`): this is a real teardown, so use a
      scratch Console project whose workspace holds at least one app-onboarded 3rd-party
      provider with a registration. Delete it from Demo Builder and confirm the
      registrations, then the provider, are gone in Developer Console and the project
      deletes. Every request now travels through `ioEventsTransport.ts` and the
      which-providers-are-ours filter lives in `eventProviderBinding.ts`; the suites drive
      both with an injected fetch, so only a live call proves the real `fetch`, the
      headers and the pagination against Adobe.

- [ ] **Quick Edit wiring on a storefront** (the `quickEditPublisher.ts` split, uncommitted
      on `refactor/eds-8-god-files`): create (or reset) an EDS storefront and confirm its
      GitHub repo gets the Quick Edit commits — `scripts/scripts.js` carries all four
      markers once each and `tools/quick-edit/quick-edit.js` exists — then open a page in
      Experience Workspace's Layout view and confirm it renders and the first section
      paints without a reload. The text now lives in `quickEditSnippet.ts` and the install
      in `quickEditPublisher.ts`; every line is a proven move and the suites drive both
      with a GitHub fake, so this is a confirmation, not a known risk.
- [ ] **The Project Dashboard's dialogs** (the `ProjectDashboardScreen.tsx` split,
      uncommitted on `refactor/eds-8-god-files`): open a project's dashboard and open
      each dialog from it, then close it — Export, Save as Package (an EDS project),
      View AI Capabilities (also close it with Esc), and Reset (the progress modal shows
      the reset's steps). On a project built on an added demo, Change source opens the
      Add a demo package dialog in its change mode, and after a change the source warning
      re-checks. The five dialogs now render from `DashboardDialogs.tsx`; the move is
      proven and both pieces score 100% under mutation, so this is a confirmation, not a
      known risk.
- [ ] **Every webview still opens and talks to the extension** (the `WebviewClient.ts`
      deletions, 2026-10-09): open the wizard, a Project Dashboard, Configure, the sidebar,
      the projects list, the AI overview, Integrations and the Data Installer; each loads
      its data, and the wizard's Adobe sign-in step still signs in. Only methods with no
      caller were deleted and every kept method is byte-identical, so this is a
      confirmation, not a known risk.
- [ ] **DA.live sign-in, from the wizard and from the agent** (the `daLiveAuthService.ts`
      verdict, 2026-10-09): sign in to DA.live from the wizard's Storefront area (paste a
      token, confirm the namespace) and confirm it shows signed in with the right email;
      then, signed out, ask the agent to sign in (its `sign_in` tool with `provider:"dalive"`) and confirm the same.
      Also confirm a token the agent's `da-auth` skill cached is picked up without a prompt.
      The JWT decoder moved file unchanged and the service lost only a parameter nothing
      passed, so this is a confirmation, not a known risk.

- [ ] **A project's generated config files, created and then regenerated** (the
      `envFileGenerator.ts` split, 2026-10-09): create a project with an EDS storefront and a
      mesh, copy each component's `.env` (and `.env.local` for a Next.js frontend) and the
      storefront's `config.json` aside, then press Save on Configure (which regenerates every
      `.env`) and redeploy the mesh from the dashboard (which rewrites the mesh `.env`).
      Compare: only the `# Generated:` timestamp line should differ. Creation reaches the files
      through `componentConfigFiles.ts`, regeneration through `envFileRegeneration.ts`, and both
      end in the same `.env` writer; every function is a proven move, so this is a
      confirmation, not a known risk.

- [ ] **The wizard's storefront setup step, every state** (the `StorefrontSetupStep.tsx`
      split, 2026-10-09): create an EDS project through the wizard and watch the setup step
      show progress through each phase; on an owner without AEM Code Sync, confirm the install
      dialog pauses the run and that installing the App resumes it at code sync without a
      Retry; close the wizard mid-run and confirm the cancel offers cleanup of what was
      created; make it fail (for example a revoked GitHub token) and confirm the error screen's
      Cancel goes back and Retry starts again; let it finish and confirm the published screen
      (with warnings, if PDP routing could not be set up) and that Continue opens. The hook
      body and both screens are proven moves and every piece scores 91% or better under
      mutation with no open gaps, so this is a confirmation, not a known risk.

- [ ] **The mesh redeploy prompt** (the `stalenessDetector.ts` split, 2026-10-09): open the
      dashboard of a project with a deployed mesh and confirm there is no false "redeploy"
      prompt; then change a mesh-relevant setting on Configure (for example the Commerce
      GraphQL endpoint or the store view code) and save, and confirm the prompt appears.
      Redeploy, reopen the dashboard, and confirm the prompt is gone. Also start the demo (a
      headless frontend), change a frontend setting such as the store view code, and
      confirm the demo status turns to "Restart needed". Every moved
      function is a proven move, so this is a confirmation, not a known risk.

- [ ] **config.json identical before and after a republish** (the `configGenerator.ts`
      split, 2026-10-09): on an EDS project with a mesh, copy the storefront repo's
      `config.json` aside, then run Republish Storefront from the dashboard and compare:
      the file should be byte-identical. Then Reset the storefront (a throwaway project) and
      compare again. Reset and republish now both call `generateProjectConfigJson`, which
      takes its params from `storefrontConfigParams.ts`; creation still renders through
      `generateConfigJson` with params from the same file. Every function is a proven move
      and the suites pin the bytes, so this is a confirmation, not a known risk.

- [ ] **A prewarm publishes the same product pages** (the `catalogPrewarmService.ts`
      split, 2026-10-09): on an ACCS storefront with BYOM set, run Republish (or Reset on a
      throwaway project) and read the setup log: "Enumerated N SKUs" then "Complete: N/N
      succeeded", with N the catalog's product count, and two product pages opened from the
      storefront load at once (no smart-404 wait). Then run Demo Builder: Diagnostics on the
      same project and confirm the PDP probe names a real product and passes. The Catalog
      Service read is now `catalogEnumeration.ts`, the diagnostics sample `catalogSampleSku.ts`
      and the wrong-project guard `storefrontIdentityGuard.ts`; every function is a proven
      move and the suites drive all three with a faked fetch and publisher, so this is a
      confirmation, not a known risk.

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
- 2026-10-08  githubFileOperations.ts (917 -> 367) split by job, uncommitted on refactor/eds-8-god-files. The 2026-08-24 'one domain' verdict is overridden by a read by job: the Contents API (one file at a time) stays in githubFileOperations.ts; the Git Data primitives and the rebase-on-race commit are githubTreeCommits.ts (326); the archive download and the template reset are githubRepoArchive.ts (317); the per-instance Octokit cache the file AND repository classes carried verbatim (a pinned clone pair) is githubAuthenticatedOperations.ts (48), which both now extend. githubTreePush was already a second orchestrator over the same primitives from outside the class, which is what made the tree unit real. Callers moved: the zip import, app-repo promotion and the demo export take treeCommits / repoArchive from getGitHubServices; createBlob/createTree/createCommit/updateBranchRef/downloadRepoArchive are retired from the facade. Three forwarders KEPT (getBranchInfo, commitTreeToBranch, resetRepoToTemplate): installBlockCollections, installInspectorTagging, storefrontFixes, storefrontSetupPhase2 and edsResetRepoHelper take one GitHubFileOperations and need Contents reads plus a tree write on it, so retiring them is a parameter split across ~15 production and 53 test files, not a move. proveMove: every function in the three new files a pure move (--via treeCommits); the only DIFFERS are the three forwarders. Mutation: old file 82.62 measured before the cut (pinned 84.67 predated the 2026-09-15 binary path) -> remainder 95.92; treeCommits 88.10, repoArchive 69.17 (log lines of a six-step orchestration; symlink guard and blob counter ledgered; the symlink path gained its first test), base 100; openGaps 0 on all four. Pins: godFileCandidates 57 -> 56, godFileCoupled 21 -> 20, cloneCeiling 42 -> 41 (the fileOps<->repoOps pair cleared). Found on the way and fixed: proveMove took the { inside Promise<{...}> for a body (two forwarders read 'same' against ten-line methods); the concurrent-run hook rule counted a status-watcher shell whose text names the test binary as a live run (ps-side twin of its 2026-09-08 command-side fix, proof case added).
- 2026-10-08  refactor(eds): githubFileOperations keeps the Contents API; tree commits and the archive reset get their own units (`7ec31f682`)
- 2026-10-08  ProgressUnifier.ts (661 -> 200) split by job, uncommitted on refactor/eds-8-god-files. The step loop, the reporter choice and the elapsed clock stay in ProgressUnifier.ts; the output-parsing reporter is exactProgress.ts (141), the pattern reporter milestoneProgress.ts (75), the two clock-driven reporters timedProgress.ts (195), and command resolution + fnm wrapping + spawning fnmCommands.ts (99). Reporters reach the spawner and clock through a ProgressReporterDeps the unifier builds once; no forwarders (the private methods had no outside caller). proveMove: every moved function a pure move; the one DIFFERS is executeWithProgress, whose four cases now pass the deps. Mutation: the old file had no row, measured 43.96 unsplit -> remainder 87.32 (openGaps 0; two guards with one synthetic fallback, a finally nothing reads and a NaN compare ledgered); exactProgress 94.51, milestoneProgress 90.57, timedProgress 94.53, fnmCommands 95.92, each with a direct suite. Found on the way and fixed: the 'no elapsed time for quick operations' test matched /\(\d+s\)/ against 'N seconds', so it could never fail. Pins: godFileCandidates 56 -> 55, godFileCoupled 20 -> 19; cloneCeiling stays 41 (the self-pair's four clones re-homed in the ledger). The five public-API suites renamed under the ProgressUnifier stem so the mirror rule finds them.
- 2026-10-08  refactor(core): the four progress reporters share one exit-code decision; core/CLAUDE.md stops listing six cleared layer crossings (`9158cf93d`)
- 2026-10-08  refactor(core): ProgressUnifier keeps the step loop; the four reporters and the fnm commands get their own files (`355a1e8d7`)
- 2026-10-08  helixSiteContent.ts (615 -> 262) split by job, uncommitted on refactor/eds-8-god-files. The whole-site publish policy stays in helixSiteContent.ts (discover, bulk first, page-by-page fallback, the progress phases; 14 public surface -> 4); the Admin API bulk preview/publish (202-and-poll) is helixBulkPublish.ts (289); the DA.live page listing with its exclusion lists and path conversion is helixPageDiscovery.ts (135). HelixService wires all three and keeps its facade (the 2026-10-03 decision); the remainder keeps NO forwarders — the facade's previewAllContent/publishAllContent/listAllPages now go straight to the owning unit, and HelixSiteContent takes `bulk` and `discovery` as narrow Pick types. proveMove: every function a pure move (--via bulk --via discovery; without the flags the only DIFFERS are those two prefixes). Mutation: the old file had NO baseline row (only helixApiClient, helixBulkJobs and helixService have one); the unsplit measure was stopped by the loop owner at 20 min because focusModule fell back to 335 import-graph suites, so there is no before number. After, each with a direct suite (59 tests): remainder 82.76, helixBulkPublish 84.55, helixPageDiscovery 92.31, openGaps 0; gaps closed on the way: publish's 400 and no-job-name branches, publish's method/headers, the default poll topic, bulk progress with no callback, the published counter (a regex had matched "-2 pages"), the unanchored .html strip; two double guards in the path conversion ledgered. Pins: godFileCandidates 55 -> 54, godFileCoupled 19 -> 18; cloneCeiling stays 40 (the preview/publish self-pair re-homed to helixBulkPublish.ts). Checks: full jest 1866/1867 suites then one sop rule (toEqual([]) on emptiness) fixed and re-run green; tsc, typecheck:tests, lint (0 errors, 25 pre-existing warnings), compile, source-duplication, test-file-sizes all 0. Found, not fixed: previewAllContent and publishAllContent are a near-verbatim pair (partition, 403 handling and wording differ) — the known clone pair, left as a move per the brief.
- 2026-10-08  refactor(eds): helixSiteContent keeps the publish policy; bulk publish and page discovery get their own units (`5667caedb`)
- 2026-10-08  The three data-installer files that share tests and callers split by job, uncommitted on refactor/eds-8-god-files. handlers/importHandlers.ts (781 -> 341: the import/validate/reset spine and its payload reading, 22 imports -> 15) hands the validate-begin-record-watch half to importJobWatch.ts (253), the modal prefill and website/store-view reads to importTargetHandlers.ts (131) and the Console provisioning button to provisionAccsHandler.ts (119); all three are spread into the one map the panel and the MCP descriptors register, so no caller changed. services/dataInstallerWriteClient.ts (579 -> 329: import/validate/delete) hands the two-step export with its types, headers, body and parsers to dataInstallerExportClient.ts (288), which imports the write client's credential fields, body parsing and deps type (named decision: shared by two, below the Rule of Three, so exported rather than given a third file); exportHandlers now builds the export client, and the stray checkCredentials doc comment is back on checkCredentials. services/dataInstallerClient.ts (429 -> 255: the read endpoints) hands how a request travels — bearer, timeout, failure mapping, drift canary, resetDriftReported — to dataInstallerTransport.ts (203), which the client wraps (its constructor is the wiring; no forwarders anywhere in the three cuts). proveMove: every function in all eight files a pure move (--via transport for the read client; the three quoted-key handlers hand-diffed, same) except ONE named DIFFERS: datapackStage read `.status` off perType entries that are plain status strings (since 2026-09-20), so the shared-channel notification always said "1 of N"; fixed to compare the string, pinned. proveMove itself was wrong a third time — a bare object-type return (`: { stage: string } {`) was taken for the body, so datapackStage, readInput and readTarget had read `same` vacuously; fixed (skips the type group), control re-run. Mutation (old rows of 2026-09-05 as before): importHandlers 89.57 -> 90.45; dataInstallerClient 95.65 -> 98.53 (the first re-measure fell to 91.18 because the per-endpoint drift tests moved to the transport suite and stopped pinning the client's action names; each endpoint now asserts its path); dataInstallerWriteClient 90.48 -> 91.67. New rows: importJobWatch 48.96 on first measure -> 87.37 (the shared-channel push had NO test since it landed, after the old row: stage wording per operation, the done/total position, succeeded/failed/no-reason closes, the record reading `watching` mid-run — all pinned now), provisionAccsHandler 93.10 (downloader wiring and the kept ACCS config pinned), importTargetHandlers 100, dataInstallerExportClient 97.37, dataInstallerTransport 96.81; ratchet held. Suites re-homed by name so the mirror rule finds them (16 selected, none from the import graph): provisionAccsHandler.test, importTargetHandlers(.testUtils/-scopes), importJobWatch(-datapackRecord), dataInstallerExportClient.test, dataInstallerTransport.test, plus importHandlers-accsOffer for the offer flag the spine sets; exportHandlers' hand-written mock retargeted to the export client. Pins: godFileCandidates 54 -> 51, godFileCoupled 18 -> 16; cloneCeiling stays 40; 5 mutation-equivalents rows and 2 user-facing-errors rows re-homed; docs/systems/data-installer.md names the export client. Checks: gate green; full jest, tsc, typecheck:tests, lint (0 errors, 25 pre-existing warnings), compile, source-duplication all 0. Live check appended above.
- 2026-10-08  refactor(data-installer): the import handlers, the write client and the read client split by job; the "N of M done" count fixed (`c5464410f`)
- 2026-10-08  githubRepoOperations.ts (552 -> 221) split by job, uncommitted on refactor/eds-8-god-files. The reads keep the file (getRepository, checkRepositoryAccess, listUserRepositories with its SSO warning; 14 public surface -> 3), so the eight Pick<'getRepository'> callers did not move. The writes and the readiness poll are githubRepoLifecycle.ts (311): createFromTemplate, createEmptyRepository, the Actions-off step, setTemplateFlag, hasContent, waitForContent, deleteRepository, archiveRepository; it extends GitHubAuthenticatedOperations like the reads. cloneRepository had NO production caller (the 2026-05-20 audit's 'only called by template creation' had gone stale) and was deleted with its suite, its mutation-ledger row and the CommandExecutor the constructor took only for it, so both constructors are now (tokenService, logger). getGitHubServices hands out repoLifecycle beside repoOperations; createSetupServices builds both and SetupServices gained githubRepoLifecycle; NewRepoServices in storefrontSetupPhase1 takes repoOps (getRepository) and repoLifecycle (the two creates) — the one interface decision, taken rather than keeping forwarders. Callers moved: cleanup, zip import, app-repo promotion, the agent's create/delete tools, agent project cleanup, project deletion, Manage GitHub Repos, Forget Added Demo, the wizard's create-repo handler. No forwarders kept. proveMove: all 12 functions a pure move, no DIFFERS; control reports DIFFERS. Mutation: the old row (85.35, pinned 2026-09-04 at 6168f48a8, which predates the 2026-10-04 createEmptyRepository and org-refusal changes) taken as the before per the brief; reads 85.71 after; lifecycle measured on its own for the first time 65.83 -> 90.00 after closing real gaps: createEmptyRepository had no direct test at all (route and body, private flag, org route, 422 name-collision reading incl. no-error-list and anywhere-in-list, 404 org fallback vs bare 404, and that another failure does not fall back — that last one needed a route-keyed mock because a queued once-value leaks past clearAllMocks), setTemplateFlag had none. Remaining survivors on both are log/error text and the two ledgered filteredOut guards. Suites re-homed by name: githubRepoLifecycle(.testUtils/-apiPaths/-orgRefusals/-actionsOff) + .test (7 selected by the focus run, none from the import graph); 23 caller-test mocks retargeted. Pins: godFileCandidates 51 -> 50, godFileCoupled 16 -> 15; cloneCeiling stays 40; one user-facing-errors key re-keyed (storefrontSetupPhases.ts:496 -> 494); spine pin for GitHub mutations now names githubRepoLifecycle instead of githubRepoOperations; call-path-audit and codebase-sweep skill rows updated. storefrontSetupPhase1.ts went 495 -> 501 on the first edit and was brought to 498 by one destructure (limit 500). Live check appended above.
- 2026-10-08  refactor(eds): githubRepoOperations keeps the reads; the repository lifecycle gets its own unit; cloneRepository deleted (`79a7c9e28`)
- 2026-10-08  ProjectCreationStep.tsx (503 -> 90) split by job, uncommitted on refactor/eds-8-god-files (Hook Extraction, ADR-017). The step keeps the wiring: it calls the two hooks and renders the body and the footer. The phase the screen is in, with its cancel and open-project actions and the flags the views branch on, is ui/hooks/useCreationProgressPhase.ts (106); the GitHub App pre-flight, the creationFailed listener that names the App, and the start-creation call are ui/hooks/useGitHubAppPreflight.ts (211); the per-phase body views are steps/projectCreationStepContent.tsx (153) and the footer steps/projectCreationStepFooter.tsx (107). No forwarders; the only caller (wizardStepRouter) is unchanged; the three WizardContainer suites that mock the step module keep intercepting. proveMove: every named function a pure move (derivePhaseFromProgress, extractGitHubRepoInfo, handleCreationFailedMessage, SuccessContent, ErrorContent, StepContentArea, StepFooterArea); the two hooks read 'new' because their bodies were the component's inline callbacks, hand-diffed: the one textual change is setPhase (the step's useState setter, identity-stable) added to four dependency lists because it now crosses the hook boundary; control reports DIFFERS. Mutation: the old row (92.00 of 2026-09-04) is the before; remainder 100 after; new rows useCreationProgressPhase 94.44, useGitHubAppPreflight 89.42, projectCreationStepContent 97.92, projectCreationStepFooter 100, openGaps 0 on all five. One real gap closed: the initial 'creating' phase was constrained by no test (every suite settled the pre-flight first, which re-writes it), so a blank initial phase - the 'footer vanished for a beat' class of 2026-08-20 - survived; pinned on the first render. Two survivors ledgered (the pre-flight's re-affirming setPhase; the ?? '' fallback on a field the type makes required), one widened (the phase name beside the ledgered showGenericError guard). Suites re-homed by name: ProjectCreationStep-footer -> projectCreationStepFooter.test, -phases -> hooks/useCreationProgressPhase.test, -preflight -> hooks/useGitHubAppPreflight.test; projectCreationStepContent.test.tsx is new (13 tests); the focus run selected 6 suites, none from the import graph. Pins: godFileCandidates 50 -> 49, godFileCoupled 15 -> 14 (17 imports -> 8); cloneCeiling stays 40; 8 mutation-equivalents rows re-homed, 2 added; test-family-setup adjudication reworded; the three comments naming the step's creationFailed listener and pre-flight (useMessageListeners, useWizardNavigation, webviewPayloads) now name the hook. Checks: full jest 1873/1873 suites (31,934 tests), tsc, typecheck:tests, tsc-blindspots, lint (0 errors, 25 pre-existing warnings), compile, source-duplication, test-file-sizes all 0. Live check appended above.
- 2026-10-08  refactor(project-creation): ProjectCreationStep becomes a shell over two hooks and two views (`4b5cba2ec`)
- 2026-10-08  WizardContainer.tsx (499 -> 328) split by job, uncommitted on refactor/eds-8-god-files (Hook Extraction, ADR-017). The container keeps the shell: it calls the hooks, derives the timeline, and renders the rail, header, content and footer. The three VS Code settings it keeps live (block-library defaults, custom libraries, added demos) with their one onMessage effect and the optimistic add are ui/hooks/useWizardSettings.ts (95); the packages/stacks mount load and the grid's cards (the project's own hidden package, the added-demo cards) are ui/hooks/useWizardCatalog.ts (113; two hooks because stacks must exist before useWizardState and the hidden-package lookup needs its selectedPackage); the stack-change handler is wizard/architectureChange.ts (92; a builder like buildAreaWalk, not a use* — it holds no state and memoising it would change the handler's identity); the Cancel/Back/Continue footer is wizard/wizardFooter.tsx (85). No forwarders; the only caller (wizard/index.tsx) is unchanged; useVSCodeMessage was considered for the settings hook and rejected (it subscribes through webviewClient, a different seam from the vscode.onMessage call every container suite mocks). proveMove: every piece reads 'new' (hook bodies and an inline JSX block), hand-diffed against HEAD with whitespace and comments ignored: useWizardSettings and useWizardCatalog byte-identical; usePackageCards adds setPackages to the lookup effect's deps (a stable setter that now crosses the hook boundary) and returns the memo instead of binding it; buildArchitectureChangeHandler returns the arrow and reads componentConfigs from its parameter instead of state.componentConfigs, and its log channel is 'architectureChange' rather than 'WizardContainer'; WizardFooter reads onCancel/onBack/onNext/stepCount/wizardMode/currentStep as props where the container read its locals. Control reports DIFFERS. proveMove itself was wrong a fourth time — an arrow in a RETURN type (`): (a: string) => void {`) read as a field initialiser, so architectureChange.ts listed nothing at all; fixed in the tool. Mutation: the old row (82.64 of 2026-09-04) is the before; remainder 90.77 after (openGaps 0; the six survivors are five CSS class strings and the ledgered focus-trap options); new rows useWizardSettings 85.71, useWizardCatalog 94.12, architectureChange 65.63 (nine log-wording survivors, assertions banned, plus the two ledgered optional chains), wizardFooter 100, openGaps 0 on all. One real gap closed: emptying the cards memo's dependencies survived, so a demo added mid-session never became a card; pinned in the catalog suite. Suites: WizardContainer-hiddenPackage re-homed as hooks/useWizardCatalog.test.tsx (+5 direct tests), hooks/useWizardSettings.test.tsx (8), wizard/architectureChange.test.ts (6) and wizard/wizardFooter.test.tsx (6) are new; the focus run selected 14 suites by name, none from the import graph. Pins: godFileCandidates 49 -> 48, godFileCoupled 14 -> 13 (25 imports -> 22); cloneCeiling stays 40; 6 mutation-equivalents rows re-homed (the two-effect `}, []);` row split into one per file) and 1 added; stackHelpers' comment names the builder. Checks: full jest 1876/1876 suites (31,968 tests), tsc, typecheck:tests, tsc-blindspots, lint (0 errors, 25 pre-existing warnings), compile, source-duplication, test-file-sizes all 0. Found, not fixed: tests/sop/webviewBundleClasses.ts:71 says three components define classes in a `<style>` block including WizardContainer; only TimelineNav does today. Live check appended above.
- 2026-10-08  refactor(project-creation): WizardContainer keeps the shell; settings, catalog, the stack-change handler and the footer get their own files (`78d44397e`)
- 2026-10-08  daLiveContentOperations.ts (558 -> 102) split by job, uncommitted on refactor/eds-8-god-files. It keeps the wiring: it builds the five DA.live services and hands them back as fields. Its sixteen forwarders are gone and callers reach the owning service; the two TokenProvider adapters moved to daLiveTokenProviders.ts (67); copyDaLiveSite and deleteSiteRoot stay (MigrationContentOps spans two services). Pins: godFileCandidates 48 -> 47, godFileCoupled 13 -> 12, cloneCeiling 40 -> 39 (PL-69 pair 8 gone). Mutation: daLiveContentOperations 100% (baseline row 100%, 33 -> 3 mutants), daLiveTokenProviders 100% (13, new row).
- 2026-10-08  refactor(eds): daLiveContentOperations keeps the wiring; token adapters get their own file and 16 forwarders are retired (`6149b39f3`)
- 2026-10-08  adobeEntityReads.ts (543 -> 140) split by entity, uncommitted on refactor/eds-8-god-files. The file keeps the SDK-first read path every listing shares (SdkEntityFetch: the bounded SDK call; resolveEffectiveOrgId: threaded, then cached, then token org); org reads are adobeOrgReads.ts (169, cache, single-flight, onNoOrgsAccessible, the SDK-only probe), project reads adobeProjectReads.ts (167) and workspace reads adobeWorkspaceReads.ts (172, including the fetchWorkspaces the Console project ops are wired to). EntityServices.reads became orgReads/projectReads/workspaceReads and every caller moved (11 production sites, AdobeContextResolver now takes org and project reads); no forwarders kept. proveMove (--via sdkFetch): every function a pure move except three named DIFFERS, all the token-org source now passed to resolveEffectiveOrgId instead of read off the instance; control reports DIFFERS. Mutation: no baseline row, measured unsplit at 60.90 over the same suites -> 69.43 across the pieces (adobeEntityReads 67.44, adobeOrgReads 78.95, adobeProjectReads 63.29, adobeWorkspaceReads 69.77, openGaps 0 on all); 9 tests close real gaps (empty org list must not be cached, a late SDK answer inside the deadline is used, SDK-only project read runs under the threaded org, workspace org-context code/name only for the cached org, no targeting without a project, SDK-only workspace ids, a failed workspace read rejects); 38 survivors ledgered as equivalent or log-only. Suites re-homed by name (9 selected, none from the import graph); hand-written mocks retargeted (both fakes, authenticationService.testUtils, the resolver suite and 7 caller suites). Pins: godFileCandidates 47 -> 46, godFileCoupled 12 -> 11; cloneCeiling stays 39 (at the pin); test-family-setup adjudicates the adobeEntityReads pair; logger-wording ledger key renamed. Live check appended above.
- 2026-10-08  refactor(authentication): adobeEntityReads keeps the shared SDK fetch; org, project and workspace reads get their own files (`e5f0f4888`)

- 2026-10-08  IntegrationsScreen.tsx (455 -> 226) split by job, uncommitted on refactor/eds-8-god-files (Hook Extraction, ADR-017). The screen keeps its three render states, the page chrome, the grid or empty state, the no-results line and the modals it hosts. The card derivation (the mesh-first memo and the row-status subscription that feeds only it) is useIntegrationCards.ts (107); the query, filterCards and the three flags the screen renders from are useIntegrationCardSearch.ts (58); the add/destination journeys' state, every control's handler, the once-per-visit update check and MESH_OPERATION are useIntegrationsScreenActions.ts (137); the sticky band (SearchHeader, the "Deploys to" row, Project Dashboard) with formatDestination and the count wording is IntegrationsActionBand.tsx (135). Only the integrations bundle renders it (index.tsx is its one importer); hook call order and effect order unchanged; no forwarders. proveMove: filterCards, formatDestination and countCards a pure move; the one DIFFERS is IntegrationsScreen itself (the code it gave up); the four "new" units hand-diffed against HEAD, whitespace ignored: the memo is returned instead of bound, the actions hook takes startOperation as a parameter instead of reading operations.start, handleDestinationChosen's parameter type is named (ChosenDestination), and the band reads search.*, onRefresh, onViewModeChange, onChangeDestination and onBack where the screen read its locals; control reports DIFFERS. Mutation: the old row (89.11) is the before; remainder 96.43 after; new rows IntegrationsActionBand 96.00, useIntegrationCards 100, useIntegrationCardSearch 100, useIntegrationsScreenActions 84.00, openGaps 0 on all five. Two real gaps closed: emptying the dependency lists of handleDeployMesh and handleDestinationChosen survived (a handler would keep the first runner it saw); pinned by re-rendering with a new start. Remaining survivors: eight constant dependency arrays and one unreachable optional chain (ledgered), one button-variant string. Suites: four new mirrored suites (useIntegrationCards 9 tests, useIntegrationCardSearch 9, useIntegrationsScreenActions 12, IntegrationsActionBand 10); the filterCards and formatDestination cases moved out of IntegrationsScreen.test.tsx; IntegrationsGrid.testUtils imports MESH_OPERATION from the actions hook. The focus run selected 12 suites by name, none from the import graph. Pins: godFileCandidates 46 -> 45, godFileCoupled 11 -> 10 (24 imports -> 20); cloneCeiling stays 39 (at the pin); 2 mutation-equivalents rows re-homed, 4 added; SearchHeader and IntegrationsGrid comments name the new homes. Checks: gate green; full jest 1883/1883 suites (32,100 tests), tsc, typecheck:tests, lint (0 errors, 25 pre-existing warnings), compile, source-duplication all 0. Live check appended above.
- 2026-10-08  refactor(dashboard): IntegrationsScreen keeps the layout; cards, search, actions and the action band get their own files (`38136ddc7`)
- 2026-10-08  The two reset files that share tests and callers split by job, uncommitted on refactor/eds-8-god-files. eds/services/reset/edsResetUI.ts (794 -> 368: the reset door, the added-demo source check, the confirmation, the progress window and the order of the steps inside it) handed the four pre-flight checks to edsResetPreflight.ts (220), the result notifications to edsResetNotifications.ts (80) and the sample-data credential check, question and removal to edsResetSampleData.ts (170). eds/services/reset/edsResetService.ts (513 -> 194: executeEdsReset and its error mapping, 20 imports -> 13) handed steps 4-5 to edsResetCodeSyncStep.ts (63), steps 8-11 to edsResetContentStep.ts (160) and the final steps with the result to edsResetFinalize.ts (121). Its re-export of extractResetParams and the reset types was retired: edsResetTool and edsResetUI import edsResetParams, and eight suites' hand-written edsResetService mocks were split so extractResetParams is mocked where it lives. No forwarders. proveMove: every function in all eight files a pure move, no DIFFERS (controls fired); the two moved constants (PIPELINE_STEP_MAP, SEE_REPORT) hand-diffed, same. Suites renamed by subject: edsResetPreflight-auth/-adobeIoAuth, edsResetNotifications, edsResetSampleData(-removalReporting), edsResetContentStep-daLiveReauth, edsResetFinalize; new: edsResetCodeSyncStep, edsResetContentStep, edsResetUI-progressSurface. Mutation (rows as before: edsResetService 91.87, edsResetUI 91.29): edsResetService 94.59, edsResetUI 93.46; new rows codeSync 73.33 (log lines), contentStep 98.08, finalize 92.00, notifications 98.61, preflight 84.71, sampleData 90.32; openGaps 0 on all eight. The first measure of the pieces found code added after the old rows that no test constrained, now pinned: which surface a reset runs on and the id its modal follows (PL-59 R1), the failure toast suppressed in a modal, the pre-flight step names, the keep-content fallback sentence, no source check without a demo, the storefront-report offer when dismissed or when only applied fixes came back, the broken-links record (replaced only on a fresh copy), a project with no component instances, and the sample-data types as the step in a modal. Two equivalent rows added (the undetermined-App log wording; an empty processing list), four re-homed. Pins: godFileCandidates 45 -> 43, godFileCoupled 10 -> 9; cloneCeiling stays 39; progress-surface, user-facing-errors and logger-wording keys re-homed; one test-family row adjudicated (edsResetContentStep: opposite edsPipeline walls). Comments fixed on the way: two cited a sentence `edsResetService` never contained (lostGrantsMessage, codeSyncInstallContent), the credential broker said the reset's check had no context (it has used resolveProjectCredentials since the as-never fix), ADR-003 and the BYOM doc named edsResetService for the config step. PL-69 lead checked: projectDeletionService's DA.live check wraps the same shared ensureDaLiveAuth guard into its own cleanup result, and its GitHub check is a delete_repo sign-in, not the Code Sync App check; variants, not one job. Checks: gate green; full jest (1886 suites, 32,127 tests), tsc, typecheck:tests, lint (0 errors, 25 pre-existing warnings), compile, source-duplication all 0. Live check appended above.
- 2026-10-08  fix(eds): the reset's sample-data removal reports a named stage, so the stage rule covers it (`9e58ae0a8`)
- 2026-10-08  refactor(eds): the reset service and the reset door split by job (`a8b835c1d`)
- 2026-10-08  configurationService.ts (490 -> 235) split by job, uncommitted on refactor/eds-8-god-files. The 2026-08-19 'over on size only; leave' verdict is overridden by a read by job: the site-config operations (register, update with grant preservation, delete, overlay read-back) stay; the lookup-key rule, SiteRegistrationParams and the registration body are siteConfigParams.ts (114); the authenticated request, the status-to-message mapping and ConfigServiceResult are configServiceRequest.ts (169). Callers import the owning unit, no forwarders; buildContentSourceUrl un-exported (its only outside caller went in cf64514fe). proveMove: every moved function a pure move; DIFFERS only where private calls became module calls (makeRequest -> requestConfigService with tokenProvider and logger passed, getImsToken(tokenProvider)) and registerSite now calls buildRegistrationBody, hand-diffed identical to the old inline literal. Mutation: before = baseline row 72.32 (128/47/2); after 130/46/2 in total: client 67.16 (only ledgered equivalents and log text left), configServiceRequest 71.11, siteConfigParams 100, openGaps 0 on all three; one gap closed (an unreadable error body reads 'Unknown error'). Pins: godFileCandidates 43 -> 42, godFileCoupled 9 -> 8; 4 mutation-equivalents rows re-homed; cloneCeiling stays 39. Checks: full jest 1888/1888 (second run, after fixing one token-shaped test literal), tsc, typecheck:tests, lint (0 errors, 25 warnings), compile, source-duplication, npm run gate all 0.
- 2026-10-08  refactor(eds): the site-config address is built once in configurationService (`a9406bbe1`)
- 2026-10-08  refactor(eds): configurationService keeps the site-config operations; the registration body and the request get their own files (`32e193848`)
- 2026-10-08  docs(backlog): PrerequisitesManager waits for PR-1a, which is reshaping the prerequisites area (`554ebd1db`)
- 2026-10-08  docs(backlog): toolManager.ts is not split; it is the unreachable ACO ingestion tool, and DI-4 decides its fate (`312171589`)
- 2026-10-08  (uncommitted on refactor/eds-8-god-files) dashboard/ui/configure/ConfigureScreen.tsx 395 -> 207 (the wiring and the page chrome; 23 -> 15 non-type imports) over four hooks: useProjectNameField 83 (the typed title, its error and folder slug), useConfigureSave 135 (Save, Close, the saving/deploying flags), useConfigureSections 115 (sections, global validation, rail tabs, canSave), useConfigureFieldRow 158 (store discovery, the shared-credential probe, the row renderer). Rendered markup unchanged, no forwarders, every existing ConfigureScreen suite unchanged and green. proveMove: ConfigureScreen DIFFERS by construction (its body became hook calls); the four new hooks hand-diffed against HEAD statement by statement, all verbatim except one comment reworded and normalizeProjectName(projectName) moved into useProjectNameField as projectFolder; one effect-order change (validation now runs before the discovery effects; no shared state). Mutation: before = baseline row 86.36 (10 survived/5 uncovered); after ConfigureScreen 96.97, useConfigureSave 69.70 (all branch survivors ledgered equivalents: the swallowed save-failure throw and two constant dependency arrays), useConfigureSections 96.15, useProjectNameField 90.91, useConfigureFieldRow 100; openGaps 0 on all five. Gap closed: an EDS project with no saved preference now saves DA.live classic, pinned. Pins: godFileCandidates 42 -> 41, godFileCoupled 8 -> 7; 2 mutation-equivalents rows re-homed to useConfigureSave, 2 added; cloneCeiling stays 39. Checks: full jest 1892/1892, tsc, typecheck:tests, lint (0 errors, 25 warnings), compile, source-duplication, tsc-blindspots, test-file-sizes all 0.
- 2026-10-08  refactor(dashboard): ConfigureScreen keeps the page frame; the name field, save, sections and field rows become hooks (`c9cd74b35`)
- 2026-10-08  (uncommitted on refactor/eds-8-god-files) authentication/services/ioEventsClient.ts 447 -> 216 (the endpoints: list/delete providers and registrations, the create half and event metadata; 20 public surface) split by job: how one request travels (headers, timeout, sanitized IoEventsApiError, isEventsAccessDenied, already-gone DELETEs, the pagination host check) moved to ioEventsTransport.ts (193), which the client wraps, and the ownership rule (THIRD_PARTY_PROVIDER_METADATA, parseProviderBinding) to eventProviderBinding.ts (69). Callers import the owning unit, no forwarders. proveMove --via transport: all 17 functions a pure move (control fired); without --via the only difference was the transport. prefix. Mutation: before = baseline row 91.3 (123/12/3); after client 98.28, transport 98.39, binding 100, openGaps 0 on all three; the ten string survivors (operation labels and error messages) are now pinned by message tests; 1 equivalents row re-homed to the transport. Pins: godFileCandidates 41 -> 40, godFileCoupled 7 -> 6; cloneCeiling stays 39. AB-6 and AB-8 notes updated. Live check appended above.
- 2026-10-08  refactor(authentication): ioEventsClient keeps the endpoints; the transport and the provider-binding rule get their own files (`fcf860115`)
- 2026-10-08  (uncommitted on refactor/eds-8-god-files) eds/services/quickEditPublisher.ts 427 -> 187 (the GitHub install: read, decide which edits are missing, commit, never throw; 15 -> 4 public surface) split by job: the anchors, markers, inserted blocks, the quick-edit.js body and the pure buildQuickEditScriptsJs transform moved to quickEditSnippet.ts (268), on the pdp404Snippet model. Every line a proven move, no forwarders, callers unchanged (all three import installQuickEdit). Tests split to match (quickEditSnippet.test.ts, quickEditSnippet-anchorMatch.test.ts renamed, shared quickEditScriptsFixture.ts); two gaps closed (the anchor-missing reason, the two repo paths). Mutation: publisher 77.63 -> 77.05 (denominator only; 59 -> 62 killed across the pair), snippet 100. Pins: godFileCandidates 40 -> 39, godFileCoupled 6 -> 5.
- 2026-10-09  refactor(eds): quickEditPublisher keeps the GitHub install; the vendored text and its transform become quickEditSnippet (`c43b63f5e`)
- 2026-10-09  (uncommitted on refactor/eds-8-god-files) dashboard/ui/ProjectDashboardScreen.tsx 374 -> 311 (what the dashboard shows: the header with the rename field, the masthead notices, the action grid, and the open state of each dialog; 25 -> 19 non-type imports) split by job: the five dialogs mounted over it (Change source, Export, Save as demo package, the operation progress modal, the AI capability catalog) moved to components/DashboardDialogs.tsx (139), with the change-source status re-request. No forwarders; the screen is its only caller and its props are unchanged. Every moved line proven by a normalised JSX diff (proveMove sees functions, and this move was JSX); the only differences are the two close callbacks, which now arrive as props carrying the same setters. New suite DashboardDialogs.test.tsx (9 tests); one wiring test added for the broken-link count. Mutation: the screen's row of record said 100 (2026-09-06) but measured 92.54 before the split (5 survivors no test constrained); after, the screen 100 (54/54) and DashboardDialogs 100 (9/9). Pins: godFileCandidates 39 -> 38, godFileCoupled 5 -> 4; modal-hosting names DashboardDialogs as the AI capability catalog's host. Renders in the dashboard bundle only.
- 2026-10-09  refactor(dashboard): ProjectDashboardScreen keeps what the dashboard shows; its five dialogs become DashboardDialogs (`22d898794`)
- 2026-10-09  refactor(core): WebviewClient is one job and stays whole; six uncalled methods go (`4375094b0`)
- 2026-10-09  refactor(auth): delete the re-detect-context handler nothing sends (`09ad0f3ca`)
- 2026-10-09  refactor(eds): daLiveAuthService is one job and stays whole; the JWT decoder gets its own file (`f1e3712f3`)
- 2026-10-09  refactor(project-creation): split envFileGenerator by job (`45539135e`)
- 2026-10-09  docs(backlog): the reset split is committed; deletion's auth checks are not the reset's (`6ce184ab3`)
- 2026-10-09  StorefrontSetupStep.tsx (657 -> 122) split by job (Hook Extraction, ADR-017). The step keeps which screen a phase shows. The run (start once, the four pushes, Retry, cancel when the wizard closes) is ui/hooks/useStorefrontSetup.ts (268); the phases, the expectation line, the config check and every state transition as a pure function are ui/helpers/storefrontSetupState.ts (288); the failed and published screens are ui/components/StorefrontSetupErrorView.tsx (51) and StorefrontSetupCompletedView.tsx (51). Dead code deleted: the per-phase PROGRESS_RANGES entries (only the finished value was ever read). No forwarders; the only caller (wizardStepRouter) is unchanged and all five step suites passed untouched. proveMove: getHelperText, toStartEdsConfig, isActivePhase pure moves; the hook body and both screens hand-diffed with the transitions inlined back, same; two inert differences named (the initial state is built lazily; the incomplete-config error was written twice and is now one transition); planted controls reported DIFFERS. Mutation: the 92.83 row predated EDS-20, so the unsplit file was re-measured at 92.61 (257 mutants, 5 open gaps); after, the same 257 score 95.72 with every survivor a ledgered equivalent: step 100, error view 100, completed view 100, storefrontSetupState 98.23, useStorefrontSetup 91.00, openGaps 0. Direct suites added for each piece (4 suites, 67 tests). Pins: godFileCandidates 35 -> 34, godFileCoupled stays 2; 5 mutation-equivalents rows re-homed, the OPEN completed-message row dropped (now killed; the question moved to the findings above); cloneCeiling at the pin (36). Renders in the wizard bundle only. Checks: gate green (lint 0 errors, tsc, typecheck:tests, full jest 1901 suites / 32,260 tests, source-duplication). Live check appended above.
- 2026-10-09  refactor(eds): StorefrontSetupStep keeps the screen choice; the run, its state and its two end screens get their own files (`a5bc275ef`)
- 2026-10-09  fix(eds): the first storefront setup start sends each dependency once (`db804c010`)
- 2026-10-09  refactor(mesh): stalenessDetector keeps the redeploy decision; its inputs get their own files (`d0c296c88`)
- 2026-10-09  configGenerator.ts (609 -> 393) split by job. It keeps the config.json render: generateHeaders, the addon and package flag injection, generateConfigJson, and one new call, generateProjectConfigJson, which EDS Reset and storefront republish now share instead of each composing the same two calls. What a project says config.json should carry (mapBackendToEnvironmentType, mergeComponentConfigs, extractConfigParamsFromConfigs, extractConfigParams, buildConfigGeneratorParams and the endpoint resolver) moved to storefrontConfigParams.ts (244); every caller imports from the owning file, no forwarders. The shared call exists because the split otherwise gave storefrontRepublishService.ts a 16th import and pushed it onto the coupled list. Two orphaned doc comments were fixed (one described a function that no longer exists). proveMove: all eleven functions pure moves; every other code line compared as a multiset against HEAD with a planted control, same. Two dead jest.mock calls of configGenerator deleted (dashboardHandlers-eds, dashboardHandlers-dalive-auth: both suites pass without them). Tests: the merge suite became storefrontConfigParams.test.ts and gained the backend-map and params tests from configGenerator.test.ts; one new test pins generateProjectConfigJson to the two-step form. Mutation: both rows predated 2026-10-06 changes, so the unsplit file was re-measured at 92.00 (161 of 175); after, 162 of 176 across the pair: configGenerator 90.24, storefrontConfigParams 96.23, open gaps 0 (one log-label survivor ledgered). Pins: godFileCandidates 33 -> 32, godFileCoupled stays 2; the configGenerator test-family reason now says five suites; rule 43's precedence proof runs on a 450-line stand-in with a control, since no routed file is oversized any more; ADR-003 and ADR-009 name the new file. Checks: npm run gate green (lint 0 errors, tsc, typecheck:tests, blind spots, test sizes, full jest 1900 suites / 32,261 tests, source duplication at the pin of 36). Live check appended above.
- 2026-10-09  refactor(eds): configGenerator keeps the config.json render; what a project says it should carry gets its own file (`02505d246`)
- 2026-10-09  catalogPrewarmService.ts (647 -> 289) split by job. It keeps the publish run: prewarmCatalog, the per-SKU publish through the authenticated Helix path, and the skip results. The Catalog Service read (page size, SKU cap, query, enumerateAccsCatalog) moved to catalogEnumeration.ts (155); the diagnostics sample (pickSampleSku and the served-scope swap) to catalogSampleSku.ts (185); the wrong-project guard projectTargetsStorefront to storefrontIdentityGuard.ts (54). Callers (diagnostics, the diagnostics report, storefront setup) import from the owning file; no forwarders. Stale comments fixed in the moved code: a doc block that sat on the guard instead of the query, a sample docstring naming a function (prewarmOne) that does not exist, and the prewarm docs still describing the anonymous prepublish-pdp POST it replaced. proveMove: all eight functions pure moves; every other code line compared as a multiset with a planted control, the only difference two added export keywords. Tests: the enumeration suite now calls enumerateAccsCatalog directly (catalogEnumeration.test.ts, three new cases: the endpoint guard, joined GraphQL errors, page-by-page reads); the sample tests gathered into catalogSampleSku.test.ts; the guard suite renamed storefrontIdentityGuard.test.ts; the logger-wording ledger key followed the rename. Mutation: the row predated 2026-10-06, so the unsplit file was re-measured at 77.34 (195 killed + 3 timeouts of 256); after, the same 256 mutants with 198 + 3 killed: catalogPrewarmService 68.13, catalogEnumeration 91.80, catalogSampleSku 69.12, storefrontIdentityGuard 100, open gaps 0 everywhere. Ten ledger rows re-homed; the endpoint-guard row was deleted because the direct suite now kills that mutant. Pins: godFileCandidates 32 -> 31, godFileCoupled stays 2. Checks: npm run gate green (lint 0 errors, tsc, typecheck:tests, blind spots, test sizes, full jest 1900 suites / 32,260 tests, source duplication at the pin of 36). Live check appended above.
- 2026-10-09  refactor(eds): catalogPrewarmService keeps the publish run; the catalog read, the diagnostics sample and the project guard get their own files (`10402bb7e`)
