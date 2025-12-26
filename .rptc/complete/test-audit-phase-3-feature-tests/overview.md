# Test Audit Phase 3: Feature Tests

> **Part of:** [Comprehensive Test Audit](../TEST-AUDIT-MASTER.md) (7 phases)
> **Phase:** 3 of 7 - Feature Tests

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (N/A - Read-only audit)
- [x] Security Review (N/A - Read-only audit)
- [x] Complete

**Created:** 2025-12-26
**Last Updated:** 2025-12-26
**Completed:** 2025-12-26

---

## Executive Summary

**Feature:** Audit all feature test files to ensure tests accurately reflect current implementation

**Purpose:** Eliminate test drift, outdated assertions, and mock data that no longer matches current TypeScript types. After Phase 1 (foundation patterns) and Phase 2 (global cleanup), this phase audits all 308 feature test files across 11 feature areas.

**Approach:**
1. Audit each feature area systematically (one step per major feature)
2. For each test file: verify mock data matches current types, assertions match current behavior
3. Remove any version-specific logic (v2/v3 references missed by Phase 2)
4. Update hardcoded values to use constants where appropriate
5. Validate handler response shapes against current implementation

**Complexity:** High (308 test files across 11 features)

**Estimated Effort:** 25-35 hours total
- Step 1 (authentication): 5-6 hours (60 files)
- Step 2 (project-creation): 4-5 hours (52 files)
- Step 3 (mesh): 4-5 hours (44 files)
- Step 4 (prerequisites): 3-4 hours (39 files)
- Step 5 (components): 3-4 hours (30 files)
- Step 6 (dashboard): 2-3 hours (28 files)
- Step 7 (lifecycle): 1-2 hours (17 files)
- Step 8 (eds): 1-2 hours (10 files)
- Step 9 (updates + projects-dashboard + sidebar): 2-3 hours (28 files combined)

**Key Risks:**
- Breaking passing tests while updating mock data
- Missing subtle type mismatches in complex mocks
- Time estimation variance due to complexity of individual test files
- Interdependencies between feature areas not immediately visible

---

## Test Strategy

### Testing Approach

- **Framework:** Jest, ts-jest, @testing-library/react
- **Coverage Goals:** All feature tests pass and accurately reflect current implementation
- **Test Distribution:** 100% existing test audit (no new tests in this phase)

### Audit Checklist (Applied to Every Test File)

For each test file in each feature area:

- [ ] **Mock Data Accuracy**
  - Verify mock objects match current TypeScript interfaces
  - Check for deprecated field names (e.g., `.components` vs `.frontends`/`.backends`)
  - Ensure factory functions produce valid objects per current types

- [ ] **Assertion Accuracy**
  - Verify expected values match current implementation behavior
  - Check handler response shapes match actual handler returns
  - Validate error messages match current error handling

- [ ] **Hardcoded Values**
  - Replace magic numbers with constants (especially timeouts)
  - Use TIMEOUTS.* constants from @/core/utils/timeoutConfig
  - Replace hardcoded paths with path utilities where appropriate

- [ ] **Version References**
  - Remove any v2/v3 version comments or logic (Phase 2 follow-up)
  - Standardize descriptions to reference "current" not versions
  - Remove backwards-compatibility test branches

- [ ] **Test Descriptions**
  - Ensure describe/it blocks accurately describe current behavior
  - Update outdated test names that reference old functionality
  - Remove TODO/FIXME comments for resolved issues

- [ ] **Integration Points**
  - Verify mocked dependencies match current function signatures
  - Check cross-feature mock consistency (e.g., auth mocks used in dashboard)
  - Validate message types match current protocol definitions

### Coverage Goals

**Overall Target:** All 308 feature test files audited

**File Breakdown by Feature:**
| Feature | Test Files | Priority |
|---------|------------|----------|
| authentication | 60 | High (auth is foundation) |
| project-creation | 52 | High (core wizard flow) |
| mesh | 44 | High (deployment logic) |
| prerequisites | 39 | Medium (prerequisite definitions) |
| components | 30 | Medium (registry structure) |
| dashboard | 28 | Medium (handler responses) |
| lifecycle | 17 | Medium (process management) |
| eds | 10 | Low (newer feature) |
| updates | 8 | Low (update system) |
| projects-dashboard | 11 | Low (listing/status) |
| sidebar | 9 | Low (navigation) |

