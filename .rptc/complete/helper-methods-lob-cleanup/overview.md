# Implementation Plan: Helper Methods LoB Cleanup

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-11-30
**Last Updated:** 2025-11-30
**Completed:** 2025-11-30

---

## Executive Summary

**Feature:** Remove unused helper methods and inline single-consumer CSS helpers per Locality of Behavior (LoB) principles

**Purpose:** Eliminate dead code (unused helpers) and improve code locality by inlining single-consumer CSS helpers into their consuming components

**Approach:** Two-phase cleanup:
1. Remove 15 verified unused helpers from typeGuards.ts and classNames.ts
2. Inline 3 single-consumer CSS helpers into their consuming components

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-3 hours

**Key Risks:**
- False positive unused detection (mitigated by verification steps)
- Inlining may break styling (mitigated by visual regression testing)

---

## Research References

**Research Document:** `.rptc/research/helper-methods-audit-lob/research.md`

**Key Findings:**
- 18 helpers identified as unused in research (15 verified after cross-check)
- `translateSpectrumToken()` is NOT unused - actively used by 3 layout components (research error)
- 3 single-consumer CSS helpers are candidates for inlining
- `styles` constant only used internally by helpers being removed/inlined

**Relevant Files Identified:**

Source files to modify:
- `src/types/typeGuards.ts` - Remove 11 unused type guards
- `src/core/ui/utils/classNames.ts` - Remove 4 unused helpers + inline 3 + remove `styles` constant
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` - Receive inlined helpers
- `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Receive inlined helper

Test files to update:
- `tests/types/typeGuards-domain-models.test.ts` - Remove tests for removed helpers
- `tests/types/typeGuards-domain-validation.test.ts` - Remove tests for removed helpers
- `tests/types/typeGuards-domain-status.test.ts` - Remove tests for removed helpers
- `tests/types/typeGuards-utility-errors.test.ts` - Remove tests for removed helpers
- `tests/types/typeGuards-utility-parsing.test.ts` - Remove tests for removed helpers

---

## Research Corrections

**Critical Finding:** The research incorrectly identified `translateSpectrumToken()` as unused.

**Verification Results:**
| Helper | Research Status | Actual Status | Action |
|--------|-----------------|---------------|--------|
| `translateSpectrumToken()` | "Never imported" | Used by GridLayout, TwoColumnLayout, SingleColumnLayout | **KEEP** |
| `styles` constant | "Never consumed" | Used internally by helpers being removed | **REMOVE** (after helper removal) |

**Verified Unused Helpers (15 total):**

**From `src/types/typeGuards.ts` (11):**
1. `isProject()` - line 31
2. `isComponentInstance()` - line 49
3. `isProcessInfo()` - line 65
4. `isComponentStatus()` - line 83
5. `isProjectStatus()` - line 104
6. `isValidationResult()` - line 121
7. `isMessageResponse()` - line 137
8. `isLogger()` - line 149
9. `isStateValue()` - line 166
10. `assertNever()` - line 218
11. `getInstanceEntriesFromRecord()` - line 345

**From `src/core/ui/utils/classNames.ts` (4):**
12. `getButtonClasses()` - line 248
13. `getCardHoverClasses()` - line 309
14. `getIconClasses()` - line 318
15. `styles` constant - line 22 (used only by helpers being removed)

**CSS Helpers to Inline (3):**
1. `getPrerequisiteItemClasses()` (line 230) - Single consumer: PrerequisitesStep.tsx
2. `getPrerequisiteMessageClasses()` (line 239) - Single consumer: PrerequisitesStep.tsx
3. `getTimelineStepLabelClasses()` (line 299) - Single consumer: TimelineNav.tsx

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node) and @testing-library/react (React)
- **Coverage Goal:** Maintain existing coverage (no new code added, only removals)
- **Test Distribution:** Primarily compile-time verification, unit test cleanup

### Verification Strategy

