---
id: EDS-8
kind: chore
area: eds
needs: []
value: low
status: backlog
---
# Files over the god-file threshold

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
