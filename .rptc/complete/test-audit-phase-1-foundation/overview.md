# Test Audit Phase 1: Foundation

> **Part of:** [Comprehensive Test Audit](../TEST-AUDIT-MASTER.md) (7 phases)
> **Phase:** 1 of 7 - Foundation

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (N/A - Read-only audit)
- [x] Security Review (N/A - Read-only audit)
- [x] Complete
- [ ] Complete

**Created:** 2025-12-26
**Last Updated:** 2025-12-26

---

## Executive Summary

**Feature:** Foundation phase - migrate legacy patterns and establish type alignment infrastructure

**Purpose:** Eliminate core test drift patterns (`.components!` usage, missing JSON alignment tests) and audit testUtils mocks. This phase establishes the patterns and validation infrastructure for subsequent phases.

**Approach:**
1. Migrate legacy `.components!` non-null assertions to current registry structure (`frontends`, `backends`, etc.)
2. Extend type-JSON alignment tests to cover prerequisites.json and logging.json
3. Audit all 39 testUtils files for mock drift against current implementation
4. Add mock validation tests for high-risk testUtils to prevent future drift

**Complexity:** Medium

**Estimated Effort:** 12-14 hours total
- Step 1 (.components! migration): 2-3 hours
- Step 2 (prerequisites.json alignment): 1-2 hours
- Step 3 (logging.json alignment): 1-2 hours
- Step 4 (testUtils audit & categorization): 3-4 hours
- Step 5 (mock validation tests): 2-3 hours

**Key Risks:**
- Breaking existing passing tests during migration
- Mock validation tests becoming overly coupled to implementation details
- Missing deprecated patterns in testUtils audit
- Type definition files may not exist as expected

---

## Test Strategy

### Testing Approach

- **Framework:** Jest, ts-jest, @testing-library/react
- **Coverage Goals:** All JSON config files have type alignment tests; all testUtils verified against current implementation
- **Test Distribution:** 100% unit tests (type validation and mock verification)

### Test Scenarios Summary

**Step 1 - .components! Migration:**
- Verify tests compile after migration to v3.0.0 structure
- Ensure no runtime type errors in test execution
- Validate spread operators work with categorical sections (frontends, backends, etc.)

**Step 2 - prerequisites.json Alignment:**
- Test root-level fields match PrerequisitesConfig type
- Test each prerequisite entry matches Prerequisite type
- Test nested structures (check, install, plugins) match types
- Test componentRequirements matches expected structure

**Step 3 - logging.json Alignment:**
- Test root-level structure matches LoggingConfig type
- Test operations section fields match expected keys
- Test statuses section fields match expected keys
- Validate template parameter placeholders follow {param} syntax

**Step 4 - testUtils Audit:**
- Verify mock structures match current TypeScript interfaces
- Check for deprecated field names or patterns
- Validate factory functions produce valid objects
- Document any drift found with remediation plan

**Step 5 - Mock Validation Tests:**
- Test high-risk mocks (auth, state, communication) against real types
- Validate mock return values match actual function signatures
- Ensure mocks stay synchronized with implementation changes

### Coverage Goals

**Overall Target:** 100% of JSON config files have alignment tests

**File Breakdown:**
- `prerequisites.json`: 100% field coverage for all types
- `logging.json`: 100% field coverage for operations and statuses
- High-risk testUtils: Runtime validation tests added

**Excluded from Coverage:**
- Low-risk testUtils (simple mocks with no complex structure)
- testUtils that only re-export other utilities

---

## Acceptance Criteria

### Definition of Done

- [ ] All `.components!` usages (7 files) migrated to current v3.0.0 patterns
- [ ] All migrated tests pass without modification to assertions
- [ ] `prerequisites.json` has complete type alignment tests
- [ ] `logging.json` has complete type alignment tests
- [ ] All 39 testUtils files audited for mock drift (documented in report)
- [ ] High-risk testUtils have mock validation tests (minimum 5 files)
- [ ] No new TypeScript errors introduced
- [ ] Existing test coverage maintained or improved

### Feature-Specific Criteria

- [ ] Legacy `components` property references eliminated from tests
- [ ] New alignment tests follow existing pattern in type-json-alignment.test.ts
- [ ] Mock validation uses compile-time type checking where possible
- [ ] Audit report documents all findings with severity ratings

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Priority | Mitigation |
|------|----------|------------|--------|----------|------------|
| Breaking passing tests during migration | Technical | Medium | High | High | Run tests after each file change; maintain git commits per file |
| Mock validation becoming brittle | Technical | Medium | Medium | Medium | Use structural validation (field presence) not value assertions |
| Missing deprecated patterns in audit | Technical | Low | Medium | Low | Use grep to systematically find patterns; document audit methodology |
| Type alignment tests missing nested fields | Technical | Medium | Medium | Medium | Follow established pattern from components.json tests which handle nesting |
| testUtils audit scope creep | Schedule | Medium | Low | Low | Strict 30-minute timebox per file; document but defer complex issues |

