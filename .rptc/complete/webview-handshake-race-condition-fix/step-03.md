# Step 3: Update Dashboard Command

## Purpose
Replace `generateWebviewHTML()` with `getWebviewHTMLWithBundles()` in dashboard command to use standardized bundle injection.

## Prerequisites
- [ ] Step 1 completed (helper function exists)
- [ ] Step 2 completed (pattern validated in wizard)

## Tests to Write First

- [ ] **Test: Dashboard uses getWebviewHTMLWithBundles helper**
  - **Given:** Dashboard command is executed
  - **When:** Webview HTML is generated
  - **Then:** `getWebviewHTMLWithBundles()` is called with correct parameters
  - **File:** `tests/unit/commands/showDashboard.test.ts`

- [ ] **Test: Dashboard HTML includes all required bundles**
  - **Given:** Dashboard webview HTML is generated
  - **When:** HTML content is parsed
  - **Then:** Contains script tags for runtime-bundle.js, vendors-bundle.js, common-bundle.js, dashboard-bundle.js in correct order
  - **File:** `tests/unit/commands/showDashboard.test.ts`

## Files to Create/Modify

- [ ] `src/commands/showDashboard.ts` - Replace HTML generation with helper call
- [ ] `tests/unit/commands/showDashboard.test.ts` - Add tests for new helper usage

## Implementation Details

### RED Phase (Write failing tests)
```typescript
describe('showDashboard', () => {
  it('should use getWebviewHTMLWithBundles helper', () => {
    // Test that helper is called with correct bundle names
  });

  it('should include all dashboard bundles in HTML', () => {
    // Test that all 4 bundles are present in correct order
  });
});
```

### GREEN Phase (Minimal implementation)
1. Import `getWebviewHTMLWithBundles` in showDashboard.ts
2. Replace `generateWebviewHTML()` call with:
   ```typescript
   getWebviewHTMLWithBundles(panel, extensionUri, [
     'runtime-bundle.js',
     'vendors-bundle.js',
     'common-bundle.js',
     'dashboard-bundle.js'
   ])
   ```
3. Verify tests pass

### REFACTOR Phase
1. Remove unused `generateWebviewHTML` import if no longer needed
2. Ensure consistent formatting

## Expected Outcome
- Dashboard command uses standardized bundle injection
- All required bundles load in correct order
- Tests validate helper integration

## Acceptance Criteria
- [ ] All tests passing
- [ ] Dashboard loads successfully with all bundles
- [ ] No console errors in webview
- [ ] Code follows project style guide

## Estimated Time
0.5 hours
