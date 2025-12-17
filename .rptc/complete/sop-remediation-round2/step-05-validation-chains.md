# Step 5: Validation Chain Extraction (§10)

**Priority**: MEDIUM
**Violations**: 4
**Effort**: 30-45 minutes

---

## Objective

Extract long validation chains (4+ conditions) to named type guard/predicate functions.

---

## Violations to Fix

### 1. src/features/project-creation/ui/steps/ProjectCreationStep.tsx:37

**Current**:
```typescript
const isActive = progress && !progress.error && !isCancelled && !isFailed && !isCompleted;
```

**Helper Function**:
```typescript
/**
 * Check if progress is actively running (SOP §10 compliance)
 *
 * Progress is active when:
 * - Progress object exists
 * - No error occurred
 * - Not cancelled by user
 * - Not failed
 * - Not completed
 */
function isProgressActive(
    progress: ProgressState | undefined,
    isCancelled: boolean,
    isFailed: boolean,
    isCompleted: boolean
): boolean {
    if (!progress) return false;
    if (progress.error) return false;
    if (isCancelled) return false;
    if (isFailed) return false;
    if (isCompleted) return false;
    return true;
}
```

**Usage**:
```typescript
const isActive = isProgressActive(progress, isCancelled, isFailed, isCompleted);
```

---

### 2. src/features/authentication/services/authenticationService.ts:282

**Current**:
```typescript
if (token && token.length > 50 && !token.includes('Error') && !token.includes('error')) {
```

**Helper Function**:
```typescript
/**
 * Validate token response from Adobe CLI (SOP §10 compliance)
 *
 * Valid token:
 * - Exists and is non-empty
 * - Length > 50 (real tokens are much longer)
 * - Does not contain error messages
 */
function isValidTokenResponse(token: string | undefined): boolean {
    if (!token) return false;
    if (token.length <= 50) return false;
    if (token.includes('Error')) return false;
    if (token.includes('error')) return false;
    return true;
}
```

**Usage**:
```typescript
if (isValidTokenResponse(token)) {
```

---

### 3. src/features/dashboard/ui/ProjectDashboardScreen.tsx:160

**Current**:
```typescript
const isStartDisabled = isTransitioning || meshStatus === 'deploying' || status === 'starting' || status === 'stopping';
```

**Helper Function**:
```typescript
/**
 * Check if start action should be disabled (SOP §10 compliance)
 *
 * Disabled when:
 * - UI is transitioning
 * - Mesh is deploying
 * - Demo is starting
 * - Demo is stopping
 */
function isStartActionDisabled(
    isTransitioning: boolean,
    meshStatus: string | undefined,
    status: string
): boolean {
    if (isTransitioning) return true;
    if (meshStatus === 'deploying') return true;
    if (status === 'starting') return true;
    if (status === 'stopping') return true;
    return false;
}
```

**Usage**:
```typescript
const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status);
```

---

### 4. src/features/project-creation/ui/steps/ReviewStep.tsx:40-44

**Current**:
```typescript
const canProceed = !!(
    state.projectName &&
    state.adobeOrg?.id &&
    state.adobeProject?.id &&
    state.adobeWorkspace?.id
);
```

**Helper Function**:
```typescript
/**
 * Check if wizard has all required data for review step (SOP §10 compliance)
 *
 * Required:
 * - Project name
 * - Adobe organization selected
 * - Adobe project selected
 * - Adobe workspace selected
 */
function hasRequiredReviewData(state: WizardState): boolean {
    if (!state.projectName) return false;
    if (!state.adobeOrg?.id) return false;
    if (!state.adobeProject?.id) return false;
    if (!state.adobeWorkspace?.id) return false;
    return true;
}
```

**Usage**:
```typescript
const canProceed = hasRequiredReviewData(state);
```

---

## TDD Approach

### RED Phase

**Test file**: `tests/features/project-creation/ui/steps/ProjectCreationStep-predicates.test.ts`

```typescript
import { isProgressActive } from '@/features/project-creation/ui/steps/projectCreationPredicates';

describe('isProgressActive', () => {
    it('returns false when no progress', () => {
        expect(isProgressActive(undefined, false, false, false)).toBe(false);
    });

    it('returns false when progress has error', () => {
        expect(isProgressActive({ error: 'fail' }, false, false, false)).toBe(false);
    });

    it('returns false when cancelled', () => {
        expect(isProgressActive({}, true, false, false)).toBe(false);
    });

    it('returns false when failed', () => {
        expect(isProgressActive({}, false, true, false)).toBe(false);
    });

    it('returns false when completed', () => {
        expect(isProgressActive({}, false, false, true)).toBe(false);
    });

    it('returns true when active with no issues', () => {
        expect(isProgressActive({}, false, false, false)).toBe(true);
    });
});
```

