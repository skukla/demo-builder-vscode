# Step 10: ESLint & Final Verification

## Purpose

Finalize ESLint configuration with stricter complexity rules and perform comprehensive verification that all refactoring goals have been achieved.

## Prerequisites

- [ ] Steps 1-9 completed
- [ ] All tests passing
- [ ] TypeScript compiles without errors

## Tests to Write First

No new unit tests - this step focuses on configuration and verification.

- [ ] **Test:** ESLint runs without critical errors
  - **Given:** Updated ESLint configuration
  - **When:** `npm run lint` is executed
  - **Then:** No errors (warnings acceptable for gradual adoption)

## Implementation Details

### Part 1: ESLint Configuration Updates

**File:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/eslint.config.mjs`

**Current State Analysis:**
- `complexity`: Currently set to `['warn', 25]` - lower to `['warn', 15]`
- `@typescript-eslint/no-explicit-any`: Already `'warn'`
- `max-lines-per-function`: Not present - add `['warn', { max: 50 }]`
- `max-lines`: Present for tests (500) - add for src files

**Updates Required:**

```javascript
// In the src/**/*.ts, src/**/*.tsx config section, update/add:
rules: {
    // ... existing rules ...

    // Tighten complexity (from 25 to 15)
    'complexity': ['warn', 15],

    // Add function size limit
    'max-lines-per-function': ['warn', {
        max: 50,
        skipBlankLines: true,
        skipComments: true
    }],

    // Add file size limit for source files
    'max-lines': ['warn', {
        max: 500,
        skipBlankLines: true,
        skipComments: true,
    }],

    // Upgrade any to error for stricter enforcement (Phase 2)
    '@typescript-eslint/no-explicit-any': 'error',
}
```

**Optional - SonarJS Plugin (if desired):**

```bash
npm install --save-dev eslint-plugin-sonarjs
```

Then add to config:
```javascript
import sonarjs from 'eslint-plugin-sonarjs';
// ...
plugins: {
    sonarjs,
},
rules: {
    'sonarjs/cognitive-complexity': ['warn', 15],
}
```

### Part 2: Fix ESLint Violations

After updating config, run:

```bash
npm run lint 2>&1 | head -100
```

Address violations by priority:
1. **Errors** - Must fix (blocking)
2. **Complexity warnings** - Extract helper functions
3. **File size warnings** - Split into modules
4. **Any warnings** - Add proper types

### Part 3: Final Verification Checklist

- [ ] All tests pass: `npm test`
- [ ] TypeScript compiles: `npm run compile:typescript`
- [ ] Coverage >= 85%: `npm run test:coverage`
- [ ] No ESLint errors: `npm run lint`
- [ ] No cognitive complexity > 15
- [ ] No file > 500 lines
- [ ] All imports resolve correctly

### Part 4: Document Final Metrics

**Create metrics summary at:** `.rptc/plans/code-efficiency-refactoring/METRICS_FINAL.md`

```markdown
# Code Efficiency Refactoring - Final Metrics

## Summary

| Metric | Baseline | Final | Change |
|--------|----------|-------|--------|
| Total LOC | TBD | TBD | -X% |
| Files > 500 lines | TBD | 0 | -100% |
| Functions > 50 lines | TBD | TBD | -X% |
| `any` usages | TBD | TBD | -X% |
| Test coverage | TBD | 85%+ | +X% |
| CC > 15 violations | TBD | 0 | -100% |

## Step-by-Step Impact

| Step | Focus | LOC Change | CC Reduction |
|------|-------|------------|--------------|
| 1 | Shared Utilities | -X | -Y |
| 2 | Testing Infrastructure | -X | -Y |
| ... | ... | ... | ... |

## Quality Improvements

- Removed X duplicate code blocks
- Extracted Y shared utilities
- Eliminated Z type-unsafe patterns
- Added N new abstractions

## ESLint Configuration

Final rules enforced:
- complexity: warn @ 15
- max-lines-per-function: warn @ 50
- max-lines: warn @ 500
- no-explicit-any: error
```

## Files to Create/Modify

- [ ] `eslint.config.mjs` - Update complexity and add new rules
- [ ] `.rptc/plans/code-efficiency-refactoring/METRICS_FINAL.md` - Document final metrics

## Acceptance Criteria

- [ ] ESLint config updated with stricter rules
- [ ] `npm run lint` passes (errors = 0)
- [ ] `npm test` passes
- [ ] `npm run compile:typescript` passes
- [ ] Coverage documented (target >= 85%)
- [ ] Final metrics documented

## Estimated Time

2-4 hours (depending on number of violations to fix)

## Improvement Tracking

```
Step 10 (FINAL) Impact Summary:
- LOC: net change from baseline (TBD after run)
- CC Reduction: total across all steps (TBD)
- Type Safety: final `any` count (TBD)
- Abstractions: total new helpers/hooks/components (TBD)
- Coverage: final % (target >= 85%)

CUMULATIVE TOTALS (Expected):
- LOC: -316+ (duplicates removed)
- CC Reduction: ~50+ points total
- Type Safety: significant `any` reduction
- Abstractions: +30+ new modules
- Coverage: baseline -> 85%+
```

## Rollback Plan

If stricter ESLint rules cause too many violations:
1. Temporarily revert to `'warn'` level
2. Create tracking issues for violations
3. Address violations incrementally over subsequent PRs