---

## Acceptance Criteria

### Definition of Done

- [ ] All 308 feature test files audited for accuracy
- [ ] All mock data matches current TypeScript interfaces
- [ ] All assertions reflect current implementation behavior
- [ ] No version-specific logic (v2/v3) in any test file
- [ ] No hardcoded timeout values (use TIMEOUTS.* constants)
- [ ] All tests pass after audit
- [ ] No new TypeScript errors introduced
- [ ] Test descriptions accurately reflect current behavior

### Feature-Specific Criteria

- [ ] Authentication: Auth flow tests match current SDK integration
- [ ] Project-Creation: Wizard step tests match current step definitions
- [ ] Mesh: Deployment tests match current staleness detection logic
- [ ] Prerequisites: Prerequisite tests match current prerequisites.json
- [ ] Components: Registry tests match current components.json (v3.0.0 structure)
- [ ] Dashboard: Handler tests match current response shapes
- [ ] Lifecycle: Process tests match current lifecycle patterns
- [ ] EDS: Integration tests match current EDS workflow
- [ ] Updates: Version tests match current update channel logic

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Priority | Mitigation |
|------|----------|------------|--------|----------|------------|
| Breaking passing tests | Technical | Medium | High | High | Run tests after each file change; git commit per file |
| Missing subtle type mismatches | Technical | Medium | Medium | Medium | Use TypeScript strict mode; compare with source types |
| Time underestimation | Schedule | Medium | Medium | Medium | Timebox each file; defer complex issues with TODO |
| Cross-feature mock inconsistency | Technical | Low | Medium | Low | Document shared mocks; verify consistency at end |
| Phase 1/2 incomplete work | Dependency | Low | High | High | Verify Phase 1/2 completion before starting |

### Risk Details

**Risk 1: Breaking Passing Tests**
- **Description:** Updating mock data or assertions may break tests that currently pass
- **Mitigation:**
  1. Run tests before AND after each file change
  2. Commit after each successful file audit
  3. If test breaks, examine source implementation before "fixing" test
  4. Broken test may indicate real implementation bug
- **Contingency:** Revert file changes; investigate implementation before proceeding

**Risk 2: Cross-Feature Mock Inconsistency**
- **Description:** Same types mocked differently across features (e.g., AuthContext)
- **Mitigation:**
  1. Document shared mock patterns found during audit
  2. Create consistent mock factories in testUtils where appropriate
  3. Verify authentication mocks used in dashboard match auth feature mocks
- **Contingency:** Consolidate mocks to shared testUtils in cleanup step

---

## Dependencies

### Prerequisite Phases

| Phase | Requirement | Status |
|-------|-------------|--------|
| Phase 1 (Foundation) | .components! migration complete; type-JSON alignment tests added | Pending |
| Phase 2 (Global Cleanup) | v2/v3 references removed globally | Pending |

**Important:** Phase 3 should begin after Phase 1 completes. Phase 2 can run in parallel.

### No New Packages Required

This audit uses existing test infrastructure:
- Jest (already installed)
- TypeScript (compile-time validation)
- @testing-library/react (React component tests)

### Source Files to Reference

For each feature, reference corresponding source implementation:

| Feature | Source Location |
|---------|-----------------|
| authentication | `src/features/authentication/` |
| project-creation | `src/features/project-creation/` |
| mesh | `src/features/mesh/` |
| prerequisites | `src/features/prerequisites/` |
| components | `src/features/components/` |
| dashboard | `src/features/dashboard/` |
| lifecycle | `src/features/lifecycle/` |
| eds | `src/features/eds/` |
| updates | `src/features/updates/` |
| projects-dashboard | `src/features/projects-dashboard/` |
| sidebar | `src/features/sidebar/` |

---

## Implementation Constraints

### Code Quality Constraints

- **File Size:** Test files should remain < 500 lines (existing standard)
- **Complexity:** No new complex test logic; audit existing
- **Pattern Reuse:** Use existing testUtils patterns; create shared mocks where needed

### Audit Constraints

- **No Breaking Changes:** Tests must pass after each file audit
- **Current Implementation is Canonical:** If test expects different behavior than implementation, update TEST (not implementation)
- **Timebox Per File:** 10-15 minutes max per test file; defer complex issues

### Naming Constraints

