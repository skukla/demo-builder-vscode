# Step 3: Inline PrerequisitesStep CSS Helpers ✅ COMPLETE

**Purpose:** Inline `getPrerequisiteItemClasses()` and `getPrerequisiteMessageClasses()` into their single consumer `PrerequisitesStep.tsx`, then remove from classNames.ts along with the `styles` constant

**Status:** Completed 2025-11-30

**Prerequisites:**

- [x] Step 2 completed (unused CSS helpers removed)
- [x] TypeScript compiles successfully
- [x] Verified single consumer for each helper

**Results:**
- 2 helpers inlined into PrerequisitesStep.tsx
- ~228 lines removed from classNames.ts (including styles constant)
- Dead `status` parameter eliminated in inlined version
- All 3845 tests pass

---

## Tests to Write First (RED Phase)

For inlining tasks, we verify the transformation preserves behavior:

- [ ] **Test:** PrerequisitesStep renders correctly after inlining
  - **Given:** PrerequisitesStep component with prerequisite checks
  - **When:** Rendered with various status values ('success', 'error', 'checking', 'pending', 'warning')
  - **Then:** CSS classes applied correctly match original behavior
  - **File:** Visual inspection (no automated tests exist for these CSS helpers)

---

## Current Implementation to Inline

### `getPrerequisiteItemClasses()` (classNames.ts lines 227-234)

```typescript
export function getPrerequisiteItemClasses(
    status: 'success' | 'error' | 'checking' | 'pending',
    isLast: boolean = false
): string {
    const baseClasses = styles.prerequisite.item;  // = 'prerequisite-item'
    const marginClass = isLast ? '' : 'mb-2';
    return cn(baseClasses, marginClass);
}
```

**Simplified inline version:**
```typescript
// The function essentially returns:
// - 'prerequisite-item mb-2' when not last
// - 'prerequisite-item' when last
// Note: The `status` parameter is NOT used in the logic!
```

### `getPrerequisiteMessageClasses()` (classNames.ts lines 236-243)

```typescript
export function getPrerequisiteMessageClasses(
    status: 'error' | 'success' | 'checking' | 'pending' | 'warning'
): string {
    return status === 'error'
        ? styles.prerequisite.messageError    // = 'prerequisite-message prerequisite-message-error'
        : styles.prerequisite.messageDefault; // = 'prerequisite-message prerequisite-message-default'
}
```

**Simplified inline version:**
```typescript
// Returns:
// - 'prerequisite-message prerequisite-message-error' when status === 'error'
// - 'prerequisite-message prerequisite-message-default' otherwise
```

---

## Current Usage in PrerequisitesStep.tsx

### Import Statement (line 17)

```typescript
// BEFORE:
import { cn, getPrerequisiteItemClasses, getPrerequisiteMessageClasses } from '@/core/ui/utils/classNames';

// AFTER:
import { cn } from '@/core/ui/utils/classNames';
```

### Usage of `getPrerequisiteMessageClasses` (line 507)

```typescript
// BEFORE:
<Text UNSAFE_className={cn(getPrerequisiteMessageClasses(check.status), 'animate-fade-in')}>

// AFTER (inline the logic):
<Text UNSAFE_className={cn(
    check.status === 'error'
        ? 'prerequisite-message prerequisite-message-error'
        : 'prerequisite-message prerequisite-message-default',
    'animate-fade-in'
)}>
```

### Usage of `getPrerequisiteItemClasses` (line 534)

```typescript
// BEFORE:
UNSAFE_className={getPrerequisiteItemClasses('pending', index === checks.length - 1)}

// AFTER (inline the logic):
UNSAFE_className={cn('prerequisite-item', index !== checks.length - 1 && 'mb-2')}
```

**Note:** The original function takes `status` but doesn't use it. The inlined version drops the unused parameter entirely.

---

## Implementation Details

### RED Phase (Verification)

1. Read current PrerequisitesStep.tsx to understand usage context
2. Verify the CSS classes referenced in `styles.prerequisite.*` are the actual string values
3. Confirm no other consumers of these helpers

```bash
# Verify only consumer is PrerequisitesStep.tsx
grep -r "getPrerequisiteItemClasses\|getPrerequisiteMessageClasses" src/ --include="*.ts" --include="*.tsx"
```

### GREEN Phase (Implementation)

**In `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`:**

1. Update import statement to remove helper imports:
   ```typescript
   import { cn } from '@/core/ui/utils/classNames';
   ```

