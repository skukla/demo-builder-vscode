# Step 2: Remove Deprecated Tests and Clean Orphaned Utilities

## Purpose

Execute removal of stale tests identified in Step 1. This step removes deprecated tests, orphaned testUtils files, and resolves TODO/FIXME tests based on inventory decisions.

## Prerequisites

- [ ] Step 1 completed with inventory document
- [ ] Each removal candidate verified and documented
- [ ] Git branch created for cleanup work
- [ ] Test suite baseline recorded

## Tests to Write First

This step removes tests rather than adds them. Validation is through test suite execution.

- [ ] **Verification:** Pre-removal test suite passes
  - **Given:** Current test infrastructure with identified stale files
  - **When:** Full test suite is executed
  - **Then:** All tests pass, coverage baseline recorded
  - **Command:** `npm test -- --coverage`

- [ ] **Verification:** Post-removal test suite passes
  - **Given:** Stale files have been removed
  - **When:** Full test suite is executed
  - **Then:** All tests pass, coverage within 1% of baseline
  - **Command:** `npm test -- --coverage`

## Files to Remove

Based on preliminary analysis (to be confirmed by Step 1 inventory):

### Empty Directories

- [ ] `tests/unit/features/eds/ui/steps/` - Remove empty directory

### TODO/FIXME Tests (Requires Decision)

- [ ] `tests/features/prerequisites/npmFallback.test.ts`
  - **Current State:** Contains placeholder tests with `expect(true).toBe(true)`
  - **Options:**
    1. **Remove entirely:** Feature not implemented, tests provide no value
    2. **Convert to skip:** Mark as `.skip()` with documentation for future
    3. **Implement:** Complete the tests and implementation
  - **Recommended Action:** Remove entirely (placeholder tests with no implementation)
  - **Rationale:** Tests that always pass provide false confidence; better to have no test than a placeholder

### Orphaned testUtils (If Any Found in Step 1)

Document and remove any testUtils files with zero importers.

## Implementation Details

### RED Phase (Prepare for Removal)

1. Create git branch for cleanup:
   ```bash
   git checkout -b cleanup/test-audit-phase-7-stale-removal
   ```

2. Record baseline metrics:
   ```bash
   npm test -- --coverage 2>&1 | tee baseline-coverage.txt
   ```

3. Verify inventory from Step 1 is complete

### GREEN Phase (Execute Removal)

Execute removals in batches, running tests after each batch:

**Batch 1: Empty Directories**

```bash
# Remove empty directories
rmdir tests/unit/features/eds/ui/steps/
# Continue with other empty directories from inventory

# Verify tests still pass
npm test
```

**Batch 2: TODO/FIXME Placeholder Tests**

```bash
# Remove placeholder test file (after decision confirmation)
rm tests/features/prerequisites/npmFallback.test.ts

# Verify tests still pass
npm test
```

**Batch 3: Orphaned testUtils Files**

```bash
# For each orphaned file from inventory:
rm [path-to-orphaned-testUtils]

# Verify tests still pass after each removal
npm test
```

### REFACTOR Phase (Validate and Document)

1. Run full test suite with coverage:
   ```bash
   npm test -- --coverage 2>&1 | tee post-cleanup-coverage.txt
   ```

2. Compare coverage:
   ```bash
   diff baseline-coverage.txt post-cleanup-coverage.txt
   ```

3. Document any coverage changes and their causes

## Expected Outcome

- All identified stale files removed
- Test suite passes completely
- Coverage remains within 1% of baseline
- No broken imports in remaining tests
- Cleaner test directory structure

## Acceptance Criteria

- [ ] All empty directories from inventory removed
- [ ] All confirmed orphaned testUtils removed
- [ ] TODO/FIXME test decision executed (remove/keep/implement)
- [ ] Full test suite passes
- [ ] Coverage within 1% of baseline
- [ ] No TypeScript errors in remaining tests
- [ ] Git commit created with descriptive message

## Estimated Time

1 hour

---

## Detailed Removal Guide

### Removing Empty Directories

Empty directories serve no purpose in test infrastructure. Remove using:

```bash
# For each empty directory in inventory
rmdir [directory-path]
```

If directory is not empty but contains only non-test files (like `.gitkeep`):

```bash
rm -rf [directory-path]
```

### Removing Orphaned testUtils

Before removing, perform final verification:

```bash
# Final check that file is truly orphaned
grep -r "$(basename [file] .ts)" tests/ --include="*.ts" --include="*.tsx"
```

If no results, safe to remove:

```bash
rm [file-path]
```

### Handling npmFallback.test.ts

This file requires special handling due to its TODO nature:

**Option 1: Full Removal (Recommended)**

```bash
# Remove the placeholder test file
rm tests/features/prerequisites/npmFallback.test.ts

# Verify no other files depended on it
npm test
```

**Option 2: Convert to Documentation**

If the feature is planned for implementation, convert TODOs to documented test cases:

```typescript
// tests/features/prerequisites/npmFallback.test.ts

/**
 * NOTE: These tests are skipped pending implementation of npm fallback logic.
 * See: [link to issue or documentation]
 *
 * When npm install fails with --prefer-offline (ENOTCACHED error),
 * the installation should automatically retry without the flag.
 */

describe.skip('npm --prefer-offline Fallback Logic', () => {
  describe('Installation Fallback Strategy', () => {
    it.todo('should detect ENOTCACHED error from npm --prefer-offline');
    it.todo('should retry npm install without --prefer-offline on cache miss');
    it.todo('should only remove --prefer-offline flag, keeping other performance flags');
    it.todo('should not retry if error is not cache-related');
    it.todo('should log fallback attempt for debugging');
  });
});
```

**Option 3: Implement Tests**

If the feature exists but tests are incomplete, implement the actual tests. This would be a separate implementation task, not part of this audit.

---

## Rollback Plan

If removal causes unexpected failures:

1. Restore removed files from git:
   ```bash
   git checkout HEAD -- [removed-file-path]
   ```

2. Re-run tests to verify restoration fixes issue:
   ```bash
   npm test
   ```

3. Document the dependency that was missed:
   - Add to inventory as "hidden dependency"
   - Update detection methods for future audits

4. Continue with remaining removals

---

## Post-Removal Checklist

After all removals complete:

- [ ] `npm test` passes
- [ ] `npm test -- --coverage` shows acceptable coverage
- [ ] `npx tsc --noEmit` shows no errors
- [ ] `git status` shows only expected deletions
- [ ] No test file imports show errors in IDE
- [ ] `git diff --stat` confirms expected file changes
