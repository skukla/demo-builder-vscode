# UI Component Extraction - Plan Overview

## Status: ✅ COMPLETE

## Status Tracking
- [x] Step 1: Extract ProjectStatusUtils ✅ (19 tests passing)
- [x] Step 2: Create CenteredFeedbackContainer ✅ (14 tests passing)
- [x] Step 3: Refactor Loading States ✅ (12 occurrences across 6 files)
- [x] Step 4: Create SuccessStateDisplay ✅ (20 tests passing)
- [x] Step 5: Remove Unused Components ✅ (5 files deleted)
- [x] Step 6: Update Barrel Exports ✅ (all barrels updated)

## Executive Summary

| Aspect | Details |
|--------|---------|
| Feature | Extract reusable UI patterns to eliminate duplicate code |
| Purpose | Reduce 200+ duplicate lines, improve consistency across 5+ features |
| Approach | Extract utilities, create wrapper components, delete unused code |
| Complexity | Low |
| Estimated Steps | 6 |
| Estimated Time | 2-3 hours |
| Key Risks | Breaking existing imports during refactor |

## Research Reference

**Document:** `.rptc/research/ui-component-extraction-opportunities/research.md`

**Key Findings:**
- 4 files with identical status helpers (72 duplicate lines per pair)
- 12+ files with repeated centered Flex wrapper pattern
- 5 unused components safe to delete (Icon, Badge, Tip, CompactOption, ComponentCard)
- 3+ inconsistent success state implementations

## Test Strategy

- **Framework:** Jest + @testing-library/react
- **Coverage Goals:** 85%+ for new utilities, 100% for critical paths
- **Test Distribution:** Unit (90%), Integration (10%)

**Per-Step Test Scenarios:** Detailed in individual step files

## Implementation Constraints

- **File Size:** <200 lines per new file (utilities are small)
- **Complexity:** Pure functions for utils, minimal props for components
- **Dependencies:** None new - uses existing Spectrum components
- **Patterns:** Follow existing `@/core/ui/components/` structure

## Acceptance Criteria

- [ ] All 4 project status files use shared `projectStatusUtils.ts`
- [ ] All loading states use `CenteredFeedbackContainer`
- [ ] All success states use `SuccessStateDisplay`
- [ ] 5 unused components deleted with no import errors
- [ ] All barrel exports (`index.ts`) updated
- [ ] Zero duplicate helper functions in projects-dashboard
- [ ] 85%+ test coverage on new code
- [ ] All existing tests pass after refactor

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| Import breakage | Technical | Medium | High | Update all imports before deletion, run tests after each step |
| Visual regression | Technical | Low | Medium | Manual visual verification after component changes |
| Missing usage | Technical | Low | Low | Grep for direct imports before deleting unused components |

## Dependencies

- **New Packages:** None
- **Configuration Changes:** None
- **External Services:** None

## File Reference Map

### Existing Files to Modify
- `src/features/projects-dashboard/ui/components/ProjectCard.tsx` - Remove helper functions
- `src/features/projects-dashboard/ui/components/ProjectRow.tsx` - Remove helper functions
- `src/features/projects-dashboard/ui/components/ProjectListView.tsx` - Use shared utils
- `src/features/projects-dashboard/ui/components/ProjectButton.tsx` - Use shared utils
- `src/core/ui/components/feedback/index.ts` - Add new exports
- `src/core/ui/components/ui/index.ts` - Remove unused exports

### New Files to Create
- `src/features/projects-dashboard/utils/projectStatusUtils.ts` - Extracted helpers
- `src/core/ui/components/feedback/CenteredFeedbackContainer.tsx` - Wrapper component
- `src/core/ui/components/feedback/SuccessStateDisplay.tsx` - Success state component

### Files to Delete
- `src/core/ui/components/ui/Icon.tsx`
- `src/core/ui/components/ui/Badge.tsx`
- `src/core/ui/components/ui/Tip.tsx`
- `src/core/ui/components/ui/CompactOption.tsx`
- `src/core/ui/components/ui/ComponentCard.tsx`

## Coordination Notes

- **Step Dependencies:** Steps 1-2 independent, Step 3 requires Step 2, Step 4 requires Steps 2-3
- **Integration Points:** Step 6 (barrel exports) must run last after all deletions
- **Safe Order:** 1, 2, 3, 4, 5, 6 (sequential due to import dependencies)

## Next Actions

1. Start with Step 1: Extract ProjectStatusUtils
2. Execute: `/rptc:tdd "@ui-component-extraction/"`