2. Replace `getPrerequisiteMessageClasses(check.status)` usage (line ~507):
   ```typescript
   // Replace:
   cn(getPrerequisiteMessageClasses(check.status), 'animate-fade-in')

   // With:
   cn(
       check.status === 'error'
           ? 'prerequisite-message prerequisite-message-error'
           : 'prerequisite-message prerequisite-message-default',
       'animate-fade-in'
   )
   ```

3. Replace `getPrerequisiteItemClasses('pending', index === checks.length - 1)` usage (line ~534):
   ```typescript
   // Replace:
   getPrerequisiteItemClasses('pending', index === checks.length - 1)

   // With:
   cn('prerequisite-item', index !== checks.length - 1 && 'mb-2')
   ```

**In `src/core/ui/utils/classNames.ts`:**

4. Remove `getPrerequisiteItemClasses()` function and JSDoc
5. Remove `getPrerequisiteMessageClasses()` function and JSDoc
6. Remove the entire `styles` constant (no longer has any consumers)
7. Run TypeScript compile: `npm run compile:typescript`
8. Run test suite: `npm run test:fast`

### REFACTOR Phase

1. Verify the inlined code is readable and follows project patterns
2. Consider if the inline expressions can be simplified further
3. Clean up any extra blank lines in classNames.ts

---

## Expected File State After This Step

### PrerequisitesStep.tsx (changes highlighted)

```typescript
// Line 17 - Updated import
import { cn } from '@/core/ui/utils/classNames';

// Line ~507 - Inlined getPrerequisiteMessageClasses
<Text UNSAFE_className={cn(
    check.status === 'error'
        ? 'prerequisite-message prerequisite-message-error'
        : 'prerequisite-message prerequisite-message-default',
    'animate-fade-in'
)}>

// Line ~534 - Inlined getPrerequisiteItemClasses
UNSAFE_className={cn('prerequisite-item', index !== checks.length - 1 && 'mb-2')}
```

### classNames.ts (significantly reduced)

```typescript
/**
 * Utility for managing CSS class names in React Spectrum components
 */

/**
 * Combines multiple class names into a single string, filtering out falsy values
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * SOP section 3: Lookup map for timeline step dot status classes
 */
const TIMELINE_DOT_STATUS_CLASS: Record<string, string> = {
    'completed': 'timeline-step-dot-completed',
    'completed-current': 'timeline-step-dot-completed',
    'current': 'timeline-step-dot-current',
    'upcoming': 'timeline-step-dot-upcoming',
};

/**
 * Helper function to build timeline step dot classes based on status
 */
export function getTimelineStepDotClasses(
    status: 'completed' | 'current' | 'upcoming' | 'completed-current'
): string {
    const baseClasses = 'timeline-step-dot';
    const statusClass = TIMELINE_DOT_STATUS_CLASS[status] ?? 'timeline-step-dot-upcoming';
    return cn(baseClasses, statusClass);
}

/**
 * SOP section 3: Lookup map for timeline step label color classes
 */
const TIMELINE_LABEL_COLOR_CLASS: Record<string, string> = {
    'completed': 'text-gray-800',
    'completed-current': 'text-blue-700',
    'current': 'text-blue-700',
    'upcoming': 'text-gray-600',
};

/**
 * Helper to check if status indicates current/active step
 */
function isCurrentOrCompletedCurrent(status: string): boolean {
    return status === 'current' || status === 'completed-current';
}

/**
 * Helper function to build timeline step label classes based on status
 * (TO BE INLINED IN STEP 4)
 */
export function getTimelineStepLabelClasses(
    status: 'completed' | 'current' | 'upcoming' | 'completed-current'
): string {
    const fontSize = 'text-base';
    const fontWeight = isCurrentOrCompletedCurrent(status) ? 'font-semibold' : 'font-normal';
    const color = TIMELINE_LABEL_COLOR_CLASS[status] ?? 'text-gray-600';
    return cn(fontSize, fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}
```

---

## Acceptance Criteria

- [ ] Import statement updated in PrerequisitesStep.tsx
- [ ] `getPrerequisiteMessageClasses()` usage inlined
- [ ] `getPrerequisiteItemClasses()` usage inlined
- [ ] Both helper functions removed from classNames.ts
- [ ] `styles` constant removed from classNames.ts
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Visual inspection: Prerequisites UI renders correctly

**Estimated Time:** 30 minutes

---

## Rollback Plan

If any issues discovered:

```bash
git checkout -- src/core/ui/utils/classNames.ts src/features/prerequisites/ui/steps/PrerequisitesStep.tsx
```
