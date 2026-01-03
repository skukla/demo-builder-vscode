# Step 9: Remove Spectrum & Cleanup

## Overview

**Purpose**: Complete the React Aria migration by removing all Spectrum dependencies, Provider wrappers, UNSAFE_className usages, and obsolete CSS.

**Prerequisites**:
- [ ] Steps 1-8 complete (all components migrated to React Aria)
- [ ] All tests passing with React Aria components
- [ ] No remaining direct Spectrum component imports in UI code

**Estimated Time**: 3-4 hours

---

## Tests to Write First

### 9.1 Dependency Verification Tests

```typescript
// tests/integration/spectrum-removal.test.ts

describe('Spectrum Removal Verification', () => {
    describe('Package Dependencies', () => {
        it('should not have @adobe/react-spectrum in package.json', () => {
            const pkg = require('../../../package.json');
            expect(pkg.dependencies['@adobe/react-spectrum']).toBeUndefined();
            expect(pkg.devDependencies?.['@adobe/react-spectrum']).toBeUndefined();
        });

        it('should have react-aria-components in dependencies', () => {
            const pkg = require('../../../package.json');
            expect(pkg.dependencies['react-aria-components']).toBeDefined();
        });
    });

    describe('Source Code Verification', () => {
        it('should have zero UNSAFE_className occurrences in src/', async () => {
            const { execSync } = require('child_process');
            try {
                const result = execSync(
                    'grep -r "UNSAFE_className" src/ --include="*.tsx" --include="*.ts" | wc -l',
                    { encoding: 'utf-8' }
                );
                expect(parseInt(result.trim(), 10)).toBe(0);
            } catch (error) {
                // grep returns exit code 1 when no matches found - this is success
                expect(true).toBe(true);
            }
        });

        it('should have zero @adobe/react-spectrum imports in src/', async () => {
            const { execSync } = require('child_process');
            try {
                const result = execSync(
                    'grep -r "@adobe/react-spectrum" src/ --include="*.tsx" --include="*.ts" | wc -l',
                    { encoding: 'utf-8' }
                );
                expect(parseInt(result.trim(), 10)).toBe(0);
            } catch (error) {
                // grep returns exit code 1 when no matches found - this is success
                expect(true).toBe(true);
            }
        });

        it('should have zero Provider/defaultTheme imports', async () => {
            const { execSync } = require('child_process');
            try {
                const result = execSync(
                    'grep -rE "(Provider|defaultTheme).*@adobe" src/ --include="*.tsx" --include="*.ts" | wc -l',
                    { encoding: 'utf-8' }
                );
                expect(parseInt(result.trim(), 10)).toBe(0);
            } catch (error) {
                expect(true).toBe(true);
            }
        });
    });

    describe('CSS Structure Verification', () => {
        it('should not have spectrum directory in styles', () => {
            const fs = require('fs');
            const path = require('path');
            const spectrumDir = path.join(
                __dirname,
                '../../../src/core/ui/styles/spectrum'
            );
            expect(fs.existsSync(spectrumDir)).toBe(false);
        });

        it('should not import spectrum in index.css', () => {
            const fs = require('fs');
            const path = require('path');
            const indexCss = fs.readFileSync(
                path.join(__dirname, '../../../src/core/ui/styles/index.css'),
                'utf-8'
            );
            expect(indexCss).not.toContain("@import './spectrum");
            expect(indexCss).not.toContain('@layer spectrum');
        });
    });
});
```

**File**: `tests/integration/spectrum-removal.test.ts`

### 9.2 Build Verification Tests

