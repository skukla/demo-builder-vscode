# Implementation Plan: Code Efficiency Refactoring

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] **Backend Complete** (Steps 1-3, 8, 10)
- [x] **Frontend Complete** (Steps 4-7)
- [x] **Test Coverage Complete** (Steps 9, 11)
- [ ] **Error Handling Consolidation** (Step 12) ← CURRENT

**Created:** 2025-01-21
**Last Updated:** 2025-11-27
**Research:** `.rptc/research/code-efficiency-analysis/research.md`
**Branch:** `refactor/core-architecture-wip`

### Step Completion Status
- [x] Step 1: Complete (duplicates deleted, enums added)
- [x] **Step 2: COMPLETE** ✅ (All valuable work done, strategic deferrals justified)
  - ✅ Part A: Mesh helpers created and integrated (-6 CC, +172 LOC including tests)
  - ✅ Part B.1: Cache jitter utility extracted (-24 LOC, eliminated 2 duplicates)
  - ✅ Step 2.5: Error Formatter Cleanup (deleted unused formatter, -121 LOC)
  - ✅ Step 2.6: HandlerRegistry Consolidation (Phases 1-2 complete, -104 LOC)
  - ✅ Step 2.7: Validator Migration (Phases 1-3 complete, composable validators established)
  - ⏸️ Strategic Deferrals: Error formatters (architectural decision needed), Commands registry (high risk), remaining validators (config-driven is superior), cache inheritance (utility achieves goal)
  - **Net Result**: Registry consolidation complete, validators established, duplications eliminated
  - See `.rptc/plans/code-efficiency-refactoring/step-02.md` for detailed analysis
- [x] **Step 4: React Component Splitting** (COMPLETE ✅)
  - Completed: 2025-11-22, Effort: ~6 hours (as estimated)
  - **TDD RED → GREEN → REFACTOR** complete (100% passing - 215/215 tests)
  - Extracted 13 components from 4 large React files
  - **Bug Found**: Missing `setCanProceed(false)` in useMeshOperations error handler (discovered via TDD)
  - **Impact**: ComponentConfigStep (1024 → ~450 lines), ComponentSelectionStep (529 → ~300 lines)
  - ApiMeshStep (471 → ~250 lines), AdobeAuthStep (380 → ~200 lines)
  - Test Coverage: 13 test files, 215 tests, 100% passing
  - See `step-04.md`
- [x] **Step 2.5: Error Formatter Cleanup** (COMPLETE ✅)
  - Completed: 2025-01-21, Effort: 1 hour (as estimated)
  - Deleted unused Core ErrorFormatter (-121 LOC), enhanced docs (+297 LOC)
  - Created comprehensive error handling guide
  - See `step-02.5-error-formatter-cleanup.md`
- [x] **Step 2.6: HandlerRegistry Consolidation** (COMPLETE ✅)
  - Completed: Oct-Nov 2025 (work predated plan creation), Documented: 2025-11-21
  - Phase 1: Dashboard → BaseHandlerRegistry ✅ (completed Nov 7, 2025, commit bfe24ed)
  - Phase 2: Project Creation → BaseHandlerRegistry ✅ (completed Oct-Nov 2025)
  - Phase 3-4: DEFERRED (Commands - high risk/low value, Core - different abstraction)
  - **Impact**: -104 LOC from Phases 1-2, eliminated 56% of registry duplication
  - **Note**: Plan created from outdated research; actual work completed 2-5 weeks before plan
  - See `step-02.6-handler-registry-consolidation.md`
- [x] **Step 2.7 Phase 1: Custom Validators** (COMPLETE ✅)
  - Completed: 2025-01-21, Effort: 2 hours (60% faster than 5-hour estimate!)
  - Added 5 validators (url, alphanumeric, lowercase, optional, email)
  - Added 27 comprehensive tests (69% more than 16 estimated)
  - All 38 validator tests passing
- [x] **Step 2.7 Phase 2: Field Validation Infrastructure** (COMPLETE ✅)
  - Completed: 2025-01-21, Effort: 1 hour
  - Migrated `src/core/validation/fieldValidation.ts` to use composable validators
  - Reduced code: validateProjectNameUI (16 lines → 7 lines, -56%)
  - Reduced code: validateCommerceUrlUI (26 lines → 2 lines, -92%)
  - All 306 validation tests passing (including 3 new custom message tests)
  - Updated url() validator for stricter validation (matches old URL constructor behavior)
