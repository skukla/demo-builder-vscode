# Step 1: Create 4-Bundle HTML Helper

## Purpose

Extract Welcome's working 4-bundle pattern (showWelcome.ts:72-116) into a reusable `getWebviewHTMLWithBundles()` helper function to enable consistent bundle loading across all webviews and eliminate single-bundle timeout issues.

## Prerequisites

- [ ] Project dependencies installed (`npm install`)
- [ ] Jest test environment configured
- [ ] No external dependencies required (using existing VS Code API)

## Tests to Write First (RED Phase)

### Test 1: Generate HTML with All 4 Bundles

**Purpose:** Verify helper generates HTML with all 4 script tags in correct order

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
describe('getWebviewHTMLWithBundles', () => {
  it('should generate HTML with all 4 bundles in correct order', () => {
    // Arrange: Create mock URIs for all 4 bundles
    const mockURIs = {
      runtime: vscode.Uri.parse('vscode-resource://runtime-bundle.js'),
      vendors: vscode.Uri.parse('vscode-resource://vendors-bundle.js'),
      common: vscode.Uri.parse('vscode-resource://common-bundle.js'),
      feature: vscode.Uri.parse('vscode-resource://wizard-bundle.js')
    };
    const options = {
      bundleUris: mockURIs,
      nonce: 'test-nonce-123',
      cspSource: 'vscode-resource:',
      title: 'Test Webview'
    };

    // Act: Generate HTML
    const html = getWebviewHTMLWithBundles(options);

    // Assert: Verify all 4 bundles present in correct order
    expect(html).toContain('runtime-bundle.js');
    expect(html).toContain('vendors-bundle.js');
    expect(html).toContain('common-bundle.js');
    expect(html).toContain('wizard-bundle.js');

    // Verify order: runtime before vendors before common before feature
    const runtimeIndex = html.indexOf('runtime-bundle.js');
    const vendorsIndex = html.indexOf('vendors-bundle.js');
    const commonIndex = html.indexOf('common-bundle.js');
    const featureIndex = html.indexOf('wizard-bundle.js');

    expect(runtimeIndex).toBeLessThan(vendorsIndex);
    expect(vendorsIndex).toBeLessThan(commonIndex);
    expect(commonIndex).toBeLessThan(featureIndex);
  });
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 2: CSP Compliance - Unique Nonces

**Purpose:** Verify each script tag has the same nonce for CSP compliance

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should apply same nonce to all script tags for CSP compliance', () => {
  // Arrange
  const nonce = 'unique-nonce-456';
  const options = {
    bundleUris: createMockBundleURIs(),
    nonce,
    cspSource: 'vscode-resource:',
    title: 'Test'
  };

  // Act
  const html = getWebviewHTMLWithBundles(options);

  // Assert: All script tags have nonce attribute
  const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
  expect(scriptMatches).toHaveLength(4); // 4 bundles = 4 script tags

  // Verify all use same nonce
  scriptMatches?.forEach(match => {
    expect(match).toContain(`nonce="${nonce}"`);
  });
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 3: CSP Headers Configuration

**Purpose:** Verify Content-Security-Policy meta tag includes all required directives

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should include proper CSP headers with nonce and cspSource', () => {
  // Arrange
  const nonce = 'test-nonce';
  const cspSource = 'vscode-webview://custom-source';
  const options = {
    bundleUris: createMockBundleURIs(),
    nonce,
    cspSource,
    title: 'Test'
  };

  // Act
  const html = getWebviewHTMLWithBundles(options);

  // Assert: CSP meta tag present
  expect(html).toContain('<meta http-equiv="Content-Security-Policy"');

  // Verify CSP directives
  expect(html).toContain(`default-src 'none'`);
  expect(html).toContain(`script-src 'nonce-${nonce}' ${cspSource}`);
  expect(html).toContain(`style-src ${cspSource} 'unsafe-inline'`);
  expect(html).toContain(`img-src https: data:`);
  expect(html).toContain(`font-src ${cspSource}`);
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 4: HTML Structure Validity

**Purpose:** Verify generated HTML is well-formed with required elements

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should generate well-formed HTML5 document', () => {
  // Arrange
  const options = {
    bundleUris: createMockBundleURIs(),
    nonce: 'test-nonce',
    cspSource: 'vscode-resource:',
    title: 'My Test Webview'
  };

  // Act
  const html = getWebviewHTMLWithBundles(options);

  // Assert: HTML structure
  expect(html).toMatch(/^<!DOCTYPE html>/);
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<meta charset="UTF-8">');
  expect(html).toContain('<meta name="viewport"');
  expect(html).toContain('<title>My Test Webview</title>');
  expect(html).toContain('<body>');
  expect(html).toContain('<div id="root"></div>');
  expect(html).toContain('</body>');
  expect(html).toContain('</html>');
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 5: Optional Theme Support

**Purpose:** Verify optional isDark parameter can be used for theme-specific customization

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should support optional isDark parameter for future theme features', () => {
  // Arrange
  const optionsLight = {
    bundleUris: createMockBundleURIs(),
    nonce: 'test',
    cspSource: 'vscode-resource:',
    title: 'Test',
    isDark: false
  };

  const optionsDark = {
    ...optionsLight,
    isDark: true
  };

  // Act
  const htmlLight = getWebviewHTMLWithBundles(optionsLight);
  const htmlDark = getWebviewHTMLWithBundles(optionsDark);

  // Assert: Both generate valid HTML (isDark doesn't break generation)
  expect(htmlLight).toContain('<!DOCTYPE html>');
  expect(htmlDark).toContain('<!DOCTYPE html>');

  // Note: isDark is reserved for future use; currently just validates it doesn't break
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 6: Additional Image Sources

**Purpose:** Verify optional additionalImgSources parameter extends CSP img-src directive

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should support additional image sources in CSP', () => {
  // Arrange
  const options = {
    bundleUris: createMockBundleURIs(),
    nonce: 'test',
    cspSource: 'vscode-resource:',
    title: 'Test',
    additionalImgSources: ['https://example.com', 'https://cdn.adobe.com']
  };

  // Act
  const html = getWebviewHTMLWithBundles(options);

  // Assert: CSP includes default + additional image sources
  expect(html).toContain('img-src https: data: https://example.com https://cdn.adobe.com');
});
```

**Expected Failure:** Function doesn't exist yet

---

### Test 7: Error Handling - Missing Nonce

**Purpose:** Verify function validates required nonce parameter

**Test Code Location:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

```typescript
it('should throw error if nonce is missing', () => {
  // Arrange
  const options = {
    bundleUris: createMockBundleURIs(),
    nonce: '', // Invalid: empty nonce
    cspSource: 'vscode-resource:',
    title: 'Test'
  };

  // Act & Assert
  expect(() => getWebviewHTMLWithBundles(options))
    .toThrow('Nonce is required for CSP compliance');
});
```

**Expected Failure:** Function doesn't exist yet

---

## Files to Create/Modify

### File 1: `src/core/utils/getWebviewHTMLWithBundles.ts` (CREATE)

**Purpose:** Reusable helper function for generating webview HTML with 4-bundle pattern

**Changes:** New file with helper function and types

---

### File 2: `src/core/utils/index.ts` (MODIFY)

**Purpose:** Export new helper from utils barrel file

**Changes:** Add export for `getWebviewHTMLWithBundles`

---

### File 3: `tests/core/utils/getWebviewHTMLWithBundles.test.ts` (CREATE)

**Purpose:** Comprehensive test suite for HTML generation helper

**Changes:** New test file with 7+ test cases covering happy path, edge cases, and errors

---

## Implementation Details (GREEN Phase)

### Step 1.1: Create Type Definitions

Define TypeScript interfaces for function parameters:

```typescript
// src/core/utils/getWebviewHTMLWithBundles.ts

