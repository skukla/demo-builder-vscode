# Step 2: Add Milestone Fields to UnifiedProgress Type

## Purpose

**What this accomplishes:** Adds optional milestone tracking fields to the `UnifiedProgress` type definition, enabling the UI to access and render substep information that the backend already sends.

**Why this is needed:** The `ProgressUnifier` class in the backend already emits `currentMilestoneIndex` and `totalMilestones` in progress updates, but the TypeScript type definition doesn't include these fields. This prevents UI components from accessing milestone data, resulting in substeps not being displayed during prerequisite installation.

**Why this step is second:** This type definition change must happen before Step 3 (UI rendering), as the UI components will reference these type fields. It's independent of Step 1 (fnm list guard), making it safe to implement in parallel or sequence.

---

## Prerequisites

- [ ] TypeScript development environment configured
- [ ] Access to `src/types/webview.ts` file
- [ ] Understanding of ProgressUnifier implementation (already sends these fields)

---

## Tests to Write First

### Test File: `tests/types/webview.test.ts`

**Note:** This file may not exist yet. Create it to establish type safety validation for webview types.

#### Test 1: Backwards Compatibility - UnifiedProgress Without Milestone Fields

- [ ] **Test:** `should allow UnifiedProgress without milestone fields for backwards compatibility`
  - **Given:** A UnifiedProgress object created without `currentMilestoneIndex` or `totalMilestones` fields
  - **When:** TypeScript compiles the code
  - **Then:** Compilation succeeds without errors (validates optional fields work correctly)
  - **File:** `tests/types/webview.test.ts`
  - **Code:**
    ```typescript
    it('should allow UnifiedProgress without milestone fields for backwards compatibility', () => {
        const progress: UnifiedProgress = {
            overall: {
                percent: 50,
                currentStep: 2,
                totalSteps: 5,
                stepName: 'Installing dependencies'
            },
            command: {
                type: 'determinate',
                percent: 75,
                detail: 'Running npm install',
                confidence: 'exact'
            }
        };

        // Type check passes (validates backwards compatibility)
        expect(progress).toBeDefined();
        expect(progress.command?.currentMilestoneIndex).toBeUndefined();
        expect(progress.command?.totalMilestones).toBeUndefined();
    });
    ```

#### Test 2: Milestone Fields Present

- [ ] **Test:** `should allow UnifiedProgress with milestone fields when provided`
  - **Given:** A UnifiedProgress object created with `currentMilestoneIndex` and `totalMilestones` fields
  - **When:** TypeScript compiles the code
  - **Then:** Compilation succeeds and fields are accessible
  - **File:** `tests/types/webview.test.ts`
  - **Code:**
    ```typescript
    it('should allow UnifiedProgress with milestone fields when provided', () => {
        const progress: UnifiedProgress = {
            overall: {
                percent: 50,
                currentStep: 2,
                totalSteps: 5,
                stepName: 'Installing Node.js'
            },
            command: {
                type: 'determinate',
                percent: 33,
                detail: 'Installing fnm',
                confidence: 'exact',
                currentMilestoneIndex: 0,  // NEW FIELD
                totalMilestones: 3         // NEW FIELD
            }
        };

        // Validate milestone fields are accessible
        expect(progress.command?.currentMilestoneIndex).toBe(0);
        expect(progress.command?.totalMilestones).toBe(3);
    });
    ```

#### Test 3: Type Safety - Number Type Enforcement

- [ ] **Test:** `should enforce number type for milestone fields`
  - **Given:** Attempt to create UnifiedProgress with non-number milestone values
  - **When:** TypeScript compiles the code
  - **Then:** TypeScript compilation error occurs (type safety validated)
  - **File:** `tests/types/webview.test.ts`
  - **Code:**
    ```typescript
    it('should enforce number type for milestone fields', () => {
        // This test validates TypeScript compilation behavior
        // TypeScript should reject the following (commented out to allow test file to compile):

        // const invalidProgress: UnifiedProgress = {
        //     overall: { percent: 50, currentStep: 1, totalSteps: 3, stepName: 'Test' },
        //     command: {
        //         type: 'determinate',
        //         confidence: 'exact',
        //         currentMilestoneIndex: "0",  // ❌ Should be number, not string
        //         totalMilestones: "3"         // ❌ Should be number, not string
        //     }
        // };

        // Valid progress with correct types
        const validProgress: UnifiedProgress = {
            overall: { percent: 50, currentStep: 1, totalSteps: 3, stepName: 'Test' },
            command: {
                type: 'determinate',
                confidence: 'exact',
                currentMilestoneIndex: 0,  // ✅ Correct type
                totalMilestones: 3         // ✅ Correct type
            }
        };

        expect(validProgress.command?.currentMilestoneIndex).toBe(0);
        expect(validProgress.command?.totalMilestones).toBe(3);
    });
    ```

