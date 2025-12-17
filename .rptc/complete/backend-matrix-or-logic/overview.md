# Backend Matrix - OR Logic for Component-Specific Steps

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Code Review
- [x] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** OR Logic for Component-Specific Wizard Steps
**Purpose:** Enable wizard steps to appear when ANY of multiple components are selected (e.g., ACO config step appears for both PaaS+ACO and ACCS backends)
**Approach:** Add `requiredAny` field to `filterStepsByComponents()` alongside existing `requiredComponents` (AND logic)
**Complexity:** Low (~10 lines implementation + tests)
**Key Risks:** Backward compatibility with existing `requiredComponents` field

---

## Research Reference

**Document:** `.rptc/research/demo-template-architecture/research.md`

**Key Findings:**
- Phase 2 of demo-first architecture: Backend Matrix
- Single concrete use case NOW: ACO configuration step for both PaaS+ACO and ACCS
- PM direction: YAGNI-focused, only OR logic, no complex conditionals

---

## Test Strategy

**Framework:** Jest with ts-jest
**Coverage Goals:** 100% on new code (matches existing filterStepsByComponents coverage)

**Test Scenarios Summary:**
1. **OR logic (requiredAny)** - Step shows when ANY component is selected
2. **Backward compatibility** - Existing `requiredComponents` (AND) continues working
3. **Combined logic** - Both `requiredComponents` AND `requiredAny` on same step
4. **Edge cases** - Empty arrays, undefined, no matching components

See individual step files for detailed test specifications.

---

## Acceptance Criteria

- [x] `requiredAny` field support added to `WizardStepConfigWithRequirements` interface
- [x] `filterStepsByComponents()` handles OR logic when `requiredAny` present
- [x] Existing AND logic (`requiredComponents`) unchanged
- [x] All existing tests pass (backward compatibility)
- [x] New tests cover OR logic scenarios with 100% coverage
- [x] Backend component placeholders added to `components.json`
- [ ] `wizard-steps.json` can use new `requiredAny` field (ready for use)

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation | Contingency |
|------|----------|------------|--------|------------|-------------|
| Breaking existing AND logic | Technical | Low | High | Comprehensive backward compatibility tests | Revert and fix before merge |
| Type errors in wizard state | Technical | Low | Medium | Update TypeScript interfaces first | Fix types before implementation |

---

## Dependencies

**New Packages:** None required
**Configuration Changes:**
- `templates/components.json` - Add ACCS and ACO addon placeholder definitions
- `templates/wizard-steps.json` - Will use new `requiredAny` field (future steps)

**External Services:** None

---

## File Reference Map

### Existing Files to Modify
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Add `requiredAny` to interface and filter logic
- `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts` - Add OR logic test suite
- `templates/components.json` - Add backend component placeholders

### New Files to Create
- None (minimal change per YAGNI)

---

## Coordination Notes

**Step Dependencies:**
1. Step 1 must complete first (provides type extension and filtering logic)
2. Step 2 can run after Step 1 (uses new field in configuration)

**Integration Points:**
- `filterStepsByComponents()` is called by `useWizardState.ts` hook
- Interface changes affect `wizard-steps.json` schema
- Component definitions feed into component selection UI

---

## Next Actions

1. Begin Step 1: Add `requiredAny` field support to `filterStepsByComponents()` with TDD