import * as vscode from 'vscode';

/**
 * Bundle URIs for webpack code-split bundles.
 * Must be loaded in this specific order:
 * 1. runtime - Webpack runtime
 * 2. vendors - Third-party libraries (React, Spectrum)
 * 3. common - Shared application code (WebviewClient)
 * 4. feature - Feature-specific bundle (wizard, dashboard, etc.)
 */
export interface BundleUris {
    runtime: vscode.Uri;
    vendors: vscode.Uri;
    common: vscode.Uri;
    feature: vscode.Uri;
}

/**
 * Options for generating webview HTML with 4-bundle pattern.
 */
export interface WebviewHTMLWithBundlesOptions {
    /** Bundle URIs in load order (runtime, vendors, common, feature) */
    bundleUris: BundleUris;

    /** Cryptographic nonce for CSP script-src directive */
    nonce: string;

    /** CSP source for webview resources (e.g., webview.cspSource) */
    cspSource: string;

    /** Webview title (displays in tab) */
    title: string;

    /** Optional: Whether VS Code is in dark theme (reserved for future use) */
    isDark?: boolean;

    /** Optional: Additional image sources for CSP img-src directive */
    additionalImgSources?: string[];
}
```

---

### Step 1.2: Implement Core Helper Function

Create minimal implementation to pass tests:

```typescript
/**
 * Generates HTML for VS Code webview with webpack 4-bundle pattern.
 *
 * This helper extracts the working pattern from showWelcome.ts (lines 72-116)
 * into a reusable function to eliminate single-bundle timeout issues.
 *
 * Bundle loading order is critical:
 * 1. runtime-bundle.js - Webpack runtime and chunk loading logic
 * 2. vendors-bundle.js - React, Spectrum, and third-party libraries
 * 3. common-bundle.js - Shared code including WebviewClient
 * 4. [feature]-bundle.js - Feature-specific code (wizard, dashboard, etc.)
 *
 * CSP Compliance:
 * - All script tags use same nonce for Content-Security-Policy
 * - No inline scripts allowed
 * - cspSource must match webview's cspSource property
 *
 * @param options - Configuration for HTML generation
 * @returns Well-formed HTML5 document string
 * @throws Error if nonce is empty (CSP requirement)
 *
 * @example
 * ```typescript
 * const html = getWebviewHTMLWithBundles({
 *   bundleUris: {
 *     runtime: panel.webview.asWebviewUri(runtimePath),
 *     vendors: panel.webview.asWebviewUri(vendorsPath),
 *     common: panel.webview.asWebviewUri(commonPath),
 *     feature: panel.webview.asWebviewUri(wizardPath)
 *   },
 *   nonce: getNonce(),
 *   cspSource: panel.webview.cspSource,
 *   title: 'Demo Builder Wizard'
 * });
 * ```
 */