**Phase 1: Unused Helper Removal**
- TypeScript compile check after each removal batch
- Test suite run to verify no runtime dependencies
- Existing tests for removed helpers should be deleted (they test removed code)

**Phase 2: CSS Helper Inlining**
- Visual inspection of affected components
- Run test suite to verify no regressions
- TypeScript compile check to verify no import errors

### Test Files Structure

```
tests/
├── types/
│   ├── typeGuards-domain-models.test.ts    # Remove: isProject, isComponentInstance, isProcessInfo tests
│   ├── typeGuards-domain-validation.test.ts # Remove: isValidationResult, isMessageResponse, isLogger tests
│   ├── typeGuards-domain-status.test.ts    # Remove: isComponentStatus, isProjectStatus tests
│   ├── typeGuards-utility-errors.test.ts   # Remove: assertNever tests
│   └── typeGuards-utility-parsing.test.ts  # Remove: isStateValue tests
└── webview-ui/
    └── (no changes - CSS helpers have no tests)
```

---

## Implementation Constraints

- **File Size:** <500 lines (standard)
- **Complexity:** <50 lines/function, <10 cyclomatic
- **Dependencies:** No new dependencies, only removals
- **Platforms:** Node.js 18+ with TypeScript strict mode
- **Performance:** No performance impact (removal-only changes)

---

## Risk Assessment

### Risk 1: False Positive Unused Detection

- **Category:** Technical
- **Likelihood:** Low (verified with grep searches)
- **Impact:** High (would break functionality if in use)
- **Priority:** High
- **Description:** Research may have missed consumers due to dynamic imports or indirect references
- **Mitigation:**
  1. Grep verification before each removal
  2. TypeScript compile check after each removal
  3. Full test suite after each batch
- **Contingency:** Git revert if any failure detected
- **Owner:** Developer

### Risk 2: CSS Styling Regression

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low (visual only, no functionality)
- **Priority:** Medium
- **Description:** Inlining CSS helpers may subtly change styling if logic not preserved exactly
- **Mitigation:**
  1. Exact logic preservation (copy-paste, then simplify)
  2. Visual inspection of affected components
  3. Run extension and visually verify UI
- **Contingency:** Inline with exact logic, no simplification
- **Owner:** Developer

### Risk 3: Test Suite Coverage Drop

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Removing tests for removed helpers will reduce line count but not coverage %
- **Mitigation:**
  1. Coverage % should stay same or increase (less code to cover)
  2. Verify coverage after completion
- **Contingency:** None needed - expected behavior
- **Owner:** Developer

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All unused helpers removed from source files
- [ ] **Inlining:** 3 CSS helpers inlined to consuming components
- [ ] **Testing:** TypeScript compiles without errors
- [ ] **Testing:** All tests pass (remaining tests, after removing tests for removed code)
- [ ] **Code Quality:** No orphaned imports or exports
- [ ] **Documentation:** No changes needed (internal cleanup)

**Feature-Specific Criteria:**

- [ ] `typeGuards.ts` reduced from ~437 lines to ~320 lines
- [ ] `classNames.ts` reduced from ~320 lines to ~75 lines
- [ ] No breaking changes to public API (only unused code removed)
- [ ] Test files updated to remove tests for removed helpers

---

## File Reference Map

### Existing Files (To Modify)

**Source Files:**

- `src/types/typeGuards.ts` - Remove 11 unused helpers (~117 lines removed)
- `src/core/ui/utils/classNames.ts` - Remove 4 unused helpers + inline 3 + remove `styles` (~250 lines removed)
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` - Add 2 inlined helpers (~12 lines added)
- `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Add 1 inlined helper (~10 lines added)

**Test Files:**

