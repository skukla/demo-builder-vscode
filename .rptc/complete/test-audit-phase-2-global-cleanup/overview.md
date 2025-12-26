# Implementation Plan: Test Audit Phase 2 - Global Version Reference Cleanup

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-12-26
**Last Updated:** 2025-12-26

---

## Executive Summary

**Feature:** Remove all v2/v3 version references from test files across the codebase

**Purpose:** Tests should reference "current implementation" not version numbers. Version numbers in tests create:
- Confusion about which version is "current"
- Maintenance burden when versions change
- False impression that multiple versions exist simultaneously

**Approach:** Systematic cleanup of 26 test files, renaming variables, updating comments, and removing version-specific language while preserving test functionality

**Estimated Complexity:** Simple (mechanical refactoring, no logic changes)

**Estimated Timeline:** 2-3 hours

**Key Risks:**
- Accidentally changing test data that legitimately contains "v2" or similar strings (e.g., `test.project.v2` as a test filename)
- Breaking imports by renaming exports without updating all consumers

---

## Scope Definition

### Files to Clean (26 total)

**Group 1: core/ and unit/ (6 files) - Step 1**
- `tests/core/shell/commandExecutor-adobe-cli.test.ts`
- `tests/core/shell/commandExecutor.security.test.ts`
- `tests/core/shell/environmentSetup-nodeVersion.test.ts`
- `tests/core/validation/normalizers.test.ts`
- `tests/core/validation/securityValidation-nodeVersion.test.ts`
- `tests/unit/prerequisites/parallelExecution.test.ts`

**Group 2: features/components/ (4 files) - Step 2**
- `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts`
- `tests/features/components/services/ComponentRegistryManager-security.test.ts`
- `tests/features/components/services/ComponentRegistryManager-v3Structure.test.ts`
- `tests/features/components/services/ComponentRegistryManager-validation.test.ts`

**Group 3: features/prerequisites/ and features/authentication/ (16 files) - Step 3**
- `tests/features/authentication/services/tokenManager.test.ts`
- `tests/features/prerequisites/handlers/checkHandler-multiVersion.test.ts`
- `tests/features/prerequisites/handlers/continueHandler-edge-cases.test.ts`
- `tests/features/prerequisites/handlers/continueHandler-operations.test.ts`
- `tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts`
- `tests/features/prerequisites/handlers/installHandler-happyPath.test.ts`
- `tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts`
- `tests/features/prerequisites/handlers/installHandler-sharedUtilities.test.ts`
- `tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts`
- `tests/features/prerequisites/handlers/installHandler.test.ts`
- `tests/features/prerequisites/handlers/security-validation.test.ts`
- `tests/features/prerequisites/handlers/shared-dependencies.test.ts`
- `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`
- `tests/features/prerequisites/services/PrerequisitesManager-checking.test.ts`
- `tests/features/prerequisites/services/PrerequisitesManager-edgeCases.test.ts`
- `tests/templates/type-json-alignment.test.ts`

---

## Patterns to Remove/Replace

### 1. Variable Names
| Pattern | Replacement |
|---------|-------------|
| `mockRawRegistryV3` | `mockRegistry` |
| `mockV3Registry` | `mockRegistry` |
| `V3_COMPONENT_SECTIONS` | `COMPONENT_SECTIONS` |
| `V3ComponentSection` | `ComponentSection` |
| `createMaliciousRegistryV3` | `createMaliciousRegistry` (with useV3 param removed) |

### 2. Comments
| Pattern | Replacement |
|---------|-------------|
| `// v3.0.0 structure` | `// current structure` |
| `// v2.0 structure` | Remove or replace with `// legacy structure` if needed |
| `* v3.0.0 uses separate...` | `* Current structure uses separate...` |

### 3. Test Descriptions
| Pattern | Replacement |
|---------|-------------|
| `'v3.0.0 structure'` | `'current structure'` |
| `'loading v3.0.0 structure'` | `'loading registry'` |
| `'getComponentById with v3.0.0 structure'` | `'getComponentById'` |

### 4. File Names (if needed)
| Pattern | Replacement |
|---------|-------------|
| `ComponentRegistryManager-v3Structure.test.ts` | `ComponentRegistryManager-structure.test.ts` |

### 5. Exclusions - DO NOT CHANGE
- `test.project.v2` - This is test data for repository name validation, not a version reference
- Version numbers in actual version strings like `'3.0.0'` in JSON version fields
- Node version references like `'Node 20'`, `'v20.0.0'` - these are runtime versions, not schema versions

---

## Test Strategy

### Testing Approach

- **Framework:** Jest
- **Coverage Goal:** All existing tests must pass after refactoring
- **Test Distribution:** This is a refactoring task - no new tests needed