```typescript
// tests/integration/build-verification.test.ts

describe('Build Verification After Spectrum Removal', () => {
    it('should compile TypeScript without errors', () => {
        const { execSync } = require('child_process');
        expect(() => {
            execSync('npm run compile:typescript -- --noEmit', {
                encoding: 'utf-8',
                stdio: 'pipe'
            });
        }).not.toThrow();
    });

    it('should build webview bundles successfully', () => {
        const { execSync } = require('child_process');
        expect(() => {
            execSync('npm run compile:webview', {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 120000
            });
        }).not.toThrow();
    });

    it('should produce valid bundle output', () => {
        const fs = require('fs');
        const path = require('path');
        const distDir = path.join(__dirname, '../../../dist/webview');

        // Verify key bundles exist
        expect(fs.existsSync(path.join(distDir, 'wizard.js'))).toBe(true);
        expect(fs.existsSync(path.join(distDir, 'dashboard.js'))).toBe(true);
        expect(fs.existsSync(path.join(distDir, 'sidebar.js'))).toBe(true);
    });

    it('should have smaller bundle size than before migration', () => {
        const fs = require('fs');
        const path = require('path');

        // Spectrum bundle was ~800KB+ minified
        // React Aria should be significantly smaller
        const wizardBundle = path.join(__dirname, '../../../dist/webview/wizard.js');
        const stats = fs.statSync(wizardBundle);
        const sizeInKB = stats.size / 1024;

        // React Aria bundles should be under 400KB
        // (Spectrum was 800KB+)
        expect(sizeInKB).toBeLessThan(400);
    });
});
```

**File**: `tests/integration/build-verification.test.ts`

### 9.3 WebviewApp Component Tests (Updated)

```typescript
// tests/core/ui/components/WebviewApp.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { WebviewApp } from '@/core/ui/components/WebviewApp';

// Mock webviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        onMessage: jest.fn(() => jest.fn()),
        ready: jest.fn(() => Promise.resolve()),
        postMessage: jest.fn(),
    },
}));

describe('WebviewApp (Post-Spectrum Removal)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render without Spectrum Provider wrapper', async () => {
        const { container } = render(
            <WebviewApp>
                <div data-testid="child">Content</div>
            </WebviewApp>
        );

        // Should NOT have Spectrum provider classes
        expect(container.querySelector('.spectrum')).toBeNull();
        expect(container.querySelector('[class*="spectrum-Provider"]')).toBeNull();
    });

    it('should apply app-container class directly', async () => {
        const { container } = render(
            <WebviewApp className="custom-class">
                <div>Content</div>
            </WebviewApp>
        );

        // Custom class should be on a plain div, not Provider
        const wrapper = container.querySelector('.custom-class');
        expect(wrapper).not.toBeNull();
        expect(wrapper?.tagName).toBe('DIV');
    });

    it('should still handle render props pattern', () => {
        render(
            <WebviewApp>
                {(data) => (
                    <div data-testid="render-props">
                        Data: {data ? 'received' : 'null'}
                    </div>
                )}
            </WebviewApp>
        );

        // Initial render shows null data
        expect(screen.getByTestId('render-props')).toHaveTextContent('Data: null');
    });

    it('should apply vscode-dark class to body', () => {
        render(
            <WebviewApp>
                <div>Content</div>
            </WebviewApp>
        );

        expect(document.body.classList.contains('vscode-dark')).toBe(true);
    });
});
```

**File**: `tests/core/ui/components/WebviewApp.test.tsx`

---

## Implementation Details

### Phase 1: Remove Package Dependency

#### 1.1 Update package.json

**File**: `package.json`

**Changes**:
```diff
  "dependencies": {
    "@adobe/aio-lib-console": "^5.4.2",
    "@adobe/aio-lib-ims": "^7.0.2",
-   "@adobe/react-spectrum": "^3.46.0",
    "@octokit/core": "^6.1.6",
    ...
+   "react-aria-components": "^1.x.x",
    ...
  }
```

**Commands**:
```bash
npm uninstall @adobe/react-spectrum
npm install  # Ensure lockfile is clean
```

---

### Phase 2: Remove Provider Wrappers from Entry Points

#### 2.1 Update WebviewApp.tsx (Primary Provider Location)

**File**: `src/core/ui/components/WebviewApp.tsx`

**Before** (current):
```tsx
import { Provider, defaultTheme } from '@adobe/react-spectrum';
// ...
return (
    <Provider
        theme={defaultTheme}
        colorScheme="dark"
        isQuiet
        UNSAFE_className={className}
    >
        {content}
    </Provider>
);
```

**After** (no Provider):
```tsx
// Remove Spectrum imports entirely
// ...
return (
    <div className={className}>
        {content}
    </div>
);
```

#### 2.2 Update Sidebar Entry Point

**File**: `src/features/sidebar/ui/index.tsx`

**Before**:
```tsx
import { Provider, defaultTheme, Flex, ProgressCircle } from '@adobe/react-spectrum';
// ...
return (
    <Provider theme={defaultTheme} colorScheme="dark" UNSAFE_className="sidebar-provider">
        <Flex alignItems="center" justifyContent="center" UNSAFE_className="sidebar-welcome">
            <ProgressCircle size="M" isIndeterminate aria-label="Loading" />
        </Flex>
    </Provider>
);
```