### Risk Details

**Risk 1: Breaking Passing Tests During Migration**
- **Description:** Changing `.components!` to `frontends!`/`backends!` may break tests if the mock data structure doesn't match expectations
- **Mitigation:**
  1. Examine each test file's mock structure before changing
  2. Update mock data structure to match v3.0.0 registry if needed
  3. Run tests after each file modification
  4. Commit after each successful file migration
- **Contingency:** Revert individual file changes if tests fail; investigate mock structure

**Risk 2: Mock Validation Becoming Brittle**
- **Description:** Testing mock structures against implementation creates tight coupling
- **Mitigation:**
  1. Focus on interface contract (field presence, types) not values
  2. Use TypeScript compile-time checking where possible
  3. Avoid testing implementation details
- **Contingency:** Convert to compile-time type assertions if runtime tests too fragile

---

## Dependencies

### Existing Files to Extend

| File | Purpose |
|------|---------|
| `tests/templates/type-json-alignment.test.ts` | Add prerequisites.json and logging.json tests following existing pattern |

### No New Packages Required

This audit uses existing test infrastructure:
- Jest (already installed)
- TypeScript (compile-time validation)
- fs/path (JSON file loading)

### TypeScript Types to Reference

| Type | Location | Purpose |
|------|----------|---------|
| `RawComponentRegistry` | `src/types/components.ts` | v3.0.0 registry structure |
| `Prerequisite` | `src/types/prerequisites.ts` | Prerequisite validation |
| `LoggingConfig` | `src/types/logging.ts` (if exists) | Logging template structure |

---

## File Reference Map

### Files to Migrate (.components! pattern)

| File | .components! Count | Action |
|------|-------------------|--------|
| `tests/features/components/services/ComponentRegistryManager.testUtils.ts` | 3 | Migrate mock structure |
| `tests/features/components/services/ComponentRegistryManager-dependencies.test.ts` | 4 | Update test assertions |
| `tests/features/components/services/ComponentRegistryManager-validation.test.ts` | 32 | Update test assertions |
| `tests/features/components/services/ComponentRegistryManager-nodeVersions.test.ts` | 2 | Update test assertions |
| `tests/features/components/services/ComponentRegistryManager-configuration.test.ts` | 2 | Update test assertions |
| `tests/features/components/services/ComponentRegistryManager-security.test.ts` | 3 | Update test assertions |
| `tests/features/project-creation/ui/wizard/steps/ReviewStep.test.tsx` | 6 | Update test assertions |

**Total:** 7 files, ~52 occurrences

### Files to Extend

| File | Extension |
|------|-----------|
| `tests/templates/type-json-alignment.test.ts` | Add prerequisites.json and logging.json sections |

### testUtils Files to Audit (39 total)

**Standalone testUtils.ts (3):**
- `tests/features/authentication/handlers/testUtils.ts`
- `tests/features/projects-dashboard/testUtils.ts`
- `tests/features/sidebar/testUtils.ts`

**Named testUtils (36):**
- `tests/core/communication/webviewCommunicationManager.testUtils.ts`
- `tests/core/logging/debugLogger.testUtils.ts`
- `tests/core/shell/commandExecutor.testUtils.ts`
- `tests/core/shell/environmentSetup.testUtils.ts`
- `tests/core/state/stateManager.testUtils.ts`
- `tests/core/state/transientStateManager.testUtils.ts`
- `tests/core/vscode/envFileWatcherService.testUtils.ts`
- `tests/features/authentication/handlers/authenticationHandlers-authenticate.testUtils.ts`
- `tests/features/authentication/handlers/projectHandlers.testUtils.ts`
- `tests/features/authentication/services/adobeEntityService.testUtils.ts`
- `tests/features/authentication/services/authCacheManager.testUtils.ts`
- `tests/features/authentication/services/authenticationService.testUtils.ts`
- `tests/features/authentication/services/organizationValidator.testUtils.ts`
- `tests/features/authentication/ui/hooks/useAuthStatus.testUtils.ts`
- `tests/features/authentication/ui/hooks/useSelectionStep.testUtils.ts`
- `tests/features/components/ui/hooks/useConfigNavigation.testUtils.ts`
- `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts`
- `tests/features/dashboard/ui/configure/ConfigureScreen.testUtils.ts`
- `tests/features/lifecycle/handlers/lifecycleHandlers.testUtils.ts`
- `tests/features/mesh/services/meshDeployment.testUtils.ts`
- `tests/features/mesh/services/meshDeploymentVerifier.testUtils.ts`
- `tests/features/mesh/services/stalenessDetector.testUtils.ts`
- `tests/features/mesh/ui/hooks/useMeshOperations.testUtils.ts`
- `tests/features/prerequisites/handlers/checkHandler.testUtils.ts`
- `tests/features/prerequisites/handlers/continueHandler.testUtils.ts`
- `tests/features/prerequisites/handlers/installHandler.testUtils.ts`
- `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts`
- `tests/features/prerequisites/services/prerequisitesCacheManager.testUtils.ts`
- `tests/features/project-creation/handlers/createHandler.testUtils.ts`
- `tests/features/project-creation/helpers/envFileGenerator.testUtils.ts`
- `tests/features/updates/services/updateManager.testUtils.ts`
- `tests/features/components/services/ComponentRegistryManager.testUtils.ts`
- `tests/unit/prerequisites/cacheManager.testUtils.ts`
- `tests/unit/utils/progressUnifier.testUtils.ts`
- `tests/webview-ui/shared/hooks/useAutoScroll.testUtils.ts`
- `tests/webview-ui/shared/hooks/useFocusTrap.testUtils.ts`

