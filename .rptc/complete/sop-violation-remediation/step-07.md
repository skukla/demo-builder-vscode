# Step 7: Split edsHandlers.ts God File (1,179 lines)

## Purpose

Split the edsHandlers.ts god file into focused files using **Pattern C: Helper Extraction** from god-file-decomposition.md. This is the highest-impact step, reducing the file from 1,179 lines to ~500-700 lines while improving testability and maintainability.

**Target Structure:**
- `edsHandlers.ts` (~500-700 lines) - Message handlers only
- `edsHelpers.ts` (~300-400 lines) - Pure helper functions
- `edsPredicates.ts` (~50-100 lines, optional) - Type guards

**Reference Pattern:** `src/features/mesh/handlers/shared.ts` (123 lines) demonstrates the extraction pattern.

---

## Prerequisites

- [ ] Steps 1-6 completed
- [ ] Understand current edsHandlers.ts structure:
  - Service cache + getters (lines 32-76)
  - Payload types (lines 82-111)
  - 16 handler functions (lines 116-1179)

---

## Tests to Write First (RED Phase)

### Unit Tests for Extracted Helpers

- [ ] Test: Service cache getters return cached instances
  - **Given:** Multiple calls to getGitHubService with same context
  - **When:** Called twice
  - **Then:** Returns same instance (referential equality)
  - **File:** `tests/features/eds/handlers/edsHelpers.test.ts`

- [ ] Test: validateDaLiveToken validates JWT format
  - **Given:** Token not starting with 'eyJ'
  - **When:** validateDaLiveToken called
  - **Then:** Returns { valid: false, error: 'Invalid token format' }
  - **File:** `tests/features/eds/handlers/edsHelpers.test.ts`

- [ ] Test: validateDaLiveToken detects expired tokens
  - **Given:** JWT with expired timestamp
  - **When:** validateDaLiveToken called
  - **Then:** Returns { valid: false, error: 'Token has expired' }
  - **File:** `tests/features/eds/handlers/edsHelpers.test.ts`

- [ ] Test: validateDaLiveToken rejects wrong client_id
  - **Given:** JWT with client_id !== 'darkalley'
  - **When:** validateDaLiveToken called
  - **Then:** Returns { valid: false, error: 'Wrong token source' }
  - **File:** `tests/features/eds/handlers/edsHelpers.test.ts`

- [ ] Test: validateDaLiveToken extracts email and expiry
  - **Given:** Valid JWT with email and expiry fields
  - **When:** validateDaLiveToken called
  - **Then:** Returns { valid: true, email, expiresAt }
  - **File:** `tests/features/eds/handlers/edsHelpers.test.ts`

---

## Files to Create/Modify

### Create

- [ ] `src/features/eds/handlers/edsHelpers.ts` - Pure helper functions (~200 lines)
  - Service cache + getters
  - `validateDaLiveToken()` - JWT validation (extracted from duplicated logic)
  - Token result interface

### Modify

- [ ] `src/features/eds/handlers/edsHandlers.ts` - Import helpers, remove extracted code (~700 lines)
- [ ] `src/features/eds/handlers/index.ts` - Re-export helpers if needed

---

## Implementation Details

### GREEN Phase

**1. Create edsHelpers.ts with extracted code:**

```typescript
// src/features/eds/handlers/edsHelpers.ts
import type { HandlerContext } from '@/types/handlers';
import { GitHubService } from '../services/githubService';
import { DaLiveService } from '../services/daLiveService';
import { DaLiveAuthService } from '../services/daLiveAuthService';

// Service cache
let cachedGitHubService: GitHubService | null = null;
let cachedDaLiveService: DaLiveService | null = null;
let cachedDaLiveAuthService: DaLiveAuthService | null = null;

// Service getters (moved from edsHandlers.ts lines 48-76)
export function getGitHubService(context: HandlerContext): GitHubService { ... }
export function getDaLiveService(context: HandlerContext): DaLiveService { ... }
export function getDaLiveAuthService(context: HandlerContext): DaLiveAuthService { ... }
export function clearServiceCache(): void { ... }

// Token validation result
export interface TokenValidationResult {
    valid: boolean;
    email?: string;
    expiresAt?: number;
    error?: string;
}

// Extracted from handleStoreDaLiveToken + handleStoreDaLiveTokenWithOrg
export function validateDaLiveToken(token: string): TokenValidationResult { ... }
```

**2. Update edsHandlers.ts to import helpers:**

```typescript
// src/features/eds/handlers/edsHandlers.ts
import {
    getGitHubService,
    getDaLiveService,
    getDaLiveAuthService,
    validateDaLiveToken,
    clearServiceCache,
} from './edsHelpers';

// Re-export for backward compatibility
export { clearServiceCache };
```

**3. Replace duplicated token validation with helper call:**

```typescript
// Before (in handleStoreDaLiveToken, ~50 lines):
if (!token.startsWith('eyJ')) { ... }
try {
    const parts = token.split('.');
    // ... 40 lines of JWT parsing
} catch { ... }

// After:
const validation = validateDaLiveToken(token);
if (!validation.valid) {
    await context.sendMessage('dalive-token-stored', {
        success: false,
        error: validation.error,
    });
    return { success: false, error: validation.error };
}
const { email, expiresAt } = validation;
```

### REFACTOR Phase

1. Ensure all existing exports preserved (backward compatibility)
2. Run full test suite to verify no regressions
3. Update index.ts if helpers need external exposure

---

## Expected Outcome

- [ ] edsHandlers.ts reduced from 1,179 to ~700 lines
- [ ] edsHelpers.ts created with ~200 lines of pure, testable helpers
- [ ] Duplicated JWT validation logic consolidated (removed ~100 lines)
- [ ] All existing handler exports preserved
- [ ] New unit tests for extracted helpers

---

## Acceptance Criteria

- [ ] All existing tests pass
- [ ] New helper tests pass (5 tests minimum)
- [ ] edsHandlers.ts < 800 lines (threshold for handler files)
- [ ] No circular dependencies
- [ ] Backward compatibility maintained (all exports work)
- [ ] clearServiceCache still exported from edsHandlers.ts

---

## Estimated Time

3-4 hours (complex extraction with backward compatibility requirements)

---

## Risk Mitigation

**Risk:** Breaking existing imports
**Mitigation:** Re-export clearServiceCache from edsHandlers.ts, update index.ts

**Risk:** Service cache behavior changes
**Mitigation:** Test cache hit/miss scenarios explicitly

---

## Line Count Tracking

| File | Before | After | Change |
|------|--------|-------|--------|
| edsHandlers.ts | 1,179 | ~700 | -479 |
| edsHelpers.ts | 0 | ~200 | +200 |
| **Net** | 1,179 | ~900 | -279 (removed duplication) |
