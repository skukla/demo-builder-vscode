# Step 2: Migrate Existing @layer Declarations

## Purpose

Migrate existing `@layer theme` and `@layer overrides` declarations to the new layer names established in Step 1. This ensures CSS files are assigned to appropriate cascade layers.

**Why Second?**: Step 1 declared the 5-layer hierarchy. Now each file needs to wrap its styles in the correct layer to benefit from cascade ordering.

**Files to Migrate**:
- `tokens.css` and `vscode-theme.css`: `@layer theme` to `@layer vscode-theme` (theme variables)
- `wizard.css`: `@layer theme` to `@layer components` (component-level styles)
- `spectrum/buttons.css`: `@layer overrides` to `@layer spectrum` (Spectrum overrides)

## Prerequisites

- [x] Step 1 complete: 5-layer declaration exists in `index.css`

## Tests to Write First

### Test File: `tests/core/ui/styles/layerMigration.test.ts`

- [ ] **Test: tokens.css uses @layer vscode-theme**
  - **Given:** The `tokens.css` file exists
  - **When:** Reading the file content
  - **Then:** Contains `@layer vscode-theme {` and NOT `@layer theme {`
  - **File:** `tests/core/ui/styles/layerMigration.test.ts`

- [ ] **Test: vscode-theme.css uses @layer vscode-theme**
  - **Given:** The `vscode-theme.css` file exists
  - **When:** Reading the file content
  - **Then:** Contains `@layer vscode-theme {` and NOT `@layer theme {`
  - **File:** `tests/core/ui/styles/layerMigration.test.ts`

- [ ] **Test: wizard.css uses @layer components**
  - **Given:** The `wizard.css` file exists
  - **When:** Reading the file content
  - **Then:** All `@layer` blocks are `@layer components {`, NOT `@layer theme {`
  - **File:** `tests/core/ui/styles/layerMigration.test.ts`

- [ ] **Test: spectrum/buttons.css uses @layer spectrum**
  - **Given:** The `spectrum/buttons.css` file exists
  - **When:** Reading the file content
  - **Then:** Contains `@layer spectrum {` and NOT `@layer overrides {`
  - **File:** `tests/core/ui/styles/layerMigration.test.ts`

- [ ] **Test: No files contain deprecated layer names**
  - **Given:** All migrated CSS files
  - **When:** Searching for old patterns
  - **Then:** None contain `@layer theme {` or `@layer overrides {`
  - **File:** `tests/core/ui/styles/layerMigration.test.ts`

## Files to Modify

**Important Note:** These files ALREADY have @layer declarations that need RENAMING. This is NOT about adding new layer wrappers (that happens in Steps 3-5). This step ONLY renames existing @layer blocks to match the new 5-layer hierarchy names.

- [ ] `src/core/ui/styles/tokens.css` - Line 7: Rename `@layer theme {` to `@layer vscode-theme {`
- [ ] `src/core/ui/styles/vscode-theme.css` - Line 12: Rename `@layer theme {` to `@layer vscode-theme {`
- [ ] `src/core/ui/styles/wizard.css` - Lines 11, 34: Rename both `@layer theme {` blocks to `@layer components {`
- [ ] `src/core/ui/styles/spectrum/buttons.css` - Line 57: Rename `@layer overrides {` to `@layer spectrum {`

## Implementation Details

### RED Phase (Write Failing Tests First)

Create `tests/core/ui/styles/layerMigration.test.ts`:

```typescript
/**
 * Layer Migration Tests
 *
 * Validates CSS files use the new 5-layer architecture layer names.
 * Part of CSS Architecture Improvement - Step 2: Layer Migration
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Migration', () => {
  const stylesPath = resolve(__dirname, '../../../../src/core/ui/styles');

  describe('vscode-theme layer assignment', () => {
    it('tokens.css uses @layer vscode-theme', () => {
      const content = readFileSync(resolve(stylesPath, 'tokens.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+vscode-theme\s*\{/);
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });

    it('vscode-theme.css uses @layer vscode-theme', () => {
      const content = readFileSync(resolve(stylesPath, 'vscode-theme.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+vscode-theme\s*\{/);
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });
  });

  describe('components layer assignment', () => {
    it('wizard.css uses @layer components', () => {
      const content = readFileSync(resolve(stylesPath, 'wizard.css'), 'utf-8');
      // Should have components layer blocks
      expect(content).toMatch(/@layer\s+components\s*\{/);
      // Should NOT have theme layer blocks
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });
  });

  describe('spectrum layer assignment', () => {
    it('spectrum/buttons.css uses @layer spectrum', () => {
      const content = readFileSync(resolve(stylesPath, 'spectrum/buttons.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+spectrum\s*\{/);
      expect(content).not.toMatch(/@layer\s+overrides\s*\{/);
    });
  });

  describe('deprecated layer names removed', () => {
    const filesToCheck = [
      'tokens.css',
      'vscode-theme.css',
      'wizard.css',
      'spectrum/buttons.css',
    ];

    it.each(filesToCheck)('%s does not contain deprecated layer names', (file) => {
      const content = readFileSync(resolve(stylesPath, file), 'utf-8');
      // @layer theme { is deprecated (but @layer vscode-theme { is valid)
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
      // @layer overrides { is deprecated (but @layer spectrum { is valid)
      expect(content).not.toMatch(/@layer\s+overrides\s*\{/);
    });
  });
});
```

