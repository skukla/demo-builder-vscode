# Step 2: Extract edsHandlers into Domain-Specific Files

## Purpose

Reduce edsHandlers.ts from 1,058 lines to <800 lines by extracting handlers into domain-specific files. Current structure has 14 handlers that can be grouped into GitHub (5) and DA.live (8) domains.

## Prerequisites

- [ ] Step 1 completed (all tests passing)
- [ ] Understanding of Pattern C: Helper Extraction from architecture SOP

## Current State Analysis

**File**: `src/features/eds/handlers/edsHandlers.ts` (1,058 lines)

| Handler | Lines | Domain |
|---------|-------|--------|
| handleCheckGitHubAuth | ~85 | GitHub |
| handleGitHubOAuth | ~65 | GitHub |
| handleGitHubChangeAccount | ~65 | GitHub |
| handleGetGitHubRepos | ~45 | GitHub |
| handleVerifyGitHubRepo | ~65 | GitHub |
| handleVerifyDaLiveOrg | ~95 | DA.live |
| handleGetDaLiveSites | ~100 | DA.live |
| handleDaLiveOAuth | ~50 | DA.live |
| handleCheckDaLiveAuth | ~50 | DA.live |
| handleOpenDaLiveLogin | ~55 | DA.live |
| handleStoreDaLiveToken | ~80 | DA.live |
| handleStoreDaLiveTokenWithOrg | ~120 | DA.live |
| handleClearDaLiveAuth | ~30 | DA.live |
| handleValidateAccsCredentials | ~75 | ACCS |

**Extraction Strategy**: Extract GitHub handlers (~325 lines) + DA.live handlers (~580 lines) = ~905 lines extracted. Remaining in main file: ~153 lines (types, re-exports, ACCS handler).

## Tests to Write First

- [ ] Test: edsGitHubHandlers exports all GitHub handlers
  - **Given:** Import from edsGitHubHandlers
  - **When:** Access handler functions
  - **Then:** All 5 GitHub handlers accessible
  - **File:** `tests/features/eds/handlers/edsGitHubHandlers.test.ts`

- [ ] Test: edsDaLiveHandlers exports all DA.live handlers
  - **Given:** Import from edsDaLiveHandlers
  - **When:** Access handler functions
  - **Then:** All 8 DA.live handlers accessible
  - **File:** `tests/features/eds/handlers/edsDaLiveHandlers.test.ts`

- [ ] Test: edsHandlers maintains backward compatibility
  - **Given:** Import from edsHandlers (main file)
  - **When:** Access any handler function
  - **Then:** All 14 handlers still accessible via main import
  - **File:** `tests/features/eds/handlers/edsHandlers-exports.test.ts`

- [ ] Test: EdsHandlerRegistry still registers all handlers
  - **Given:** EdsHandlerRegistry with new import structure
  - **When:** Registry initialized
  - **Then:** All 14 handlers registered
  - **File:** `tests/features/eds/handlers/EdsHandlerRegistry.test.ts`

## Files to Create

- [ ] `src/features/eds/handlers/edsGitHubHandlers.ts` - GitHub handlers
- [ ] `src/features/eds/handlers/edsDaLiveHandlers.ts` - DA.live handlers

## Files to Modify

- [ ] `src/features/eds/handlers/edsHandlers.ts` - Keep types + ACCS + re-exports
- [ ] `src/features/eds/handlers/index.ts` - Update exports if needed
- [ ] `src/features/eds/handlers/EdsHandlerRegistry.ts` - Update imports

## Implementation Details

### RED Phase

Write tests that verify:
1. New files export expected handlers
2. Main file still exports all handlers (backward compatibility)
3. Registry still works

### GREEN Phase

**1. Create edsGitHubHandlers.ts:**
```typescript
// src/features/eds/handlers/edsGitHubHandlers.ts
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getGitHubService } from './edsHelpers';

export async function handleCheckGitHubAuth(...) { ... }
export async function handleGitHubOAuth(...) { ... }
export async function handleGitHubChangeAccount(...) { ... }
export async function handleGetGitHubRepos(...) { ... }
export async function handleVerifyGitHubRepo(...) { ... }
```

**2. Create edsDaLiveHandlers.ts:**
```typescript
// src/features/eds/handlers/edsDaLiveHandlers.ts
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getDaLiveService, getDaLiveAuthService, validateDaLiveToken } from './edsHelpers';

export async function handleVerifyDaLiveOrg(...) { ... }
export async function handleGetDaLiveSites(...) { ... }
// ... 6 more handlers
```

**3. Update edsHandlers.ts to re-export:**
```typescript
// src/features/eds/handlers/edsHandlers.ts
// Types and ACCS handler remain here
export * from './edsGitHubHandlers';
export * from './edsDaLiveHandlers';
export { clearServiceCache } from './edsHelpers';

// Keep ACCS handler here (only 75 lines, doesn't warrant separate file)
export async function handleValidateAccsCredentials(...) { ... }
```

### REFACTOR Phase

- Verify all tests still pass
- Check that EdsHandlerRegistry works correctly
- Ensure no circular dependencies

## Expected Outcome

- [ ] edsHandlers.ts < 200 lines (types + re-exports + ACCS handler)
- [ ] edsGitHubHandlers.ts ~350 lines
- [ ] edsDaLiveHandlers.ts ~600 lines
- [ ] All tests passing
- [ ] Backward compatible (existing imports work)

## Acceptance Criteria

- [ ] `wc -l src/features/eds/handlers/edsHandlers.ts` < 800
- [ ] All 5,670 tests passing
- [ ] No new SOP violations
- [ ] Handler registry functions correctly

## Estimated Time

1 hour

---

_Step 2 of 2_