- [x] **Step 2.7 Phase 3: React Component Migration** (COMPLETE ✅)
  - Completed: 2025-01-21, Effort: 15 minutes
  - Migrated `WelcomeStep.tsx` validation to composable validators (7 lines → 5 lines)
  - Assessed ConfigureScreen.tsx and ComponentConfigStep.tsx - already use config-driven validation (no migration needed)
  - All 306 validation tests passing
  - **Phase 4-5 DEFERRED**: Remaining files use good patterns, no immediate migration value
  - See `step-02.7-validator-migration.md`
- [x] **Step 3: TypeScript Smell Remediation** (COMPLETE ✅)
  - Completed: 2025-11-21, Effort: 20 minutes (plan estimated 3-4 hours)
  - **Core Fix** (5 minutes):
    - Changed `useVSCodeMessage<T = any>` to `<T = unknown>` (better type safety)
    - Fixed downstream type errors in `useAsyncData.ts` (proper type annotations)
  - **Quick Wins Fixed** (15 minutes):
    - Fixed 15 test file type assertions
    - 9 array casts: `[] as any` → `[]` or `as string[]`
    - 6 mock objects: Removed unnecessary `as any` from properly-shaped mocks
    - Files: `stalenessDetector-hashCalculation.test.ts` (10), `stalenessDetector.testUtils.ts` (5)
  - **Research Findings**:
    - Only 2 `as any` in src/ (1 legitimate, 1 in docs) - plan claimed 400+
    - 387 `as any` in tests/ - **84% are industry-standard acceptable patterns**
    - Remaining test assertions: Intentionally deferred (would reduce code quality)
  - TypeScript compilation: ✅ Passing, All tests: ✅ Passing
  - See `step-03.md`
- [x] **Step 5-7: Frontend Refactoring** (COMPLETE ✅)
  - Completed: 2025-11-27
  - **Step 5.1**: Created `useAsyncOperation` hook for async operation state management (17 tests)
  - **Step 5.2-5.4**: Evaluated and determined not needed (existing hooks already provide functionality)
  - **Step 6**: Created `useFocusOnMount` hook (3-tier focus strategy, 10 tests)
  - **Step 7**: Consolidated BaseStepProps interface (9 components migrated, ~45 lines removed)
  - See `step-05-hooks-extraction.md`, `step-06-useeffect-refactoring.md`, `step-07-interface-consolidation.md`
- [x] **Step 8: Handler Refactoring (TDD)** (COMPLETE ✅)
  - Completed: 2025-11-21, Effort: ~3.5 hours (30% faster than 5-7 hour estimate)
  - **Phase 0**: Security fix - workspaceId validation in deleteHandler (+5 LOC)
  - **Phase 1**: Integrated extractAndParseJSON() helper (-80 LOC duplicates, 19 tests from Step 2)
  - **Phase 2**: checkHandler helpers extracted (3 functions, -115 LOC, 42 tests, 96.55% coverage)
  - **Phase 3**: createHandler helpers extracted (2 functions, -71 LOC, 31 tests, 100% coverage)
  - **Phase 4**: executor.ts - SKIPPED per YAGNI (agent review: "optimally simple")
  - **Impact**: -266 LOC duplicates, 92 tests added, 98.13% coverage, CC reduced -14 total
  - **Agent Reviews**: 4/4 unanimous approval (Master Efficiency Agent)
  - **Metrics**: See `METRICS_BACKEND.md`
  - See `step-08.md`
- [x] **Step 9: Test Coverage Improvements** (COMPLETE ✅)
  - Completed: 2025-11-27, Effort: ~4 hours
  - **Phase 1**: Critical infrastructure tests (54 tests)
  - **Phase 2**: Hook unit tests - useAuthStatus (20 tests), useConfigNavigation (23 tests)
  - **Phase 3**: Component gap tests - ConfigFieldRenderer (25 tests), ConfigurationSummary (24 tests)
  - **Total**: 146 new tests across 7 test files
  - All tests passing, TypeScript compilation clean
- [x] **Step 10: Backend Verification** (COMPLETE ✅)
  - Completed: 2025-11-21, Scope: Backend refactoring only (Steps 1-3, 8)
  - ✅ All tests passing (mesh handlers: 2 suites, 29 tests, helpers: 68 tests)
  - ✅ TypeScript compilation: No errors
  - ✅ Test coverage: 98.13% (target: 85%) - EXCEEDED
  - ✅ ESLint: 0 errors (2 fixed: unused variable, prefer-const)
  - ✅ Import order: Auto-fixed with --fix
  - ✅ Complexity targets: checkHandler <15, createHandler <15 - ACHIEVED
  - **Note**: Steps 4-7, 9 deferred - frontend refactoring separate effort
  - **Metrics**: See `METRICS_BACKEND.md`
  - See `step-10.md`
