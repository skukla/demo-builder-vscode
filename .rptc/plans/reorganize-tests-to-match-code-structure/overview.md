# Implementation Plan: Reorganize Tests to Match Code Structure

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-01-04
**Last Updated:** 2025-01-05
**Steps:** 7 total steps (Steps 1-3 completed)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

---

## Executive Summary

**Feature:** Reorganize all test files to mirror the current src/ directory structure, eliminating legacy locations and obsolete patterns.

**Purpose:** Improve test discoverability, maintainability, and consistency as the codebase evolves. Current test structure reflects legacy organization patterns (utils/, atomic design webviews/) that no longer match the refactored src/ structure (core/, features/).

**Approach:** Systematic migration of tests from legacy locations to structure-aligned paths using git mv for history preservation. Each step migrates a category of tests, verifies all tests pass, updates Jest configuration as needed, and removes obsolete directories.

**Estimated Complexity:** Medium

**Estimated Timeline:** 6-8 hours

**Key Risks:** Breaking test imports during migration, Jest configuration path issues, losing git history if not using git mv

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node environment for extension tests, jsdom for React tests)
- **Coverage Goal:** Maintain existing 80%+ coverage through reorganization
- **Test Distribution:** No new tests created - pure reorganization of existing 92 test files

### Test Scenarios Summary

**Happy Path:** All tests successfully relocated to structure-aligned paths, all imports updated to use path aliases, all tests pass after each migration step.

**Edge Cases:** Circular dependency handling in moved tests, Jest config testMatch patterns for new locations, tests with relative imports that need path alias conversion.

**Error Conditions:** Import resolution failures after migration, Jest unable to find tests in new locations, path alias misconfiguration breaking test execution.

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, etc.)

### Coverage Goals

**Overall Target:** 80% (maintain existing coverage)

**Component Breakdown:**

- Core modules: Maintain existing test coverage through reorganization
- Features: Maintain existing test coverage through reorganization
- No coverage changes expected (reorganization only)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 92 test files relocated to structure-aligned paths
- [ ] **Testing:** All tests passing after reorganization (npm test reports no failures)
- [ ] **Coverage:** Coverage maintained at 80%+ (no reduction from reorganization)
- [ ] **Code Quality:** All imports use path aliases (@/core/, @/features/, @/shared/)
- [ ] **Documentation:** README and CLAUDE.md files updated with new test structure
- [ ] **Git History:** Test file history preserved through git mv operations
- [ ] **Clean Structure:** All obsolete test directories deleted (tests/utils/, tests/webviews/, tests/commands/handlers/)

**Feature-Specific Criteria:**

- [ ] tests/core/ directory structure mirrors src/core/ (base, shell, logging, state, utils, validation, vscode, communication, commands, config, di)
- [ ] tests/features/ contains all feature tests with handlers colocated properly
- [ ] No duplicate test files across locations (consolidated hook tests)
- [ ] Jest config testMatch patterns updated for new structure
- [ ] Zero broken imports (all path aliases resolved correctly)

---

## Risk Assessment

### Risk 1: Import Resolution Failures After Migration

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** High
- **Description:** Moving test files to new directories may break import statements if path aliases are misconfigured or if tests use relative imports that no longer resolve correctly.
- **Mitigation:**
  1. Use path aliases (@/core/, @/features/) exclusively in test imports
  2. Verify Jest moduleNameMapper configuration matches new test locations
  3. Run npm test after each migration step to catch failures early
  4. Use TypeScript compiler to validate import resolution before running tests
- **Contingency Plan:** Revert specific migration step using git reset --hard if imports cannot be resolved, investigate path alias configuration before retrying

### Risk 2: Jest Configuration Incompatibility

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Jest testMatch patterns may not find tests in new locations, or separate Node/React projects may miscategorize tests after reorganization.
- **Mitigation:**
  1. Update testMatch patterns incrementally as directories are moved
  2. Test both Node and React project configurations separately
  3. Verify test count before/after migration (should remain 92 files)
  4. Use --listTests flag to preview which tests Jest will find
- **Contingency Plan:** Restore original Jest config from git, analyze testMatch patterns that exclude new locations, update patterns to include new structure

