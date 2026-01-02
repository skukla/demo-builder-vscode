# Step 5: Migration - Prerequisites Feature

## Status
- [x] Tests Written
- [x] Implementation Complete
- [x] Tests Passing
- [x] Refactored

## Purpose

Extract all prerequisite-specific CSS from global files into a feature-scoped CSS Module. This is the smallest feature migration, serving as a validation pattern for subsequent migrations.

## Prerequisites

- [x] Step 3 complete (Webpack CSS Modules configured)
- [x] Step 4 complete (TypeScript declarations exist)

## Source Analysis

**Classes to migrate from `src/core/ui/styles/wizard.css` (lines 19-66):**
- `.prerequisites-container`
- `.prerequisite-item-grid`
- `.prerequisite-icon`
- `.prerequisite-header`
- `.prerequisite-header-inner`
- `.prerequisite-expandable`

**Classes to migrate from `src/core/ui/styles/custom-spectrum.css`:**
- `.prerequisite-item` (~line 255)
- `.prerequisite-item-spacing` (~line 760)
- `.prerequisite-title`, `.prerequisite-description` (~lines 274-285)
- `.prerequisite-message`, `.prerequisite-message-error/warning/default` (~lines 287-310)
- `.prerequisite-plugin-item` (~line 327)
- Transition classes (~lines 2575-2661)

**Component:** `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`

## Tests to Write First

- [x] Test: CSS Module imports resolve correctly
  - **Given:** PrerequisitesStep component with CSS Module import
  - **When:** Component renders
  - **Then:** No import/resolution errors occur
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [x] Test: All prerequisite class names map to camelCase
  - **Given:** Prerequisites CSS Module with hyphenated class names
  - **When:** Imported as `styles`
  - **Then:** `styles.prerequisitesContainer`, `styles.prerequisiteItem` exist
  - **File:** `tests/features/prerequisites/ui/styles/prerequisites.module.test.ts`

## Files to Create/Modify

- [x] Create `src/features/prerequisites/ui/styles/prerequisites.module.css`
- [x] Modify `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- [x] Modify `src/features/prerequisites/ui/steps/hooks/prerequisiteRenderers.tsx`
- [x] Modify `src/core/ui/styles/wizard.css` (remove prerequisite classes)
- [x] Modify `src/core/ui/styles/custom-spectrum.css` (remove prerequisite classes)

## Implementation Details

**1. Create CSS Module:**

```css
/* src/features/prerequisites/ui/styles/prerequisites.module.css */

/* Container */
.prerequisitesContainer {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid var(--spectrum-global-color-gray-400);
    border-radius: 4px;
    padding: 12px;
    margin-top: 20px;
    margin-bottom: 30px;
}

/* Grid layout */
.prerequisiteItemGrid {
    display: grid;
    grid-template-columns: 20px 1fr;
    column-gap: 12px;
}

/* ... remaining classes with camelCase naming */
```

**2. Update Component Import:**

```tsx
// PrerequisitesStep.tsx
import styles from '../styles/prerequisites.module.css';

// Change: className="prerequisites-container"
// To:     className={styles.prerequisitesContainer}
```

**3. Class Name Mapping:**

| Global Class | Module Property |
|--------------|-----------------|
| `prerequisites-container` | `prerequisitesContainer` |
| `prerequisite-item` | `prerequisiteItem` |
| `prerequisite-item-grid` | `prerequisiteItemGrid` |
| `prerequisite-item-spacing` | `prerequisiteItemSpacing` |
| `prerequisite-icon` | `prerequisiteIcon` |
| `prerequisite-header` | `prerequisiteHeader` |
| `prerequisite-header-inner` | `prerequisiteHeaderInner` |
| `prerequisite-title` | `prerequisiteTitle` |
| `prerequisite-description` | `prerequisiteDescription` |
| `prerequisite-expandable` | `prerequisiteExpandable` |
| `prerequisite-message` | `prerequisiteMessage` |
| `prerequisite-message-error` | `prerequisiteMessageError` |
| `prerequisite-plugin-item` | `prerequisitePluginItem` |

**4. Update cn() calls:**

```tsx
// Before
className={cn('prerequisite-item', 'prerequisite-item-grid', ...)}

// After
className={cn(styles.prerequisiteItem, styles.prerequisiteItemGrid, ...)}
```

## Expected Outcome

- Prerequisites CSS is feature-scoped (not global)
- No visual changes to Prerequisites UI
- ~80 lines removed from global CSS files
- Pattern validated for subsequent feature migrations

## Acceptance Criteria

- [x] All prerequisite styles in CSS Module
- [x] Component uses `styles.className` syntax
- [x] No prerequisite classes remain in global CSS
- [x] Visual regression: UI unchanged
- [x] Build succeeds with no CSS warnings

## Estimated Time

1-2 hours