export function getWebviewHTMLWithBundles(options: WebviewHTMLWithBundlesOptions): string {
    const {
        bundleUris,
        nonce,
        cspSource,
        title,
        additionalImgSources = []
    } = options;

    // Validate required nonce for CSP
    if (!nonce || nonce.trim() === '') {
        throw new Error('Nonce is required for CSP compliance');
    }

    // Build img-src directive: default sources + additional
    const imgSources = ['https:', 'data:', ...additionalImgSources].join(' ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${cspSource};
        img-src ${imgSources};
        font-src ${cspSource};
    ">
    <title>${title}</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${bundleUris.runtime}"></script>
    <script nonce="${nonce}" src="${bundleUris.vendors}"></script>
    <script nonce="${nonce}" src="${bundleUris.common}"></script>
    <script nonce="${nonce}" src="${bundleUris.feature}"></script>
</body>
</html>`;
}
```

---

### Step 1.3: Export from Barrel File

Update utils index to export new helper:

```typescript
// src/core/utils/index.ts

export { getWebviewHTMLWithBundles } from './getWebviewHTMLWithBundles';
export type { BundleUris, WebviewHTMLWithBundlesOptions } from './getWebviewHTMLWithBundles';

// ... existing exports
```

---

### Step 1.4: Create Test Helper

Add helper function in test file for creating mock URIs:

```typescript
// tests/core/utils/getWebviewHTMLWithBundles.test.ts

import * as vscode from 'vscode';
import {
  getWebviewHTMLWithBundles,
  type BundleUris,
  type WebviewHTMLWithBundlesOptions
} from '@/core/utils/getWebviewHTMLWithBundles';

/**
 * Test helper: Create mock bundle URIs for testing
 */
function createMockBundleURIs(): BundleUris {
  return {
    runtime: vscode.Uri.parse('vscode-resource://runtime-bundle.js'),
    vendors: vscode.Uri.parse('vscode-resource://vendors-bundle.js'),
    common: vscode.Uri.parse('vscode-resource://common-bundle.js'),
    feature: vscode.Uri.parse('vscode-resource://wizard-bundle.js')
  };
}

// Tests defined in "Tests to Write First" section above
```

---

## Expected Outcome

- [ ] All 7+ tests passing (green)
- [ ] Helper function generates HTML identical to showWelcome.ts pattern
- [ ] CSP compliance verified (nonces, no inline scripts)
- [ ] Bundle loading order enforced (runtime → vendors → common → feature)
- [ ] Function properly exported from `@/core/utils`

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] JSDoc comments explain bundle order rationale
- [ ] No debug code (console.log, debugger)
- [ ] Test coverage ≥ 90% for new code (7 tests cover all branches)
- [ ] Helper validates required nonce parameter
- [ ] CSP headers match showWelcome.ts implementation exactly

## Dependencies from Other Steps

None (Step 1 is foundational - no dependencies)

## Estimated Time

60-90 minutes
- Test setup: 20 minutes
- Helper implementation: 30 minutes
- Test refinement: 20 minutes
- Documentation: 10 minutes

---

**Testing Focus:** CSP compliance is critical - verify nonce uniqueness and proper CSP headers to prevent VS Code webview security violations

**Common Pitfalls:**
- Forgetting to escape template literal quotes in CSP meta tag
- Wrong bundle load order (must be: runtime → vendors → common → feature)
- Missing nonce validation (empty string should throw error)
- Not using same nonce for all script tags (breaks CSP)

**Reference:** See showWelcome.ts lines 72-116 for working implementation pattern
