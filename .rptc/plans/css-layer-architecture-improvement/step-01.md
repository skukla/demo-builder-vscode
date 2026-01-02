# Step 1: Update @layer Declaration

## Purpose

Update the @layer declaration in `index.css` from the current 3-layer hierarchy (`reset, theme, overrides`) to the new 5-layer hierarchy (`reset, vscode-theme, spectrum, components, utilities`).

**Why First?**: The layer declaration establishes cascade priority order. All subsequent steps (wrapping CSS files in their respective layers) depend on this declaration existing first. Layers that aren't declared are treated as unlayered CSS with highest specificity - the opposite of our intent.

**Rationale**: The 5-layer architecture enables cascade-based priority control:
- `reset` (lowest) - Browser normalization
- `vscode-theme` - VS Code theme variables and base styling
- `spectrum` - Adobe Spectrum component overrides
- `components` - Semantic component styles
- `utilities` (highest) - Single-purpose utility classes that must win

## Prerequisites

- [ ] None (this is Step 1)

## Tests to Write First

### Test File: `tests/core/ui/styles/layerDeclaration.test.ts`

- [ ] **Test: Layer declaration contains exactly 5 layers in correct order**
  - **Given:** The `index.css` file exists
  - **When:** Reading the @layer declaration
  - **Then:** Contains exactly `@layer reset, vscode-theme, spectrum, components, utilities;`
  - **File:** `tests/core/ui/styles/layerDeclaration.test.ts`

- [ ] **Test: Layer declaration appears before any @import statements**
  - **Given:** The `index.css` file exists
  - **When:** Checking line positions
  - **Then:** @layer declaration line number < first @import line number
  - **File:** `tests/core/ui/styles/layerDeclaration.test.ts`

- [ ] **Test: Layer declaration is the first non-comment CSS rule**
  - **Given:** The `index.css` file exists
  - **When:** Parsing for CSS rules (excluding comments)
  - **Then:** @layer declaration is the first rule encountered
  - **File:** `tests/core/ui/styles/layerDeclaration.test.ts`

- [ ] **Test: No duplicate layer declarations exist**
  - **Given:** The `index.css` file exists
  - **When:** Counting @layer declarations with layer names
  - **Then:** Exactly one top-level @layer declaration exists
  - **File:** `tests/core/ui/styles/layerDeclaration.test.ts`

- [ ] **Test: Old 3-layer declaration is not present**
  - **Given:** The `index.css` file has been updated
  - **When:** Searching for old pattern
  - **Then:** Does not contain `@layer reset, theme, overrides`
  - **File:** `tests/core/ui/styles/layerDeclaration.test.ts`

## Files to Modify

- [ ] `src/core/ui/styles/index.css` - Update @layer declaration on line 7

## Implementation Details

### RED Phase (Write Failing Tests First)

Create `tests/core/ui/styles/layerDeclaration.test.ts`:

```typescript
/**
 * Layer Declaration Tests
 *
 * Validates the 5-layer CSS architecture declaration in index.css.
 * Part of CSS Architecture Improvement - Step 1: Layer Declaration Update
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Declaration', () => {
  const indexCSSPath = resolve(
    __dirname,
    '../../../../src/core/ui/styles/index.css'
  );
  let cssContent: string;

  beforeAll(() => {
    cssContent = readFileSync(indexCSSPath, 'utf-8');
  });

  describe('5-Layer Architecture', () => {
    it('declares exactly 5 layers in correct order', () => {
      expect(cssContent).toMatch(
        /@layer\s+reset\s*,\s*vscode-theme\s*,\s*spectrum\s*,\s*components\s*,\s*utilities\s*;/
      );
    });

    it('does not contain old 3-layer declaration', () => {
      expect(cssContent).not.toMatch(/@layer\s+reset\s*,\s*theme\s*,\s*overrides/);
    });

    it('has layer declaration before any @import statements', () => {
      const layerMatch = cssContent.match(/@layer\s+reset/);
      const importMatch = cssContent.match(/@import/);

      expect(layerMatch).not.toBeNull();
      expect(importMatch).not.toBeNull();

      const layerIndex = layerMatch!.index!;
      const importIndex = importMatch!.index!;

      expect(layerIndex).toBeLessThan(importIndex);
    });

    it('has exactly one top-level layer declaration', () => {
      // Match @layer declarations with layer names (not @layer {} blocks)
      const layerDeclarations = cssContent.match(
        /@layer\s+[\w-]+\s*(?:,\s*[\w-]+)*\s*;/g
      );

      expect(layerDeclarations).toHaveLength(1);
    });
  });

  describe('Declaration Positioning', () => {
    it('layer declaration is first non-comment CSS rule', () => {
      // Remove all CSS comments
      const withoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
      // Trim whitespace
      const trimmed = withoutComments.trim();
      // First rule should start with @layer
      expect(trimmed).toMatch(/^@layer/);
    });
  });
});
```

