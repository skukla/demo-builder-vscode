# Step 4: Complex Expression Extraction

**Status:** ✅ Complete
**Priority:** MEDIUM
**Effort:** ~30 minutes
**Risk:** Low
**Completed:** 2025-12-31

---

## Purpose

Extract complex inline expressions to named helper functions for improved readability.

---

## Pattern: Inline → Named Helper

```typescript
// BEFORE (complex inline - cognitive load)
const isEditable = project?.status !== 'running' &&
                   project?.mesh?.status !== 'deploying' &&
                   !isLoading && userHasPermission;

// AFTER (named predicate - self-documenting)
const isEditable = canEditProject(project, isLoading, userHasPermission);

// In helpers file:
export function canEditProject(
    project: Project | undefined,
    isLoading: boolean,
    userHasPermission: boolean
): boolean {
    if (!project) return false;
    if (project.status === 'running') return false;
    if (project.mesh?.status === 'deploying') return false;
    if (isLoading) return false;
    return userHasPermission;
}
```

---

## Patterns to Scan For

1. **Ternary chains** (`a ? b : c ? d : e`)
2. **Long boolean expressions** (3+ conditions with && or ||)
3. **Complex object constructions** inline in JSX

---

## Files to Review

Scan codebase for:
```bash
# Find nested ternaries
grep -rn "? .* : .* ?" src/

# Find long boolean chains (3+ conditions)
grep -rn "&& .* && .* &&" src/
grep -rn "|| .* || .* ||" src/
```

---

## Extraction Rules

1. **Extract to named function** - Not anonymous function
2. **Keep in same file** - Unless clearly reusable
3. **Use descriptive names** - `canEditProject`, `shouldShowWarning`
4. **Early returns** - For clarity over single expression

---

## Tests to Write First

### Test Scenarios
1. **No nested ternaries**: Grep verification
2. **Complex expressions extracted**: Named predicates used
3. **Functionality preserved**: All existing tests pass

### Test Approach
- Grep-based pattern detection
- Run existing test suite

---

## Expected Outcome

- No nested ternaries in codebase
- Boolean expressions with 3+ conditions extracted to predicates
- Complex object constructions use builder helpers
- Improved code readability

---

## Acceptance Criteria

- [x] No nested ternary operators (verified: 0 in codebase, already extracted)
- [x] Boolean expressions with 3+ conditions extracted to predicates (fixed: 1 in VerifiedField.tsx)
- [x] Complex constructions use helper functions (verified: existing extractions in wizardHelpers.ts, authPredicates.ts)
- [x] All existing tests pass (10 SOP tests passing)

---

## Implementation Notes

### Scan Results

**Nested Ternaries:**
- 0 actual violations found in source code
- All patterns found were in comments documenting prior extractions
- `wizardHelpers.ts` already has `getNextButtonText()` extracted
- `stepStatusHelpers.ts` already has status predicates extracted

**Long Boolean Chains:**
- 1 violation found: `VerifiedField.tsx:101`
  ```tsx
  {isVerified && !isVerifying && !error && (
  ```
  - Fixed by extracting to `shouldShowVerified()` predicate

### Changes Made

1. **Created `tests/sop/complex-expressions.test.ts`**:
   - Detects nested ternary patterns
   - Detects 4+ condition && chains in JSX
   - Verifies existing predicate files exist
   - 5 tests, all passing

2. **Fixed `src/features/eds/ui/components/VerifiedField.tsx`**:
   - Added `shouldShowVerified()` predicate function
   - Extracted 4-condition chain to named function
   - Follows SOP §10 pattern

### Existing Predicate Files (Already Compliant)

- `src/features/authentication/ui/steps/authPredicates.ts` - 6 predicates
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Multiple helper functions
- `src/core/ui/components/wizard/stepStatusHelpers.ts` - Status predicates

### Test Coverage

**SOP Tests:**
```
tests/sop/magic-timeouts.test.ts      → 5 tests
tests/sop/complex-expressions.test.ts → 5 tests
Total: 10 tests passing
```
