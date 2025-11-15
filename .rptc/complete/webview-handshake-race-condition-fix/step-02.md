# Step 2: Update Wizard Command to Use 4-Bundle Pattern

## Purpose

Replace single-bundle `generateWebviewHTML()` call with new `getWebviewHTMLWithBundles()` helper in wizard command to eliminate bundle loading race condition and enable proper JavaScript execution timing.

## Prerequisites

- [x] Step 1 completed (`getWebviewHTMLWithBundles()` helper created)
- [ ] No external dependencies required

## Tests to Write First (RED Phase)

### Test 1: Wizard Webview Generates HTML with 4 Bundles

**Purpose:** Verify wizard command generates HTML with all 4 webpack bundles in correct order

**Test Code Location:** `tests/features/project-creation/commands/createProject.test.ts`

```typescript
describe('CreateProjectWebviewCommand - Bundle Loading', () => {
  it('should generate webview HTML with all 4 bundles in correct order', async () => {
    // Arrange: Create command instance with mocked dependencies
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockStatusBar = createMockStatusBar();
    const mockLogger = createMockLogger();

    const command = new CreateProjectWebviewCommand(
      mockContext,
      mockStateManager,
      mockStatusBar,
      mockLogger
    );

    // Act: Get webview content
    const html = await command.getWebviewContent();

    // Assert: Verify all 4 bundles present in correct order
    expect(html).toContain('runtime-bundle.js');
    expect(html).toContain('vendors-bundle.js');
    expect(html).toContain('common-bundle.js');
    expect(html).toContain('wizard-bundle.js');

    // Verify load order: runtime → vendors → common → wizard
    const runtimeIndex = html.indexOf('runtime-bundle.js');
    const vendorsIndex = html.indexOf('vendors-bundle.js');
    const commonIndex = html.indexOf('common-bundle.js');
    const wizardIndex = html.indexOf('wizard-bundle.js');

    expect(runtimeIndex).toBeLessThan(vendorsIndex);
    expect(vendorsIndex).toBeLessThan(commonIndex);
    expect(commonIndex).toBeLessThan(wizardIndex);
  });
});
```

**Expected Failure:** Test fails because command still uses `generateWebviewHTML()` (single bundle)

---

### Test 2: Wizard HTML Has CSP-Compliant Nonces

**Purpose:** Verify all script tags have proper nonce attributes for Content Security Policy compliance

**Test Code Location:** `tests/features/project-creation/commands/createProject.test.ts`

```typescript
it('should apply nonces to all script tags for CSP compliance', async () => {
  // Arrange
  const command = createWizardCommand();

  // Act
  const html = await command.getWebviewContent();

  // Assert: All script tags have nonce attribute
  const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
  expect(scriptMatches).toHaveLength(4); // 4 bundles = 4 script tags

  // Verify all use same nonce
  const noncePattern = /nonce="([^"]+)"/;
  const nonces = scriptMatches?.map(match => {
    const result = noncePattern.exec(match);
    return result ? result[1] : null;
  });

  expect(nonces).toBeDefined();
  expect(new Set(nonces).size).toBe(1); // All same nonce
  expect(nonces![0]).toHaveLength(32); // Reasonable nonce length
});
```

**Expected Failure:** Test fails because single bundle doesn't match 4-bundle pattern

---

### Test 3: Wizard CSP Headers Include Bundle Sources

**Purpose:** Verify Content-Security-Policy meta tag allows script loading from cspSource

**Test Code Location:** `tests/features/project-creation/commands/createProject.test.ts`

```typescript
it('should include proper CSP headers with nonce and cspSource', async () => {
  // Arrange
  const command = createWizardCommand();

  // Act
  const html = await command.getWebviewContent();

  // Assert: CSP meta tag present with required directives
  expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
  expect(html).toContain(`default-src 'none'`);

  // Extract nonce from first script tag
  const scriptMatch = html.match(/<script nonce="([^"]+)"/);
  expect(scriptMatch).toBeTruthy();
  const nonce = scriptMatch![1];

  // Verify CSP includes nonce in script-src
  expect(html).toContain(`script-src 'nonce-${nonce}'`);

  // Verify CSP includes cspSource
  expect(html).toMatch(/script-src[^;]+vscode-webview:/);
});
```

**Expected Failure:** Test fails with single-bundle HTML structure

---

### Test 4: Integration Test - Wizard Opens Without Timeout

**Purpose:** Verify wizard webview can be created and handshake completes successfully

**Test Code Location:** `tests/integration/wizard-webview-creation.test.ts`

