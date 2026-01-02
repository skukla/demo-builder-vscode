# Step 1: Quick Wins - Dead CSS Audit & Cleanup

## Status
- [x] Tests Written
- [x] Implementation Complete
- [x] Tests Passing
- [x] Refactored

## Purpose

Remove unused CSS classes from `custom-spectrum.css` to reduce bundle size and maintenance burden. Research identified ~50-100 unused utility classes representing 5-10% dead code (~150-300 lines). This is a zero-risk, high-value cleanup that requires no architectural changes.

## Prerequisites

- [ ] Node.js installed (for running audit scripts)
- [ ] Access to codebase grep/search tools

## Tests to Write First

### Test 1: Verify removed classes have no codebase references
- [ ] **Test:** Dead CSS classes are not referenced in any TSX/TS files
  - **Given:** A list of CSS class names identified for removal
  - **When:** Searching entire codebase (src/, tests/) for each class name
  - **Then:** Zero matches found for any removed class
  - **File:** `tests/core/ui/styles/deadCssAudit.test.ts`

### Test 2: Verify remaining utility classes still work
- [ ] **Test:** Active utility classes render correctly in components
  - **Given:** Components using utility classes (text-sm, flex-center, mb-4, etc.)
  - **When:** Component renders
  - **Then:** Expected CSS properties applied (verified via computed styles)
  - **File:** `tests/core/ui/styles/utilityClasses.test.ts`

### Test 3: Verify CSS file line count reduction
- [ ] **Test:** custom-spectrum.css reduced by target amount
  - **Given:** Original line count baseline (3,147 lines)
  - **When:** Dead CSS removed
  - **Then:** Line count reduced by 5-10% (~150-300 lines)
  - **File:** `tests/core/ui/styles/deadCssAudit.test.ts`

## Files to Create/Modify

- [ ] `scripts/audit-dead-css.js` - Script to identify unused CSS classes
- [ ] `src/core/ui/styles/custom-spectrum.css` - Remove dead classes (~50-100 classes)
- [ ] `tests/core/ui/styles/deadCssAudit.test.ts` - Verification tests
- [ ] `tests/core/ui/styles/utilityClasses.test.ts` - Utility class tests

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
// tests/core/ui/styles/deadCssAudit.test.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Dead CSS Audit', () => {
  const cssPath = path.join(__dirname, '../../../../src/core/ui/styles/custom-spectrum.css');

  // Classes confirmed unused by audit (populate during GREEN phase)
  const removedClasses: string[] = [
    // Will be populated after PurgeCSS audit
  ];

  it('should have no references to removed classes in codebase', () => {
    for (const className of removedClasses) {
      const result = execSync(
        `grep -r "${className}" src/ --include="*.tsx" --include="*.ts" || true`,
        { encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('');
    }
  });

  it('should reduce custom-spectrum.css by at least 100 lines', () => {
    const content = fs.readFileSync(cssPath, 'utf-8');
    const lineCount = content.split('\n').length;
    // Baseline: 3,147 lines, target: 3,000 or less
    expect(lineCount).toBeLessThan(3050);
  });
});
```

### GREEN Phase (Minimal implementation to pass tests)

1. **Run PurgeCSS Audit:**
   ```bash
   npx purgecss --css src/core/ui/styles/custom-spectrum.css \
     --content "src/**/*.tsx" "src/**/*.ts" \
     --output purge-report.css
   ```

2. **Create audit script** (`scripts/audit-dead-css.js`):
   - Parse custom-spectrum.css for all class selectors
   - Search codebase for each class name
   - Output list of unused classes

3. **Identify candidate classes** (from research):
   - `.border-t`, `.border-r`, `.border-b`, `.border-l`
   - `.border-dashed`, `.border-dotted`
   - Unused `.w-*`, `.h-*` variants
   - Unused color utilities

4. **Remove verified dead classes** from custom-spectrum.css

5. **Update test** with actual removed class list

### REFACTOR Phase

1. Add comment header documenting audit date
2. Ensure remaining classes organized logically
3. Verify no visual regressions in webview

## Expected Outcome

- custom-spectrum.css reduced from ~3,147 lines to ~2,900-3,000 lines
- 50-100 unused utility classes removed
- Zero visual regressions (no code references these classes)
- Audit script available for future use

## Acceptance Criteria

- [ ] Dead CSS audit completed (classes identified and documented)
- [ ] At least 50 unused classes removed
- [ ] Line count reduced by 5%+ (150+ lines)
- [ ] All tests passing
- [ ] No grep matches for removed classes in src/
- [ ] Visual spot-check of wizard UI confirms no regressions

## Dependencies from Other Steps

None - this step is independent and can be executed immediately. Completing this step makes later steps cleaner by reducing the CSS that needs to be analyzed for migration.

## Estimated Time

2-3 hours (audit: 1 hour, removal: 1 hour, verification: 30 min)
