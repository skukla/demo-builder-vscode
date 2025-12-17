# Step 5: Custom Hooks Extraction - Detailed Implementation Plan

## Overview

Extract complex logic from React components into reusable custom hooks, improving testability, reducing component complexity, and enabling code reuse.

**Estimated Effort:** 8-12 hours
**Risk Level:** Medium
**Dependencies:** None (can proceed independently)

---

## Current State Analysis

### Hooks Inventory (19 total)
- **Core hooks:** 12 (well-structured, 100% documented)
- **Feature hooks:** 7 (some oversized)
- **Test coverage:** 16% (3/19 with dedicated tests)

### Problem Areas Identified

| Hook/Component | Lines | Issue |
|----------------|-------|-------|
| `useComponentConfig` | 351 | Multiple responsibilities, validation logic embedded |
| `useMeshOperations` | 349 | Repeated state update patterns |
| `PrerequisitesStep` | 250+ | Complex logic mixed with rendering |
| `useSelectionStep` | 312 | Large but well-organized |

---

## Implementation Plan

### Phase 1: Extract Async Operation Pattern (Priority: HIGH)

**Goal:** Create reusable `useAsyncOperation` hook from repeated patterns in `useMeshOperations`

#### 1.1 Create useAsyncOperation Hook

**File:** `src/core/ui/hooks/useAsyncOperation.ts`

```typescript
interface UseAsyncOperationOptions<T> {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    initialMessage?: string;
}

interface UseAsyncOperationReturn<T> {
    execute: (operation: () => Promise<T>) => Promise<T | undefined>;
    isExecuting: boolean;
    message: string | null;
    subMessage: string | null;
    setMessage: (msg: string | null) => void;
    setSubMessage: (msg: string | null) => void;
    error: Error | null;
    reset: () => void;
}
```

**Extract from `useMeshOperations`:**
- `setIsChecking`/`setIsCreating`/`setIsRecreating` → unified `isExecuting`
- `setMessage`/`setSubMessage` pattern
- Error handling with progress cleanup
- Timeout management for progress indicators

#### 1.2 Test Strategy

**File:** `tests/core/ui/hooks/useAsyncOperation.test.ts`

```typescript
describe('useAsyncOperation', () => {
    describe('execution flow', () => {
        it('sets isExecuting true during operation');
        it('sets isExecuting false after success');
        it('sets isExecuting false after error');
        it('calls onSuccess callback with result');
        it('calls onError callback with error');
    });

    describe('message management', () => {
        it('sets initial message when provided');
        it('allows message updates during operation');
        it('clears messages on reset');
    });

    describe('error handling', () => {
        it('captures error from failed operation');
        it('does not throw on error (returns undefined)');
        it('allows retry after error');
    });
});
```

#### 1.3 Refactor useMeshOperations

**Before:**
```typescript
// useMeshOperations.ts - repeated 3x
const runCheck = async () => {
    setIsChecking(true);
    setMessage('Checking API Mesh...');
    try {
        const result = await webviewClient.request(...);
        setIsChecking(false);
        // handle result
    } catch (error) {
        setIsChecking(false);
        setMessage(null);
        // handle error
    }
};
```

**After:**
```typescript
// useMeshOperations.ts - uses useAsyncOperation
const checkOperation = useAsyncOperation<CheckResult>({
    onSuccess: handleCheckSuccess,
    onError: handleCheckError,
});

const runCheck = () => checkOperation.execute(async () => {
    checkOperation.setMessage('Checking API Mesh...');
    return await webviewClient.request(...);
});
```

**Lines reduced:** ~100-150 in `useMeshOperations`

---

### Phase 2: Extract Form Validation Logic (Priority: HIGH)

**Goal:** Extract validation logic from `useComponentConfig` into dedicated `useFormValidation` hook

#### 2.1 Create useFormValidation Hook

**File:** `src/core/ui/hooks/useFormValidation.ts`

```typescript
interface ValidationRule {
    required?: boolean;
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    custom?: (value: unknown) => string | null;
}

interface UseFormValidationOptions<T extends Record<string, unknown>> {
    fields: Record<keyof T, ValidationRule>;
    validateOnChange?: boolean;
    validateOnBlur?: boolean;
}

interface UseFormValidationReturn<T> {
    errors: Record<keyof T, string | null>;
    touchedFields: Set<keyof T>;
    isValid: boolean;
    validate: (fieldKey: keyof T, value: unknown) => string | null;
    validateAll: (values: T) => boolean;
    touchField: (fieldKey: keyof T) => void;
    resetValidation: () => void;
}
```

#### 2.2 Test Strategy

**File:** `tests/core/ui/hooks/useFormValidation.test.ts`

```typescript
describe('useFormValidation', () => {
    describe('field validation', () => {
        it('validates required fields');
        it('validates pattern matching');
        it('validates min/max length');
        it('runs custom validation function');
        it('returns null for valid fields');
    });

    describe('touched field tracking', () => {
        it('tracks touched fields');
        it('only shows errors for touched fields');
        it('resets touched state');
    });

    describe('form-level validation', () => {
        it('validates all fields at once');
        it('returns isValid based on all fields');
        it('marks all fields as touched on validateAll');
    });
});
```

#### 2.3 Refactor useComponentConfig

**Before:** 351 lines with embedded validation
**After:** ~200 lines using `useFormValidation`

