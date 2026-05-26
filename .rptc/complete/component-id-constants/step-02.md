# Step 2: Update typeGuards.ts to use constants

## Summary
Replace hardcoded `'eds-storefront'` strings with `COMPONENT_IDS.EDS_STOREFRONT` in EDS accessor functions.

## Purpose
Eliminate magic strings in type guard functions, ensuring consistent component ID usage across the codebase.

## Prerequisites
- [ ] Step 1 completed (COMPONENT_IDS constant exists in src/core/constants.ts)

## Tests to Write First (TDD)

### Test File: `tests/types/typeGuards-project-accessors.test.ts`

No new tests required. Existing tests cover the EDS functions:
- getEdsLiveUrl - 7 existing tests
- getEdsPreviewUrl - 5 existing tests
- getEdsDaLiveUrl - tested via typeGuards-project-accessors.test.ts

**Note**: typeGuards.ts has 6 'eds-storefront' occurrences (3 runtime lookups + 3 JSDoc comments). Replace all 6 for consistency.

**Verification**: Run existing tests to confirm they still pass after refactor.

```bash
npm run test:file -- tests/types/typeGuards-project-accessors.test.ts
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/typeGuards.ts` | MODIFY | Import COMPONENT_IDS and replace 3 string literals |

## Implementation Details

### RED Phase
Run existing tests - they should pass (baseline verification):
```bash
npm run test:file -- tests/types/typeGuards-project-accessors.test.ts
```

### GREEN Phase
1. Add import at top of `src/types/typeGuards.ts`:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
```

2. Replace 6 occurrences (3 runtime lookups at lines 318, 334, 348 + 3 JSDoc comments at lines 309, 325, 341):
```typescript
// Before:
const edsInstance = project?.componentInstances?.['eds-storefront'];

// After:
const edsInstance = project?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
```

### REFACTOR Phase
- Verify no remaining hardcoded 'eds-storefront' strings in file
- Run tests to confirm behavior unchanged

## Expected Outcome
- typeGuards.ts imports COMPONENT_IDS from @/core/constants
- 3 EDS functions use COMPONENT_IDS.EDS_STOREFRONT
- All existing tests pass (behavior unchanged)

## Acceptance Criteria
- [ ] Import added for COMPONENT_IDS
- [ ] 6 string literals replaced with constant (3 runtime + 3 JSDoc)
- [ ] Existing tests pass
- [ ] TypeScript compiles without errors
- [ ] No hardcoded 'eds-storefront' remains in typeGuards.ts