- Follow existing test naming conventions
- Update describe/it blocks to accurately describe current behavior
- Remove version numbers from test descriptions

---

## Step Reference

| Step | File | Feature | Test Files | Estimated Time |
|------|------|---------|------------|----------------|
| 1 | `step-01.md` | authentication | 60 | 5-6 hours |
| 2 | `step-02.md` | project-creation | 52 | 4-5 hours |
| 3 | `step-03.md` | mesh | 44 | 4-5 hours |
| 4 | `step-04.md` | prerequisites | 39 | 3-4 hours |
| 5 | `step-05.md` | components | 30 | 3-4 hours |
| 6 | `step-06.md` | dashboard | 28 | 2-3 hours |
| 7 | `step-07.md` | lifecycle | 17 | 1-2 hours |
| 8 | `step-08.md` | eds | 10 | 1-2 hours |
| 9 | `step-09.md` | updates, projects-dashboard, sidebar | 28 | 2-3 hours |

---

## Assumptions

- [ ] **Assumption 1:** Phase 1 (Foundation) has completed successfully
  - **Source:** ASSUMED - verify before starting
  - **Impact if Wrong:** May encounter .components! patterns not yet migrated

- [ ] **Assumption 2:** Phase 2 (Global Cleanup) has removed most v2/v3 references
  - **Source:** ASSUMED - Phase 2 runs in parallel
  - **Impact if Wrong:** More cleanup work needed per file

- [ ] **Assumption 3:** Current implementation is stable (no active refactoring)
  - **Source:** ASSUMED based on project state
  - **Impact if Wrong:** Tests may need re-audit after implementation changes

- [ ] **Assumption 4:** Test files follow standard test organization patterns
  - **Source:** FROM tests/README.md
  - **Impact if Wrong:** May need to reorganize tests as part of audit

---

## Plan Maintenance

### Deviations Log

_To be updated during implementation_

### When to Request Replanning

Request full replan if:
- More than 50% of tests in a feature fail after audit
- Major implementation changes occur during audit
- New feature areas discovered not in original count
- Phase 1/2 not complete and blocking work

---

## Implementation Notes

_To be filled during TDD phase_

### Completed Steps

_None yet_

### In Progress

_None yet_

### Pending

- [ ] Step 1: authentication (60 files)
- [ ] Step 2: project-creation (52 files)
- [ ] Step 3: mesh (44 files)
- [ ] Step 4: prerequisites (39 files)
- [ ] Step 5: components (30 files)
- [ ] Step 6: dashboard (28 files)
- [ ] Step 7: lifecycle (17 files)
- [ ] Step 8: eds (10 files)
- [ ] Step 9: updates + projects-dashboard + sidebar (28 files)

---

## Completion Summary

**Completed:** 2025-12-26

### Results

| Feature | Test Files | Tests | testUtils Files | Status |
|---------|------------|-------|-----------------|--------|
| Authentication | 60 | 636 | 9 | ✅ Validated |
| Project-creation | 52 | 590 | 2 | ✅ Validated |
| Mesh | 44 | 491 | 4 | ✅ Validated |
| Prerequisites | 40 | 256 | 5 | ✅ Validated |
| Components | 30 | 295 | (Phase 2) | ✅ Validated |
| Dashboard | 28 | 286 | 2 | ✅ Validated |
| Lifecycle | 17 | 122 | 1 | ✅ Validated |
| EDS | 10 | 125 | Inline | ✅ Validated |
| Updates/projects-dashboard/sidebar | 28 | 338 | 3 | ✅ Validated |
| **TOTAL** | **309** | **3139** | **26+** | **✅ ALL PASS** |

### Findings

1. **No critical issues found** - All test mocks accurately reflect implementation
2. **Version references**: Zero v2/v3 references (cleaned in Phase 2)
3. **TDD placeholders**: 3 in `npmFallback.test.ts` for future feature
4. **Test health**: All 5761 tests pass, no `.only()`, no deprecated patterns

### Validation Method

Deep-dive validation traced mock methods to actual implementation:
- Type-safe imports ensure structural alignment
- Execution tests verify assertion accuracy
- 1:1 correspondence between test assertions and implementation outputs

---

_Plan created by Master Feature Planner_
_Phase 3 of 7 - See [TEST-AUDIT-MASTER.md](../TEST-AUDIT-MASTER.md) for full audit scope_
