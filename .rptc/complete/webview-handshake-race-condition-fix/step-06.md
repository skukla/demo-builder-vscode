### Step 6: Delete Deprecated Code

**Purpose:** Remove deprecated `generateWebviewHTML()` function entirely per PM requirement (no deprecation markers, complete deletion).

**Prerequisites:**
- [ ] Step 5 completed (all webviews migrated)

**Tests to Write First:**

- [ ] Test: Verify no usages of deprecated function exist
  - **Given:** Codebase after migration
  - **When:** Search for `generateWebviewHTML` in src/
  - **Then:** No imports or calls found (except in tests to be deleted)
  - **File:** `tests/unit/core/utils/webviewHTMLBuilder.test.ts` (verification test)

**Files to Create/Modify:**

- [ ] `src/core/utils/webviewHTMLBuilder.ts` - Delete `generateWebviewHTML()` (lines 21-61)
- [ ] `src/core/utils/index.ts` - Remove export if present
- [ ] `tests/unit/core/utils/webviewHTMLBuilder.test.ts` - Remove tests for deprecated function

**Implementation Details:**

1. **RED Phase** (Write verification test)
   - Add test confirming function removal breaks old usage pattern
   - Expect TypeScript compilation to fail if function exists

2. **GREEN Phase** (Delete code)
   - Grep search: `generateWebviewHTML` across src/ (confirm zero usages)
   - Delete function from webviewHTMLBuilder.ts (lines 21-61)
   - Remove from index.ts exports
   - Delete related tests

3. **REFACTOR Phase**
   - Verify clean TypeScript compilation
   - Ensure only `generateWebviewHTMLWithCommunication` remains
   - Update file comments if needed

**Expected Outcome:**
- Deprecated function completely removed
- Zero references in codebase
- Clean compilation with no errors

**Acceptance Criteria:**
- [ ] `generateWebviewHTML()` deleted from source
- [ ] No exports of deprecated function
- [ ] Related tests removed
- [ ] TypeScript compiles successfully
- [ ] Grep confirms zero usages

**Estimated Time:** 0.5 hours
