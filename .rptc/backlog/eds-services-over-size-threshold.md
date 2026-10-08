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
   dialogs; EDS external cleanup; the delete orchestrator. Check first whether its DA.live
   and GitHub auth checks duplicate `edsResetUI`'s (unverified).
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

- 2026-10-08  The owner asked whether the 40 pinned clone pairs were accounted for. They
  were not (one blanket sentence, no per-pair verdict). Read in full and filed as [[PL-69]]:
  34 EXTRACT, 5 leave, 1 variant, in 11 sittings the loop takes between splits. One
  behaviour finding for the owner lives there (publish vs preview on an expired session).

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
