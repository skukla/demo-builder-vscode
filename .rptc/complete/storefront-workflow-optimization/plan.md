# Implementation Plan: Storefront Workflow Optimization

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

### Phase Completion Status

| Phase | Status | Date |
|-------|--------|------|
| Phase 1: Rename eds-preflight to storefront-setup | ✅ Complete | (Previously completed) |
| Phase 2: Move GitHub App check to eds-repository-config | ✅ Complete | (Previously completed) |
| Phase 3: Enhance AEM Code Sync Verification | ✅ Complete | (Previously completed) |
| Phase 4: Move operations from executor to storefront-setup | ✅ Complete | (Previously completed) |
| Phase 5: Config.json Generation Consolidation | ✅ Complete | 2026-01-26 |
| Phase 6: Make config.json push failure fatal | ✅ Complete | 2026-01-26 |

**Phase 5-6 Implementation Notes:**
- Created `configSyncService.ts` for GitHub push + CDN publish
- Added Phase 5 sync step to executor after `generateEnvironmentFiles()`
- Removed post-mesh config generation from executor (replaced by Phase 4 local gen + Phase 5 sync)
- Removed Phase 2c from wizard `storefrontSetupHandlers.ts`
- Config.json now generated ONCE in Phase 4 with mesh endpoint, synced in Phase 5
- Push failures are now fatal (user informed Commerce features won't work)

**Created:** 2026-01-14
**Research:** `.rptc/research/creation-workflow-order-of-operations/research.md`

---

## Executive Summary

**Feature:** Restructure EDS creation workflow for optimal user experience

**Purpose:**
- Early failure detection (GitHub App check at repo selection, not 4 steps later)
- No staleness windows (config.json generated ONCE after mesh with complete data)
- Clear completion points (storefront viewable after phase 1, Commerce works after phase 2)

**Approach:** 6 phases - rename step, move GitHub App check earlier, enhance code sync verification, move operations to storefront-setup, reorder config.json timing, make failures fatal

**Estimated Complexity:** Medium-Large

**Key Risks:** Complex state management across phases; mitigated by comprehensive tests

**Quality Requirements:**
- Reuse existing code/patterns wherever possible (no reinventing)
- Clean up dead code paths made obsolete by changes
- ALL tests must pass after each phase (not just new/updated tests)

---

## Current State Analysis

### Current Flow Problems

| Issue | Current Behavior | Impact |
|-------|-----------------|--------|
| Late GitHub App check | Discovered in step 11 (eds-preflight), after 4 more steps | User frustration |
| Double config.json push | Generated before mesh (empty endpoint), re-pushed after | Staleness window |
| config.json push failure silent | Logged but project continues | Commerce features broken silently |
| publish/clone in executor | Happens during project-creation | Unclear completion points |

### Current Step Order (EDS stacks)

```
1. welcome → 2. prerequisites → 3. adobe-auth → 4. adobe-project → 5. adobe-workspace
    ↓
6. eds-connect-services (GitHub + DA.live auth)
    ↓
7. eds-repository-config ← NO GitHub App check here
    ↓
8. eds-data-source → 9. settings → 10. review
    ↓
11. eds-preflight ← GitHub App check HERE (too late!)
    ↓
12. project-creation
```

---

## Proposed Architecture

### New Flow

```
1. welcome → 2. prerequisites → 3. adobe-auth → 4. adobe-project → 5. adobe-workspace
    ↓
6. eds-connect-services (GitHub + DA.live auth)
    ↓
7. eds-repository-config ← GitHub App check HERE (blocks Continue)
    ↓
8. eds-data-source → 9. settings → 10. review
    ↓
11. storefront-setup (publish content, clone tool) ← Site is LIVE
    ↓
12. project-creation (mesh deploy, THEN config.json) ← Commerce works
```

### Key Architectural Changes

| Change | Before | After |
|--------|--------|-------|
| Step 11 ID | `eds-preflight` | `storefront-setup` |
| GitHub App check | Step 11 (preflight) | Step 7 (repo config) |
| Code sync verification | Generic error, unclear recovery | Typed errors, specific UI states, retry |
| `publishAllSiteContent()` | executor | storefront-setup |
| `cloneIngestionTool()` | executor | storefront-setup |
| `generateConfigJson()` | Before mesh (empty) | After mesh only |
| config.json push failure | Logged, continue | Fatal error |

---

## Implementation Phases

### Phase 1: Rename eds-preflight to storefront-setup

**Rationale**: The step's purpose is to CREATE and PUBLISH the storefront, not "preflight checks".

**Files to modify:**

| File | Change |
|------|--------|
| `src/features/project-creation/config/wizard-steps.json` | Step id: `eds-preflight` → `storefront-setup`, update name/description |
| `src/features/eds/ui/steps/EdsPreflightStep.tsx` | Rename to `StorefrontSetupStep.tsx` |
| `src/features/project-creation/ui/wizard/WizardContainer.tsx` | Update import and case statement |
| `src/types/webview.ts` | Add `'storefront-setup'` to WizardStep union |
| `src/features/eds/handlers/edsPreflightHandlers.ts` | Rename to `storefrontSetupHandlers.ts` |
| `src/features/eds/handlers/edsHandlers.ts` | Update imports and handler map |

**Message type changes:**
- `eds-preflight-start` → `storefront-setup-start`
- `eds-preflight-progress` → `storefront-setup-progress`
- `eds-preflight-complete` → `storefront-setup-complete`
- `eds-preflight-error` → `storefront-setup-error`
- `eds-preflight-github-app-required` → `storefront-setup-github-app-required`
- `eds-preflight-resume` → `storefront-setup-resume`

---

### Phase 2: Move GitHub App check to eds-repository-config step

**Rationale**: Check immediately when user selects repo, not 4 steps later.

**Key File:** `src/features/eds/ui/steps/GitHubRepoSelectionStep.tsx`

**Implementation:**

1. **Add state for GitHub App status:**
```typescript
interface GitHubAppStatus {
    isChecking: boolean;
    isInstalled: boolean | null;  // null = not checked yet
    error?: string;
}
```

2. **Check on repo selection:**
- When user selects existing repo OR enters new repo name
- Call backend `check-github-app-for-repo` handler
- Show inline status indicator

3. **Inline install prompt:**
- If not installed, show inline prompt (not dialog)
- Include "Open Installation Page" and "Check Again" buttons
- Reuse `NumberedInstructions` pattern

4. **Block Continue until verified:**
```typescript
const canContinue = isNewValid || isExistingValid;
const appVerified = githubAppStatus.isInstalled === true;
setCanProceed(canContinue && appVerified);
```

5. **Poll for installation:**
- After user clicks "Check Again"
- Use polling with exponential backoff
- Show loading indicator during check

**New Handler:** `check-github-app-for-repo` in `edsGitHubHandlers.ts`

```typescript
export async function handleCheckGitHubAppForRepo(
    context: HandlerContext,
    payload?: { owner: string; repo?: string },
): Promise<HandlerResponse> {
    const githubAppService = new GitHubAppService(context.logger);
    const isInstalled = await githubAppService.isAppInstalled(
        payload.owner,
        payload.repo || 'any-repo',  // Check org-level if no repo
    );
    return { success: true, data: { isInstalled } };
}
```

---

### Phase 3: Enhance AEM Code Sync Verification

**Rationale**: GitHub App installation is necessary but not sufficient. We need to verify actual code sync works.

**Problem**: Currently, code sync verification:
- Polls `https://admin.hlx.page/code/{owner}/{repo}/main/scripts/aem.js`
- If it fails after 25 attempts, checks if GitHub App is installed
- If app IS installed but sync fails, error handling is unclear

**Two-Level Verification Strategy**:

| Level | Location | Purpose | Failure Action |
|-------|----------|---------|----------------|
| 1. Prerequisite | eds-repository-config (Phase 2) | GitHub App installed? | Block Continue, show install prompt |
| 2. Functional | storefront-setup | Code actually syncing? | Clear error with troubleshooting |

**Implementation in `storefrontSetupHandlers.ts`:**

1. **Improve code sync polling:**
```typescript
// Current: Generic timeout error
// New: Specific error based on failure mode

const syncResult = await verifyCodeSync(owner, repo);

if (!syncResult.success) {
    switch (syncResult.failureMode) {
        case 'timeout':
            throw new CodeSyncTimeoutError(
                'Code sync timed out. The GitHub App may be slow or misconfigured.',
                { owner, repo, attempts: syncResult.attempts }
            );
        case 'forbidden':
            throw new CodeSyncPermissionError(
                'Code sync returned 403. Check GitHub App permissions.',
                { owner, repo }
            );
        case 'not-found':
            throw new CodeSyncNotFoundError(
                'Repository not found on Helix. Verify the GitHub App has access.',
                { owner, repo }
            );
        default:
            throw new CodeSyncError(
                `Code sync failed: ${syncResult.error}`,
                { owner, repo }
            );
    }
}
```

2. **Add verification test after sync:**
```typescript
// After code sync reports success, verify the actual file is accessible
const verifyUrl = `https://main--${repo}--${owner}.aem.page/scripts/aem.js`;
const verifyResponse = await fetch(verifyUrl);

if (!verifyResponse.ok) {
    throw new CodeSyncVerificationError(
        'Code sync reported success but content is not accessible.',
        { url: verifyUrl, status: verifyResponse.status }
    );
}
```

3. **Update UI with clear failure states:**

| Failure Mode | UI Message | Recovery Action |
|--------------|------------|-----------------|
| GitHub App not installed | "GitHub App Required" + install instructions | "Open Installation Page" button |
| Timeout | "Code Sync Timeout" + troubleshooting | "Retry" button |
| Permission denied | "Permission Error" + check app settings | Link to GitHub App settings |
| Verification failed | "Sync Incomplete" + wait and retry | "Retry" button with delay suggestion |

**New Error Types in `src/features/eds/errors/`:**

```typescript
// src/features/eds/errors/codeSyncErrors.ts
export class CodeSyncError extends Error {
    constructor(message: string, public context: Record<string, unknown>) {
        super(message);
        this.name = 'CodeSyncError';
    }
}

export class CodeSyncTimeoutError extends CodeSyncError {
    name = 'CodeSyncTimeoutError';
}

export class CodeSyncPermissionError extends CodeSyncError {
    name = 'CodeSyncPermissionError';
}

export class CodeSyncVerificationError extends CodeSyncError {
    name = 'CodeSyncVerificationError';
}
```

**Update `StorefrontSetupStep.tsx` error handling:**

```typescript
// Map error types to user-friendly UI states
if (error instanceof CodeSyncTimeoutError) {
    setPreflightState({
        phase: 'error',
        errorType: 'code-sync-timeout',
        message: 'Code sync is taking longer than expected',
        subMessage: 'This can happen when the GitHub App is processing many files.',
        recoveryAction: 'retry',
    });
} else if (error instanceof CodeSyncPermissionError) {
    setPreflightState({
        phase: 'error',
        errorType: 'code-sync-permission',
        message: 'Permission denied during code sync',
        subMessage: 'Check that the GitHub App has access to this repository.',
        recoveryAction: 'check-permissions',
    });
}
```

**Key Files:**

| File | Action |
|------|--------|
| `src/features/eds/errors/codeSyncErrors.ts` | NEW: Define error types |
| `src/features/eds/handlers/storefrontSetupHandlers.ts` | Improve error handling, add verification |
| `src/features/eds/ui/steps/StorefrontSetupStep.tsx` | Handle different error types in UI |
| `src/features/eds/services/helixService.ts` | Add verification method |

---

### Phase 4: Move operations from executor to storefront-setup

**Rationale**: After storefront-setup, site should be LIVE and VIEWABLE.

**Operations to move:**

| Operation | From | To |
|-----------|------|-----|
| `publishAllSiteContent()` | `edsProjectService.ts:208-222` | `storefrontSetupHandlers.ts` |
| `cloneIngestionTool()` | `edsProjectService.ts:225-231` | `storefrontSetupHandlers.ts` |

**Add to `storefrontSetupHandlers.ts`:**

```typescript
// Phase 5: Publish content to CDN
sendProgress('content-publish', 'Publishing content to CDN...', 70);
await helixService.publishAllSiteContent(repoFullName, 'main', daLiveOrg, daLiveSite);

// Phase 6: Clone ingestion tool
sendProgress('tools-clone', 'Installing commerce tools...', 85);
await contentPhase.cloneIngestionTool(config);
```

**Update progress ranges in `StorefrontSetupStep.tsx`:**

```typescript
const PROGRESS_RANGES = {
    'github-repo': { start: 0, end: 15 },
    'helix-config': { start: 15, end: 30 },
    'code-sync': { start: 30, end: 40 },
    'dalive-content': { start: 40, end: 60 },
    'content-publish': { start: 60, end: 80 },  // NEW
    'tools-clone': { start: 80, end: 95 },       // NEW
    'complete': 100,
};
```

**Add phase descriptions:**

```typescript
case 'content-publish':
    return 'Publishing content to CDN...';
case 'tools-clone':
    return 'Installing commerce tools...';
```

**Remove from executor.ts:**
- Remove `helixService.publishAllSiteContent()` call
- Remove `contentPhase.cloneIngestionTool()` call
- Keep component registration and state saving

---

### Phase 5: Move config.json generation to AFTER mesh deployment

**Rationale**: Eliminate staleness window where site has empty commerce-core-endpoint.

**Current Flow (problematic):**
```
1. EDS setup generates config.json with EMPTY endpoint
2. Push config.json to GitHub (staleness begins)
3. Deploy mesh
4. Update config.json with mesh endpoint
5. Re-push config.json (staleness ends)
```

**New Flow (optimal):**
```
1. EDS setup - NO config.json
2. Deploy mesh
3. Generate config.json WITH mesh endpoint
4. Push config.json ONCE with complete data
```

**Remove from `edsProjectService.ts`:**
- Remove Phase 7 (config.json generation)
- Remove `pushConfigJsonToGitHub()` call

**Add to `executor.ts` (EDS Post-Mesh section):**

```typescript
// EDS POST-MESH: Generate and push config.json (ONCE, with mesh endpoint)
if (isEdsStack && edsSetupComplete && project.meshState?.endpoint) {
    const isPaasBackend = typedConfig.components?.backend === 'adobe-commerce-paas';

    if (isPaasBackend) {
        progressTracker('Generating Config', 86, 'Generating config.json...');

        // Generate config.json WITH mesh endpoint (complete data)
        const envPhase = new EnvConfigPhase(context.logger);
        await envPhase.generateConfigJson({
            ...edsProjectConfig,
            meshEndpoint: project.meshState.endpoint,
        });

        // Push ONCE with complete data
        await pushConfigJsonToGitHub(componentPath, githubOwner, repoName);
    }
}
```

---

### Phase 6: Make config.json push failure fatal

**Rationale**: User should know Commerce features won't work.

**Current behavior:**
```typescript
} catch (error) {
    context.logger.error('Failed to update config.json', error);
    context.logger.warn('Site may show configuration error...');
    // Continues silently
}
```

**New behavior:**
```typescript
} catch (error) {
    context.logger.error('Failed to push config.json', error);
    throw new Error(
        `Commerce configuration failed: Could not push config.json to GitHub. ` +
        `The storefront is live but Commerce features will not work. ` +
        `Error: ${(error as Error).message}`
    );
}
```

**Result**: Project creation STOPS with clear error. User knows Commerce won't work.

---

## Test Strategy

### Phase 1 Tests (Rename)
- Unit tests for renamed handlers
- Integration tests for wizard flow with new step ID
- Regression tests for message handling

### Phase 2 Tests (GitHub App Check)
- Unit tests for `handleCheckGitHubAppForRepo` handler
- Unit tests for inline status component
- Integration tests for blocking behavior
- Mock tests for polling logic

### Phase 3 Tests (Code Sync Verification)
- Unit tests for each error type (timeout, permission, verification)
- Unit tests for `verifyCodeSync` with different HTTP responses
- Unit tests for post-sync verification
- Integration tests for error → UI state mapping
- Mock tests simulating slow sync, failed sync, partial sync

### Phase 4 Tests (Move Operations)
- Unit tests for new phases in storefront-setup
- Integration tests verifying site viewable after completion
- Regression tests for executor (should skip operations)

### Phase 5 Tests (config.json Timing)
- Unit tests verifying config.json NOT generated in storefront-setup
- Unit tests verifying config.json generated AFTER mesh
- Integration tests verifying complete data on first push

### Phase 6 Tests (Fatal Failure)
- Unit tests for error handling
- Integration tests verifying fatal behavior
- Mock tests with simulated GitHub API failures

---

## Acceptance Criteria

### Phase 1: Rename
- [ ] Step ID changed from `eds-preflight` to `storefront-setup`
- [ ] All UI text updated
- [ ] All message types renamed
- [ ] Tests pass

### Phase 2: GitHub App Check
- [ ] GitHub App checked when repo is selected
- [ ] Inline install prompt shown if not installed
- [ ] Continue button blocked until verified
- [ ] Polling works for installation detection

### Phase 3: Code Sync Verification
- [ ] Code sync polling returns specific failure modes (timeout, forbidden, not-found)
- [ ] Post-sync verification confirms content is actually accessible
- [ ] Different error types map to different UI states
- [ ] Each error state has appropriate recovery action (retry, check permissions, etc.)
- [ ] Tests cover all failure modes

### Phase 4: Move Operations
- [ ] `publishAllSiteContent()` runs in storefront-setup
- [ ] `cloneIngestionTool()` runs in storefront-setup
- [ ] Site is viewable after storefront-setup completes
- [ ] Executor no longer runs these operations

### Phase 5: config.json Timing
- [x] config.json NOT generated during storefront-setup
- [x] config.json generated AFTER mesh deployment
- [x] config.json pushed ONCE with complete data
- [x] No staleness window for commerce-core-endpoint

### Phase 6: Fatal Failure
- [x] config.json push failure stops project creation
- [x] Clear error message shown to user
- [x] User knows Commerce features won't work

### All Phases: Quality Gates
- [ ] `npm test` passes (ALL tests, not just new/updated)
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] No dead code left behind (code paths removed as specified in Dead Code Cleanup)
- [ ] Existing patterns/code reused (no reinventing per Code Reuse Strategy)

---

## File Reference Map

### Phase 1: Rename
| File | Action |
|------|--------|
| `src/features/project-creation/config/wizard-steps.json` | Update step id, name, description |
| `src/features/eds/ui/steps/EdsPreflightStep.tsx` | Rename to `StorefrontSetupStep.tsx` |
| `src/features/eds/handlers/edsPreflightHandlers.ts` | Rename to `storefrontSetupHandlers.ts` |
| `src/features/eds/handlers/edsHandlers.ts` | Update imports and handler map |
| `src/features/project-creation/ui/wizard/WizardContainer.tsx` | Update import and case |
| `src/types/webview.ts` | Add `'storefront-setup'` type |

### Phase 2: GitHub App Check
| File | Action |
|------|--------|
| `src/features/eds/ui/steps/GitHubRepoSelectionStep.tsx` | Add check, inline prompt, block logic |
| `src/features/eds/handlers/edsGitHubHandlers.ts` | Add `handleCheckGitHubAppForRepo` |
| `src/features/eds/handlers/edsHandlers.ts` | Register new handler |

### Phase 3: Code Sync Verification
| File | Action |
|------|--------|
| `src/features/eds/errors/codeSyncErrors.ts` | NEW: Define error types |
| `src/features/eds/handlers/storefrontSetupHandlers.ts` | Improve error handling, add verification |
| `src/features/eds/ui/steps/StorefrontSetupStep.tsx` | Handle different error types in UI |
| `src/features/eds/services/helixService.ts` | Add verification method |

### Phase 4: Move Operations
| File | Action |
|------|--------|
| `src/features/eds/handlers/storefrontSetupHandlers.ts` | Add publish, clone tool phases |
| `src/features/eds/ui/steps/StorefrontSetupStep.tsx` | Add phase descriptions, progress ranges |
| `src/features/eds/services/edsProjectService.ts` | Remove publish, clone tool calls |
| `src/features/project-creation/handlers/executor.ts` | Remove moved operations |

### Phase 5: config.json Timing
| File | Action |
|------|--------|
| `src/features/eds/services/edsProjectService.ts` | Remove config.json generation |
| `src/features/project-creation/handlers/executor.ts` | Add config.json after mesh |

### Phase 6: Fatal Failure
| File | Action |
|------|--------|
| `src/features/project-creation/handlers/executor.ts` | Make push failure throw |

---

## Dependencies and Sequencing

```
Phase 1 (Rename) ─┬─> Phase 2 (GitHub App Check)
                  ├─> Phase 3 (Code Sync Verification)
                  └─> Phase 4 (Move Operations) ─> Phase 5 (config.json) ─> Phase 6 (Fatal)