Run the tests:

```bash
npm run test:file -- tests/core/ui/styles/layerDeclaration.test.ts
```

**Expected Result:** Tests FAIL because `index.css` still has `@layer reset, theme, overrides;`

### GREEN Phase (Minimal Implementation to Pass Tests)

1. Open `src/core/ui/styles/index.css`

2. Locate line 7:
   ```css
   @layer reset, theme, overrides;
   ```

3. Replace with:
   ```css
   @layer reset, vscode-theme, spectrum, components, utilities;
   ```

4. Run tests:
   ```bash
   npm run test:file -- tests/core/ui/styles/layerDeclaration.test.ts
   ```

**Expected Result:** All tests PASS

5. Verify build compiles:
   ```bash
   npm run compile
   ```

**Expected Result:** Build succeeds without errors

### REFACTOR Phase (Improve While Keeping Tests Green)

1. **Update the comment above the declaration** to reflect the new architecture:

   Change line 6 comment from:
   ```css
   /* Layer order declaration - MUST be first */
   ```

   To:
   ```css
   /* 5-Layer cascade order (lowest to highest priority) - MUST be first */
   ```

2. Re-run tests to ensure they still pass:
   ```bash
   npm run test:file -- tests/core/ui/styles/layerDeclaration.test.ts
   ```

3. **No other refactoring needed** - this is a minimal, surgical change

## Expected Outcome

After completing this step:

- [x] `index.css` has 5-layer declaration: `@layer reset, vscode-theme, spectrum, components, utilities;`
- [x] Layer declaration appears before all @import statements
- [x] Build compiles successfully (`npm run compile`)
- [x] All existing webviews still render correctly (layers are declared but empty)
- [x] Tests passing: 5 unit tests in `layerDeclaration.test.ts`

**Visual Impact:** None. The layers are declared but not yet populated. CSS files that aren't wrapped in `@layer` blocks are treated as unlayered CSS (highest specificity), so existing styles continue to work identically.

## Acceptance Criteria

- [ ] @layer declaration updated from 3 layers to 5 layers
- [ ] Layer order is exactly: `reset, vscode-theme, spectrum, components, utilities`
- [ ] Layer declaration is first non-comment CSS rule in index.css
- [ ] Build succeeds with `npm run compile`
- [ ] All tests in `layerDeclaration.test.ts` pass
- [ ] No visual regressions in any webview (wizard, welcome, dashboard, configure)

## Dependencies from Other Steps

- **None** - This is Step 1
- **Depended on by:** Steps 2-5 (all layer wrapping steps require this declaration)

## Estimated Time

30 minutes (including test writing and verification)

## Verification Commands

```bash
# Run step-specific tests
npm run test:file -- tests/core/ui/styles/layerDeclaration.test.ts

# Verify build compiles
npm run compile

# Run all CSS-related tests (quick regression check)
npm run test:file -- tests/core/ui/styles/

# Manual verification: Open each webview and confirm no visual issues
# - Wizard: Command Palette > "Demo Builder: Create Project"
# - Dashboard: Click existing project in sidebar
# - Configure: Click "Configure" in dashboard
# - Welcome: Command Palette > "Demo Builder: Welcome"
```

## Rollback Plan

If issues arise, revert line 7 of `index.css` to:
```css
@layer reset, theme, overrides;
```

This is a single-line change with no downstream dependencies until Steps 2-5 are completed.

---

_Step 1 of 8 in CSS Layer Architecture Improvement_
_Status: Ready for TDD Implementation_