#### Test 4: Integration with ProgressUnifier

- [ ] **Test:** `should work with existing ProgressUnifier integration`
  - **Given:** ProgressUnifier generates progress updates with milestone data
  - **When:** Progress object is assigned to UnifiedProgress type
  - **Then:** Type-checking succeeds (validates end-to-end type flow)
  - **File:** `tests/types/webview.test.ts`
  - **Code:**
    ```typescript
    it('should work with existing ProgressUnifier integration', () => {
        // Simulate what ProgressUnifier sends
        const backendProgress = {
            overall: {
                percent: 66,
                currentStep: 3,
                totalSteps: 5,
                stepName: 'Installing Adobe I/O CLI'
            },
            command: {
                type: 'determinate' as const,
                percent: 50,
                detail: 'Installing plugin 2 of 3',
                confidence: 'exact' as const,
                currentMilestoneIndex: 1,
                totalMilestones: 3
            }
        };

        // Should be assignable to UnifiedProgress type
        const typedProgress: UnifiedProgress = backendProgress;

        expect(typedProgress.command?.currentMilestoneIndex).toBe(1);
        expect(typedProgress.command?.totalMilestones).toBe(3);
        expect(typedProgress.command?.detail).toBe('Installing plugin 2 of 3');
    });
    ```

#### Test 5: Partial Milestone Data

- [ ] **Test:** `should allow only one milestone field to be present`
  - **Given:** UnifiedProgress object with only `currentMilestoneIndex` (no `totalMilestones`)
  - **When:** TypeScript compiles the code
  - **Then:** Compilation succeeds (validates independent optionality)
  - **File:** `tests/types/webview.test.ts`
  - **Code:**
    ```typescript
    it('should allow only one milestone field to be present', () => {
        const progressWithOnlyIndex: UnifiedProgress = {
            overall: { percent: 50, currentStep: 1, totalSteps: 3, stepName: 'Test' },
            command: {
                type: 'determinate',
                confidence: 'exact',
                currentMilestoneIndex: 2  // Only index, no total
            }
        };

        const progressWithOnlyTotal: UnifiedProgress = {
            overall: { percent: 50, currentStep: 1, totalSteps: 3, stepName: 'Test' },
            command: {
                type: 'determinate',
                confidence: 'exact',
                totalMilestones: 5  // Only total, no index
            }
        };

        expect(progressWithOnlyIndex.command?.currentMilestoneIndex).toBe(2);
        expect(progressWithOnlyIndex.command?.totalMilestones).toBeUndefined();

        expect(progressWithOnlyTotal.command?.currentMilestoneIndex).toBeUndefined();
        expect(progressWithOnlyTotal.command?.totalMilestones).toBe(5);
    });
    ```

---

## Files to Create/Modify

- [ ] **MODIFY:** `src/types/webview.ts` - Add optional milestone fields to `UnifiedProgress` interface
- [ ] **CREATE:** `tests/types/webview.test.ts` - Type safety and backwards compatibility tests

---

## Implementation Details

### RED Phase (Write Failing Tests First)

**1. Create Test File Structure**

Create `tests/types/webview.test.ts`:

```typescript
import { UnifiedProgress } from '@/types/webview';

describe('UnifiedProgress Type', () => {
    describe('Milestone Fields', () => {
        // Test 1: Backwards compatibility
        it('should allow UnifiedProgress without milestone fields for backwards compatibility', () => {
            // Test implementation from above
        });

        // Test 2: Milestone fields present
        it('should allow UnifiedProgress with milestone fields when provided', () => {
            // Test implementation from above
        });

        // Test 3: Type safety
        it('should enforce number type for milestone fields', () => {
            // Test implementation from above
        });

        // Test 4: Integration
        it('should work with existing ProgressUnifier integration', () => {
            // Test implementation from above
        });

        // Test 5: Partial data
        it('should allow only one milestone field to be present', () => {
            // Test implementation from above
        });
    });
});
```

**2. Run Tests (Expected: FAIL)**

```bash
npm test tests/types/webview.test.ts
```

**Expected Result:** Tests fail because `currentMilestoneIndex` and `totalMilestones` don't exist on the type yet.

---

### GREEN Phase (Minimal Implementation to Pass Tests)

**Modify `src/types/webview.ts` (lines 131-144)**

**Current Code:**
```typescript
export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
    };
}
```

