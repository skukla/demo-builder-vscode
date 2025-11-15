### Step 5: Refactor Welcome Command

**Purpose:** Replace manual HTML construction in WelcomeWebviewCommand with `getWebviewHTMLWithBundles()` helper for consistency.

**Prerequisites:**
- [x] Step 1 completed (helper created)

**Tests to Write First:**

- [ ] Test: Welcome command uses helper with correct bundles
  - **Given:** WelcomeWebviewCommand instance
  - **When:** `getWebviewContent()` called
  - **Then:** Returns HTML from `getWebviewHTMLWithBundles(['runtime-bundle.js', 'vendors-bundle.js', 'common-bundle.js', 'welcome-bundle.js'])`
  - **File:** `tests/features/welcome/commands/showWelcome.test.ts`

**Files to Modify:**

- [ ] `src/features/welcome/commands/showWelcome.ts` - Replace manual HTML construction (lines 72-119) with helper call

**Implementation Details:**

**RED Phase:**
```typescript
// Test structure
describe('WelcomeWebviewCommand', () => {
  it('should use getWebviewHTMLWithBundles helper', async () => {
    const command = new WelcomeWebviewCommand(mockContext);
    const html = await command['getWebviewContent']();

    expect(mockGetWebviewHTMLWithBundles).toHaveBeenCalledWith(
      mockPanel.webview,
      mockContext.extensionPath,
      ['runtime-bundle.js', 'vendors-bundle.js', 'common-bundle.js', 'welcome-bundle.js']
    );
  });
});
```

**GREEN Phase:**
1. Import `getWebviewHTMLWithBundles` from `@/shared/webview`
2. Replace lines 68-120 in `getWebviewContent()`:
```typescript
protected async getWebviewContent(): Promise<string> {
    return getWebviewHTMLWithBundles(
        this.panel!.webview,
        this.context.extensionPath,
        ['runtime-bundle.js', 'vendors-bundle.js', 'common-bundle.js', 'welcome-bundle.js']
    );
}
```

**REFACTOR Phase:**
1. Remove unused imports (path.join if no longer needed)
2. Remove getNonce() method if no longer used
3. Verify alignment with other command implementations

**Expected Outcome:**
- Welcome command uses consistent HTML generation
- Manual bundle URI construction eliminated
- Code reduced from ~50 lines to ~6 lines

**Acceptance Criteria:**
- [ ] Test passing
- [ ] HTML generation identical to before
- [ ] Welcome webview still loads correctly
- [ ] No unused imports remain

**Estimated Time:** 1 hour