```typescript
describe('Wizard Webview Creation - Integration', () => {
  it('should open wizard webview without timeout', async () => {
    // Arrange: Create command with real VS Code API (mocked)
    const command = await createIntegrationWizardCommand();

    // Act: Execute command to open webview
    const startTime = Date.now();
    await command.execute();
    const duration = Date.now() - startTime;

    // Assert: Webview opens in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000);

    // Verify panel was created
    expect(command.panel).toBeDefined();
    expect(command.panel!.webview).toBeDefined();

    // Verify communication manager initialized (handshake complete)
    expect(command.communicationManager).toBeDefined();

    // Cleanup
    command.dispose();
  });

  it('should load all 4 bundles in browser environment', async () => {
    // Arrange: Create webview with actual DOM
    const command = await createIntegrationWizardCommand();
    await command.execute();

    // Act: Get HTML and parse
    const html = await command.getWebviewContent();
    const scriptUrls = extractScriptUrls(html);

    // Assert: All 4 bundle URLs present
    expect(scriptUrls).toHaveLength(4);
    expect(scriptUrls[0]).toContain('runtime-bundle.js');
    expect(scriptUrls[1]).toContain('vendors-bundle.js');
    expect(scriptUrls[2]).toContain('common-bundle.js');
    expect(scriptUrls[3]).toContain('wizard-bundle.js');

    // Cleanup
    command.dispose();
  });
});
```

**Expected Failure:** Integration test times out with single-bundle pattern

---

## Files to Create/Modify

### File 1: `src/features/project-creation/commands/createProject.ts` (MODIFY)

**Purpose:** Replace single-bundle HTML generation with 4-bundle helper

**Changes:**
- Import `getWebviewHTMLWithBundles` and types from `@/core/utils`
- Modify `getWebviewContent()` method (lines 173-194)
- Replace `generateWebviewHTML()` call with new helper
- Construct bundle URIs for runtime, vendors, common, wizard

---

### File 2: `tests/features/project-creation/commands/createProject.test.ts` (CREATE)

**Purpose:** Unit tests for wizard command bundle loading

**Changes:** New test file with 3 unit tests covering bundle generation, CSP compliance, and HTML structure

---

### File 3: `tests/integration/wizard-webview-creation.test.ts` (CREATE)

**Purpose:** Integration test verifying wizard opens without timeout

**Changes:** New integration test file with 2 tests covering webview creation and bundle loading

---

## Implementation Details (GREEN Phase)

### Step 2.1: Import New Helper and Types

Add imports at top of `createProject.ts`:

```typescript
// Replace this import:
import { generateWebviewHTML } from '@/core/utils/webviewHTMLBuilder';

// With these imports:
import {
  getWebviewHTMLWithBundles,
  type BundleUris
} from '@/core/utils/getWebviewHTMLWithBundles';
```

---

### Step 2.2: Modify getWebviewContent() Method

Replace entire `getWebviewContent()` implementation (lines 173-194):

**BEFORE** (Single Bundle):
```typescript
protected async getWebviewContent(): Promise<string> {
    const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

    // Get URI for bundle
    const bundleUri = this.panel!.webview.asWebviewUri(
        vscode.Uri.file(path.join(webviewPath, 'main-bundle.js')),
    );

    const nonce = this.getNonce();
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    // Build the HTML content using shared utility
    return generateWebviewHTML({
        scriptUri: bundleUri,
        nonce,
        title: 'Adobe Demo Builder',
        cspSource: this.panel!.webview.cspSource,
        includeLoadingSpinner: true,
        loadingMessage: 'Loading Adobe Demo Builder...',
        isDark,
    });
}
```

**AFTER** (4-Bundle Pattern):
```typescript
protected async getWebviewContent(): Promise<string> {
    const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

    // Webpack code splitting requires loading bundles in order:
    // 1. runtime (webpack runtime and chunk loading)
    // 2. vendors (React, Spectrum, third-party libraries)
    // 3. common (shared code including WebviewClient)
    // 4. wizard (wizard-specific code)
    const bundleUris: BundleUris = {
        runtime: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js'))
        ),
        vendors: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js'))
        ),
        common: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'common-bundle.js'))
        ),
        feature: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'wizard-bundle.js'))
        ),
    };

    const nonce = this.getNonce();
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    // Build HTML with 4-bundle pattern
    return getWebviewHTMLWithBundles({
        bundleUris,
        nonce,
        cspSource: this.panel!.webview.cspSource,
        title: 'Adobe Demo Builder',
        isDark, // Optional: reserved for future theme features
    });
}
```

