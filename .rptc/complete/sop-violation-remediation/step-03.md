# Step 3: Remove Dead Code

## Summary

Delete identified dead code block(s) to reduce codebase size and improve maintainability.

## Prerequisites

- [ ] Steps 1-2 completed (optional - can run independently)
- [ ] TypeScript strict mode enabled (catches unused variables)

## Tests to Write First (RED Phase)

- [ ] Verify no existing tests reference dead code
  - **Given:** Identified dead code function/class
  - **When:** Search for imports across test files
  - **Then:** Zero test imports found (confirms safe to delete)
  - **File:** N/A - verification via grep, not new test file

- [ ] Run full test suite to confirm code is truly unused
  - **Given:** Codebase with identified dead code
  - **When:** Run `npm test`
  - **Then:** All tests pass (no dependencies on dead code)

## Identification Process

1. **Search for unused exports**:
   ```bash
   # Find exports with zero imports
   grep -r "export.*function\|export.*const\|export.*class" src/ | while read export; do
     name=$(echo "$export" | grep -oE "export (function|const|class) \w+" | awk '{print $3}')
     if [ -n "$name" ] && [ $(grep -r "import.*$name" src/ | wc -l) -eq 0 ]; then
       echo "Possibly unused: $name in $export"
     fi
   done
   ```

2. **Search for commented-out code blocks** (>10 lines)

3. **Verify via TypeScript**: `npx tsc --noEmit` with `noUnusedLocals: true`

## Files to Modify

Identified during verification process above. Pattern:
- [ ] Remove unused function/class/constant
- [ ] Remove any now-orphaned imports
- [ ] Delete associated test file if exists

## Implementation Details (GREEN Phase)

1. Run identification commands above
2. For each identified dead code block:
   - Verify zero imports via grep
   - Delete the code
   - Remove orphaned imports
3. Run `npm test` to confirm no breakage

## Expected Outcome

- [x] Dead code removed
- [x] No orphaned imports remain
- [x] All tests still pass
- [x] TypeScript compiles without unused variable warnings

## Acceptance Criteria

- [x] Identified dead code deleted
- [x] No test failures introduced
- [x] `npm run build` succeeds
- [x] No new TypeScript errors

## Estimated Time

30 minutes

---

## Completion Notes

**Status:** ✅ Complete
**Date:** 2025-12-29
**Dead Code Removed:** 5 items
- OperationResult, createSuccess, createFailure from results.ts
- DataStepProps, FullStepProps from wizard.ts
**Files Reduced:** results.ts -42%, wizard.ts -31%
**Full Suite:** 5998 tests passing
