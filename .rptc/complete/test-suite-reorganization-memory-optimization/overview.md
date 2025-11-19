# Implementation Plan: Test Suite Reorganization & Memory Optimization

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review (Disabled - not applicable)
- [x] Complete

**Created:** 2025-01-17
**Last Updated:** 2025-01-18
**Completed:** 2025-01-18
**Steps:** 4 total steps (all complete)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

**Note**: Security review disabled as this is internal test infrastructure work with no production security implications.

---

## Executive Summary

**Feature:** Split 41 oversized test files (>500 lines) into focused, maintainable test files following feature-based architecture; establish CI/CD guardrails with 500-line warning threshold; optimize jest.config.js for memory efficiency.

**Purpose:** Eliminate "JavaScript heap out of memory" errors during test execution and establish sustainable test organization patterns to prevent future test file bloat.

**Approach:** Incremental hybrid strategy - immediate jest.config.js optimizations (Step 1) for quick wins, followed by systematic file splitting of Priority 1 (3 files) and Priority 2 (4 files) candidates (Step 3), with infrastructure (Step 2) and long-term maintenance (Step 4) guardrails to prevent regression.

**Estimated Complexity:** Medium

**Estimated Timeline:** 16-20 hours (Step 1: 1-2h, Step 2: 2-3h, Step 3: 10-12h, Step 4: 3-4h)

**Key Risks:** Test regressions during splitting (mitigated by existing test suite validation), memory issue persists if wrong candidates targeted (mitigated by research-validated file selection), CI/CD disruption during transition (mitigated by gradual rollout).

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node) and @testing-library/react (jsdom)
- **Coverage Goal:** Maintain 80%+ overall, 100% critical paths (existing threshold)
- **Test Distribution:** Existing distribution maintained (unit/integration/e2e)

### Test Scenarios Summary

**Happy Path:**
- Baseline metrics capture (memory, duration, coverage)
- jest.config.js optimization validation (heap size, maxWorkers)
- Successful file splitting without test failures
- ESLint rule enforcement catches new violations
- CI/CD checks prevent large file commits

**Edge Cases:**
- Shared mock extraction preserves test isolation
- Test utilities properly handle multiple file imports
- Coverage maintained across split files
- Pre-commit hooks don't block legitimate large files (documentation)

**Error Conditions:**
- Split tests fail to detect regressions (rollback mechanism)
- Memory issue persists after Step 1 quick wins (proceed to Step 3 immediately)
- ESLint rule conflicts with existing configuration (override configuration)
- CI/CD check false positives (refinement of threshold rules)

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, step-03.md, step-04.md)

### Coverage Goals

**Overall Target:** 80% (existing threshold)

**Component Breakdown:**

- Maintain existing coverage levels across all components
- No coverage reduction acceptable during refactoring
- Post-split validation ensures coverage parity

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 168 test files execute successfully
- [ ] **Testing:** Zero test failures after all refactoring
- [ ] **Coverage:** Overall coverage ≥ 80%, no reduction from baseline
- [ ] **Code Quality:** Passes linter with new ESLint rules enforced
- [ ] **Documentation:** Splitting playbook created, guidelines documented
- [ ] **Performance:** Memory usage reduced by 40-50% (validated via baseline comparison)
- [ ] **Error Handling:** All test failures caught before commit (pre-commit hooks)

**Feature-Specific Criteria:**

- [ ] All 7 Priority 1 & 2 files split to <500 lines per file
- [ ] jest.config.js optimized with heap size increase and maxWorkers tuning
- [ ] ESLint rule enforces 500-line warning threshold (non-blocking)
- [ ] CI/CD pipeline checks file sizes and blocks >750-line violations
- [ ] Baseline metrics captured (memory, duration, coverage) for comparison
- [ ] Post-refactoring metrics show 40-50% memory reduction
- [ ] Splitting playbook documents when/how to split test files
- [ ] `.testUtils.ts` pattern established for shared fixtures

---

## Risk Assessment

### Risk 1: Test Regressions During Splitting

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** File splitting could introduce test failures if shared mocks, setup logic, or dependencies aren't properly preserved across split files. Silent failures could reduce coverage without detection.
- **Mitigation:**
  1. Run full test suite after each file split (immediate validation)
  2. Use git branches for each split (easy rollback)
  3. Extract shared utilities to `.testUtils.ts` BEFORE splitting (tested isolation)
  4. Validate coverage maintained or improved after split (baseline comparison)
- **Contingency Plan:** Rollback split via git, analyze failure patterns, extract additional shared utilities, retry split

### Risk 2: Memory Issue Persists After Quick Wins

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** If Step 1 jest.config.js optimizations don't resolve memory issues, file splitting (Step 3) becomes critical path. Research indicates 60-70% chance Step 1 alone insufficient for systemic issue affecting 41 files.
- **Mitigation:**
  1. Capture baseline memory metrics in Step 1 (quantifiable improvement measurement)
  2. Prioritize dashboardHandlers.test.ts split immediately if Step 1 shows <30% improvement
  3. Research validates top 7 files account for majority of memory pressure
- **Contingency Plan:** Accelerate Step 3 timeline, split top 3 Priority 1 files within 48 hours if memory failures continue

### Risk 3: Shared Test Utilities Not Properly Extracted

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Large test files often have shared mock fixtures, factory functions, and setup logic. If not properly extracted to `.testUtils.ts`, split files will duplicate this code (defeating DRY principle) or fail due to missing dependencies.
- **Mitigation:**
  1. Analyze existing successful splits (stateManager, meshDeployer, authenticationHandlers) for patterns
  2. Create `.testUtils.ts` extraction checklist (mocks, fixtures, factories, setup/teardown)
  3. Extract utilities BEFORE splitting files (tested in original file first)
  4. Document utility extraction pattern in playbook (Step 2)