- [x] **Step 11: Testing Infrastructure Modernization** (COMPLETE ✅)
  - Completed: 2025-11-26, Effort: ~8 hours
  - **Migration**: 31 test files migrated from fireEvent to @testing-library/user-event
  - **Tests Updated**: 481 tests affected
  - **Benefits Achieved**: Realistic user interaction simulation, Spectrum component compatibility
  - **Commit**: 1d4dac4 "test: migrate to userEvent for realistic user interactions"
  - See `step-11.md`
- [ ] **Step 12: Error Handling Consolidation** (IN PROGRESS)
  - Started: 2025-11-27, Estimated Effort: 8-12 hours
  - **Analysis Complete**: 4 parallel agents analyzed error handling patterns across codebase
  - **Findings**: 3 different error payload formats, ErrorBoundary underutilized (1/5), silent catch blocks
  - **Phase A**: Quick Wins - ErrorBoundary wrappers, silent catch audit, documentation (2-3 hours)
  - **Phase B**: Inline Logic Abstraction continuation - jscpd scan, remaining extractions (2-3 hours)
  - **Phase C**: Systematic Overhaul (optional) - custom error classes, unified payload format (4-6 hours)
  - See `step-12-error-handling-consolidation.md`

---

## Executive Summary

**Feature:** Comprehensive codebase cleanup addressing code smells, complexity, and maintainability

**Purpose:** Reduce technical debt, improve type safety, lower cognitive complexity, and establish sustainable patterns

**Approach:** Incremental refactoring across 10 steps - quick wins first, then systematic improvements to functions, components, hooks, interfaces, and handlers

**Complexity:** Large (10 steps, ~40 files affected)

**Key Risks:** Regression in existing functionality, test coverage gaps during refactoring

---

## Test Strategy

- **Framework:** Jest with ts-jest, @testing-library/react
- **Coverage Goal:** 85%+ overall, 100% for refactored code
- **Approach:** Update existing tests as code changes, add tests for extracted functions/hooks
- **Pattern:** Follow existing test file organization in `tests/` directory

*Detailed test scenarios in individual step files.*

---

## Acceptance Criteria

- [ ] All 12 steps completed with tests passing
- [ ] Coverage >= 85% overall
- [ ] No cognitive complexity > 15 in any function
- [ ] All webview messages properly typed
- [ ] No `as any` casts in new/modified code
- [ ] ESLint rules passing (complexity, explicit-any)
- [ ] Improvement metrics documented per step
- [ ] ErrorBoundary coverage: 5/5 wizard steps protected
- [ ] No silent error swallowing (all user-relevant errors displayed)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regression bugs | Medium | High | Run full test suite after each step |
| Broken imports after moves | Medium | Medium | Use IDE refactoring tools, verify builds |
| Test coverage drop | Low | Medium | Write tests before/during refactoring |
| Merge conflicts | Low | Medium | Work on dedicated branch, regular rebases |
| Incomplete refactoring | Low | Medium | Track metrics, verify improvements |

---

## Dependencies

**ESLint Plugins (Step 10):**
- `@typescript-eslint/eslint-plugin` (existing)
- Configure: `complexity`, `max-lines-per-function`, `@typescript-eslint/no-explicit-any`

**No new npm packages required.**

---

## Key Files to Modify

**High Priority:**
- `src/features/mesh/handlers/meshHandler.ts` - Extract helpers, reduce complexity
- `src/features/project-creation/handlers/executor.ts` - Split large functions
- `src/features/components/handlers/checkHandler.ts` - Handler splitting
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Component/hook extraction

**Types:**
- `src/types/wizard.ts` - Interface decomposition
- `src/shared/communication/types.ts` - Message typing

**Delete (duplicates):**
- 6 duplicate files identified in research

---

## Improvement Tracking Template

Track after each step:

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| LOC (key files) | TBD | - | -10% |
| Max Cognitive Complexity | TBD | - | <=15 |
| `any` usage count | TBD | - | -50% |
| Duplicate code instances | 6 | - | 0 |
| Test Coverage | TBD | - | >=85% |

---

## Coordination Notes

**Step Dependencies:**
- Steps 1-3: Independent, can parallelize
- Step 4-6: React work, sequential recommended
- Step 7: Interface changes may affect steps 4-6
- Step 8: Depends on step 2 (helper extractions)
- Step 9: After all refactoring complete
- Step 10: Final verification
- Step 11: Testing infrastructure (independent)
- Step 12: Error handling consolidation (depends on 1-11 complete)
  - Phase A (Quick Wins): Independent, start immediately
  - Phase B (Inline Logic): Independent, can parallel with A
  - Phase C (Systematic Overhaul): Decision gate after A+B

**Critical Path:** 1 → 2 → 8 → 9 → 10 → 12A → 12B → [Decision Gate] → 12C (optional)
