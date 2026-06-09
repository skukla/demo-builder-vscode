# Research: Creation Workflow Order of Operations

**Date:** 2026-01-14
**Scope:** Codebase Analysis
**Goal:** Understand current flow + Design new architecture
**Depth:** Comprehensive

---

## Executive Summary

The codebase analysis reveals that **the current architecture has the right structure but incomplete execution**. The preflight step handles some operations, but several critical operations still occur in the executor. Additionally, code sync verification happens too late in the flow.

### Key Issues Identified

1. **4 operations in executor should be in preflight** (publish content, clone tool, generate config.json)
2. **GitHub App check happens too late** (in preflight, after 4 more config steps)
3. **Code sync should be a blocking prerequisite** in the repository configuration step

---

## Current Flow Analysis

### Wizard Step Order (for EDS stacks)

```
1. welcome → 2. prerequisites → 3. adobe-auth → 4. adobe-project → 5. adobe-workspace
    ↓
6. eds-connect-services (GitHub + DA.live auth)
    ↓
7. eds-repository-config (repo selection/creation)
    ↓
8. eds-data-source (DA.live site config)
    ↓
9. settings → 10. review
    ↓
11. eds-preflight (Storefront Setup) ← GitHub App check happens HERE
    ↓
12. project-creation (executor)
```

---

## Operations Analysis

### Operations in Preflight (eds-preflight) - Currently

| Operation | File:Line | Status |
|-----------|-----------|--------|
| Create/fetch GitHub repo | `edsPreflightHandlers.ts:476-481` | ✅ Done |
| Wait for repo content | `edsPreflightHandlers.ts:501` | ✅ Done |
| Push fstab.yaml to GitHub | `edsPreflightHandlers.ts:538-545` | ✅ Done |
| Poll code sync | `edsPreflightHandlers.ts:577-579` | ✅ Done |
| Check GitHub App installation | `edsPreflightHandlers.ts:595` | ✅ Done |
| Copy DA.live content | `edsPreflightHandlers.ts:656-668` | ✅ Done |
| Generate preview/live URLs | `edsPreflightHandlers.ts:691-692` | ✅ Done |

### Operations in Executor That Should Be in Preflight

| Operation | File:Line | Issue |
|-----------|-----------|-------|
| Publish content to CDN | `edsProjectService.ts:208-222` | ❌ **Missing from preflight** |
| Clone ingestion tool | `edsProjectService.ts:225-231` | ❌ **Missing from preflight** |
| Generate config.json | `edsProjectService.ts:234-245` | ❌ **Missing from preflight** |
| Push config.json to GitHub | `edsProjectService.ts:245` | ❌ **Missing from preflight** |
| Update config.json with mesh endpoint | `executor.ts:606-673` | ⚠️ **Requires mesh first** |

---

## GitHub App / Code Sync Problem

### Current Flow (Reactive)

```
Step 7: eds-repository-config
  ↓ User selects/creates repo
  ↓ NO code sync check here
  ↓
Step 8-10: (more config steps)
  ↓
Step 11: eds-preflight
  ↓ Repo creation
  ↓ fstab.yaml push
  ↓ Code sync verification ← FAILS if GitHub App not installed
  ↓ Show install dialog
  ↓ User installs, returns
  ↓ Resume and continue
```

### Problem

User goes through 4 more steps (data-source, settings, review, start preflight) before discovering GitHub App isn't installed. This is frustrating UX.

### Proposed Flow (Proactive Blocking)

```
Step 7: eds-repository-config
  ↓ User selects/creates repo
  ↓ IMMEDIATELY check GitHub App status
  ↓ If not installed → show inline install prompt
  ↓ BLOCK navigation until verified
  ↓
Step 8-10: (proceed with confidence)
  ↓
Step 11: eds-preflight
  ↓ Code sync verification is FAST (app already installed)
```

---

## Proposed New Architecture

### Phase 1: Repository Configuration Step (`eds-repository-config`)

**New operations to add:**
1. When user selects/creates repo → immediately check GitHub App status
2. If not installed → show inline install prompt (not a dialog)
3. Poll for installation in background
4. Only enable "Continue" when app is verified installed
5. **This becomes a blocking prerequisite**

**File to modify:** `src/features/eds/ui/steps/GitHubRepoSelectionStep.tsx`

### Phase 2: Storefront Setup Step (`eds-preflight`)

**Should handle ALL storefront operations:**
1. ✅ Create/fetch GitHub repo (already done)
2. ✅ Push fstab.yaml (already done)
3. ✅ Verify code sync (already done - but should be faster since app pre-verified)
4. ✅ Copy DA.live content (already done)
5. **NEW: Publish content to CDN** (`helixService.publishAllSiteContent()`)
6. **NEW: Clone ingestion tool** (if needed)
7. **NEW: Generate and push config.json** (initial version without mesh)

**Error handling:** Each operation should have retry capability in the UI

### Phase 3: Project Creation Step (`project-creation`)

**Should only handle:**
1. Clone local components (non-EDS)
2. Install npm dependencies
3. Deploy API Mesh
4. **Update config.json with mesh endpoint** (this must stay here)
5. Generate .env files
6. Git initialization
7. Finalization

---

## Gap Analysis: What's Missing from Preflight

| Operation | Current Location | Should Be In |
|-----------|------------------|--------------|
| `publishAllSiteContent()` | `edsProjectService.ts:208-222` | **Preflight** |
| `cloneIngestionTool()` | `edsProjectService.ts:225-231` | **Preflight** |
| `generateConfigJson()` | `edsProjectService.ts:234-245` | **Preflight** |
| `pushConfigJsonToGitHub()` | `edsProjectService.ts:245` | **Preflight** |

---

## Code Sync Check Options