**After**:
```tsx
import { Spinner } from '@/core/ui/components';  // React Aria version
// ...
return (
    <div className="sidebar-provider">
        <div className="sidebar-welcome flex items-center justify-center">
            <Spinner size="medium" label="Loading" />
        </div>
    </div>
);
```

#### 2.3 Update Wizard Entry Point

**File**: `src/features/project-creation/ui/wizard/index.tsx`

**Before**:
```tsx
import { View } from '@adobe/react-spectrum';
// ...
loadingContent={
    <View padding="size-400">
        <div>Initializing...</div>
    </View>
}
```

**After**:
```tsx
// Remove View import
loadingContent={
    <div className="p-6">
        <div>Initializing...</div>
    </div>
}
```

---

### Phase 3: Eliminate UNSAFE_className Across Codebase

#### 3.1 Search and Replace Strategy

**Files with UNSAFE_className** (62 files identified):

The grep search identified 62 files. Each must be updated to use standard `className` prop with React Aria components.

**Pattern Transformation**:
```tsx
// Before (Spectrum)
<Button UNSAFE_className="my-class" variant="cta">Click</Button>

// After (React Aria)
<Button className="my-class btn-cta">Click</Button>
```

#### 3.2 Priority Files (High Impact)

1. **Core UI Components**:
   - `src/core/ui/components/WebviewApp.tsx`
   - `src/core/ui/components/TimelineNav.tsx`
   - `src/core/ui/components/ErrorBoundary.tsx`
   - `src/core/ui/components/layout/PageHeader.tsx`
   - `src/core/ui/components/layout/PageFooter.tsx`
   - `src/core/ui/components/wizard/ConfigurationSummary.tsx`
   - `src/core/ui/components/feedback/EmptyState.tsx`
   - `src/core/ui/components/feedback/StatusDisplay.tsx`
   - `src/core/ui/components/feedback/LoadingDisplay.tsx`
   - `src/core/ui/components/feedback/LoadingOverlay.tsx`
   - `src/core/ui/components/navigation/SearchableList.tsx`
   - `src/core/ui/components/navigation/SearchHeader.tsx`
   - `src/core/ui/components/navigation/NavigationPanel.tsx`
   - `src/core/ui/components/forms/FieldHelpButton.tsx`
   - `src/core/ui/components/ui/NumberedInstructions.tsx`
   - `src/core/ui/components/ui/Spinner.tsx`

2. **Feature Components**:
   - All files in `src/features/*/ui/` directories

#### 3.3 Automated Search Command

```bash
# Find all UNSAFE_className occurrences
grep -rn "UNSAFE_className" src/ --include="*.tsx" --include="*.ts"

# Count occurrences per file
grep -rc "UNSAFE_className" src/ --include="*.tsx" --include="*.ts" | grep -v ":0$"
```

---

### Phase 4: CSS Cleanup

#### 4.1 Remove Spectrum CSS Directory

**Files to Delete**:
```
src/core/ui/styles/spectrum/
  - index.css
  - buttons.css
  - components.css
```

**Command**:
```bash
rm -rf src/core/ui/styles/spectrum/
```

#### 4.2 Update CSS Index

**File**: `src/core/ui/styles/index.css`

**Before**:
```css
/* 5-Layer cascade order (lowest to highest priority) - MUST be first */
@layer reset, vscode-theme, spectrum, components, utilities;

/* ... */

/* Spectrum overrides (medium specificity, component overrides) */
@import './spectrum/index.css';
```

**After**:
```css
/* 4-Layer cascade order (lowest to highest priority) - MUST be first */
@layer reset, vscode-theme, components, utilities;

/* ... */

/* Remove: @import './spectrum/index.css'; */
```

#### 4.3 Update custom-spectrum.css

**File**: `src/core/ui/styles/custom-spectrum.css`

If this file only re-exports spectrum imports, delete it entirely. Otherwise, migrate any still-needed styles to `components/` directory.

#### 4.4 Update CLAUDE.md Documentation

**File**: `src/core/ui/styles/CLAUDE.md`

Update the documentation to reflect the new 4-layer cascade system without Spectrum.

---

### Phase 5: Final Verification

