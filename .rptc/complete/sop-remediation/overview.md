# SOP Remediation Plan

## Overview

**Created**: 2025-11-28
**Status**: Ready for TDD
**Priority**: Medium
**Estimated Steps**: 3

## Problem Statement

SOP compliance scan identified 11 pre-existing violations of `code-patterns.md` v2.0.0:

| Category | Section | Count | Priority |
|----------|---------|-------|----------|
| Magic Timeout Numbers | §1 | 3 | MEDIUM |
| Inline Object Operations | §4 | 4 | MEDIUM |
| Long Validation Chains | §10 | 4 | MEDIUM |

These violations predate the recent frontend error code migration and should be remediated to maintain code quality standards.

## Goals

1. Replace magic timeout numbers with `TIMEOUTS.*` constants
2. Replace inline `Object.keys/values/entries` with type guard helpers
3. Extract long JSX validation chains to named predicate functions

## Non-Goals

- Refactoring beyond the specific SOP violations
- Adding new features or functionality
- Changing component behavior

## Implementation Steps

### Step 1: Magic Timeout Constants (§1)
**File**: `step-01-timeout-constants.md`
**Priority**: Medium
**Files**: 2 files, 3 violations

Add missing timeout constants and replace magic numbers:
- `src/features/welcome/commands/showWelcome.ts:52` - 50ms delay
- `src/features/mesh/ui/hooks/useMeshOperations.ts:178` - 1000ms progress message
- `src/features/mesh/ui/hooks/useMeshOperations.ts:183` - 2000ms progress message

### Step 2: Inline Object Operations (§4)
**File**: `step-02-object-operations.md`
**Priority**: Medium
**Files**: 3 files, 4 violations

Replace inline Object.keys/values/entries with existing `hasKeys()` helper or extract to named functions:
- `src/features/dashboard/ui/configure/ConfigureScreen.tsx:90,582`
- `src/features/components/services/componentManager.ts:459`
- `src/features/dashboard/commands/configure.ts:441-482`

### Step 3: JSX Validation Chains (§10)
**File**: `step-03-validation-chains.md`
**Priority**: Medium
**Files**: 2 files, 4 violations

Extract long `&&` chains in JSX conditionals to named predicate functions:
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx:74,90,115,134,176`
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:37`

## Test Strategy

Each step follows TDD:
1. Write tests for new helper functions/constants
2. Implement the helper/constant
3. Update call sites to use new abstractions
4. Verify no behavior change via existing tests

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing behavior | Run full test suite after each step |
| Missing edge cases in JSX conditionals | Extract exact existing logic without modification |

## Success Criteria

- [ ] All 11 violations resolved
- [ ] No new violations introduced
- [ ] All existing tests pass
- [ ] SOP compliance scan shows 0 violations for remediated patterns

## Dependencies

- Existing `hasKeys()` and `keyCount()` helpers in `@/types/typeGuards.ts`
- Existing `TIMEOUTS` constants in `@/core/utils/timeoutConfig.ts`

## References

- `.rptc/sop/code-patterns.md` - SOP defining patterns
- `src/types/typeGuards.ts` - Existing object operation helpers
- `src/core/utils/timeoutConfig.ts` - Centralized timeout constants