Run the tests:

```bash
npm run test:file -- tests/core/ui/styles/layerMigration.test.ts
```

**Expected Result:** Tests FAIL because files still use old layer names.

### GREEN Phase (Minimal Implementation to Pass Tests)

**1. Update tokens.css (Line 7):**

```css
/* Before */
@layer theme {

/* After */
@layer vscode-theme {
```

**2. Update vscode-theme.css (Line 12):**

```css
/* Before */
@layer theme {

/* After */
@layer vscode-theme {
```

**3. Update wizard.css (Lines 11 and 34):**

Both `@layer theme {` blocks become `@layer components {`:

```css
/* Before (line 11) */
@layer theme {

/* After */
@layer components {

/* Before (line 34) */
@layer theme {

/* After */
@layer components {
```

**4. Update spectrum/buttons.css (Line 57):**

```css
/* Before */
@layer overrides {

/* After */
@layer spectrum {
```

Run tests:

```bash
npm run test:file -- tests/core/ui/styles/layerMigration.test.ts
```

**Expected Result:** All tests PASS.

### REFACTOR Phase (Improve While Keeping Tests Green)

1. **Update comments** in each file to reflect new layer names:

   In `tokens.css` header comment, consider adding:
   ```css
   /* Layer: vscode-theme (VS Code integration & design tokens) */
   ```

2. **Verify no stale comments** reference old layer names.

3. Re-run tests:
   ```bash
   npm run test:file -- tests/core/ui/styles/layerMigration.test.ts
   ```

## Expected Outcome

After completing this step:

- [x] `tokens.css` wraps content in `@layer vscode-theme {}`
- [x] `vscode-theme.css` wraps content in `@layer vscode-theme {}`
- [x] `wizard.css` wraps content in `@layer components {}`
- [x] `spectrum/buttons.css` wraps CTA overrides in `@layer spectrum {}`
- [x] No CSS files contain deprecated `@layer theme {` or `@layer overrides {`
- [x] Build compiles successfully
- [x] Tests passing: 6 tests in `layerMigration.test.ts`

**Visual Impact:** Minimal. The cascade order now correctly places:
- VS Code theme variables at layer 2 (vscode-theme)
- Wizard component styles at layer 4 (components)
- Spectrum button overrides at layer 3 (spectrum)

## Acceptance Criteria

- [ ] `tokens.css` uses `@layer vscode-theme`
- [ ] `vscode-theme.css` uses `@layer vscode-theme`
- [ ] `wizard.css` uses `@layer components` (both blocks)
- [ ] `spectrum/buttons.css` uses `@layer spectrum`
- [ ] No files contain `@layer theme {` or `@layer overrides {`
- [ ] Build succeeds with `npm run compile`
- [ ] All tests in `layerMigration.test.ts` pass
- [ ] No visual regressions in wizard, dashboard, welcome, configure webviews

## Dependencies from Other Steps

- **Depends on:** Step 1 (5-layer declaration must exist)
- **Depended on by:** Steps 3-5 (subsequent files will use these layer names as reference)

## Estimated Time

30 minutes (including test writing and verification)

## Verification Commands

```bash
# Run step-specific tests
npm run test:file -- tests/core/ui/styles/layerMigration.test.ts

# Run all layer-related tests
npm run test:file -- tests/core/ui/styles/

# Verify build compiles
npm run compile

# Manual verification: Open each webview
# - Wizard: "Demo Builder: Create Project"
# - Dashboard: Click project in sidebar
# - Configure: Click "Configure" in dashboard
# - Welcome: "Demo Builder: Welcome"
```

## Rollback Plan

If issues arise, revert each file to original layer names:
- `@layer vscode-theme` back to `@layer theme`
- `@layer components` back to `@layer theme`
- `@layer spectrum` back to `@layer overrides`

This is a find-replace operation with no cascading dependencies until Steps 3-5 add more files to these layers.

---

_Step 2 of 8 in CSS Layer Architecture Improvement_
_Status: Ready for TDD Implementation_
