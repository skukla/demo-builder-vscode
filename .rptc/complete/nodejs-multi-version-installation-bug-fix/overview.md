# Implementation Plan: Node.js Multi-Version Installation Bug Fix

## Status Tracking

- [x] Planned
- [ ] Step 1: Fix installHandler bug (pass nodeVersions array)
- [ ] Step 2: Eliminate infrastructure version concept
- [ ] Step 3: Add semver version satisfaction checking
- [ ] Step 4: Update documentation and clarity
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-11-11
**Last Updated:** 2025-11-11

---

## Executive Summary

**Feature:** Fix Node.js installation bug and eliminate misleading infrastructure version concept

**Purpose:** Ensure all required Node.js versions are properly installed based on component needs, removing confusion about infrastructure dictating versions

**Approach:** Direct bug fix, clean removal of infrastructure version, add intelligent version satisfaction using semver

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-3 hours

**Key Risks:** Breaking changes in PrerequisitesManager API, version detection edge cases, existing project compatibility

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Coverage Goal:** 80% overall, 100% critical paths
- **Test Distribution:** Unit (80%), Integration (20%)

### Test Scenarios Summary

**Happy Path:**
- Multiple Node.js versions install correctly when passed array
- Version satisfaction detects already-installed versions (e.g., 24.0.10 satisfies 24.x)
- Components correctly specify their Node requirements without infrastructure fallback

**Edge Cases:**
- Empty nodeVersions array handling
- Partial version matches (major.minor.patch variations)
- Mixed installed/not-installed versions
- Version range specifications (^24.0.0, ~24.0.0)

**Error Conditions:**
- Installation failures mid-process
- Invalid version format handling
- fnm command failures

*Note: Detailed test scenarios are in each step file (step-01.md through step-04.md)*

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] Bug fixed: installHandler correctly receives and processes nodeVersions array
- [ ] Infrastructure version completely removed from codebase
- [ ] Semver-based version satisfaction prevents redundant installations
- [ ] All existing tests pass with modifications
- [ ] New tests achieve 80%+ coverage on changed code
- [ ] No console.log or debug statements remain
- [ ] Components.json updated with clear Node version requirements
- [ ] Documentation reflects component-driven version approach

**Feature-Specific Criteria:**

- [ ] User-reported issue resolved: Node 24 installs when mesh component requires it
- [ ] No infrastructure version fallback logic remains
- [ ] Version detection handles real-world formats (24.0.10, 22.11.0, etc.)

---

## Risk Assessment

### Risk 1: Breaking Changes to PrerequisitesManager API

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:**
  1. Carefully trace all callers of getInfrastructureVersion()
  2. Update all references before removing method
  3. Run full test suite after each modification
- **Contingency:** Deprecate first with warning if too many dependencies

### Risk 2: Version Detection Complexity

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:**
  1. Use battle-tested semver library (already in package.json)
  2. Test with real-world version formats from fnm
  3. Add comprehensive edge case tests
- **Contingency:** Fall back to exact string matching if semver fails

### Risk 3: Existing Project Compatibility

- **Category:** Schedule
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:**
  1. Check for any persisted infrastructure version references
  2. Test with existing demo projects
  3. Clear migration path in documentation
- **Contingency:** Add compatibility shim if needed

---

## Dependencies

### Existing Packages

- **semver:** Already in package.json - will use for version satisfaction logic
- **fnm:** External tool, already required - no changes needed

### No New Dependencies Required

---

## File Reference Map

### Existing Files (To Modify)

**Core Implementation:**
- `src/features/prerequisites/handlers/installHandler.ts` - Fix line 50 bug
- `src/features/prerequisites/services/PrerequisitesManager.ts` - Remove infrastructure version
- `templates/components.json` - Update Node version specifications

**Test Files:**
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Update for bug fix
- `tests/features/prerequisites/services/PrerequisitesManager.test.ts` - Remove infrastructure tests
- `tests/features/prerequisites/handlers/shared-per-node-status.test.ts` - Update version handling

**Total Files:** 6 modified, 0 created

---

## Coordination Notes

### Step Dependencies

1. **Step 1 → Step 2:** Infrastructure removal depends on bug fix working first
2. **Step 2 → Step 3:** Semver checking replaces infrastructure fallback logic
3. **Step 3 → Step 4:** Documentation updates after implementation complete

### Integration Points

- Prerequisites UI will continue working without changes (backend fix only)
- Component selection flow unaffected
- Existing projects will benefit automatically from fix

---

## Next Actions

**After Plan Complete:**

1. **For Developer:** Execute with `/rptc:tdd "@nodejs-multi-version-installation-bug-fix/"`
2. **Quality Gates:** Efficiency review for code simplicity
3. **Verification:** Test with user's reported scenario (Node 24 for mesh)

**First Step:** Run `/rptc:tdd "@nodejs-multi-version-installation-bug-fix/"` to begin TDD implementation

---

_Plan created by Overview Generator Sub-Agent_
_Status: ✅ Ready for Step Generation_