- `tests/types/typeGuards-domain-models.test.ts` - Remove tests for isProject, isComponentInstance, isProcessInfo
- `tests/types/typeGuards-domain-validation.test.ts` - Remove tests for isValidationResult, isMessageResponse, isLogger
- `tests/types/typeGuards-domain-status.test.ts` - Remove tests for isComponentStatus, isProjectStatus
- `tests/types/typeGuards-utility-errors.test.ts` - Remove tests for assertNever
- `tests/types/typeGuards-utility-parsing.test.ts` - Remove tests for isStateValue

### New Files (To Create)

None - this is a cleanup task only.

**Total Files:** 9 modified, 0 created

---

## Assumptions

- [ ] **Assumption 1:** Grep search accurately identifies all consumers
  - **Source:** Verified via grep patterns in research
  - **Impact if Wrong:** Would break functionality - mitigated by compile check

- [ ] **Assumption 2:** Tests for removed helpers should also be removed
  - **Source:** ASSUMED based on standard practice - tests for deleted code are dead tests
  - **Impact if Wrong:** None - keeping dead tests wastes CI time but doesn't break anything

- [ ] **Assumption 3:** Inlined CSS helpers don't need dedicated unit tests
  - **Source:** ASSUMED based on existing pattern - original helpers had no tests
  - **Impact if Wrong:** None - original code was untested, inlined code maintains that

---

## Step Summary

| Step | Name | Purpose | Lines Changed |
|------|------|---------|---------------|
| 1 | Remove Unused Type Guards | Remove 11 unused helpers from typeGuards.ts | ~-117 source, ~-250 tests |
| 2 | Remove Unused CSS Helpers | Remove 4 unused helpers + styles constant from classNames.ts | ~-200 source |
| 3 | Inline PrerequisitesStep CSS Helpers | Inline 2 helpers into PrerequisitesStep.tsx | ~+12, ~-20 |
| 4 | Inline TimelineNav CSS Helper | Inline 1 helper into TimelineNav.tsx | ~+10, ~-15 |
| 5 | Final Verification | Full test suite, compile check, coverage | 0 |

**Total Estimated Impact:**
- Source lines removed: ~330
- Test lines removed: ~250
- Source lines added: ~22
- Net reduction: ~558 lines

---

## Plan Maintenance

**This is a living document.**

### How to Handle Changes During Implementation

1. **Small Adjustments:** Update plan inline, note in "Deviations" section
2. **Major Changes:** Use `/rptc:helper-update-plan` command
3. **Blockers:** Document in "Implementation Notes" section

### Deviations Log

**Format:**
```markdown
- **Date:** [YYYY-MM-DD]
- **Change:** [What changed from original plan]
- **Reason:** [Why the change was needed]
- **Impact:** [How this affects other steps]
```

### When to Request Replanning

Request full replan if:
- More than 3 helpers are found to be in use (research significantly incorrect)
- Inlining causes functional regressions
- TypeScript compile errors persist after fixes

---

## Implementation Notes (Updated During TDD Phase)

### Completed Steps

- [x] Step 1: Remove Unused Type Guards (11 helpers + ValidationResult interface removed)
- [x] Step 2: Remove Unused CSS Helpers (3 helpers removed)
- [x] Step 3: Inline PrerequisitesStep CSS Helpers (2 helpers + styles constant removed)
- [x] Step 4: Inline TimelineNav CSS Helper (getTimelineStepLabelClasses inlined)
- [x] Step 5: Final Verification (all checks pass)

### Quality Gates

- [x] Efficiency Agent: Additional optimization - inlined getTimelineStepDotClasses
- [x] Security Agent: Clean audit, 0 issues found
- [x] Documentation Specialist: No updates needed (internal cleanup)

### Final Results

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| typeGuards.ts | 437 lines | 232 lines | 47% |
| classNames.ts | 320 lines | 16 lines | 95% |

**Total Lines Removed:** ~550 (source + tests)
**Tests Passing:** 3845

---

## Next Actions

**Plan Complete!**

Run `/rptc:commit` to commit all changes.

---

_Plan created by Master Feature Planner_
_TDD execution completed 2025-11-30_
_Status: Complete - Ready for Commit_
