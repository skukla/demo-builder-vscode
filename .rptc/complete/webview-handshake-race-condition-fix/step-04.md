# Step 4: Update Configure Command

## Purpose
Replace `generateWebviewHTML()` with `getWebviewHTMLWithBundles()` in configure command to use bundle-aware HTML generation.

## Prerequisites
- [ ] Step 3 completed (dashboard updated)
- [ ] Helper function exists in webviewHelpers.ts

## Tests to Write First
- [ ] Test: Configure webview loads with all required bundles
  - **Given:** Configure command invoked
  - **When:** Webview HTML generated
  - **Then:** All 4 bundles included in correct order
  - **File:** `tests/unit/commands/configure.test.ts`

- [ ] Test: Configure webview handshake completes successfully
  - **Given:** Configure webview created
  - **When:** Webview loads
  - **Then:** Handshake message received within timeout
  - **File:** `tests/integration/commands/configure-webview.test.ts`

## Files to Modify
- [ ] `src/commands/configure.ts` - Replace HTML generation call

## Implementation Details

**RED Phase** (Write failing tests):
```typescript
describe('configure command', () => {
  it('should include all required bundles', () => {
    const html = getWebviewHTMLWithBundles(webview, extensionUri, [
      'runtime-bundle.js',
      'vendors-bundle.js',
      'common-bundle.js',
      'configure-bundle.js'
    ]);
    expect(html).toContain('runtime-bundle.js');
    expect(html).toContain('configure-bundle.js');
  });
});
```

**GREEN Phase** (Implement changes):
1. Open `src/commands/configure.ts`
2. Locate `generateWebviewHTML()` call
3. Replace with:
```typescript
getWebviewHTMLWithBundles(panel.webview, context.extensionUri, [
  'runtime-bundle.js',
  'vendors-bundle.js',
  'common-bundle.js',
  'configure-bundle.js'
]);
```

**REFACTOR Phase**:
- Verify bundle order matches webpack output
- Ensure no duplicate script tags
- Confirm proper error handling

## Expected Outcome
- Configure command uses new bundle-aware helper
- All 4 bundles load in correct sequence
- Handshake completes without timing issues

## Acceptance Criteria
- [ ] All tests passing
- [ ] Configure webview loads successfully
- [ ] No console errors about missing bundles
- [ ] Handshake completes within 5 seconds

**Estimated Time:** 30 minutes
