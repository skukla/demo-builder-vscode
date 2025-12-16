# Component-Specific Wizard Steps - Implementation Plan

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Code Review
- [x] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** Component-Specific Wizard Timeline Steps

**Purpose:** Enable wizard steps to dynamically appear/disappear based on selected components. When a user selects components (e.g., `citisignal-nextjs`), relevant configuration steps become visible in the timeline. Steps without component requirements remain always visible (backward compatible).

**Approach:** Extend the existing configuration-first architecture with minimal changes:
1. Add optional `requiredComponents` field to `wizard-steps.json` schema
2. Create `filterStepsByComponents()` helper function
3. Make `WIZARD_STEPS` memo reactive to component selection changes

**Complexity:** Low-Medium

**Key Risks:**
1. Breaking existing wizard flow (mitigate with backward-compatible optional field)
2. Performance impact from recalculating steps (mitigate with memoization)

---

## Test Strategy

**Framework:** Jest with ts-jest
**Coverage Goals:** 80%+ overall, 100% critical paths

**Test Scenarios Summary:**
- **Schema extension** (Step 1): Backward compatibility with existing steps, new field parsing
- **Step filtering** (Step 2): No requirements (always shown), single requirement, multiple requirements, mixed scenarios
- **Reactive memo** (Step 3): Step list updates when components change, timeline reflects filtered steps

See individual step files for detailed test specifications.

---

## Acceptance Criteria

- [x] Steps with `requiredComponents` only appear when those components are selected
- [x] Steps without `requiredComponents` always appear (backward compatible)
- [x] Timeline UI automatically updates when component selection changes
- [x] All existing wizard tests continue passing (372 tests)
- [x] 100% test coverage on new code (27 tests for new functions)
- [x] No performance degradation (memoized recalculation)

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation | Contingency |
|------|----------|------------|--------|------------|-------------|
| Breaking existing steps | Technical | Low | High | `requiredComponents` is optional - steps without it unchanged | Revert field, use separate config |
| Performance on step recalculation | Technical | Low | Medium | Use `useMemo` with proper dependencies | Add debouncing if needed |
| Type system complexity | Technical | Medium | Low | Extend existing types minimally | Use type assertion as fallback |

---

## Dependencies

**New Packages:** None required

**Configuration Changes:**
- Extend `wizard-steps.json` with optional `requiredComponents` field
- No new types needed (extend inline in wizardHelpers)

**External Services:** None

---

## File Reference Map

### Existing Files to Modify

- `templates/wizard-steps.json` - Add `requiredComponents` field to step definitions
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Add `filterStepsByComponents()` function
- `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` - Make WIZARD_STEPS memo reactive

### New Files to Create

- `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts` - Step filtering tests
- `tests/features/project-creation/ui/wizard/hooks/useWizardState.reactive.test.ts` - Reactive memo tests

---

## Coordination Notes

**Step Dependencies:**
1. **Step 1 (Schema Extension)** must complete first
   - Provides: Extended step type with `requiredComponents`
   - Required by: Steps 2 and 3
   - Status: No external dependencies

2. **Step 2 (Step Filtering)** depends on Step 1
   - Uses: Extended step type
   - Provides: `filterStepsByComponents()` function
   - Can be tested independently with mock config

3. **Step 3 (Reactive Memo)** depends on Steps 1 and 2
   - Uses: `filterStepsByComponents()` function
   - Provides: Reactive step list in `useWizardState`
   - Includes integration with TimelineNav

**Integration Points:**
- `filterStepsByComponents()` (Step 2) → called by `useWizardState` memo
- `WIZARD_STEPS` memo (Step 3) → consumed by `TimelineNav` and navigation logic
- Backward compatibility maintained: steps without `requiredComponents` work as before

---

## Data Flow

```
User selects components in ComponentSelectionStep
    |
    v
state.components updated via updateState()
    |
    v
useWizardState hook detects dependency change
    |
    v
WIZARD_STEPS memo recalculates via filterStepsByComponents()
    |
    v
TimelineNav re-renders with updated step list
    |
    v
Navigation logic adjusts to new step sequence
```

---

## Next Actions

1. Begin Step 1: Extend wizard-steps.json with requiredComponents field