#### 5.1 Run Full Test Suite

```bash
npm test
```

#### 5.2 Verify No Spectrum References

```bash
# Should return no results
grep -r "@adobe/react-spectrum" src/
grep -r "UNSAFE_className" src/
grep -r "defaultTheme" src/ --include="*.tsx"
grep -r "from '@adobe/react-spectrum'" src/
```

#### 5.3 Verify Package Not Installed

```bash
# Should fail with "not installed" or similar
npm ls @adobe/react-spectrum
```

#### 5.4 Build and Verify Bundle Size

```bash
npm run compile:webview
ls -la dist/webview/*.js
```

---

## Files to Create/Modify

### Files to Modify

- [ ] `package.json` - Remove @adobe/react-spectrum dependency
- [ ] `src/core/ui/components/WebviewApp.tsx` - Remove Provider wrapper
- [ ] `src/features/sidebar/ui/index.tsx` - Remove Provider, use React Aria components
- [ ] `src/features/project-creation/ui/wizard/index.tsx` - Remove View import
- [ ] `src/core/ui/styles/index.css` - Remove spectrum layer and import
- [ ] `src/core/ui/styles/CLAUDE.md` - Update documentation
- [ ] 62 files with UNSAFE_className - Replace with className

### Files to Delete

- [ ] `src/core/ui/styles/spectrum/index.css`
- [ ] `src/core/ui/styles/spectrum/buttons.css`
- [ ] `src/core/ui/styles/spectrum/components.css`
- [ ] `src/core/ui/styles/spectrum/` (directory)
- [ ] `src/core/ui/styles/custom-spectrum.css` (if only Spectrum re-exports)

### Files to Create

- [ ] `tests/integration/spectrum-removal.test.ts` - Dependency verification tests
- [ ] `tests/integration/build-verification.test.ts` - Build verification tests

---

## Acceptance Criteria

- [ ] `@adobe/react-spectrum` removed from package.json
- [ ] `npm ls @adobe/react-spectrum` returns "not installed"
- [ ] Zero UNSAFE_className occurrences in src/
- [ ] Zero @adobe/react-spectrum imports in src/
- [ ] No Provider/defaultTheme wrappers in entry points
- [ ] spectrum/ CSS directory removed
- [ ] CSS @layer declaration updated (4 layers)
- [ ] All tests passing
- [ ] Build compiles successfully
- [ ] Bundle size reduced (target: <400KB for wizard.js)
- [ ] All webviews render correctly
- [ ] Documentation updated

---

## Expected Outcome

After this step:
1. The project has zero dependency on `@adobe/react-spectrum`
2. All UNSAFE_className props are eliminated (cleaner code)
3. CSS cascade is simplified (4 layers instead of 5)
4. Bundle size is significantly reduced (~50% smaller)
5. No Spectrum-specific overrides needed in CSS
6. Codebase uses only React Aria for component primitives

---

## Rollback Plan

If critical issues discovered:
1. Revert package.json changes: `git checkout package.json`
2. Reinstall Spectrum: `npm install @adobe/react-spectrum@3.46.0`
3. Revert entry point changes
4. Restore spectrum/ CSS directory from git

Keep the branch isolated until verification complete.

---

## Notes

### UNSAFE_className Migration Context

The 62 files with UNSAFE_className use it because Spectrum components don't accept standard `className`. React Aria components DO accept `className` directly, making the code cleaner:

```tsx
// Spectrum (awkward)
<Button UNSAFE_className="my-custom-class">Click</Button>

// React Aria (standard React pattern)
<Button className="my-custom-class">Click</Button>
```

### CSS Layer Simplification

The Spectrum layer was needed for:
1. Button cursor overrides (pointer cursor)
2. CTA button color overrides (Tangerine Orange)
3. Progress bar animations
4. Size variations

With React Aria, these can be handled via:
1. Standard CSS on React Aria components
2. CSS custom properties
3. Tailwind-style utility classes already in place

### Bundle Size Impact

Spectrum bundle analysis (approximate):
- @adobe/react-spectrum: ~400KB minified
- Spectrum CSS: ~300KB
- Total: ~700KB+

React Aria bundle (approximate):
- react-aria-components: ~80KB minified
- Custom CSS: ~50KB
- Total: ~130KB

Expected reduction: **~80%** bundle size decrease for UI framework code.
