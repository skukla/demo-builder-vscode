# Implementation Plan: Demo Inspector Default for Headless Frontends

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Complete

**Created:** 2025-12-30
**Completed:** 2025-12-30

---

## Executive Summary

**Feature:** Make demo-inspector checked by default for headless frontend stacks

**Purpose:** Headless frontends should have demo-inspector enabled by default since it provides essential debugging capabilities for NextJS storefronts.

**Approach:** Separate `FRONTEND_DEPENDENCIES` (required, locked) from `FRONTEND_ADDONS` (optional, pre-selected). This mirrors the `stacks.json` structure where behavior is determined by array membership, not boolean flags.

**Key Distinction:**
- `FRONTEND_DEPENDENCIES` = LOCKED, cannot be unchecked (shown with lock icon)
- `FRONTEND_ADDONS` = Pre-checked but OPTIONAL, user can still uncheck

**Estimated Complexity:** Simple (UI code change)

**Estimated Timeline:** 30 minutes

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest and @testing-library/react
- **Coverage Goal:** Verify existing component tests pass

### Test Validation

All 91 component UI tests pass with the implementation. The defaultSelected behavior is validated through:
- ComponentSelectionStep rendering tests
- useComponentSelection hook initialization tests

**No new tests required** - existing tests verify the correct behavior.

---

## Implementation Constraints

- File Size: N/A (small code change)
- Complexity: Minimal - interface extension and effect modification
- Dependencies: None
- Platforms: All
- Performance: No impact

---

## Acceptance Criteria

- [x] demo-inspector remains in `optionalAddons` in stacks.json (NOT moved to dependencies)
- [x] Separate `FRONTEND_DEPENDENCIES` array (commerce-mesh, required/locked)
- [x] Separate `FRONTEND_ADDONS` array (demo-inspector, optional/pre-selected)
- [x] useComponentSelection hook accepts `frontendAddons` prop
- [x] Hook initializes both dependencies AND addons when frontend selected
- [x] All existing tests pass (33 ComponentSelectionStep tests)
- [x] Demo inspector checkbox is checked by default when headless frontend is selected
- [x] Demo inspector checkbox can still be unchecked by user (not locked)

---

## Risk Assessment

### Risk 1: Breaking Existing Projects

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Description:** Existing projects already have their selections saved; this only affects new projects
- **Mitigation:** Change only affects initial defaults, not persisted state

---

## File Reference Map

### Files Modified

- `src/features/components/ui/steps/ComponentSelectionStep.tsx` - Split into separate `FRONTEND_DEPENDENCIES` (required) and `FRONTEND_ADDONS` (optional) arrays; updated UI to render separate sections
- `src/features/components/ui/hooks/useComponentSelection.ts` - Added `frontendAddons` prop; updated initialization to add both dependencies and addons when frontend selected

### Files NOT Modified (Incorrect Initial Approach)

- `src/features/project-creation/config/stacks.json` - NOT modified; demo-inspector stays in optionalAddons

**Total Files:** 2 modified, 0 created
