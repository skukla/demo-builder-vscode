# Pre-existing SOP-scan findings — code-pattern cleanup pass

**Filed:** 2026-06-10
**Origin:** Audit run between Step 5a (type-system prep) and the patches-repo workstream for ADR-006. The audit launched 12 of the 17 `/sop-scan` agents against `src/features/eds/`, `src/features/updates/`, and `src/features/project-creation/handlers/executor.ts`. The one ADR-006 finding (templateUpdateChecker nesting) was fixed inline (`9b78c9dc`); this entry captures everything else the scan surfaced as **pre-existing** so it doesn't get lost.
**Status:** Ready — self-contained cleanup batches; pick up any time the codebase wants a refresh pass without being mid-feature.

## Provenance

The audit was specifically scoped to verify the ADR-006 thin-layer storefront workstream (commits `7ddb6c3d` → `9b78c9dc`). The findings below are **not from that session's work** — the scan picked them up incidentally because they live in files the workstream touched or in adjacent files in the same directories. Several pre-date the workstream by months. None is currently breaking anything; the noise floor just got loud enough during the audit to be worth recording.

## Goal / scope

One focused cleanup pass that takes the ~20 surfaced findings, groups them into 4 small batches by domain, and lands each as its own commit so the diff stays reviewable. Behavior-preserving throughout — every change is a refactor with the same test coverage before and after.

**Not in scope:** big-bang restructures (the `daLiveContentOperations` god-file is noted but not in scope — that file is a known long-standing god-file with its own decomposition story; this entry is for the smaller patterns).

## Findings inventory

### Batch S1 — `helixService.ts` (3 deep optional chains + 3 complex inline expressions)

- `helixService.ts:298` — `response?.headers?.get?.('x-error') ?? null` → extract `getErrorHeader(response)` helper.
- `helixService.ts:318` — `jobInfo?.job?.name || jobInfo?.name` → extract `getJobName(jobInfo)`.
- `helixService.ts:319` — `jobInfo?.job?.topic || jobInfo?.topic || defaultTopic` → extract `getJobTopic(jobInfo, defaultTopic)`.
- `helixService.ts:164` — `if (legacyKeys && Object.keys(legacyKeys).length > 0)` → `hasLegacyKeys(legacyKeys)` predicate.
- `helixService.ts:984` and `:1087` — duplicate `paths && paths.length > 0 ? paths : ['/']` → extract `getPathsOrDefault(paths)` (one helper, two call sites).

All three deep-chain extractions sit inside `parseBulkJobResponse`; doing them together reduces that method's complexity nicely.

### Batch S2 — `executor.ts` (1 magic timeout adjacent, 1 deep chain in debug log, 5 `Object.keys(x || {}).length` patterns)

- `executor.ts:367, 522` — duplicate `Object.keys(project.componentInstances || {})` → extract `getComponentInstanceKeys(project)` helper (covers both sites and the 2 lookalikes in `featurePackInstaller.ts:86, 92`).
- `executor.ts:820` — `if (!project.componentInstances || Object.keys(project.componentInstances).length === 0)` → `hasNoComponentInstances(project)` predicate.
- `executor.ts:861, 866` — `if (meshEnvVars && Object.keys(meshEnvVars).length > 0)` / `Object.keys(meshEnvVars).length` in adjacent log → assign to `envVarCount` variable once.
- `executor.ts:758` — `existingProject?.meshState?.endpoint` deep chain inside a debug log line. Lowest priority of the batch — only fires when debug logging is on. Extract `getMeshEndpoint(project)` getter (the helper is one-liner; the value is in unifying the access pattern, not the bytes saved).

### Batch S3 — UI nested ternaries (2 components)

- `GitHubServiceCard.tsx:91-133` — 4-level nested ternary (loading / authenticated+user / compact / error / fallback). Extract `renderAuthenticatedStatus(user, compact, onChangeAccount)` helper that handles the `compact ? ... : ...` arm; outer ternary becomes flat.
- `DaLiveServiceCard.tsx:123-220` — identical shape (5-arm ternary with `compact` nested in the authenticated branch). Same extraction pattern: `renderAuthenticatedView(compact, verifiedOrg, onReset)`.

Both files have the same anti-pattern by construction; the extractions are parallel and should land in the same commit.

### Batch S4 — long validation chains (2 files)

- `storefrontSyncService.ts:106` — `if (input.githubRepo && !input.skipHelix && input.githubToken && input.daLiveToken)` → `isHelixPublishableInput(input)` type-guard predicate.
- `GitHubRepoSelectionStep.tsx:671` — `if (repoMode === 'existing' && selectedRepo && hasLoadedOnce && repos.length > 0)` → `isValidExistingRepoSelection(repoMode, selectedRepo, hasLoadedOnce, repos)` predicate.

Plus one magic timeout in an unrelated file:

- `pdp404HandlerPublisher.ts:217` — `setTimeout(res, 1000)` → `TIMEOUTS.POLL.INTERVAL` (semantic match: retry polling).

## What's NOT in this entry

The scan also flagged two things that are intentionally out of scope:

- **`daLiveContentOperations.ts` (2,537 lines, god-file)** — pre-existing decomposition target; carries its own architectural story (it was extracted from `DaLiveService` already). Belongs to whatever future trim cycle takes on that file; squashing it into this generic cleanup would muddy the diff.
- **`executeEdsPipeline` complexity 27 (over 25 threshold)** — was 32 before Step 2b's `pipelineApplyBlockCodePatches` extraction (`b398388c`). Further reduction needs a structural refactor of the orchestrator (the phased-extraction sketch in the Step 2b commit message), which is a separate workstream from "swap a few helpers in."

Both are tracked as part of the **structural baseline** ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md)) — that's the right home for them.

## Execution plan

Four small batches. Each is a single commit. Total ~2 hours of mechanical refactoring with tests staying green between each.

1. **S1** (helixService) — ~30 min. Verify with EDS test sweep.
2. **S2** (executor + featurePackInstaller) — ~30 min. Verify with project-creation + components sweep.
3. **S3** (UI cards) — ~30 min. Verify with React test sweep.
4. **S4** (validation chains + 1 magic timeout) — ~20 min. Verify with EDS sweep.

Each batch lints clean and passes the existing test set unchanged before commit.

## Constraints

- **Behavior-preserving only** — no logic changes, no test rewrites. If a refactor requires a test change, the test is asserting on the implementation rather than the behavior, and the right answer is "skip this refactor, file a separate test cleanup."
- **No new dependencies, no new abstractions** beyond the extracted helpers themselves. Each helper is one-liner-style and lives in the same file as its caller (unless it's the duplicate `getPathsOrDefault` or `getComponentInstanceKeys`, which are shared and go into a sensibly close `utils.ts` or similar).
- **Lint warnings only** — none of these are blocking. Skip any batch if it's not a good time. They're recorded so they don't get lost; they don't carry a deadline.

## Kickoff prompt

```
Pick up the SOP-pre-existing-patterns backlog item
(.rptc/backlog/2026-06-10-sop-pre-existing-patterns.md).

Run the four batches (S1–S4) in order, each as its own commit. Verify
tests stay green between batches. Skip any batch if it touches a file
that's currently mid-feature on a branch you're aware of — those land
later. Each batch is ~30 minutes of mechanical refactoring; the whole
pass is ~2 hours.

If a refactor would require test changes, skip it and note why (the
test is asserting implementation, not behavior, and is its own
cleanup item).
```