- **Contingency Plan:** Refactor split files to consolidate duplicated utilities if duplication detected during code review

### Risk 4: CI/CD Disruption During Transition

- **Category:** Schedule
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Adding ESLint rules and CI/CD checks mid-project could block legitimate commits or cause pipeline failures if thresholds too aggressive (e.g., blocking documentation files or generated code).
- **Mitigation:**
  1. Configure ESLint rule as WARNING not ERROR (non-blocking, visibility only)
  2. Add CI/CD check only to test directories (`tests/**/*.test.{ts,tsx}`)
  3. Allow override via comment annotation for legitimate exceptions
  4. Phase rollout: ESLint first (local validation), then CI/CD (team enforcement)
- **Contingency Plan:** Disable CI/CD check temporarily if blocking critical work, refine rules, re-enable after validation

### Risk 5: Wrong Files Targeted for Splitting

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Low
- **Description:** If Priority 1 & 2 files (7 total) aren't actual memory bottlenecks, splitting effort won't achieve 40-50% memory reduction goal. Research indicates high confidence in file selection, but execution environment differences could affect results.
- **Mitigation:**
  1. Research document validates file selection based on line count, mock complexity, VS Code API overhead
  2. Step 1 baseline metrics include per-file memory profiling (identify actual bottlenecks)
  3. dashboardHandlers.test.ts has CONFIRMED memory issue (lowest risk target)
- **Contingency Plan:** If memory reduction <20% after Priority 1 splits, run heap profiler to identify actual memory-heavy files, adjust Priority 2 list accordingly

---

## Dependencies

### New Packages to Install

None - all work uses existing Jest and ESLint infrastructure.

### Configuration Changes

- [ ] **Config:** `jest.config.js`
  - **Changes:** Increase `--max-old-space-size` from default to 4096MB, adjust `maxWorkers` from 75% to 50%
  - **Environment:** All environments (local development, CI/CD)

- [ ] **Config:** `package.json`
  - **Changes:** Update `test` script to include `node --max-old-space-size=4096`
  - **Environment:** All environments

- [ ] **Config:** `.eslintrc.json`
  - **Changes:** Add max-lines rule for test files (500-line warning threshold)
  - **Environment:** All environments

- [ ] **Config:** CI/CD pipeline configuration
  - **Changes:** Add file size check script for test files (750-line hard limit)
  - **Environment:** CI/CD only

### External Service Integrations

None - all work is internal test infrastructure.

---

## File Reference Map

### Existing Files (To Modify)

**Configuration Files:**
- `jest.config.js` - Current maxWorkers: 75%, add heap size configuration
- `package.json` - Current test script, update with heap size flag
- `.eslintrc.json` - Add max-lines rule

**Test Files to Split (Priority 1 - 3 files):**
- `tests/features/prerequisites/handlers/installHandler.test.ts` (1,198 lines) - Split into 6-7 files by installation type
- `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx` (1,067 lines) - Split into 5 files by workflow stage
- `tests/features/dashboard/handlers/dashboardHandlers.test.ts` (792 lines) - Split into 5 files by handler function

**Test Files to Split (Priority 2 - 4 files):**
- `tests/features/components/services/ComponentRegistryManager.test.ts` (955 lines) - Split by responsibility
- `tests/features/mesh/services/stalenessDetector.test.ts` (925 lines) - Split by detection type
- `tests/features/prerequisites/services/PrerequisitesManager.test.ts` (802 lines) - Split by operation type
- `tests/features/authentication/services/adobeEntityService-organizations.test.ts` (793 lines) - Split by operation

### New Files (To Create)

**Documentation:**
- `docs/testing/test-file-splitting-playbook.md` - Guidelines for when/how to split test files
- `docs/testing/baseline-metrics.md` - Captured baseline and post-refactoring metrics

**Test Utility Files (created during splitting):**
- `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts` - Shared mocks for dashboard handler tests
- `tests/features/prerequisites/handlers/installHandler.testUtils.ts` - Shared fixtures for install handler tests
- `tests/features/prerequisites/ui/steps/PrerequisitesStep.testUtils.tsx` - Shared React setup for prerequisites step tests
- [Additional .testUtils files created as needed during Priority 2 splits]

**Split Test Files:**
- ~35 new test files created from splitting 7 large files (4-7 files per split)

**CI/CD Scripts:**
- `scripts/check-test-file-sizes.js` - File size validation script
- `.github/workflows/test-file-size-check.yml` - GitHub Actions workflow

**Total Files:** 7 modified, ~44 created (~42 from Step 3 splits + 2 from Step 4 CI/CD)

---

## Coordination Notes

**Step Dependencies:**

- Step 2 depends on Step 1: Infrastructure guidelines reference baseline metrics and jest.config.js patterns from Step 1
- Step 3 depends on Step 2: File splitting follows playbook and uses .testUtils pattern established in Step 2
- Step 4 depends on Step 3: CI/CD checks validate against 500-line threshold established during Step 3 refactoring

**Integration Points:**

- Baseline metrics (Step 1) used to validate success in Step 3 and Step 4
- ESLint rules (Step 2) provide local feedback; CI/CD checks (Step 4) provide team enforcement
- .testUtils pattern (Step 2 documentation, Step 3 implementation) becomes standard for all future test file organization
- All steps maintain existing test suite execution (no disruption to development workflow)

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@test-suite-reorganization-memory-optimization"`
3. **Quality Gates:** Efficiency Agent review after all steps complete (Security review disabled)
4. **Completion:** Verify all acceptance criteria met, validate 40-50% memory reduction

**First Step:** Run `/rptc:tdd "@test-suite-reorganization-memory-optimization"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, step-03.md, step-04.md_
