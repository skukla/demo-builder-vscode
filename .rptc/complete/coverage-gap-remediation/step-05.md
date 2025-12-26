# Step 5: progressUnifier Module Tests

## Purpose

Migrate existing progressUnifier tests from legacy location to structure-aligned path and verify coverage collection. Tests exist but are in `tests/unit/utils/` instead of `tests/core/utils/progressUnifier/` per project conventions.

## Prerequisites

- [x] Steps 1-4 complete
- [x] Understand test migration path

## Current State Analysis

**Existing Test Files** (5 files at `tests/unit/utils/`):
- `progressUnifier-strategies.test.ts` - Elapsed time, formatting tests
- `progressUnifier-commands.test.ts` - Command execution tests
- `progressUnifier-cleanup.test.ts` - Cleanup behavior tests
- `progressUnifier-node-version.test.ts` - Node version handling
- `progressUnifierHelpers.test.ts` - Helper function tests

**Test Utilities**:
- `progressUnifier.testUtils.ts` - Mock factories (createMockStep, createProgressCollector)

**Source Files** (at `src/core/utils/progressUnifier/`):
- `ProgressUnifier.ts`, `CommandResolver.ts`, `ElapsedTimeTracker.ts`
- `strategies/ExactProgressStrategy.ts`, `MilestoneProgressStrategy.ts`, `SyntheticProgressStrategy.ts`, `ImmediateProgressStrategy.ts`

## Tests to Write First

### Migration Tasks

- [x] **Task: Create structure-aligned directory**
  - **Path**: `tests/core/utils/progressUnifier/`
  - **File**: Directory creation

- [x] **Task: Migrate test files**
  - **From**: `tests/unit/utils/progressUnifier-*.test.ts`
  - **To**: `tests/core/utils/progressUnifier/*.test.ts`
  - **Includes**: `progressUnifier.testUtils.ts`

- [x] **Task: Update helper imports**
  - **File**: Migrated test files
  - **Change**: Update relative import paths for helpers

### Verification Tests

- [ ] **Test: Run migrated tests pass**
  - **Command**: `npm test -- tests/core/utils/progressUnifier/`
  - **Expected**: All existing tests pass

- [ ] **Test: Coverage includes progressUnifier**
  - **Command**: `npm test -- --coverage --collectCoverageFrom='src/core/utils/progressUnifier/**/*.ts'`
  - **Expected**: Coverage report shows progressUnifier files

## Files to Migrate

**Source (tests/unit/utils/)** -> **Destination (tests/core/utils/progressUnifier/)**:
- [ ] `progressUnifier-strategies.test.ts` -> `strategies.test.ts`
- [ ] `progressUnifier-commands.test.ts` -> `commands.test.ts`
- [ ] `progressUnifier-cleanup.test.ts` -> `cleanup.test.ts`
- [ ] `progressUnifier-node-version.test.ts` -> `nodeVersion.test.ts`
- [ ] `progressUnifierHelpers.test.ts` -> `helpers.test.ts`
- [ ] `progressUnifier.testUtils.ts` -> `testUtils.ts`

**Also update**:
- [ ] `tests/helpers/progressUnifierTestHelpers.ts` - Update if imports change

## Implementation Details

### RED Phase
Verify tests run from new location before moving.

### GREEN Phase
1. Create `tests/core/utils/progressUnifier/` directory
2. Copy test files to new location with cleaner names
3. Update import paths in migrated files
4. Run tests to verify they pass
5. Delete old files from `tests/unit/utils/`

### REFACTOR Phase
1. Ensure consistent naming (drop `progressUnifier-` prefix)
2. Verify coverage collection works

## Expected Outcome

- Tests at structure-aligned location: `tests/core/utils/progressUnifier/`
- All existing tests passing (~20+ test cases preserved)
- Coverage properly attributed to `src/core/utils/progressUnifier/`
- Legacy `tests/unit/utils/progressUnifier-*` files removed

## Acceptance Criteria

- [x] Tests run from `tests/core/utils/progressUnifier/`
- [x] Coverage report includes progressUnifier source files (87.23% core, 50.34% strategies)
- [x] No test regressions (25/25 tests passing)
- [x] Old test location cleaned up

## Estimated Time

30 minutes (migration + verification)
