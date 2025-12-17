# Step 1: Remove Unused Type Guards ✅ COMPLETE

**Purpose:** Remove 11 unused type guard helpers from `src/types/typeGuards.ts` and their associated tests

**Status:** Completed 2025-11-30

**Prerequisites:**

- [x] Verified no consumers exist via grep search
- [x] All tests currently pass (`npm run test:fast`)

**Results:**
- 11 helpers removed + ValidationResult interface
- 4 test files deleted, 2 test files modified
- ~400 lines removed (source + tests)
- All 3845 remaining tests pass

---

## Tests to Write First (RED Phase)

For removal tasks, the "RED" phase is verification that removal is safe:

- [ ] **Verification Test:** Grep search confirms zero consumers for each helper
  - **Given:** Codebase with potentially unused helpers
  - **When:** Grep search executed for each helper name
  - **Then:** Only definition site found (in typeGuards.ts), no call sites in src/
  - **Command:** `grep -r "helperName(" src/ --include="*.ts" --include="*.tsx" | grep -v "typeGuards.ts"`

---

## Helpers to Remove (11 total)

### 1. `isProject()` (lines 28-44)

```typescript
// REMOVE: Function and JSDoc
/**
 * isProject - Type guard for Project
 */
export function isProject(value: unknown): value is Project {
    // ... implementation
}
```

### 2. `isComponentInstance()` (lines 46-60)

```typescript
// REMOVE: Function and JSDoc
/**
 * isComponentInstance - Type guard for ComponentInstance
 */
export function isComponentInstance(value: unknown): value is ComponentInstance {
    // ... implementation
}
```

### 3. `isProcessInfo()` (lines 62-78)

```typescript
// REMOVE: Function and JSDoc
/**
 * isProcessInfo - Type guard for ProcessInfo
 */
export function isProcessInfo(value: unknown): value is ProcessInfo {
    // ... implementation
}
```

### 4. `isComponentStatus()` (lines 80-99)

```typescript
// REMOVE: Function and JSDoc
/**
 * isComponentStatus - Type guard for ComponentStatus
 */
export function isComponentStatus(value: unknown): value is ComponentStatus {
    // ... implementation
}
```

### 5. `isProjectStatus()` (lines 101-116)

```typescript
// REMOVE: Function and JSDoc
/**
 * isProjectStatus - Type guard for ProjectStatus
 */
export function isProjectStatus(value: unknown): value is ProjectStatus {
    // ... implementation
}
```

### 6. `isValidationResult()` (lines 118-132)

```typescript
// REMOVE: Function, JSDoc, AND the ValidationResult interface (lines 19-26)
/**
 * isValidationResult - Type guard for ValidationResult
 */
export function isValidationResult(value: unknown): value is ValidationResult {
    // ... implementation
}
```

### 7. `isMessageResponse()` (lines 134-144)

```typescript
// REMOVE: Function and JSDoc
/**
 * isMessageResponse - Type guard for MessageResponse
 */
export function isMessageResponse(value: unknown): value is MessageResponse {
    // ... implementation
}
```

### 8. `isLogger()` (lines 146-161)

```typescript
// REMOVE: Function and JSDoc
/**
 * isLogger - Type guard for Logger interface
 */
export function isLogger(value: unknown): value is Logger {
    // ... implementation
}
```

### 9. `isStateValue()` (lines 163-179)

```typescript
// REMOVE: Function and JSDoc
/**
 * isStateValue - Type guard for StateValue
 */
export function isStateValue(value: unknown): value is StateValue {
    // ... implementation
}
```

### 10. `assertNever()` (lines 205-220)

```typescript
// REMOVE: Function and JSDoc
/**
 * assertNever - Exhaustiveness checking for discriminated unions
 * ...
 */
export function assertNever(value: never): never {
    // ... implementation
}
```

### 11. `getInstanceEntriesFromRecord()` (lines 332-350)

```typescript
// REMOVE: Function and JSDoc
/**
 * Get component instance entries from a record
 * ...
 */
export function getInstanceEntriesFromRecord(
    componentInstances: Record<string, ComponentInstance> | undefined | null,
): Array<[string, ComponentInstance]> {
    // ... implementation
}
```

---

## Also Remove: Unused Imports

After removing the helpers, clean up unused imports at the top of the file:

```typescript
// POTENTIALLY REMOVE if no longer used:
import { Logger } from './logger';
import { MessageResponse } from './messages';
import { StateValue } from './state';
```

**Verification:** After removal, check if these imports are used by remaining code.

---

## Also Remove: ValidationResult Interface

The `ValidationResult` interface (lines 19-26) is only used by the `isValidationResult` type guard being removed:

```typescript
// REMOVE: Interface
/**
 * ValidationResult - Represents validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
```

---

## Test Files to Update

### 1. `tests/types/typeGuards-domain-models.test.ts`

**Remove entire file** - tests isProject, isComponentInstance, isProcessInfo which are all being removed.

### 2. `tests/types/typeGuards-domain-validation.test.ts`

**Remove entire file** - tests isValidationResult, isMessageResponse, isLogger which are all being removed.

### 3. `tests/types/typeGuards-domain-status.test.ts`

**Remove entire file** - tests isComponentStatus, isProjectStatus which are all being removed.

### 4. `tests/types/typeGuards-utility-errors.test.ts`

**Remove assertNever tests only** - keep other tests if any exist.

### 5. `tests/types/typeGuards-utility-parsing.test.ts`

**Remove isStateValue tests only** - keep parseJSON and other tests.

---

## Implementation Details

### RED Phase (Verification)

Run grep verification for each helper:

```bash
# Verify no consumers (should return empty or only definition)
grep -r "isProject(" src/ --include="*.ts" --include="*.tsx" | grep -v "typeGuards.ts" | grep -v ".test.ts"
grep -r "isComponentInstance(" src/ --include="*.ts" --include="*.tsx" | grep -v "typeGuards.ts" | grep -v ".test.ts"
# ... repeat for all 11 helpers
```

### GREEN Phase (Implementation)

1. Remove helpers from `src/types/typeGuards.ts` in order (top to bottom)
2. Remove `ValidationResult` interface
3. Clean up unused imports (Logger, MessageResponse, StateValue)
4. Run TypeScript compile: `npm run compile:typescript`
5. Delete test files that test only removed helpers
6. Update test files that test both removed and kept helpers
7. Run test suite: `npm run test:fast`

### REFACTOR Phase

1. Verify remaining code in typeGuards.ts is properly organized
2. Ensure exports are still correct
3. Run final compile and test

---

## Expected Outcome

- `src/types/typeGuards.ts` reduced by ~117 lines
- Test files reduced by ~250 lines
- All remaining tests pass
- TypeScript compiles without errors
- No orphaned imports/exports

---

## Acceptance Criteria

- [ ] All 11 helpers removed from typeGuards.ts
- [ ] ValidationResult interface removed
- [ ] Unused imports cleaned up
- [ ] Test files updated/removed appropriately
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] No console.log or debugger statements

**Estimated Time:** 45 minutes

---

## Rollback Plan

If any issues discovered:

```bash
git checkout -- src/types/typeGuards.ts tests/types/
```

All changes in this step are in two directories, making rollback simple.