### Risk 3: Loss of Git History

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Using file copy/delete operations instead of git mv will break git blame and file history tracking, making it harder to understand test evolution.
- **Mitigation:**
  1. Use git mv exclusively for all test file relocations
  2. Commit each migration step separately with descriptive messages
  3. Avoid combining file moves with content changes in same commit
- **Contingency Plan:** If history is lost for some files, document file origins in commit messages and use git log --follow to trace partial history

### Risk 4: Circular Dependencies in Moved Tests

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Tests moved to new locations may expose circular dependency issues that were masked by previous structure, causing module resolution failures.
- **Mitigation:**
  1. Run TypeScript compiler after each migration step
  2. Use madge or similar tool to detect circular dependencies
  3. Refactor circular dependencies before moving tests if detected
- **Contingency Plan:** Temporarily exclude problematic tests from Jest config, resolve circular dependencies, then re-enable tests

### Risk 5: Duplicate Test Consolidation Conflicts

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Consolidating duplicate hook tests from tests/webviews/hooks/ and tests/webview-ui/shared/hooks/ may reveal conflicting test assertions or setup differences.
- **Mitigation:**
  1. Review both test files before consolidation to identify conflicts
  2. Merge test cases logically, preserving all unique assertions
  3. Run consolidated tests to verify no regressions
- **Contingency Plan:** Keep both test files temporarily if conflicts are complex, document differences, schedule follow-up refactoring to resolve conflicts properly

---

## Dependencies

### New Packages to Install

No new packages required (pure reorganization).

### Configuration Changes

- [ ] **Config:** jest.config.js
  - **Changes:** Update testMatch patterns to include new test locations, verify moduleNameMapper paths still resolve correctly
  - **Environment:** Development only

### External Service Integrations

No external service changes required.

---

## File Reference Map

### Existing Files (To Modify)

**Jest Configuration:**
- `jest.config.js` - Update testMatch patterns for reorganized test structure

**Documentation:**
- `README.md` - Update test structure documentation section
- `docs/testing/README.md` - Update test organization guidelines (if exists)
- Various CLAUDE.md files - Update test location references

**Test Files (92 total to relocate via git mv):**
- `tests/unit/utils/*.test.ts` → `tests/core/*/` (migrate to structure-aligned paths)
- `tests/commands/handlers/*.test.ts` → `tests/features/*/handlers/` (move to feature-colocated structure)
- `tests/webviews/hooks/*.test.tsx` → `tests/webview-ui/shared/hooks/` (consolidate duplicates)

### New Files (To Create)

**Test Directory Structure:**
- `tests/core/base/` - Tests for src/core/base/
- `tests/core/shell/` - Tests for src/core/shell/
- `tests/core/logging/` - Tests for src/core/logging/
- `tests/core/config/` - Tests for src/core/config/
- `tests/core/di/` - Tests for src/core/di/
- `tests/core/vscode/` - Tests for src/core/vscode/

**Directories to Delete:**
- `tests/unit/utils/` - Obsolete location (after migration to tests/core/)
- `tests/commands/handlers/` - Obsolete location (after migration to tests/features/)
- `tests/webviews/` - Obsolete atomic design structure (after cleanup/consolidation)

**Total Files:** 1 config modified, 3-5 documentation files updated, 92 test files relocated, 6 new directories created, 3 obsolete directories deleted

---

## Coordination Notes

**Step Dependencies:**

- Step 2 (command handler migration) depends on Step 1: Ensures path aliases are validated before complex migrations
- Step 6 (Jest config update) integrates all previous steps: Must run after all test files relocated
- Step 7 (documentation update) is final step: Documents completed reorganization

**Integration Points:**

- Jest configuration must be updated incrementally to recognize tests in new locations
- Path alias resolution must work correctly for both source code imports and test imports
- TypeScript compiler must validate import paths before Jest executes tests
- Git history preservation requires using git mv consistently across all migration steps

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@reorganize-tests-to-match-code-structure"`
3. **Quality Gates:** Efficiency Agent (enabled) → Security Agent (disabled)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@reorganize-tests-to-match-code-structure"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, ..., step-07.md_
