# Step 2: Remove Unused CSS Helpers ✅ COMPLETE

**Purpose:** Remove 3 unused helper functions from `src/core/ui/utils/classNames.ts`

**Status:** Completed 2025-11-30

**Prerequisites:**

- [x] Step 1 completed (typeGuards cleanup)
- [x] Verified no consumers exist via grep search
- [x] TypeScript compiles successfully

**Results:**
- 3 helpers removed (getButtonClasses, getCardHoverClasses, getIconClasses)
- ~29 lines removed
- `styles` constant kept for Step 3
- All 3845 tests pass

---

## Tests to Write First (RED Phase)

For removal tasks, the "RED" phase is verification that removal is safe:

- [ ] **Verification Test:** Grep search confirms zero consumers for each helper
  - **Given:** Codebase with potentially unused helpers
  - **When:** Grep search executed for each helper name
  - **Then:** Only definition site found (in classNames.ts), no call sites in src/
  - **Command:** `grep -r "helperName" src/ --include="*.ts" --include="*.tsx" | grep -v "classNames.ts"`

---

## Helpers to Remove (4 total)

### 1. `getButtonClasses()` (lines 245-256)

```typescript
// REMOVE: Function and JSDoc
/**
 * Helper function to build button classes based on variant and state
 */
export function getButtonClasses(
    size: 'compact' | 'standard' | 'large' = 'standard',
    isDisabled: boolean = false
): string {
    return cn(
        styles.button[size],
        isDisabled && styles.utility.cursorNotAllowed
    );
}
```

### 2. `getCardHoverClasses()` (lines 306-313)

```typescript
// REMOVE: Function and JSDoc
/**
 * Helper function to build card hover classes
 */
export function getCardHoverClasses(isHoverable: boolean = true): string {
    return isHoverable
        ? cn('transition-all', 'cursor-pointer', 'hover:translate-y--2', 'hover:shadow-md')
        : '';
}
```

### 3. `getIconClasses()` (lines 315-320)

```typescript
// REMOVE: Function and JSDoc
/**
 * Helper function to build icon classes based on size
 */
export function getIconClasses(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
    return `icon-${size}`;
}
```

### 4. `styles` constant (lines 22-225)

**IMPORTANT:** The `styles` constant is a large object (~200 lines) that is ONLY used by:
- `getPrerequisiteItemClasses()` - being inlined in Step 3
- `getPrerequisiteMessageClasses()` - being inlined in Step 3
- `getButtonClasses()` - being removed in this step

After Step 3 completes, `styles` will have zero consumers. However, for proper ordering:

**This step:** Mark `styles` for removal after verifying it's only used by helpers being removed/inlined.
**Step 3:** When inlining prerequisite helpers, inline the ACTUAL string values, not references to `styles`.
**After Step 3:** `styles` can be safely removed.

```typescript
// REMOVE: The entire styles constant (lines 22-225)
/**
 * Type-safe style constants for commonly used class combinations
 * Helps maintain consistency and provides IntelliSense support
 */
export const styles = {
    // Button size variants
    button: { ... },
    // Text size variants
    text: { ... },
    // ... all ~200 lines
} as const;
```

---

## Implementation Details

### RED Phase (Verification)

Run grep verification for each helper:

```bash
# Verify no consumers for getButtonClasses
grep -r "getButtonClasses" src/ --include="*.ts" --include="*.tsx" | grep -v "classNames.ts"

# Verify no consumers for getCardHoverClasses
grep -r "getCardHoverClasses" src/ --include="*.ts" --include="*.tsx" | grep -v "classNames.ts"

# Verify no consumers for getIconClasses
grep -r "getIconClasses" src/ --include="*.ts" --include="*.tsx" | grep -v "classNames.ts"

# Verify styles only used by helpers in classNames.ts
grep -r "styles\." src/ --include="*.ts" --include="*.tsx" | grep -v "classNames.ts"
```

### GREEN Phase (Implementation)

**Order matters:** Remove unused helpers first, then the `styles` constant last.

1. **Remove `getButtonClasses()`** (lines 245-256)
2. **Remove `getCardHoverClasses()`** (lines 306-313 after previous removal)
3. **Remove `getIconClasses()`** (lines 315-320 after previous removal)
4. **DO NOT remove `styles` yet** - wait until Step 3 inlines the prerequisite helpers
5. Run TypeScript compile: `npm run compile:typescript`
6. Run test suite: `npm run test:fast`

### REFACTOR Phase

After Step 3 completes:
1. Remove the `styles` constant entirely
2. Remove the JSDoc comment for `styles`
3. Clean up any blank lines left behind
4. Run final compile and test

---

## Expected Outcome After This Step

- 3 unused helper functions removed (~30 lines)
- `styles` constant marked for removal (pending Step 3)
- File still contains:
  - `cn()` function (heavily used - 75 consumers)
  - `getPrerequisiteItemClasses()` (to be inlined in Step 3)
  - `getPrerequisiteMessageClasses()` (to be inlined in Step 3)
  - `getTimelineStepDotClasses()` (used by TimelineNav - KEEP)
  - `getTimelineStepLabelClasses()` (to be inlined in Step 4)
  - `TIMELINE_DOT_STATUS_CLASS` constant (used by getTimelineStepDotClasses - KEEP)
  - `TIMELINE_LABEL_COLOR_CLASS` constant (used by getTimelineStepLabelClasses - to be inlined)
  - `isCurrentOrCompletedCurrent()` helper (used by getTimelineStepLabelClasses - to be inlined)
  - `styles` constant (to be removed after Step 3)

---

## File State After This Step

```typescript
// classNames.ts - After Step 2

/**
 * Combines multiple class names into a single string, filtering out falsy values
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * Type-safe style constants (TO BE REMOVED IN STEP 3)
 */
export const styles = { ... }; // ~200 lines

/**
 * Helper function to build prerequisite item classes (TO BE INLINED IN STEP 3)
 */
export function getPrerequisiteItemClasses(...) { ... }

/**
 * Helper function to build prerequisite message classes (TO BE INLINED IN STEP 3)
 */
export function getPrerequisiteMessageClasses(...) { ... }

// Timeline helpers - some kept, some inlined in Step 4
const TIMELINE_DOT_STATUS_CLASS = { ... };
export function getTimelineStepDotClasses(...) { ... }

const TIMELINE_LABEL_COLOR_CLASS = { ... };
function isCurrentOrCompletedCurrent(...) { ... }
export function getTimelineStepLabelClasses(...) { ... }
```

---

## Acceptance Criteria

- [ ] `getButtonClasses()` removed
- [ ] `getCardHoverClasses()` removed
- [ ] `getIconClasses()` removed
- [ ] `styles` constant still present (removed in Step 3)
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] No orphaned exports

**Estimated Time:** 15 minutes

---

## Rollback Plan

If any issues discovered:

```bash
git checkout -- src/core/ui/utils/classNames.ts
```