---

### Step 2.3: Run Tests to Verify GREEN

Execute tests to verify implementation:

```bash
# Run unit tests for wizard command
npm test -- tests/features/project-creation/commands/createProject.test.ts

# Run integration test for webview creation
npm test -- tests/integration/wizard-webview-creation.test.ts

# All tests should pass (GREEN)
```

---

## REFACTOR Phase

### Refactor 2.1: Add JSDoc Comment

Add documentation explaining why 4-bundle pattern is used:

```typescript
/**
 * Generates webview HTML content with webpack 4-bundle pattern.
 *
 * Bundle loading order is critical for proper initialization:
 * 1. runtime-bundle.js - Webpack runtime enables chunk loading
 * 2. vendors-bundle.js - React/Spectrum must load before application code
 * 3. common-bundle.js - Shared code (including WebviewClient for handshake)
 * 4. wizard-bundle.js - Wizard-specific code executes last
 *
 * This pattern eliminates race conditions where webview JavaScript
 * attempts to execute before dependencies are loaded, causing timeout errors.
 *
 * @returns HTML string with all 4 bundles in correct order
 */
protected async getWebviewContent(): Promise<string> {
    // ... implementation
}
```

---

### Refactor 2.2: Extract Bundle Path Construction (Optional)

If bundle path construction is complex, consider extracting to helper method:

```typescript
/**
 * Constructs bundle URIs for wizard webview
 * @private
 */
private getWizardBundleUris(): BundleUris {
    const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

    return {
        runtime: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js'))
        ),
        vendors: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js'))
        ),
        common: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'common-bundle.js'))
        ),
        feature: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'wizard-bundle.js'))
        ),
    };
}

protected async getWebviewContent(): Promise<string> {
    const bundleUris = this.getWizardBundleUris();
    const nonce = this.getNonce();
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    return getWebviewHTMLWithBundles({
        bundleUris,
        nonce,
        cspSource: this.panel!.webview.cspSource,
        title: 'Adobe Demo Builder',
        isDark,
    });
}
```

---

### Refactor 2.3: Verify No Unused Imports

After replacing `generateWebviewHTML`, remove unused import:

```typescript
// Remove if no other usage in file:
// import { generateWebviewHTML } from '@/core/utils/webviewHTMLBuilder';
```

---

## Expected Outcome

- [ ] Wizard command generates HTML with 4 bundles (runtime → vendors → common → wizard)
- [ ] All script tags have proper CSP nonces
- [ ] Webview opens without timeout (< 5 seconds)
- [ ] Unit tests pass (3 tests for bundle loading and CSP)
- [ ] Integration test passes (webview creation without timeout)
- [ ] Code properly documented with JSDoc comments

## Acceptance Criteria

- [ ] All tests passing for this step (unit + integration)
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] Bundle order matches documentation (runtime → vendors → common → wizard)
- [ ] No debug code (console.log, debugger)
- [ ] JSDoc comments explain bundle loading rationale
- [ ] Import cleanup (removed unused `generateWebviewHTML`)
- [ ] Wizard webview opens successfully in manual testing

## Dependencies from Other Steps

**Depends On:**
- Step 1: `getWebviewHTMLWithBundles()` helper must exist at `@/core/utils`

**Enables:**
- Step 3: Dashboard command can follow same pattern
- Step 4: Configure command can follow same pattern
- Step 5: Welcome command can be refactored for consistency

## Estimated Time

45-60 minutes
- Test implementation: 25 minutes (4 tests)
- Code modification: 15 minutes
- Manual verification: 10 minutes
- Documentation: 10 minutes

---

**Testing Focus:** Integration test is critical - must verify wizard actually opens without timeout in real VS Code environment (not just mocked)

**Common Pitfalls:**
- Wrong bundle name (wizard vs main) - must match webpack output
- Wrong bundle order (must be: runtime → vendors → common → feature)
- Forgetting to update imports (remove old, add new)
- CSP nonce mismatch (all script tags must use same nonce)

**Manual Verification Checklist:**
1. Open Command Palette → "Demo Builder: Create Project"
2. Wizard should open in < 3 seconds (no timeout)
3. Open DevTools (Help → Toggle Developer Tools)
4. Console tab should show 4 script loads (no CSP errors)
5. Network tab should show all 4 bundles downloaded
6. Sources tab should show all 4 bundles loaded

**Reference:** See `showWelcome.ts` lines 72-116 for working 4-bundle pattern example
