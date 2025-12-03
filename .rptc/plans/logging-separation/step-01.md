# Step 1: Baseline Verification and Pattern Analysis

## Purpose

Establish baseline by running existing tests and documenting the correct logging pattern from reference files.

## Prerequisites

- None (first step)

## Tests to Write First

### Test: Verify Existing Logging Tests Pass

```bash
# Run existing logging tests - MUST pass before any changes
npm run test:fast -- tests/core/logging/
```

**Expected**: All tests pass (baseline established)

### Test: Document Current State

```bash
# Count current info calls with [Component] prefix
grep -rn "logger\.info.*\[" src/ --include="*.ts" | wc -l

# Count current debug calls
grep -rn "logger\.debug\(" src/ --include="*.ts" | wc -l
```

**Expected**: Document counts for before/after comparison

## Implementation

1. **Run existing tests** to establish green baseline
2. **Analyze reference file** (`src/core/shell/fileWatcher.ts`) to document correct pattern:
   - All `[File Watcher]` prefixed messages use `debug()`
   - No user-facing info() calls at all (internal service)
3. **Create categorization rules**:
   - `[Component] technical detail` → `debug()`
   - Messages with ✅ emoji → keep `info()`
   - Messages with "successfully", "complete", "failed" → keep `info()`
   - Timing/attempt messages → `debug()`
   - Internal state changes → `debug()`

## Files to Modify

None - this step is analysis only.

## Expected Outcome

- All existing logging tests pass ✅
- Documented before/after counts
- Clear categorization rules for remaining steps
- Baseline established for regression detection

## Acceptance Criteria

- [x] `npm run test:fast -- tests/core/logging/` passes (53 tests)
- [x] Current state documented (174 info with prefix, 230 debug)
- [x] Categorization rules documented

## Status: ✅ COMPLETE