### High-Risk testUtils for Validation Tests

Priority files based on complexity and drift likelihood:

1. `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Registry mocks
2. `tests/core/state/stateManager.testUtils.ts` - State management mocks
3. `tests/core/communication/webviewCommunicationManager.testUtils.ts` - Communication mocks
4. `tests/features/authentication/services/authenticationService.testUtils.ts` - Auth mocks
5. `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts` - Prerequisites mocks

---

## Implementation Constraints

### Code Quality Constraints

- **File Size:** All test files < 500 lines (standard)
- **Complexity:** < 50 lines/function, < 10 cyclomatic
- **Pattern Reuse:** Follow existing type-json-alignment.test.ts pattern exactly

### Testing Constraints

- **No Breaking Changes:** Existing tests must pass after each migration
- **No Value Coupling:** Mock validation tests check structure, not specific values
- **Compile-Time Preferred:** Use TypeScript types for validation where possible

### Naming Constraints

- Follow existing naming conventions in type-json-alignment.test.ts
- Use `PREREQUISITE_FIELDS`, `LOGGING_OPERATIONS_FIELDS` style for field sets
- Describe blocks follow `[filename].json <-> [TypeName] alignment` pattern

---

## Step Reference

| Step | File | Purpose |
|------|------|---------|
| 1 | `step-01.md` | Audit and migrate .components! usages (7 files) |
| 2 | `step-02.md` | Extend type-json-alignment for prerequisites.json |
| 3 | `step-03.md` | Extend type-json-alignment for logging.json |
| 4 | `step-04.md` | Audit 39 testUtils files for mock drift |
| 5 | `step-05.md` | Create mock validation tests for high-risk testUtils |

---

## Assumptions

- [ ] **Assumption 1:** Current v3.0.0 components.json structure with `frontends`, `backends`, `mesh`, etc. is canonical
  - **Source:** FROM templates/components.json `"version": "3.0.0"`
  - **Impact if Wrong:** Migration approach would need revision

- [ ] **Assumption 2:** Type definitions exist for prerequisites.json structure
  - **Source:** ASSUMED - need to verify in src/types/
  - **Impact if Wrong:** May need to define types before alignment tests

- [ ] **Assumption 3:** Logging.json structure has corresponding TypeScript types
  - **Source:** ASSUMED - need to verify in src/types/
  - **Impact if Wrong:** May need to define types before alignment tests

- [ ] **Assumption 4:** testUtils files are co-located with their test files
  - **Source:** FROM glob results showing pattern
  - **Impact if Wrong:** Audit approach would need adjustment

---

## Plan Maintenance

### Deviations Log

_To be updated during implementation_

### When to Request Replanning

Request full replan if:
- More than 10 additional files found with .components! pattern
- Type definitions don't exist for prerequisites or logging
- testUtils audit reveals fundamental architectural issues

---

## Implementation Notes

_To be filled during TDD phase_

### Completed Steps

_None yet_

### In Progress

_None yet_

### Pending

- [ ] Step 1: Audit .components! usages
- [ ] Step 2: Extend type-json-alignment for prerequisites.json
- [ ] Step 3: Extend type-json-alignment for logging.json
- [ ] Step 4: Audit testUtils files for mock drift
- [ ] Step 5: Create mock validation tests for high-risk testUtils

---

## Next Actions

**After Phase 1 Complete:**

1. **Execute Phase 1:** `/rptc:tdd "@test-audit-phase-1-foundation/"`
2. **Quality Gates:** Efficiency Agent review (if enabled)
3. **Proceed to Phase 2:** After Phase 1 complete, execute Phase 2 (Global Cleanup)

**First Step:** Run `/rptc:tdd "@test-audit-phase-1-foundation/"` to begin TDD implementation

---

_Plan created by Master Feature Planner_
_Phase 1 of 7 - See [TEST-AUDIT-MASTER.md](../TEST-AUDIT-MASTER.md) for full audit scope_