**Extract:**
- Validation rule application (~40 lines)
- Touched field tracking (~30 lines)
- Error message generation (~30 lines)
- Field completion checking (~20 lines)

---

### Phase 3: Extract Prerequisite Checks Logic (Priority: MEDIUM)

**Goal:** Extract checking logic from `PrerequisitesStep` into `usePrerequisiteChecks` hook

#### 3.1 Create usePrerequisiteChecks Hook

**File:** `src/features/prerequisites/ui/hooks/usePrerequisiteChecks.ts`

```typescript
interface UsePrerequisiteChecksOptions {
    onComplete?: (allPassed: boolean) => void;
    autoStart?: boolean;
}

interface UsePrerequisiteChecksReturn {
    checks: PrerequisiteCheck[];
    isChecking: boolean;
    installingIndex: number | null;
    runChecks: () => void;
    installPrerequisite: (index: number) => void;
    canProceed: boolean;
}
```

#### 3.2 Test Strategy

**File:** `tests/features/prerequisites/ui/hooks/usePrerequisiteChecks.test.ts`

```typescript
describe('usePrerequisiteChecks', () => {
    describe('check execution', () => {
        it('loads prerequisites on mount when autoStart=true');
        it('does not load on mount when autoStart=false');
        it('sets isChecking during check process');
        it('updates checks as status messages arrive');
    });

    describe('installation', () => {
        it('tracks installing index');
        it('clears installing index on completion');
        it('handles installation errors');
    });

    describe('completion', () => {
        it('sets canProceed when all required checks pass');
        it('calls onComplete callback');
        it('allows proceed with warnings');
    });
});
```

#### 3.3 Refactor PrerequisitesStep

**Before:** ~250 lines with 5 useEffects
**After:** ~100 lines (render logic only)

**Component becomes:**
```typescript
const PrerequisitesStep: React.FC<Props> = ({ state, updateState, setCanProceed }) => {
    const {
        checks,
        isChecking,
        installingIndex,
        runChecks,
        installPrerequisite,
        canProceed,
    } = usePrerequisiteChecks({
        autoStart: state.currentStep === 'prerequisites',
        onComplete: (passed) => setCanProceed(passed),
    });

    // Render logic only (~100 lines)
};
```

---

### Phase 4: Create Composite Hooks (Priority: LOW)

**Goal:** Create convenience hooks that combine common patterns

#### 4.1 useSearchableSelection Hook

**File:** `src/core/ui/hooks/useSearchableSelection.ts`

Combines `useSearchFilter` + `useSelection` (used together in 3+ places)

```typescript
interface UseSearchableSelectionOptions<T extends { id: string }> {
    items: T[];
    searchFields: (keyof T)[];
    onSelect?: (item: T | null) => void;
}

interface UseSearchableSelectionReturn<T> {
    // From useSearchFilter
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filteredItems: T[];
    // From useSelection
    selectedItem: T | null;
    selectItem: (item: T | null) => void;
    isSelected: (item: T) => boolean;
}
```

#### 4.2 Test Strategy

**File:** `tests/core/ui/hooks/useSearchableSelection.test.ts`

```typescript
describe('useSearchableSelection', () => {
    it('filters items based on search query');
    it('maintains selection when filtering');
    it('clears selection when selected item filtered out');
    it('combines search and selection callbacks');
});
```

---

## Acceptance Criteria

### Phase 1: useAsyncOperation
- [ ] Hook created with full TypeScript types
- [ ] 10+ unit tests passing
- [ ] `useMeshOperations` refactored to use it
- [ ] All existing mesh tests pass
- [ ] Reduced `useMeshOperations` by 100+ lines

### Phase 2: useFormValidation
- [ ] Hook created with generic type support
- [ ] 15+ unit tests passing
- [ ] `useComponentConfig` refactored to use it
- [ ] All existing component config tests pass
- [ ] Reduced `useComponentConfig` by 80+ lines

### Phase 3: usePrerequisiteChecks
- [ ] Hook created with message subscription handling
- [ ] 12+ unit tests passing
- [ ] `PrerequisitesStep` refactored to use it
- [ ] All existing prerequisite tests pass
- [ ] Reduced `PrerequisitesStep` by 120+ lines

### Phase 4: useSearchableSelection
- [ ] Hook created composing existing hooks
- [ ] 8+ unit tests passing
- [ ] At least one component refactored to use it

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Write tests BEFORE refactoring |
| Prop drilling increases | Keep state close to where it's used |
| Over-abstraction | Only extract patterns used 2+ times |
| Performance regression | Profile before/after with React DevTools |

---

## File Changes Summary

### New Files
- `src/core/ui/hooks/useAsyncOperation.ts` (~120 lines)
- `src/core/ui/hooks/useFormValidation.ts` (~150 lines)
- `src/features/prerequisites/ui/hooks/usePrerequisiteChecks.ts` (~180 lines)
- `src/core/ui/hooks/useSearchableSelection.ts` (~80 lines)
- 4 corresponding test files (~400 lines total)

### Modified Files
- `src/features/mesh/ui/hooks/useMeshOperations.ts` (-100 lines)
- `src/features/components/ui/hooks/useComponentConfig.ts` (-80 lines)
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` (-120 lines)
- `src/core/ui/hooks/index.ts` (add exports)

### Net Change
- **New code:** ~930 lines (including tests)
- **Removed code:** ~300 lines
- **Net increase:** ~630 lines (but much better organized)
