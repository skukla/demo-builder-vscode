# Step 6: Migration - Project Creation Feature

## Status
- [ ] Tests Written
- [ ] Implementation Complete
- [ ] Tests Passing
- [ ] Refactored

## Purpose

Extract all project-creation-specific CSS from `custom-spectrum.css` into a feature-scoped CSS Module. This is the largest feature migration (~200 lines), covering BrandGallery, StackSelector, and architecture modal components.

## Prerequisites

- [ ] Step 3 complete (Webpack CSS Modules configured)
- [ ] Step 4 complete (TypeScript declarations exist)
- [ ] Step 5 complete (Prerequisites migration validates pattern)

## Source Analysis

**Classes to migrate from `src/core/ui/styles/custom-spectrum.css`:**

**Selector Components (lines ~788-842):**
- `.selector-grid`
- `.selector-card`, `:hover`, `:focus-visible`, `[data-selected="true"]`
- `.selector-card-name`, `.selector-card-description`

**Expandable Brand Cards (lines ~849-948):**
- `.expandable-brand-grid`
- `.expandable-brand-card`, `.selected`, `.expanded`, `.dimmed`
- `.brand-card-header`, `.brand-card-title-row`
- `.brand-card-name`, `.brand-card-check`, `.brand-card-description`
- `.brand-card-selection`, `-label`, `-value`

**Architecture Modal (lines ~949-1160):**
- `.architecture-modal-options`, `.architecture-modal-option`
- `.architecture-radio`, `.architecture-radio-dot`
- `.architecture-content`, `.architecture-name`, `.architecture-description`
- `.architecture-addons`, `.addon-label`, `.addon-name`, `.addon-description`

**Components:**
- `src/features/project-creation/ui/components/BrandGallery.tsx`
- `src/features/project-creation/ui/components/StackSelector.tsx`

## Tests to Write First

- [ ] Test: CSS Module imports resolve correctly
  - **Given:** BrandGallery component with CSS Module import
  - **When:** Component renders
  - **Then:** No import/resolution errors occur
  - **File:** `tests/features/project-creation/ui/components/BrandGallery.test.tsx`

- [ ] Test: All class names map to camelCase
  - **Given:** Project creation CSS Module
  - **When:** Imported as `styles`
  - **Then:** `styles.selectorGrid`, `styles.expandableBrandCard` exist
  - **File:** `tests/features/project-creation/ui/styles/project-creation.module.test.ts`

## Files to Create/Modify

- [ ] Create `src/features/project-creation/ui/styles/project-creation.module.css`
- [ ] Modify `src/features/project-creation/ui/components/BrandGallery.tsx`
- [ ] Modify `src/features/project-creation/ui/components/StackSelector.tsx`
- [ ] Modify `src/core/ui/styles/custom-spectrum.css` (remove extracted classes)

## Implementation Details

**1. Create CSS Module:**

```css
/* src/features/project-creation/ui/styles/project-creation.module.css */

/* Selector Grid */
.selectorGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.selectorCard { background: var(--spectrum-global-color-gray-50); border-radius: 8px; padding: 12px; cursor: pointer; }
.selectorCardName { font-size: 13px; font-weight: 600; }
.selectorCardDescription { font-size: 11px; color: var(--spectrum-global-color-gray-500); }

/* Expandable Brand Cards */
.expandableBrandGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.expandableBrandCard { background: var(--spectrum-global-color-gray-50); border-radius: 12px; padding: 16px; }
/* ... remaining classes */
```

**2. Update Component Imports:**

```tsx
// BrandGallery.tsx
import styles from '../styles/project-creation.module.css';

// Change: className="expandable-brand-card"
// To:     className={styles.expandableBrandCard}

// Change: cn('expandable-brand-card', isSelected && 'selected')
// To:     cn(styles.expandableBrandCard, isSelected && styles.selected)
```

**3. Class Name Mapping (Key Classes):**

| Global Class | Module Property |
|--------------|-----------------|
| `selector-grid` | `selectorGrid` |
| `selector-card` | `selectorCard` |
| `expandable-brand-grid` | `expandableBrandGrid` |
| `expandable-brand-card` | `expandableBrandCard` |
| `brand-card-header` | `brandCardHeader` |
| `architecture-modal-option` | `architectureModalOption` |

## Expected Outcome

- Project creation CSS is feature-scoped
- No visual changes to BrandGallery or StackSelector
- ~200 lines removed from global CSS
- Largest feature migration validates scalability

## Acceptance Criteria

- [ ] All project-creation styles in CSS Module
- [ ] Components use `styles.className` syntax
- [ ] No project-creation classes remain in global CSS
- [ ] Visual regression: UI unchanged
- [ ] Build succeeds with no CSS warnings

## Estimated Time

2-3 hours
