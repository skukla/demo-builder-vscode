# Step 7: Migration - Projects Dashboard Feature

## Status
- [x] Tests Written
- [x] Implementation Complete
- [x] Tests Passing
- [x] Refactored

## Purpose

Extract 2 projects-dashboard CSS classes from the monolithic custom-spectrum.css to a feature-scoped CSS Module. This is the smallest migration (~20 lines).

## Prerequisites

- [x] Step 3 complete (Webpack CSS Modules configured)
- [x] Step 4 complete (TypeScript declarations exist)
- [x] Step 5-6 patterns established

## Tests to Write First

- [x] Test: CSS Module file exists at correct path
  - **Given:** Feature styles directory
  - **When:** Build runs
  - **Then:** `projects-dashboard.module.css` exists in `src/features/projects-dashboard/ui/styles/`

- [x] Test: ProjectsGrid imports CSS Module
  - **Given:** ProjectsGrid.tsx component
  - **When:** Compiled
  - **Then:** Import statement `import styles from` present

## Files to Create/Modify

- [x] Create `src/features/projects-dashboard/ui/styles/projects-dashboard.module.css`
- [x] Modify `src/features/projects-dashboard/ui/components/ProjectsGrid.tsx` - Import CSS Module
- [x] Modify `src/features/projects-dashboard/ui/ProjectsDashboard.tsx` - Import CSS Module
- [x] Modify `src/core/ui/styles/custom-spectrum.css` - Remove extracted classes

## Implementation Details

### RED Phase

Verify ProjectsGrid.tsx currently uses global className:
```typescript
// Current: className="projects-grid"
// Target: className={styles.projectsGrid}
```

### GREEN Phase

1. Create CSS Module with extracted classes:
```css
/* projects-dashboard.module.css */
.projectsStickyHeader {
    position: sticky !important;
    top: 0 !important;
    z-index: 10 !important;
    background-color: #050505 !important;
    border-bottom: 1px solid #2a2a2a !important;
}

.projectsGrid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
    gap: 24px !important;
}
```

2. Update ProjectsGrid.tsx:
```typescript
import styles from '../styles/projects-dashboard.module.css';
// Change: className="projects-grid" -> className={styles.projectsGrid}
```

3. Remove from custom-spectrum.css:
   - `.projects-sticky-header` (lines 768-775)
   - `.projects-grid` (lines 777-782)

### REFACTOR Phase

- Verify no orphaned references to removed classes
- Update any comment references

## Expected Outcome

- ProjectsGrid renders with feature-scoped styles
- custom-spectrum.css reduced by ~20 lines
- Consistent pattern with Steps 5-6

## Acceptance Criteria

- [x] CSS Module created with 2 classes
- [x] ProjectsGrid uses module import
- [x] ProjectsDashboard uses module import
- [x] Classes removed from custom-spectrum.css
- [x] Grid layout visually unchanged (verified by tests)

## Estimated Time

15 minutes
