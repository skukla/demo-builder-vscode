# Implementation Plan: Demo Templates - Phase 4 (Template Gallery)

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** Enhanced template gallery with search, filter, and responsive grid layout

**Purpose:** Replace the simple card grid with a full-featured template gallery (similar to Projects Dashboard) that scales well as more templates are added. Provides search, tag filtering, and grid/list view modes.

**Approach:**
1. Create `TemplateGallery` component with search/filter capabilities
2. Reuse patterns from `ProjectsDashboard` and `SearchHeader`
3. Support tag-based filtering using existing `tags` field in templates
4. Add view mode toggle (cards/list)

**Estimated Complexity:** Medium (3 implementation steps, ~8-12 hours)

**Key Risks:**
- UI consistency with existing ProjectsDashboard patterns

---

## Research Reference

**Document:** Phase 3 implementation provides foundation

**Key Findings:**
- `demo-templates.json` already has `tags` field for filtering
- `SearchHeader` component provides search + view mode toggle
- `ProjectsGrid` / `ProjectRowList` patterns can be adapted
- Current `TemplateCardGrid` is minimal - can be replaced

---

## Test Strategy

**Framework:** Jest with @testing-library/react
**Coverage Goals:** 85%+ on new components

**Test Scenarios Summary:**
1. Search filters templates by name and description
2. Tag filtering shows only matching templates
3. View mode toggle between cards and list
4. Empty state when no templates match filter
5. Template selection works in both view modes

---

## Acceptance Criteria

- [ ] `TemplateGallery` component with search input
- [ ] Tag-based filtering (chips or dropdown)
- [ ] Grid/list view mode toggle
- [ ] Responsive layout matching ProjectsDashboard
- [ ] All tests pass with 85%+ coverage
- [ ] WelcomeStep uses new TemplateGallery

---

## File Reference Map

### New Files to Create
- `src/features/project-creation/ui/components/TemplateGallery.tsx` - Main gallery component
- `src/features/project-creation/ui/components/TemplateCard.tsx` - Enhanced card (replaces simple card)
- `src/features/project-creation/ui/components/TemplateRow.tsx` - List view row
- `tests/features/project-creation/ui/components/TemplateGallery.test.tsx`

### Existing Files to Modify
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - Use TemplateGallery
- `src/features/project-creation/ui/components/TemplateCardGrid.tsx` - Remove (replaced)

### Patterns to Reuse
- `SearchHeader` from `@/core/ui/components/navigation/SearchHeader`
- `ProjectsGrid` layout pattern from `projects-dashboard`
- Tag chip styling from Spectrum components

---

## Implementation Steps

### Step 1: Create TemplateCard and TemplateRow components
- Enhanced card with icon, tags display, featured badge
- List row variant for compact view
- Selection state styling

### Step 2: Create TemplateGallery component
- Integrate SearchHeader with search and view mode toggle
- Tag filter chips
- Grid/list view rendering
- Empty state for no matches

### Step 3: Integrate into WelcomeStep
- Replace TemplateCardGrid with TemplateGallery
- Remove old TemplateCardGrid component
- Update tests

---

## Coordination Notes

**Dependencies:**
- Phase 3 complete (provides template loading infrastructure)
- SearchHeader component available in @/core/ui

**Reusable Patterns:**
- Copy filter logic from ProjectsDashboard
- Reuse SearchHeader props pattern
- Match spacing and layout with existing dashboard

---

## Next Actions

1. Begin Step 1: Create TemplateCard and TemplateRow components with TDD
