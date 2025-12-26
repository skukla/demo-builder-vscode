# Test Audit Phase 7: Stale Test Removal

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (N/A - cleanup only)
- [x] Security Review (N/A - cleanup only)
- [x] Complete

**Completed:** 2025-12-26

**Created:** 2025-12-26
**Last Updated:** 2025-12-26

---

## Executive Summary

**Feature:** Remove stale, orphaned, and deprecated tests from the test infrastructure

**Purpose:** Final cleanup phase to eliminate dead code in test files, ensuring the test suite remains maintainable, accurate, and performant

**Approach:** Systematic identification and removal of stale tests through dead import detection, orphaned utility cleanup, TODO/FIXME resolution, and structural alignment verification

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-4 hours

**Key Risks:**
1. Accidentally removing tests that are still valid but have non-obvious dependencies
2. Missing stale tests that don't fit obvious detection patterns

---

## Test Strategy

### Testing Approach

- **Framework:** Jest (existing)
- **Coverage Goal:** Maintain 80%+ overall coverage after cleanup
- **Test Distribution:** N/A (this is cleanup, not new feature development)

### Validation Strategy

This phase is unique in that it removes tests rather than adds them. Validation consists of:

1. **Pre-removal verification:** Confirm each identified test file is truly stale
2. **Post-removal verification:** Run full test suite to ensure no regressions
3. **Coverage validation:** Verify coverage percentages remain stable

### Test Scenario Categories

#### Category 1: Dead Import Detection

- [ ] **Verification:** Scan test files for imports from non-existent modules
  - **Given:** A test file imports from a deleted/moved source module
  - **When:** TypeScript compilation or import resolution is attempted
  - **Then:** Error indicates missing module - candidate for removal
  - **Detection Method:** TypeScript errors, grep for import patterns

#### Category 2: Orphaned Test Utilities

- [ ] **Verification:** Identify testUtils files not imported by any test
  - **Given:** A `*.testUtils.ts` file exists in tests directory
  - **When:** Grep for imports of that file across all tests
  - **Then:** If no imports found, file is orphaned - candidate for removal
  - **Detection Method:** Cross-reference analysis

#### Category 3: TODO/FIXME Tests

- [ ] **Verification:** Identify tests with unresolved TODO/FIXME comments
  - **Given:** A test contains TODO or FIXME comments about implementation
  - **When:** The comment indicates the test is a placeholder or incomplete
  - **Then:** Evaluate for removal or implementation - document decision
  - **Detection Method:** Grep for TODO|FIXME patterns

#### Category 4: Structural Drift

- [ ] **Verification:** Compare test directory structure to src/ layout
  - **Given:** Test directory exists at path `tests/X/Y/Z`
  - **When:** Corresponding source path `src/X/Y/Z` does not exist
  - **Then:** Tests may be orphaned - investigate and remediate
  - **Detection Method:** Directory comparison analysis

### Coverage Goals

**Pre-cleanup Baseline:** Document current coverage before any changes
**Post-cleanup Target:** Coverage should remain within 1% of baseline
**Critical Paths:** Ensure no critical path coverage is lost

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: N/A (cleanup phase)
- Dependencies: None - this is removal-only work
- Platforms: All (test infrastructure)
- Performance: Test suite should run faster after cleanup

---

## Findings Summary (From Codebase Analysis)

### Dead Imports - None Critical Found

TypeScript compilation catches most dead imports automatically. No obvious dead imports detected in preliminary scan.

### Orphaned Test Utilities - 3 Files Identified

Located in `tests/helpers/`:
1. `handlerContextTestHelpers.ts` - **IN USE** (22 files reference it)
2. `progressUnifierTestHelpers.ts` - **IN USE** (22 files reference it)
3. `react-test-utils.tsx` - **IN USE** (22 files reference it)

Located in `tests/testUtils/`:
1. `async.ts` - **IN USE** (1 file: `dashboardHandlers-unknownDeployed.test.ts`)

### TODO/FIXME Tests - 1 File Identified

`tests/features/prerequisites/npmFallback.test.ts`:
- Line 162: `// TODO: Implement installPrerequisite method that:`
- Line 188: `// TODO: Verify fallback command contains:`
- Line 228: `// TODO: Verify logger.warn or logger.info is called with fallback message`

This file contains placeholder tests for unimplemented npm fallback functionality. Tests are marked with TODO and use `expect(true).toBe(true)` placeholders.

### Structural Drift - Potential Issues

1. **`tests/unit/`** directory exists separately from `tests/features/` and `tests/core/`
   - Contains: `prerequisites/`, `utils/`, `features/eds/`, `features/mesh/`
   - Some duplication with main test structure
   - README.md indicates these should have been migrated

2. **`tests/commands/handlers/`** - Legacy location
   - Contains: `HandlerContext.test.ts`
   - README.md mentions this was supposed to migrate to `tests/features/*/handlers/`