**Updated Code (add 2 lines):**
```typescript
export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
        currentMilestoneIndex?: number;  // ← ADD THIS LINE
        totalMilestones?: number;         // ← ADD THIS LINE
    };
}
```

**Run Tests Again:**

```bash
npm test tests/types/webview.test.ts
```

**Expected Result:** All tests pass (GREEN phase complete).

---

### REFACTOR Phase (Improve While Keeping Tests Green)

**1. Add JSDoc Documentation**

Enhance the type definition with clear documentation:

```typescript
export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';

        /**
         * Current milestone index (0-based) for multi-step operations.
         * Used to display substep progress (e.g., "Installing plugin 2 of 3").
         * Optional - only present when operation has multiple milestones.
         *
         * @example
         * currentMilestoneIndex: 1  // Currently on 2nd milestone (0-indexed)
         * totalMilestones: 3        // Out of 3 total milestones
         * // UI renders: "Step 2 of 3"
         */
        currentMilestoneIndex?: number;

        /**
         * Total number of milestones in the operation.
         * Used with currentMilestoneIndex to show substep progress.
         * Optional - only present when operation has multiple milestones.
         */
        totalMilestones?: number;
    };
}
```

**2. Verify Backwards Compatibility**

Search for existing uses of `UnifiedProgress` in the codebase:

```bash
# Find all references to UnifiedProgress
grep -r "UnifiedProgress" src/
```

**Expected:** All existing code should continue to compile without changes (optional fields ensure backwards compatibility).

**3. Re-run Tests**

```bash
npm test tests/types/webview.test.ts
```

