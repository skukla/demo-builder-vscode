# Step 2: Nested Ternary Extraction (§3)

**Priority**: MEDIUM
**Violations**: 4
**Effort**: 30-45 minutes

---

## Objective

Extract nested ternary expressions to explicit helper functions with clear if/else logic.

---

## Violations to Fix

### 1. src/core/shell/commandSequencer.ts:84

**Current**:
```typescript
code: err.code ? (typeof err.code === 'number' ? err.code : 1) : 1,
```

**Helper Function**:
```typescript
/**
 * Extract error code from NodeJS.ErrnoException (SOP §3 compliance)
 *
 * Handles cases where err.code may be string (ENOENT) or number.
 */
function getNumericErrorCode(err: NodeJS.ErrnoException): number {
    if (!err.code) return 1;
    if (typeof err.code === 'number') return err.code;
    return 1;
}
```

**Usage**:
```typescript
code: getNumericErrorCode(err),
```

---

### 2. src/features/project-creation/ui/components/ConfigurationSummary.tsx:142

**Current**:
```typescript
status={state.adobeProject ? (isStepCompleted('adobe-project') ? 'completed' : 'pending') : 'empty'}
```

**Helper Function** (shared with violation #3):
```typescript
/**
 * Determine step status based on value presence and completion (SOP §3 compliance)
 */
function getStepStatus(
    hasValue: boolean,
    isCompleted: boolean
): 'completed' | 'pending' | 'empty' {
    if (!hasValue) return 'empty';
    if (isCompleted) return 'completed';
    return 'pending';
}
```

**Usage**:
```typescript
status={getStepStatus(!!state.adobeProject, isStepCompleted('adobe-project'))}
```

---

### 3. src/features/project-creation/ui/components/ConfigurationSummary.tsx:151

**Current**:
```typescript
status={state.adobeWorkspace ? (isStepCompleted('adobe-workspace') ? 'completed' : 'pending') : 'empty'}
```

**Usage** (uses same helper as #2):
```typescript
status={getStepStatus(!!state.adobeWorkspace, isStepCompleted('adobe-workspace'))}
```

---

### 4. src/features/project-creation/ui/wizard/WizardContainer.tsx:591-593

**Current**:
```typescript
{isConfirmingSelection
    ? 'Continue'
    : (currentStepIndex === WIZARD_STEPS.length - 2 ? 'Create Project' : 'Continue')
}
```

**Helper Function**:
```typescript
/**
 * Determine next button text based on wizard state (SOP §3 compliance)
 */
function getNextButtonText(
    isConfirmingSelection: boolean,
    currentStepIndex: number,
    totalSteps: number
): string {
    if (isConfirmingSelection) return 'Continue';
    if (currentStepIndex === totalSteps - 2) return 'Create Project';
    return 'Continue';
}
```

**Usage**:
```typescript
{getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length)}
```

---

## TDD Approach

### RED Phase

**Test file**: `tests/features/project-creation/ui/components/ConfigurationSummary-helpers.test.ts`

```typescript
import { getStepStatus } from '@/features/project-creation/ui/components/configurationSummaryHelpers';

describe('getStepStatus', () => {
    it('returns empty when no value', () => {
        expect(getStepStatus(false, false)).toBe('empty');
        expect(getStepStatus(false, true)).toBe('empty');
    });

    it('returns completed when value exists and step completed', () => {
        expect(getStepStatus(true, true)).toBe('completed');
    });

    it('returns pending when value exists but step not completed', () => {
        expect(getStepStatus(true, false)).toBe('pending');
    });
});
```

**Test file**: `tests/features/project-creation/ui/wizard/WizardContainer-helpers.test.ts`

```typescript
import { getNextButtonText } from '@/features/project-creation/ui/wizard/wizardHelpers';

describe('getNextButtonText', () => {
    it('returns Continue when confirming selection', () => {
        expect(getNextButtonText(true, 0, 5)).toBe('Continue');
        expect(getNextButtonText(true, 3, 5)).toBe('Continue');
    });

    it('returns Create Project on second-to-last step', () => {
        expect(getNextButtonText(false, 3, 5)).toBe('Create Project'); // index 3, total 5
    });

    it('returns Continue on other steps', () => {
        expect(getNextButtonText(false, 0, 5)).toBe('Continue');
        expect(getNextButtonText(false, 1, 5)).toBe('Continue');
    });
});
```

**Test file**: `tests/core/shell/commandSequencer-helpers.test.ts`

```typescript
import { getNumericErrorCode } from '@/core/shell/commandSequencer';

describe('getNumericErrorCode', () => {
    it('returns 1 when no code', () => {
        expect(getNumericErrorCode({} as NodeJS.ErrnoException)).toBe(1);
    });

    it('returns numeric code directly', () => {
        expect(getNumericErrorCode({ code: 127 } as any)).toBe(127);
    });

    it('returns 1 for string codes', () => {
        expect(getNumericErrorCode({ code: 'ENOENT' } as any)).toBe(1);
    });
});
```

### GREEN Phase

1. Create helper functions in appropriate locations
2. Export helpers for testing
3. Update usage sites

### REFACTOR Phase

1. Verify identical behavior with existing tests
2. Check for any other similar patterns to consolidate

---

## Files Modified

1. `src/core/shell/commandSequencer.ts` - Add `getNumericErrorCode()` helper
2. `src/features/project-creation/ui/components/ConfigurationSummary.tsx` - Add `getStepStatus()` helper
3. `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Add `getNextButtonText()` helper
4. Test files for each helper

---

## Verification

```bash
# Run tests
npm run test:fast -- tests/core/shell/commandSequencer
npm run test:fast -- tests/features/project-creation/ui/components/ConfigurationSummary
npm run test:fast -- tests/features/project-creation/ui/wizard/WizardContainer

# Verify no nested ternaries remain
grep -E "\? .+ : .+\?" src/core/shell/commandSequencer.ts
grep -E "\? .+ : .+\?" src/features/project-creation/ui/components/ConfigurationSummary.tsx
grep -E "\? .+ : .+\?" src/features/project-creation/ui/wizard/WizardContainer.tsx
```