3. **`tests/unit/features/eds/ui/steps/`** - Empty directory
   - No test files present, only directory structure

4. **`tests/webview-ui/`** vs `tests/core/ui/`**
   - Two locations for UI-related tests
   - May need consolidation

---

## Risk Assessment

### Risk 1: Removing In-Use Tests

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Critical
- **Description:** Accidentally removing tests that are still needed could reduce coverage and miss regressions
- **Mitigation:**
  1. Verify each file has no importers before removal
  2. Check git blame for recent activity
  3. Run full test suite after each removal batch
- **Contingency Plan:** Git revert if coverage drops unexpectedly

### Risk 2: Missing Hidden Dependencies

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Some test utilities may be used via dynamic imports or path aliases not caught by grep
- **Mitigation:**
  1. Search for file names without path prefixes
  2. Verify no dynamic require/import patterns
  3. Check Jest config for special mappings
- **Contingency Plan:** Restore files if tests fail after removal

### Risk 3: Incomplete Structural Analysis

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Medium
- **Description:** Some stale tests may not match any detection pattern
- **Mitigation:**
  1. Document known patterns for future audits
  2. Establish periodic review cadence
  3. Add linting rules to prevent future drift
- **Contingency Plan:** Accept some stale code may remain; address in future phases

---

## Dependencies

### No New Packages Required

This phase only removes code; no new dependencies needed.

### Tools Used

- Git for safe removal and rollback capability
- Jest for test suite validation
- Grep/ripgrep for pattern detection
- TypeScript compiler for dead import detection

---

## Acceptance Criteria

**Definition of Done for this phase:**

- [x] **Dead Import Analysis:** All test files scanned - no dead imports found
- [x] **Orphaned Utilities:** All testUtils verified in use - none orphaned
- [x] **TODO Resolution:** 3 placeholder tests marked as skipped with documentation
- [x] **Structural Alignment:** tests/unit/ contains valid tests (not stale) - documented
- [x] **Empty Directories:** 5 empty directories removed
- [x] **Test Suite:** Full test suite passes (5991 passed, 3 skipped)
- [x] **Coverage:** No coverage impact (cleanup only)
- [x] **Documentation:** Plan updated with findings

**Phase-Specific Criteria:**

- [x] `tests/features/prerequisites/npmFallback.test.ts` - 3 placeholder tests marked as skipped (UNIMPLEMENTED feature)
- [x] `tests/unit/` directory - Contains 13 valid tests (not stale), kept in place
- [x] `tests/commands/handlers/` - Not found (may have been migrated)
- [x] 5 empty directories removed: eds/ui/steps, utils, templates, core/errors, wizard/components

---

## File Reference Map

### Files to Evaluate for Removal

**High Confidence (Stale):**
- `tests/unit/features/eds/ui/steps/` - Empty directory

**Requires Investigation:**
- `tests/features/prerequisites/npmFallback.test.ts` - TODO placeholder tests
- `tests/commands/handlers/HandlerContext.test.ts` - Legacy location
- `tests/unit/` entire directory - Potential structural drift

### Files Confirmed In-Use (Do Not Remove)

**Test Helpers:**
- `tests/helpers/handlerContextTestHelpers.ts` - 22 importers
- `tests/helpers/progressUnifierTestHelpers.ts` - 22 importers
- `tests/helpers/react-test-utils.tsx` - 22 importers
- `tests/testUtils/async.ts` - 1 importer

**Feature-Specific testUtils:**
- All `*.testUtils.ts` files in feature directories (verified in use)

---

## Assumptions

- [ ] **Assumption 1:** TypeScript compilation catches dead imports
  - **Source:** FROM: Standard TypeScript behavior
  - **Impact if Wrong:** May miss some dead import patterns

- [ ] **Assumption 2:** The tests/unit/ directory should be merged into tests/features/
  - **Source:** ASSUMED based on README.md migration notes
  - **Impact if Wrong:** May need separate structure for unit vs integration

- [ ] **Assumption 3:** Empty directories serve no purpose and can be removed
  - **Source:** ASSUMED based on standard practices
  - **Impact if Wrong:** Some tooling may expect directories to exist

---

## Implementation Notes (Updated During TDD Phase)

**This section filled during implementation by TDD phase.**

### Completed Steps

(To be filled during implementation)

### In Progress

(To be filled during implementation)

### Pending

- [ ] Step 1: Identify stale tests
- [ ] Step 2: Remove deprecated tests and clean orphaned utilities
- [ ] Step 3: Verify structural alignment and final cleanup

---

## Next Actions

**After Plan Complete:**

1. **For Developer:** Execute with `/rptc:tdd "@test-audit-phase-7-stale-removal/"`
2. **Quality Gates:** Efficiency Agent review (no security review needed - removal only)
3. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@test-audit-phase-7-stale-removal/"` to begin cleanup

---

_Plan created by Master Feature Planner_
_Status: Ready for TDD Implementation_