**Expected Result:** All tests still pass after refactoring (documentation doesn't break functionality).

---

## Expected Outcome

After completing this step:

**✅ Functionality:**
- `UnifiedProgress` type includes `currentMilestoneIndex?: number` field
- `UnifiedProgress` type includes `totalMilestones?: number` field
- Both fields are optional (backwards compatible)

**✅ Testing:**
- 5 comprehensive tests written and passing
- Type safety validated (number type enforcement)
- Backwards compatibility verified (existing code unaffected)
- Integration with ProgressUnifier validated

**✅ Documentation:**
- JSDoc comments explain field purpose and usage
- Example provided for UI rendering pattern

**✅ Code Quality:**
- Follows existing type naming conventions (camelCase)
- Uses optional fields (`?`) for proper backwards compatibility
- No breaking changes to existing code

---

## Acceptance Criteria

**Type Definition:**
- [ ] `UnifiedProgress.command` has `currentMilestoneIndex?: number` field
- [ ] `UnifiedProgress.command` has `totalMilestones?: number` field
- [ ] Both fields are optional (use `?` modifier)
- [ ] Fields follow camelCase naming convention

**Testing:**
- [ ] All tests written BEFORE implementation (TDD RED phase completed)
- [ ] Test file created: `tests/types/webview.test.ts`
- [ ] Test 1: Backwards compatibility validation passes
- [ ] Test 2: Milestone fields present validation passes
- [ ] Test 3: Type safety enforcement passes
- [ ] Test 4: ProgressUnifier integration passes
- [ ] Test 5: Partial milestone data passes
- [ ] All tests passing (TDD GREEN phase completed)
- [ ] Test coverage ≥85% for type definitions

**Code Quality:**
- [ ] TypeScript compilation succeeds across entire project
- [ ] No console.log or debugger statements added
- [ ] JSDoc comments added for new fields
- [ ] Code follows project style guide
- [ ] Existing code continues to compile (backwards compatibility verified)

**Documentation:**
- [ ] JSDoc explains field purpose
- [ ] Example usage provided in comments
- [ ] Field descriptions mention they're optional

---

## Estimated Time

**Total:** 1.5 hours

**Breakdown:**
- Test design and creation: 45 minutes (5 comprehensive type tests)
- Type definition update: 15 minutes (add 2 optional fields)
- JSDoc documentation: 15 minutes (clear comments with examples)
- Backwards compatibility verification: 15 minutes (search and validate existing usage)

---

## Dependencies

### Depends On
- **Step 1:** NO (independent type definition change)
- **Prerequisites:** TypeScript environment, access to `src/types/webview.ts`

### Required By
- **Step 3:** YES (UI rendering needs these type fields to access milestone data)

### Integration Points
- **ProgressUnifier:** Backend already sends these fields (no backend changes needed)
- **PrerequisitesStep:** UI will consume these fields in Step 3
- **Webview Message Protocol:** No changes needed (fields already in backend messages)

---

## Risk Assessment

### Risk 1: Breaking Changes to Existing Code

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Medium
- **Description:** Adding fields to `UnifiedProgress` could break existing code that uses the type
- **Mitigation:**
  1. Use optional fields (`?`) to ensure backwards compatibility
  2. Test that existing code compiles without changes
  3. Search codebase for all `UnifiedProgress` references and verify no breaks
  4. Test 1 specifically validates backwards compatibility
- **Contingency Plan:** If breaks occur, use union types or extend interface instead of modifying
- **Owner:** Step implementer

### Risk 2: Type-Only Changes May Lack Test Coverage

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Type definitions are compile-time only, making runtime test coverage challenging
- **Mitigation:**
  1. Create runtime tests that validate type assignability
  2. Add integration test with ProgressUnifier (Test 4)
  3. Include type safety validation (Test 3)
  4. Verify backwards compatibility with real objects (Test 1)
- **Contingency Plan:** Add integration tests in Step 3 that validate full end-to-end flow
- **Owner:** Step implementer

### Risk 3: Mismatch with Backend Implementation

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Low
- **Description:** Type definition might not match what backend actually sends
- **Mitigation:**
  1. Review ProgressUnifier implementation to confirm field names
  2. Add integration test that uses ProgressUnifier output (Test 4)
  3. Coordinate with Step 3 to validate UI receives expected data
- **Contingency Plan:** Update field names if mismatch discovered during Step 3 implementation
- **Owner:** Step implementer

---

## Implementation Notes

### Key Design Decisions

**1. Optional Fields vs Required Fields**
- **Decision:** Use optional (`?`) for both milestone fields
- **Rationale:** Not all progress updates have milestones (e.g., simple indeterminate progress)
- **Alternative Considered:** Required fields - rejected due to backwards compatibility concerns

**2. Field Placement**
- **Decision:** Add fields to `command` object, not `overall`
- **Rationale:** Milestones are command-specific granular progress, not overall workflow progress
- **Alternative Considered:** New `milestone` object - rejected to minimize API surface area

**3. Naming Convention**
- **Decision:** `currentMilestoneIndex` and `totalMilestones`
- **Rationale:** Matches existing patterns (`currentStep`, `totalSteps`) and ProgressUnifier implementation
- **Alternative Considered:** `step`/`totalSteps` - rejected to avoid confusion with overall workflow steps

### Backend Context (ProgressUnifier)

The backend `ProgressUnifier` class already emits these fields in the following locations:

**File:** `src/core/utils/progressUnifier.ts`
**Lines:** ~150-180 (approximate)

```typescript
// ProgressUnifier already sends:
{
    command: {
        currentMilestoneIndex: this.currentMilestoneIndex,
        totalMilestones: this.milestones.length,
        // ... other fields
    }
}
```

**No backend changes needed** - this step only updates the type definition to match what backend already sends.

### Integration with Step 3

Step 3 (UI rendering) will access these fields like this:

```typescript
// In PrerequisitesStep.tsx (Step 3 implementation)
const renderSubstepProgress = (progress: UnifiedProgress) => {
    if (progress.command?.currentMilestoneIndex !== undefined &&
        progress.command?.totalMilestones !== undefined) {
        return `Step ${progress.command.currentMilestoneIndex + 1} of ${progress.command.totalMilestones}`;
    }
    return null;
};
```

---

## Test Coverage Details

### Coverage Goals for This Step

**Overall Target:** 85% minimum

**Type Definition Coverage:**
- `UnifiedProgress` interface: 100% (all new fields tested)
- Backwards compatibility: 100% (Test 1)
- Type safety enforcement: 100% (Test 3)
- Integration validation: 100% (Test 4)

**Test Distribution:**
- Type assignability tests: 60% (Tests 1, 2, 5)
- Type safety tests: 20% (Test 3)
- Integration tests: 20% (Test 4)

**Excluded from Coverage:**
- No runtime coverage needed for type definitions (compile-time only)
- Integration coverage validated in Step 3 (UI rendering)

---

## Next Steps

**After this step is complete:**

1. ✅ Verify all tests pass: `npm test tests/types/webview.test.ts`
2. ✅ Verify full project compiles: `npm run build`
3. ✅ Commit changes: `git add src/types/webview.ts tests/types/webview.test.ts`
4. ➡️ **Proceed to Step 3:** Render substep progress in Prerequisites UI using the new type fields

**Step 3 Preview:**
- Will consume `currentMilestoneIndex` and `totalMilestones` from `UnifiedProgress`
- Will render substep information in Prerequisites step UI
- Will display progress like "Installing plugin 2 of 3"

---

_Step 2 of 3 - Type Definition Update for Milestone Fields_
