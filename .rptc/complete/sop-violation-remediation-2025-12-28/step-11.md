# Step 11: Fix Validation Chain Violations

**STATUS: COMPLETE**

## Summary

Standardize validation hook files to use the composable validators from `@/core/validation/Validator` instead of inline/duplicated validation logic.

## Prerequisites

- Steps 9-10 complete (module structure finalized)
- Familiarity with `src/core/validation/Validator.ts` composable pattern

## Tests to Write First (RED Phase)

- [x] Test `useFieldValidation` uses core validators for URL/pattern (17 tests written)
- [x] Test `useConfigValidation` uses core validators consistently (15 tests existing)
- [x] Test `useStepValidation` returns standard `ValidationResult` type - **NOT APPLICABLE** (see Notes)
- [x] Test validation error messages match core validator format
- [x] Test edge cases: empty strings, null, undefined inputs

## Validation Pattern Standard

The project has established composable validators in `@/core/validation/Validator.ts`:

```typescript
// Standard pattern from core/validation
import { required, url, pattern, compose, ValidationResult } from '@/core/validation/Validator';

// Use composable validators instead of inline logic
const validator = compose(
  required('Field is required'),
  url('Please enter a valid URL')
);
const result: ValidationResult = validator(value);
```

## Analysis Results

| File | Original Issue | Resolution |
|------|----------------|------------|
| `useFieldValidation.ts` | Inline `new URL()` and manual `RegExp.test()` | **FIXED** - Now uses core validators |
| `useConfigValidation.tsx` | Duplicates same URL/pattern logic | **FIXED** - Now uses core validators |
| `useStepValidation.ts` | Custom `StepValidation` type | **ACCEPTABLE** - Different purpose (see Notes) |
| `useComponentConfig.ts` | Same inline validation | **FIXED** - Additional file discovered and refactored |
| `ConfigureScreen.tsx` | Same inline validation | **FIXED** - Additional file discovered and refactored |

## Files Fixed

- [x] `src/features/dashboard/ui/configure/hooks/useFieldValidation.ts`
- [x] `src/features/components/ui/steps/hooks/useConfigValidation.tsx`
- [x] `src/features/components/ui/hooks/useComponentConfig.ts` (additional)
- [x] `src/features/dashboard/ui/configure/ConfigureScreen.tsx` (additional)
- [x] `src/features/project-creation/ui/hooks/useStepValidation.ts` (documentation added)

## Notes: useStepValidation.ts Decision

**NOT REFACTORED** - This hook validates wizard step **state** (boolean existence checks), NOT string field values:
- Checks like `state.adobeAuth?.isAuthenticated === true`
- Checks like `Boolean(state.projectName?.trim())`

The core `@/core/validation/Validator.ts` validators (`url`, `pattern`, `required`, etc.) are designed for **string field validation**. The `StepValidation` type `{ isValid: boolean, canProceed: boolean }` serves a different purpose than `ValidationResult { valid: boolean, error?: string }`.

A clarifying comment was added to the file to document this design decision.

## Expected Outcome

- [x] All applicable files use `@/core/validation/Validator` functions
- [x] No duplicated URL validation logic in field validators
- [x] Consistent error message format (`'Please enter a valid URL'`)
- [x] All 49 validation hook tests pass
- [x] All 326 affected feature tests pass

## Acceptance Criteria

- [x] 4 violations fixed (2 original + 2 discovered during refactoring)
- [x] 1 violation documented as acceptable (useStepValidation - different purpose)
- [x] Tests pass (49 validation tests + 326 feature tests)
- [x] No inline `new URL()` try/catch for validation in hooks
- [x] No manual `RegExp.test()` when `pattern()` validator exists in hooks