```

- Phase 1 can be done first (foundational)
- Phases 2, 3, 4 depend on Phase 1 (new names)
- Phase 3 can be done in parallel with Phase 2 (independent concerns)
- Phase 5 depends on Phase 4 (operations moved)
- Phase 6 depends on Phase 5 (config.json in right place)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Complex state management | Medium | Medium | Comprehensive tests, clear documentation |
| GitHub App API rate limits | Low | Low | Cached results, exponential backoff |
| Content publish timeout | Low | Medium | Retry logic, progress feedback |
| Code sync flaky/slow | Medium | Medium | Clear error messages, retry capability, timeout handling |
| Regression in existing flow | Medium | High | Phased rollout, backward compatibility |

---

## Code Reuse Strategy

**Principle**: Don't reinvent - reuse existing patterns and code.

### Existing Code to Reuse

| Component | Location | Reuse In |
|-----------|----------|----------|
| `GitHubAppService.isAppInstalled()` | `src/features/eds/services/githubAppService.ts` | Phase 2 (handler already exists) |
| `GitHubAppInstallDialog` component | `src/features/eds/ui/components/` | Phase 2 (adapt for inline display) |
| `NumberedInstructions` component | `src/core/ui/components/` | Phase 2 (install instructions) |
| Polling pattern with backoff | `src/features/eds/services/edsSetupPhases.ts:423-442` | Phase 2 (polling for app install) |
| `helixService.publishAllSiteContent()` | `src/features/eds/services/helixService.ts` | Phase 4 (move call, don't rewrite) |
| `contentPhase.cloneIngestionTool()` | `src/features/eds/services/edsSetupPhases.ts` | Phase 4 (move call, don't rewrite) |
| Error display pattern | `EdsPreflightStep.tsx:444-466` | Phase 3 (extend, don't replace) |
| `LoadingDisplay` component | `src/core/ui/components/feedback/` | All phases (already used) |

### Patterns to Follow

| Pattern | Example Location | Apply To |
|---------|------------------|----------|
| Handler response format | Any handler in `edsHandlers.ts` | New `check-github-app-for-repo` handler |
| Progress phase updates | `edsPreflightHandlers.ts:sendProgress()` | New content-publish, tools-clone phases |
| Error type hierarchy | `src/features/eds/errors/` | New `codeSyncErrors.ts` |
| UI state machine | `EdsPreflightStep.tsx` PreflightState | Extended error states |

---

## Dead Code Cleanup

**Principle**: Remove code paths that become unreachable after changes.

### Phase 1 Cleanup (Rename)
| Dead Code | Location | Reason |
|-----------|----------|--------|
| Old message type handlers | `edsHandlers.ts` | Renamed to `storefront-setup-*` |
| Old step ID references | Various | Changed from `eds-preflight` |

### Phase 4 Cleanup (Move Operations)
| Dead Code | Location | Reason |
|-----------|----------|--------|
| `publishAllSiteContent()` call | `edsProjectService.ts:208-222` | Moved to storefront-setup |
| `cloneIngestionTool()` call | `edsProjectService.ts:225-231` | Moved to storefront-setup |
| Phase 5.5 progress tracking | `edsProjectService.ts` | No longer needed here |
| Phase 6 progress tracking | `edsProjectService.ts` | No longer needed here |

### Phase 5 Cleanup (config.json Timing)
| Dead Code | Location | Reason |
|-----------|----------|--------|
| Initial config.json generation | `edsProjectService.ts:234-245` | Moved to executor post-mesh |
| `pushConfigJsonToGitHub()` first call | `edsProjectService.ts` | Only one push now |
| Config.json update logic | `executor.ts:606-673` | Replaced with single generation |
| Empty endpoint handling | `edsSetupPhases.ts` | No longer generates with empty endpoint |

### Executor EDS Phase 0 Review
| Code Path | Location | Action |
|-----------|----------|--------|
| `if (!preflightComplete)` branch | `executor.ts:259-407` | **KEEP** - fallback for edge cases |
| Duplicate publish/clone calls | `executor.ts` | **REMOVE** - now in storefront-setup |

---

## Test Requirements

**Critical**: ALL tests must pass after each phase, not just new/updated tests.

### Test Execution Per Phase

```bash
# After EACH phase implementation:
npm test                    # Full test suite - MUST PASS
npm run build              # Build - MUST SUCCEED
npm run lint               # Lint - MUST PASS
```

### Test Updates Required

| Phase | Test File Updates |
|-------|-------------------|
| 1 | Update all tests referencing `eds-preflight` to `storefront-setup` |
| 2 | Add tests for `handleCheckGitHubAppForRepo`, update GitHubRepoSelectionStep tests |
| 3 | Add tests for error types, update storefront-setup handler tests |
| 4 | Update executor tests (operations removed), add storefront-setup phase tests |
| 5 | Update executor tests (config.json timing), remove edsProjectService config tests |
| 6 | Update executor tests (fatal error behavior) |

### Regression Test Focus

| Area | Test Files | Watch For |
|------|------------|-----------|
| Wizard flow | `tests/features/project-creation/ui/wizard/` | Step navigation, state transitions |
| EDS handlers | `tests/features/eds/handlers/` | Message handling, error paths |
| Executor | `tests/features/project-creation/handlers/` | Phase ordering, skip logic |
| Helper functions | `tests/features/project-creation/ui/wizard/wizardHelpers.test.ts` | Button text, step logic |

---

## Configuration

**Efficiency Review:** enabled (after all phases complete)
**Security Review:** disabled (no security-sensitive changes)

---

## Next Actions

**To execute this plan:**

```bash
/rptc:tdd "@storefront-workflow-optimization/"
```

---

_Plan created for PM approval_
_Target: .rptc/plans/storefront-workflow-optimization/_
