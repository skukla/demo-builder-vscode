# Step 1: Add Webview Transition Timeout to Existing Config

## Purpose

Add `WEBVIEW_TRANSITION: 3000` to the existing `TIMEOUTS` configuration object in `src/core/utils/timeoutConfig.ts`. This establishes a 3-second timeout for webview transition tracking, providing safety against race conditions where the Welcome screen auto-reopens when users click "Create New Project".

## Prerequisites

- None (first step in plan)

## Tests to Write First (RED)

### Test Scenarios

**Unit Tests:**

- [ ] Test: WEBVIEW_TRANSITION constant is defined in TIMEOUTS
  - **Given:** TIMEOUTS configuration is imported
  - **When:** Accessing WEBVIEW_TRANSITION property
  - **Then:** Property exists and is defined
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

- [ ] Test: WEBVIEW_TRANSITION is set to 3000ms (3 seconds)
  - **Given:** TIMEOUTS configuration is imported
  - **When:** Reading WEBVIEW_TRANSITION value
  - **Then:** Value equals exactly 3000
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

- [ ] Test: TIMEOUTS object maintains type-level immutability
  - **Given:** TIMEOUTS uses 'as const' assertion
  - **When:** TypeScript processes the type
  - **Then:** Object is readonly at type level
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

**Edge Cases:**

- [ ] Test: WEBVIEW_TRANSITION is longer than typical UI transitions (>5s)
  - **Given:** WEBVIEW_TRANSITION timeout value
  - **When:** Comparing to minimum reasonable transition time
  - **Then:** Value is at least 5000ms to allow for slow webview initialization
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

- [ ] Test: WEBVIEW_TRANSITION is shorter than user patience threshold (<60s)
  - **Given:** WEBVIEW_TRANSITION timeout value
  - **When:** Comparing to maximum reasonable wait time
  - **Then:** Value is at most 60000ms to avoid frustrating users
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

- [ ] Test: WEBVIEW_TRANSITION is appropriate for webview lifecycle operations
  - **Given:** WEBVIEW_TRANSITION timeout value
  - **When:** Comparing to other webview-related timeouts
  - **Then:** Falls within reasonable range (2-5 seconds) for webview transitions
  - **File:** `tests/core/utils/timeoutConfig.test.ts`

## Files to Create/Modify

### File: `src/core/utils/timeoutConfig.ts`
**Action:** Modify
**Changes:**
- Add `WEBVIEW_TRANSITION: 30000` to the `TIMEOUTS` object
- Add comment explaining purpose: "Webview transition tracking (prevents race conditions during navigation)"
- Place in appropriate section (after "Data loading timeouts" or before "Demo lifecycle timeouts")

### File: `tests/core/utils/timeoutConfig.test.ts`
**Action:** Modify
**Changes:**
- Add new `describe` block: "WEBVIEW_TRANSITION timeout"
- Add 6 test cases covering definition, value, bounds, and rationale

## Implementation Details (GREEN)

### RED Phase

Add comprehensive tests to `tests/core/utils/timeoutConfig.test.ts`:

```typescript
describe('WEBVIEW_TRANSITION timeout', () => {
    it('should be defined in TIMEOUTS', () => {
        // Arrange & Act
        const hasProperty = 'WEBVIEW_TRANSITION' in TIMEOUTS;

        // Assert
        expect(hasProperty).toBe(true);
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBeDefined();
    });

    it('should be set to 3000ms (3 seconds)', () => {
        // Prevents race conditions during webview transitions
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBe(3000);
    });

    it('should be longer than typical UI transitions', () => {
        // Webview transitions need reasonable safety margin
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBeGreaterThanOrEqual(2000);
    });

    it('should be shorter than user patience threshold', () => {
        // Users won't wait more than a few seconds for transitions
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBeLessThanOrEqual(5000);
    });

    it('should be appropriate for webview lifecycle operations', () => {
        // 3 seconds is reasonable for webview transitions
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBeGreaterThanOrEqual(2000);
        expect(TIMEOUTS.WEBVIEW_TRANSITION).toBeLessThanOrEqual(5000);
    });

    it('should use const assertion for type safety', () => {
        // Verify TIMEOUTS object structure
        expect(TIMEOUTS).toBeDefined();
        expect(typeof TIMEOUTS).toBe('object');
        expect(TIMEOUTS).not.toBeNull();
    });
});
```

**Run tests:** `npm test -- tests/core/utils/timeoutConfig.test.ts`

**Expected result:** All 6 tests FAIL (RED) because WEBVIEW_TRANSITION doesn't exist yet.

### GREEN Phase

1. Open `src/core/utils/timeoutConfig.ts`
2. Locate the `TIMEOUTS` constant (around line 11)
3. Find appropriate section (suggest after "Data loading timeouts" section, around line 30)
4. Add new timeout constant:

```typescript
// Webview lifecycle timeouts
WEBVIEW_TRANSITION: 3000,       // 3 seconds - webview transition tracking (prevents race conditions)
```

5. Save file
6. Run tests: `npm test -- tests/core/utils/timeoutConfig.test.ts`
7. Verify all 6 new tests PASS (GREEN)

### REFACTOR Phase

1. Review comment clarity - ensure it explains the "why" (prevents race conditions)
2. Verify alphabetical or logical grouping with nearby timeout constants
3. Consider adding section comment if this is the first webview-specific timeout
4. Ensure consistent formatting (spacing, alignment) with existing constants
5. Re-run tests to ensure still passing after any formatting changes

## Expected Outcome

After completing this step:
- `TIMEOUTS.WEBVIEW_TRANSITION` constant exists with value 30000
- 6 new tests verify the constant's definition, value, and bounds
- Code is ready for Step 2 (consume this timeout in transition tracking logic)
- No breaking changes to existing code (purely additive)

## Acceptance Criteria

- [x] All 6 new tests passing for WEBVIEW_TRANSITION timeout
- [x] Code follows project style guide (matches existing TIMEOUTS formatting)
- [x] No console.log or debugger statements
- [x] Coverage maintained at 80%+ for timeoutConfig.ts
- [x] Comment explains purpose (prevents race conditions during webview transitions)
- [x] Constant value is exactly 3000 (3 seconds)

## Dependencies from Other Steps

**This step depends on:** None (first step)

**Steps that depend on this:**
- Step 2: Use `TIMEOUTS.WEBVIEW_TRANSITION` in transition tracking logic
- Step 3: Integration test verifying race condition fix

## Estimated Time

15 minutes

(5 min: write tests, 5 min: add constant, 5 min: verify and refactor)
