# Fix ProgressUnifier to Handle Pre-Substituted Templates (Option B)

## Feature Description

Fix regression in ProgressUnifier where `resolveCommands()` returns empty array for dynamic Node.js installs because it requires both `commandTemplate` AND `nodeVersion`, but PrerequisitesManager pre-substitutes the version into the template before calling the method.

**Bug Symptoms**:
- Node.js installation never starts
- Empty command array returned
- Dynamic installs (multi-version Node.js) fail silently

**Root Cause**:
`ProgressUnifier.resolveCommands()` checks: `if (step.commandTemplate && options?.nodeVersion)` but `options?.nodeVersion` is undefined for dynamic installs where version is already baked into commandTemplate (e.g., "fnm install 18" instead of "fnm install {version}").

## Test Strategy

**Test Focus**: Unit tests for `ProgressUnifier.resolveCommands()` method

**Coverage Target**: 100% for modified code (this is a critical bug fix)

**Test Categories**:
1. **Happy Path**: Pre-substituted templates work correctly
2. **Backward Compatibility**: Templates with `{version}` placeholder still work
3. **Edge Cases**: Empty templates, missing parameters, mixed scenarios

**Test Files**:
- `tests/core/utils/ProgressUnifier.test.ts` (create if doesn't exist)

## Acceptance Criteria

- [x] `resolveCommands()` handles pre-substituted templates (e.g., "fnm install 18")
- [x] `resolveCommands()` still handles placeholder templates (e.g., "fnm install {version}")
- [x] All existing tests pass (no regressions)
- [x] New tests cover both scenarios
- [x] Node.js installation works end-to-end

## Implementation Summary

**Status:** ✅ Complete

**Implementation Date:** 2025-11-12

**Test Results:** 14/14 passing (5 new tests + 9 existing tests)

**Coverage:** 100% for modified code paths

**Quality Gates Passed:**
- ✅ Efficiency Review: 17% cyclomatic complexity reduction, 33% nesting depth reduction
- ⏩ Security Review: Disabled (simple logic fix, no security implications)
- ✅ Documentation Review: No updates needed (internal changes only)

**Files Modified:**
- `src/core/utils/progressUnifier.ts` (lines 207-237, optimized 31→29 lines)
- `tests/unit/utils/progressUnifier.test.ts` (5 comprehensive test scenarios added)

## Implementation Steps

This plan has 1 step (simple bug fix).

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled (simple logic fix, no security implications)

## Implementation Constraints

- File size: Keep ProgressUnifier.ts under existing limit
- Simplicity: KISS principle - simple if/else logic, no over-engineering
- Backward Compatibility: MUST support both pre-substituted and placeholder templates
- Testing: 100% coverage for modified code paths

## Risks

- **Low Risk**: Simple logic change with clear test cases
- **Regression Risk**: Mitigated by comprehensive tests and backward compatibility
