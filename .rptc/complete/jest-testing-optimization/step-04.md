# Step 4: Large Test File Splitting

**Status:** Pending
**Effort:** Medium (4-6 hours)
**Impact:** Medium (30-40% memory reduction, improved maintainability)
**Dependencies:** Steps 1-3 complete (stable infrastructure)

---

## Objective

Split the 6 largest test files (>600 lines) into smaller, focused files following the existing test file splitting playbook.

**Expected Outcome:**
- All 6 target files split to <400 lines each
- Shared utilities extracted to .testUtils.ts files
- Improved memory efficiency (30-40% reduction per file)
- Better test organization and maintainability

---

## Target Files

Based on line count analysis:

| # | File | Lines | Location |
|---|------|-------|----------|
| 1 | debugLogger.test.ts | 771 | tests/core/logging/ |
| 2 | checkHandler-refactored.test.ts | 689 | tests/features/mesh/handlers/ |
| 3 | transientStateManager.test.ts | 646 | tests/core/state/ |
| 4 | useSelectionStep.test.tsx | 619 | tests/features/authentication/ui/hooks/ |
| 5 | createHandler-refactored.test.ts | 617 | tests/features/mesh/handlers/ |
| 6 | envFileWatcherService.mocked.test.ts | 609 | tests/core/vscode/ |

**Note:** ProjectDashboardScreen.test.tsx (520 lines) is at threshold but under 600. Monitor only.

---

## Test Strategy

### Verification Approach

For each split file:
1. Create .testUtils.ts first (shared utilities)
2. Split into logical groupings
3. Verify each split file passes independently
4. Verify total test count unchanged
5. Run full suite to confirm no regressions

### Happy Path Tests

- [ ] **Test:** Split files pass individually
  - **Given:** Original file split into N smaller files
  - **When:** Running `npx jest tests/path/to/split-file-*.test.ts`
  - **Then:** All tests in split files pass
  - **File:** Each split file

- [ ] **Test:** Test count unchanged after split
  - **Given:** Original file had X tests
  - **When:** Running tests on all split files
  - **Then:** Total test count equals X
  - **File:** N/A (validation)

- [ ] **Test:** Coverage maintained after split
  - **Given:** Original file coverage was Y%
  - **When:** Running coverage on split files
  - **Then:** Combined coverage >= Y%
  - **File:** N/A (validation)

### Edge Case Tests

- [ ] **Test:** Shared mocks work across split files
  - **Given:** Mocks extracted to .testUtils.ts
  - **When:** Multiple split files import same mock
  - **Then:** Mocks function correctly in all files
  - **File:** .testUtils.ts

### Error Condition Tests

- [ ] **Test:** Missing utility import fails clearly
  - **Given:** Split file missing required import
  - **When:** Running test
  - **Then:** Clear error about undefined mock/utility
  - **File:** N/A (validation)

---

## Prerequisites

- [ ] Steps 1-3 complete (infrastructure stable)
- [ ] Familiar with test file splitting playbook (`docs/testing/test-file-splitting-playbook.md`)
- [ ] Current test suite passing

---

## Implementation Details

### Approach Per File

Follow this pattern for EACH of the 6 files:

#### Phase 1: Analysis

1. Open the target file
2. Identify natural groupings:
   - By feature area (e.g., init, update, error)
   - By test type (happy path, edge cases, errors)
   - By related functionality

3. List shared dependencies:
   - Mocks and mock factories
   - Setup/teardown functions
   - Test fixtures and constants

#### Phase 2: Extract Utilities

Create `[filename].testUtils.ts`:

```typescript
/**
 * Shared test utilities for [Component] tests
 */

// Mocks
jest.mock('vscode');
jest.mock('dependency');

// Types
export interface TestMocks {
  mockA: jest.Mocked<TypeA>;
  mockB: jest.Mocked<TypeB>;
}

// Factory functions
export function createMockEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'mock-id',
    ...overrides
  };
}

// Setup function
export function setupMocks(): TestMocks {
  jest.clearAllMocks();
  // Setup logic
  return { mockA, mockB };
}
```

#### Phase 3: Split Files

Create focused test files:
- `[component]-[group1].test.ts`
- `[component]-[group2].test.ts`
- etc.

Each file:
- Imports from .testUtils.ts
- Contains 100-300 lines
- Tests single responsibility
- Has own describe block

#### Phase 4: Validate

```bash
# Test individual split files
npx jest tests/path/to/[component]-*.test.ts

# Verify test count
npx jest tests/path/to/[component]-*.test.ts --json | jq '.numTotalTests'

# Check coverage
npx jest tests/path/to/[component]-*.test.ts --coverage
```

---

## Detailed Plans Per File

### File 1: debugLogger.test.ts (771 lines)

**Location:** `tests/core/logging/debugLogger.test.ts`

**Suggested Split:**
- `debugLogger.testUtils.ts` - Mock setup, factories
- `debugLogger-initialization.test.ts` - Logger initialization tests
- `debugLogger-formatting.test.ts` - Log formatting tests
- `debugLogger-levels.test.ts` - Log level tests
- `debugLogger-channels.test.ts` - Output channel tests
- `debugLogger-edge-cases.test.ts` - Edge cases and errors

