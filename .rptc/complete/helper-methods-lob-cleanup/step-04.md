# Step 4: Inline TimelineNav CSS Helper ✅ COMPLETE

**Purpose:** Inline `getTimelineStepLabelClasses()` into its single consumer `TimelineNav.tsx`, then remove from classNames.ts along with its supporting code

**Status:** Completed 2025-11-30

**Prerequisites:**

- [x] Step 3 completed (PrerequisitesStep helpers inlined)
- [x] TypeScript compiles successfully
- [x] Verified single consumer for the helper

**Results:**
- getTimelineStepLabelClasses() inlined as getTimelineLabelClasses()
- +19 lines to TimelineNav.tsx, -29 lines from classNames.ts
- classNames.ts now 35 lines (down from ~320)
- All 3845 tests pass

---

## Tests to Write First (RED Phase)

For inlining tasks, we verify the transformation preserves behavior:

- [ ] **Test:** TimelineNav renders correctly after inlining
  - **Given:** TimelineNav component with steps in various states
  - **When:** Rendered with 'completed', 'current', 'upcoming', 'completed-current' statuses
  - **Then:** CSS classes applied correctly match original behavior
  - **File:** Visual inspection (no automated tests exist for this CSS helper)

---

## Current Implementation to Inline

### `getTimelineStepLabelClasses()` (classNames.ts)

```typescript
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

**Simplified inline version:**

The function builds a class string based on status:
- Base: `'text-base whitespace-nowrap user-select-none'`
- Font weight: `'font-semibold'` for current/completed-current, `'font-normal'` otherwise
- Color: varies by status (see lookup map)

---

## Current Usage in TimelineNav.tsx

### Import Statement (line 5)

```typescript
// BEFORE:
import { cn, getTimelineStepDotClasses, getTimelineStepLabelClasses } from '@/core/ui/utils/classNames';

// AFTER:
import { cn, getTimelineStepDotClasses } from '@/core/ui/utils/classNames';
```

### Usage of `getTimelineStepLabelClasses` (line 122)

```typescript
// BEFORE:
<Text
    UNSAFE_className={getTimelineStepLabelClasses(status)}
>
    {step.name}
</Text>

// AFTER (with local helper):
<Text
    UNSAFE_className={getTimelineLabelClasses(status)}
>
    {step.name}
</Text>
```

---

## Implementation Details

### RED Phase (Verification)

1. Read current TimelineNav.tsx to understand usage context
2. Verify only one consumer of getTimelineStepLabelClasses
3. Understand the full class generation logic

```bash
# Verify only consumer is TimelineNav.tsx
grep -r "getTimelineStepLabelClasses" src/ --include="*.ts" --include="*.tsx"
```

### GREEN Phase (Implementation)

**In `src/features/project-creation/ui/wizard/TimelineNav.tsx`:**

1. Update import statement:
   ```typescript
   import { cn, getTimelineStepDotClasses } from '@/core/ui/utils/classNames';
   ```

2. Add local helper function (after the TimelineStatus type definition, around line 11):
   ```typescript
   /**
    * Lookup map for timeline step label color classes
    */
   const TIMELINE_LABEL_COLOR_CLASS: Record<TimelineStatus, string> = {
       'completed': 'text-gray-800',
       'completed-current': 'text-blue-700',
       'current': 'text-blue-700',
       'upcoming': 'text-gray-600',
   };

   /**
    * Build timeline step label classes based on status
    * Inlined from classNames.ts per LoB principles
    */
   function getTimelineLabelClasses(status: TimelineStatus): string {
       const isCurrent = status === 'current' || status === 'completed-current';
       const fontWeight = isCurrent ? 'font-semibold' : 'font-normal';
       const color = TIMELINE_LABEL_COLOR_CLASS[status];
       return cn('text-base', fontWeight, color, 'whitespace-nowrap', 'user-select-none');
   }
   ```

3. Update usage (line ~122):
   ```typescript
   // Replace:
   UNSAFE_className={getTimelineStepLabelClasses(status)}

   // With:
   UNSAFE_className={getTimelineLabelClasses(status)}
   ```

**In `src/core/ui/utils/classNames.ts`:**

4. Remove `TIMELINE_LABEL_COLOR_CLASS` constant
5. Remove `isCurrentOrCompletedCurrent()` helper function
6. Remove `getTimelineStepLabelClasses()` function and JSDoc
7. Remove the export from any barrel exports
8. Run TypeScript compile: `npm run compile:typescript`
9. Run test suite: `npm run test:fast`

### REFACTOR Phase

1. Verify the inlined code in TimelineNav.tsx is readable
2. Clean up classNames.ts to remove blank lines
3. Verify remaining exports are correct

---

## Expected File State After This Step

### TimelineNav.tsx (with inlined helper)

```typescript
import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { WizardStep } from '@/types/webview';
import { cn, getTimelineStepDotClasses } from '@/core/ui/utils/classNames';

/**
 * Timeline step status type
 */
type TimelineStatus = 'completed' | 'completed-current' | 'current' | 'upcoming';

/**
 * Lookup map for timeline step label color classes
 */
const TIMELINE_LABEL_COLOR_CLASS: Record<TimelineStatus, string> = {
    'completed': 'text-gray-800',
    'completed-current': 'text-blue-700',
    'current': 'text-blue-700',
    'upcoming': 'text-gray-600',
};

/**
 * Build timeline step label classes based on status
 * Inlined from classNames.ts per LoB principles
 */
function getTimelineLabelClasses(status: TimelineStatus): string {
    const isCurrent = status === 'current' || status === 'completed-current';
    const fontWeight = isCurrent ? 'font-semibold' : 'font-normal';
    const color = TIMELINE_LABEL_COLOR_CLASS[status];
    return cn('text-base', fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}

/**
 * Render the appropriate indicator icon for a timeline step
 * ...existing code...
 */
function renderStepIndicator(status: TimelineStatus): React.ReactNode {
    // ...existing implementation...
}

// ... rest of component
```

### classNames.ts (final state - minimal)

```typescript
/**
 * Utility for managing CSS class names in React Spectrum components
 * This provides a cleaner alternative to inline UNSAFE_style props
 */

/**
 * Combines multiple class names into a single string, filtering out falsy values
 * Similar to popular libraries like clsx or classnames
 *
 * @example
 * cn('text-sm', isError && 'text-red-600', 'mb-2')
 * // Returns: "text-sm text-red-600 mb-2" (if isError is true)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * SOP section 3: Lookup map for timeline step dot status classes
 * Extracted from nested ternary for clarity
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
```

**Final classNames.ts:** ~35 lines (down from ~320 lines - 89% reduction!)

---

## Acceptance Criteria

- [ ] Import statement updated in TimelineNav.tsx
- [ ] Local helper function added to TimelineNav.tsx
- [ ] Usage updated to call local helper
- [ ] `TIMELINE_LABEL_COLOR_CLASS` constant removed from classNames.ts
- [ ] `isCurrentOrCompletedCurrent()` function removed from classNames.ts
- [ ] `getTimelineStepLabelClasses()` function removed from classNames.ts
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Visual inspection: Timeline UI renders correctly

**Estimated Time:** 20 minutes

---

## Rollback Plan

If any issues discovered:

```bash
git checkout -- src/core/ui/utils/classNames.ts src/features/project-creation/ui/wizard/TimelineNav.tsx
```