### Validation Tests

#### Happy Path Tests
- [ ] All 26 files can be imported without errors
- [ ] All existing tests pass after renaming
- [ ] No TypeScript compilation errors

#### Edge Case Tests
- [ ] Test data containing `v2` strings (like `test.project.v2`) remains unchanged
- [ ] JSON version fields (like `version: '3.0.0'`) remain unchanged
- [ ] Node version references remain unchanged

#### Error Condition Tests
- [ ] Build fails if any renamed export is not updated in all consumers

### Coverage Goals

**Overall Target:** No coverage regression
**Critical Paths:** All renamed exports must be updated in all import locations

---

## Implementation Constraints

- **File Size:** No constraint (refactoring only)
- **Complexity:** Simple string replacement and renaming
- **Dependencies:** None added
- **Platforms:** All existing platforms
- **Performance:** No impact

---

## Dependencies

### Files with Shared Exports (Update First)

The `ComponentRegistryManager.testUtils.ts` file exports shared utilities used by multiple test files:
- `mockRawRegistryV3` -> `mockRegistry`
- `V3_COMPONENT_SECTIONS` -> `COMPONENT_SECTIONS`
- `V3ComponentSection` -> `ComponentSection`
- `createMaliciousRegistryV3` -> Remove (consolidate into `createMaliciousRegistry`)

**Strategy:** Update the testUtils file FIRST, then update all consumers.

### Documentation Files

- `tests/README.md` - Contains version reference documentation that should be updated

---

## Risk Assessment

### Risk 1: Breaking Test Imports
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High (tests won't compile)
- **Priority:** High
- **Description:** Renaming exports without updating all import locations will break tests
- **Mitigation:**
  1. Use editor's rename symbol feature (F2 in VS Code) for type-safe renames
  2. Run `npm run compile` after each file change
  3. Run `npm test` to verify all tests pass
- **Contingency:** Git revert if tests break

### Risk 2: Accidentally Changing Test Data
- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium (test logic changes)
- **Priority:** Medium
- **Description:** Strings like `test.project.v2` could be mistakenly changed
- **Mitigation:**
  1. Review each change manually
  2. Only change patterns in the defined list above
  3. Skip normalizers.test.ts version-like strings in test data
- **Contingency:** Review git diff carefully before committing

### Risk 3: Incomplete Cleanup
- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low (aesthetic only)
- **Priority:** Low
- **Description:** Some version references might be missed
- **Mitigation:**
  1. Use grep to find all remaining v2/v3 references after cleanup
  2. Review each match to determine if it's legitimate
- **Contingency:** Follow-up cleanup in future iteration

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [x] **All files cleaned:** Version references removed per patterns above
- [x] **Tests pass:** All 5761 tests pass without modification to test logic
- [x] **No TypeScript errors:** Compilation succeeds
- [x] **Grep verification:** No unexpected v2/v3 references remain in test files
- [x] **README updated:** `tests/README.md` updated to remove version documentation

**Feature-Specific Criteria:**

- [x] All "v3.0.0 structure" comments replaced with "current structure"
- [x] Test descriptions no longer mention version numbers
- [x] Mock validation tests updated to version-agnostic descriptions
- [x] Type alignment tests updated to remove version references

---

## File Reference Map

### Shared Utility Files (Update First)
- `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Core exports to rename

### Documentation Files
- `tests/README.md` - Version alignment documentation to update

### Test Files (26 total)
See "Files to Clean" section above for complete list.

**Total Files:** 28 modified (26 test files + 1 testUtils + 1 README)

---

## Implementation Order

1. **Step 1:** Clean core/ and unit/ test files (6 files)
   - These have minimal version references
   - Quick wins to establish pattern

2. **Step 2:** Clean features/components/ test files (4 files)
   - Includes the central testUtils file with shared exports
   - Update exports first, then consumers

3. **Step 3:** Clean features/prerequisites/ and features/authentication/ test files (16 files)
   - Largest group but consistent patterns
   - May reference renamed exports from Step 2

---

## Verification Commands

After each step, run:
```bash
# Compile check
npm run compile

# Test run
npm test

# Grep for remaining references
grep -r "v3\.0\|v2\.0\|mockV3\|mockV2\|V3_\|V2_" tests/ --include="*.ts" | grep -v node_modules
```

---

## Next Actions

**After Plan Complete:**

1. **For Developer:** Execute with `/rptc:tdd "@test-audit-phase-2-global-cleanup/"`
2. **Quality Gates:** Run tests after each step
3. **Completion:** Verify grep shows no unexpected version references

**First Step:** Run `/rptc:tdd "@test-audit-phase-2-global-cleanup/"` to begin implementation

---

_Plan created by Master Feature Planner_
_Status: Ready for TDD Implementation_