**Expected Result:** 6 files, ~130 lines each

---

### File 2: checkHandler-refactored.test.ts (689 lines)

**Location:** `tests/features/mesh/handlers/checkHandler-refactored.test.ts`

**Suggested Split:**
- `checkHandler.testUtils.ts` - Mesh mock setup
- `checkHandler-status.test.ts` - Status check tests
- `checkHandler-staleness.test.ts` - Staleness detection tests
- `checkHandler-deployment.test.ts` - Deployment state tests
- `checkHandler-errors.test.ts` - Error handling tests

**Expected Result:** 5 files, ~140 lines each

---

### File 3: transientStateManager.test.ts (646 lines)

**Location:** `tests/core/state/transientStateManager.test.ts`

**Suggested Split:**
- `transientStateManager.testUtils.ts` - State mock setup
- `transientStateManager-lifecycle.test.ts` - State lifecycle tests
- `transientStateManager-persistence.test.ts` - Persistence tests
- `transientStateManager-events.test.ts` - Event handling tests
- `transientStateManager-edge-cases.test.ts` - Edge cases

**Expected Result:** 5 files, ~130 lines each

---

### File 4: useSelectionStep.test.tsx (619 lines)

**Location:** `tests/features/authentication/ui/hooks/useSelectionStep.test.tsx`

**Suggested Split:**
- `useSelectionStep.testUtils.tsx` - React hook mock setup
- `useSelectionStep-initialization.test.tsx` - Hook initialization
- `useSelectionStep-selection.test.tsx` - Selection handling
- `useSelectionStep-navigation.test.tsx` - Navigation behavior
- `useSelectionStep-errors.test.tsx` - Error states

**Expected Result:** 5 files, ~125 lines each

---

### File 5: createHandler-refactored.test.ts (617 lines)

**Location:** `tests/features/mesh/handlers/createHandler-refactored.test.ts`

**Suggested Split:**
- `createHandler.testUtils.ts` - Mesh creation mocks
- `createHandler-creation.test.ts` - Mesh creation tests
- `createHandler-validation.test.ts` - Input validation tests
- `createHandler-integration.test.ts` - Integration tests
- `createHandler-errors.test.ts` - Error handling

**Expected Result:** 5 files, ~125 lines each

---

### File 6: envFileWatcherService.mocked.test.ts (609 lines)

**Location:** `tests/core/vscode/envFileWatcherService.mocked.test.ts`

**Suggested Split:**
- `envFileWatcherService.testUtils.ts` - File system mocks
- `envFileWatcherService-watching.test.ts` - File watching tests
- `envFileWatcherService-changes.test.ts` - Change detection tests
- `envFileWatcherService-notifications.test.ts` - Notification tests
- `envFileWatcherService-cleanup.test.ts` - Cleanup/disposal tests

**Expected Result:** 5 files, ~120 lines each

---

## Files to Create/Modify

For each of the 6 target files:
- [ ] Create `[name].testUtils.ts`
- [ ] Create 4-5 split test files
- [ ] Delete or archive original file

**Total new files:** ~30 files (6 .testUtils + ~24 split files)

---

## Expected Outcome

After this step:
- No test files >400 lines in target locations
- Shared utilities centralized in .testUtils.ts files
- Same test count as before (no tests lost)
- Same or better coverage
- Memory usage improved 30-40% per split area

---

## Acceptance Criteria

- [ ] All 6 target files split
- [ ] No split file exceeds 400 lines
- [ ] .testUtils.ts created for each split group
- [ ] All tests pass after splitting
- [ ] Total test count unchanged
- [ ] Coverage maintained or improved
- [ ] No duplicate mocks across split files
- [ ] Original files deleted after successful split

---

## Rollback Plan

If issues arise:

1. **For individual file:**
   ```bash
   # Restore from git
   git checkout -- tests/path/to/original.test.ts
   rm tests/path/to/split-*.test.ts
   rm tests/path/to/original.testUtils.ts
   ```

2. **For complete rollback:**
   ```bash
   git checkout -- tests/
   ```

3. **Document issues:**
   - Which file caused problems
   - What pattern failed
   - Whether to adjust splitting approach

---

## Notes

### Order of Operations

Recommended split order:
1. debugLogger.test.ts (largest, most impact)
2. transientStateManager.test.ts (core infrastructure)
3. checkHandler-refactored.test.ts (mesh feature)
4. createHandler-refactored.test.ts (mesh feature - can share utils)
5. useSelectionStep.test.tsx (React hooks)
6. envFileWatcherService.mocked.test.ts (VS Code integration)

### Shared Utilities Between Mesh Files

Files 2 and 5 are both mesh handlers. Consider:
- Shared mesh mocks in a common utility file
- Or separate utilities if mocks differ significantly

### React Component Splits

File 4 (useSelectionStep.test.tsx) requires:
- React Testing Library setup in utilities
- Hook testing patterns (@testing-library/react-hooks patterns)
- Proper async testing for hooks

---

## Estimated Time

- Per file: 45-60 minutes
- 6 files total: 4.5-6 hours
- Allow extra time for first file (learning curve)

---

_Step 4 of 5 - Jest Testing Optimization_
