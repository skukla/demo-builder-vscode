# Step 1: Fix WizardContainer Test Mocks

## Purpose

Fix 55+ WizardContainer test failures caused by missing `brandStackLoader.ts` mock. The tests fail because `loadStacks()` accesses `componentsConfig.components` which is undefined in the test environment.

## Prerequisites

- [ ] Understanding of Jest mock patterns
- [ ] Familiarity with WizardContainer.mocks.tsx

## Root Cause Analysis

**Error**: `TypeError: Cannot read properties of undefined (reading 'citisignal-nextjs')`

**Location**: `src/features/project-creation/ui/helpers/brandStackLoader.ts:29`

**Cause**: WizardContainer calls `loadBrands()` and `loadStacks()` in useEffect, but tests don't mock the brandStackLoader module. The JSON import for `components.json` returns undefined in jsdom.

## Tests to Write First

- [ ] Test: Verify mock returns valid brands array
  - **Given:** Mock brandStackLoader
  - **When:** loadBrands() called
  - **Then:** Returns array with test brand
  - **File:** Inline in WizardContainer.mocks.tsx

- [ ] Test: Verify mock returns valid stacks array
  - **Given:** Mock brandStackLoader
  - **When:** loadStacks() called
  - **Then:** Returns array with test stack
  - **File:** Inline in WizardContainer.mocks.tsx

## Files to Modify

- [ ] `tests/features/project-creation/ui/wizard/WizardContainer.mocks.tsx` - Add brandStackLoader mock

## Implementation Details

### RED Phase

The tests are already failing - this is our RED state.

### GREEN Phase

Add mock to WizardContainer.mocks.tsx:

```typescript
// Mock brandStackLoader to prevent undefined components access
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    loadBrands: jest.fn().mockResolvedValue([
        {
            id: 'test-brand',
            name: 'Test Brand',
            description: 'Test brand for unit tests',
            logo: '/test-logo.svg',
            stacks: ['test-stack'],
        },
    ]),
    loadStacks: jest.fn().mockResolvedValue([
        {
            id: 'test-stack',
            name: 'Test Stack',
            frontend: 'test-frontend',
            backend: 'test-backend',
        },
    ]),
}));
```

### REFACTOR Phase

- Verify mock structure matches actual return types
- Ensure mock is imported before component imports (order matters)

## Expected Outcome

- [ ] All 55+ WizardContainer tests passing
- [ ] No changes to production code
- [ ] Mock follows existing mock patterns in file

## Acceptance Criteria

- [ ] `npm run test:fast -- --testPathPatterns="WizardContainer"` passes all tests
- [ ] Mock added to shared mocks file (not duplicated per test)
- [ ] Mock returns type-safe data matching Brand and Stack interfaces

## Estimated Time

15 minutes

---

_Step 1 of 2_