### Option A: Check in eds-repository-config step (Recommended)

**Pros:**
- Earliest possible detection
- User can't proceed without app installed
- Clear blocking prerequisite

**Cons:**
- Need to modify GitHubRepoSelectionStep significantly
- Need polling mechanism in that step
- More complex UX flow

### Option B: Check immediately after repo selection (before fstab push)

**Pros:**
- Can leverage existing preflight infrastructure
- Simpler implementation
- User has already committed to the repo

**Cons:**
- User still goes through more steps before finding out

---

## Key Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `GitHubRepoSelectionStep.tsx` | Repo config UI | Add GitHub App check + install flow |
| `edsPreflightHandlers.ts` | Preflight backend | Add publish, clone tool, config.json operations |
| `EdsPreflightStep.tsx` | Preflight UI | Update phase descriptions, add retry for new ops |
| `executor.ts:258-407` | EDS Phase 0 | Can be removed entirely (all ops in preflight) |
| `edsProjectService.ts` | EDS orchestrator | May become obsolete for preflight path |

---

## Detailed File References

### EdsPreflightStep (handleStartEdsPreflight)

| Operation | File:Line | Details |
|-----------|-----------|---------|
| Create repo from template | `edsPreflightHandlers.ts:476-481` | `githubRepoOps.createFromTemplate()` |
| Wait for repo content | `edsPreflightHandlers.ts:501` | `githubRepoOps.waitForContent()` |
| Generate fstab.yaml | `edsPreflightHandlers.ts:523-525` | Content generation |
| Get existing fstab SHA | `edsPreflightHandlers.ts:535` | `githubFileOps.getFileContent()` |
| Push fstab.yaml to GitHub | `edsPreflightHandlers.ts:538-545` | `githubFileOps.createOrUpdateFile()` |
| Poll code sync | `edsPreflightHandlers.ts:577-579` | HTTP GET to Helix code endpoint |
| Check GitHub App | `edsPreflightHandlers.ts:595` | `githubAppService.isAppInstalled()` |
| Detect app not installed | `edsPreflightHandlers.ts:597-607` | Send `eds-preflight-github-app-required` |
| Copy DA.live content | `edsPreflightHandlers.ts:656-668` | `daLiveContentOps.copyCitisignalContent()` |
| Generate URLs | `edsPreflightHandlers.ts:691-692` | `generatePreviewUrl()`, `generateLiveUrl()` |
| Send completion | `edsPreflightHandlers.ts:227-235` | `eds-preflight-complete` message |

### EdsProjectService (if preflight not run)

| Operation | File:Line | Details |
|-----------|-----------|---------|
| Phase 1: Create/get repo | `edsProjectService.ts:155-173` | `githubPhase.createFromTemplate()` or `getExisting()` |
| Phase 2: Clone repo | `edsProjectService.ts:176-179` | `githubPhase.clone()` |
| Phase 3: Configure Helix | `edsSetupPhases.ts:289-330` | `helixPhase.configure()` |
| Phase 4: Verify code sync | `edsProjectService.ts:188-191` | `helixPhase.verifyCodeSync()` |
| Code sync polling | `edsSetupPhases.ts:423-442` | `pollingService.pollUntilCondition()` |
| Check GitHub App | `edsSetupPhases.ts:449-452` | `githubAppService.isAppInstalled()` |
| Throw GitHub App error | `edsSetupPhases.ts:461-465` | `GitHubAppNotInstalledError` |
| Phase 5: Copy DA.live | `edsProjectService.ts:194-204` | `contentPhase.populateDaLiveContent()` |
| Phase 5.5: Publish content | `edsProjectService.ts:208-222` | `helixService.publishAllSiteContent()` |
| Phase 6: Clone tools | `edsProjectService.ts:225-231` | `contentPhase.cloneIngestionTool()` |
| Phase 7: Generate config.json | `edsProjectService.ts:234-245` | `envPhase.generateConfigJson()` + `pushConfigJsonToGitHub()` |

### Executor (project-creation)

| Operation | File:Line | Details |
|-----------|-----------|---------|
| Skip Phase 0 if preflight complete | `executor.ts:259` | Conditional check |
| Register EDS component (preflight) | `executor.ts:421-436` | From `edsConfig.repoUrl` |
| Post-mesh: Update config.json | `executor.ts:606-673` | Update local config.json with mesh endpoint, push to GitHub |
| Phase 1-2: Install components | `executor.ts:513-514` | `cloneAllComponents()`, `installAllComponents()` |
| Phase 3: Deploy mesh | `executor.ts:564-589` | `deployNewMesh()` |
| Phase 4-5: Finalization | `executor.ts:694-750` | Environment files, git initialization, finalization |

---

## Recommended Action Items

### 1. Move GitHub App check to eds-repository-config step
- Add `GitHubAppService.isAppInstalled()` check when repo selected
- Show inline install prompt if not installed
- Block "Continue" until verified

### 2. Add missing operations to preflight
- Port `publishAllSiteContent()` from edsProjectService
- Port `cloneIngestionTool()` from contentPhase
- Port `generateConfigJson()` and `pushConfigJsonToGitHub()`

### 3. Remove EDS Phase 0 from executor
- The `if (!preflightComplete)` branch can be removed
- Preflight is now mandatory for EDS stacks

### 4. Keep mesh-related config.json update in executor
- This must happen AFTER mesh deployment
- Executor should just update the existing config.json

---

## Key Takeaways

1. **Architecture is sound** - preflight concept is correct, just incomplete
2. **4 operations need to move** from executor to preflight
3. **Code sync check should be blocking** in repo config step
4. **Retry capability** should be added for all preflight operations
5. **Executor's EDS Phase 0** can be removed once preflight is complete

---

*Research conducted: 2026-01-14*
