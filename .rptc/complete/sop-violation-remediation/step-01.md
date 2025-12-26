# Step 01: Refactor Nested Ternaries to Helper Functions

## Purpose

Fix 3 nested ternary violations (SOP Section 3) by extracting inline nested ternaries to explicit helper functions with clear if/else logic.

## Prerequisites

- [ ] Understanding of code-patterns.md Section 3: Nested Ternary Refactoring
- [ ] Files exist and are accessible

## Violations to Fix

| File | Line | Nested Ternary |
|------|------|----------------|
| `EdsRepositoryConfigStep.tsx` | 332, 402 | `error ? 'invalid' : (verified ? 'valid' : undefined)` |
| `ProjectCreationStep.tsx` | 263 | `isCheckingMesh ? 'Back' : isCancelling ? 'Cancelling...' : 'Cancel'` |

## Tests to Write First (RED Phase)

- [ ] Test: `getValidationState` returns correct state
  - **Given:** Various combinations of error and verified flags
  - **When:** `getValidationState(error, verified)` called
  - **Then:** Returns `'invalid'`, `'valid'`, or `undefined` appropriately
  - **File:** `tests/features/eds/ui/helpers/validationHelpers.test.ts`

- [ ] Test: `getCancelButtonText` returns correct text
  - **Given:** Various phase states (checking, cancelling, active)
  - **When:** `getCancelButtonText(isCheckingMesh, isCancelling)` called
  - **Then:** Returns `'Back'`, `'Cancelling...'`, or `'Cancel'`
  - **File:** `tests/features/project-creation/ui/helpers/buttonTextHelpers.test.ts`

## Files to Create/Modify

- [ ] `src/features/eds/ui/helpers/validationHelpers.ts` - Create helper function
- [ ] `src/features/eds/ui/steps/EdsRepositoryConfigStep.tsx` - Use helper (lines 332, 402)
- [ ] `src/features/project-creation/ui/helpers/buttonTextHelpers.ts` - Create helper function
- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Use helper (line 263)

## Implementation Details

### GREEN Phase

**1. Create `getValidationState` helper:**

```typescript
// src/features/eds/ui/helpers/validationHelpers.ts
export function getValidationState(
    hasError: boolean,
    isVerified: boolean
): 'invalid' | 'valid' | undefined {
    if (hasError) return 'invalid';
    if (isVerified) return 'valid';
    return undefined;
}
```

**2. Create `getCancelButtonText` helper:**

```typescript
// src/features/project-creation/ui/helpers/buttonTextHelpers.ts
export function getCancelButtonText(
    isCheckingMesh: boolean,
    isCancelling: boolean
): string {
    if (isCheckingMesh) return 'Back';
    if (isCancelling) return 'Cancelling...';
    return 'Cancel';
}
```

**3. Update components to use helpers**

### REFACTOR Phase

- Ensure helpers are exported from feature index files if needed elsewhere
- Verify no duplication with existing helpers (check `wizardHelpers.ts` patterns)

## Expected Outcome

- 3 nested ternary violations eliminated
- Explicit if/else logic improves readability
- Pattern aligns with SOP Section 3 examples

## Acceptance Criteria

- [ ] All tests passing
- [ ] No nested ternaries in modified lines
- [ ] Helpers follow naming convention (`get*` for returning values)
- [ ] Code follows existing helper patterns in codebase

## Estimated Time

30 minutes