**Test file**: `tests/features/authentication/services/authenticationService-predicates.test.ts`

```typescript
import { isValidTokenResponse } from '@/features/authentication/services/authPredicates';

describe('isValidTokenResponse', () => {
    it('returns false for undefined token', () => {
        expect(isValidTokenResponse(undefined)).toBe(false);
    });

    it('returns false for short token', () => {
        expect(isValidTokenResponse('short')).toBe(false);
    });

    it('returns false for token containing Error', () => {
        expect(isValidTokenResponse('a'.repeat(60) + 'Error')).toBe(false);
    });

    it('returns false for token containing error', () => {
        expect(isValidTokenResponse('a'.repeat(60) + 'error message')).toBe(false);
    });

    it('returns true for valid long token', () => {
        expect(isValidTokenResponse('a'.repeat(100))).toBe(true);
    });
});
```

**Test file**: `tests/features/dashboard/ui/ProjectDashboardScreen-predicates.test.ts`

```typescript
import { isStartActionDisabled } from '@/features/dashboard/ui/dashboardPredicates';

describe('isStartActionDisabled', () => {
    it('returns true when transitioning', () => {
        expect(isStartActionDisabled(true, undefined, 'stopped')).toBe(true);
    });

    it('returns true when mesh deploying', () => {
        expect(isStartActionDisabled(false, 'deploying', 'stopped')).toBe(true);
    });

    it('returns true when starting', () => {
        expect(isStartActionDisabled(false, undefined, 'starting')).toBe(true);
    });

    it('returns true when stopping', () => {
        expect(isStartActionDisabled(false, undefined, 'stopping')).toBe(true);
    });

    it('returns false when ready', () => {
        expect(isStartActionDisabled(false, 'deployed', 'stopped')).toBe(false);
    });
});
```

**Test file**: `tests/features/project-creation/ui/steps/ReviewStep-predicates.test.ts`

```typescript
import { hasRequiredReviewData } from '@/features/project-creation/ui/steps/reviewPredicates';

describe('hasRequiredReviewData', () => {
    it('returns false when no project name', () => {
        const state = { adobeOrg: { id: '1' }, adobeProject: { id: '2' }, adobeWorkspace: { id: '3' } };
        expect(hasRequiredReviewData(state)).toBe(false);
    });

    it('returns false when no org', () => {
        const state = { projectName: 'test', adobeProject: { id: '2' }, adobeWorkspace: { id: '3' } };
        expect(hasRequiredReviewData(state)).toBe(false);
    });

    it('returns false when no project', () => {
        const state = { projectName: 'test', adobeOrg: { id: '1' }, adobeWorkspace: { id: '3' } };
        expect(hasRequiredReviewData(state)).toBe(false);
    });

    it('returns false when no workspace', () => {
        const state = { projectName: 'test', adobeOrg: { id: '1' }, adobeProject: { id: '2' } };
        expect(hasRequiredReviewData(state)).toBe(false);
    });

    it('returns true when all required data present', () => {
        const state = {
            projectName: 'test',
            adobeOrg: { id: '1' },
            adobeProject: { id: '2' },
            adobeWorkspace: { id: '3' },
        };
        expect(hasRequiredReviewData(state)).toBe(true);
    });
});
```

### GREEN Phase

1. Create predicate functions in appropriate files
2. Update usage sites

### REFACTOR Phase

1. Run all tests
2. Check for any similar patterns that could use same predicates

---

## Files Modified

1. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Add `isProgressActive()`
2. `src/features/authentication/services/authenticationService.ts` - Add `isValidTokenResponse()`
3. `src/features/dashboard/ui/ProjectDashboardScreen.tsx` - Add `isStartActionDisabled()`
4. `src/features/project-creation/ui/steps/ReviewStep.tsx` - Add `hasRequiredReviewData()`
5. Test files for each predicate

---

## Verification

```bash
# Run predicate tests
npm run test:fast -- tests/features/project-creation/ui/steps/ProjectCreationStep-predicates
npm run test:fast -- tests/features/authentication/services/authenticationService-predicates
npm run test:fast -- tests/features/dashboard/ui/ProjectDashboardScreen-predicates
npm run test:fast -- tests/features/project-creation/ui/steps/ReviewStep-predicates

# Run full test suite
npm run test:fast

# Verify no long chains remain
grep -E "&&.*&&.*&&.*&&" src/features/project-creation/ui/steps/ProjectCreationStep.tsx
grep -E "&&.*&&.*&&.*&&" src/features/authentication/services/authenticationService.ts
grep -E "\|\|.*\|\|.*\|\|.*\|\|" src/features/dashboard/ui/ProjectDashboardScreen.tsx
```
