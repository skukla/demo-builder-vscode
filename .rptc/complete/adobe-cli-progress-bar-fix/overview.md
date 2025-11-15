# Adobe I/O CLI Progress Bar Reset Fix

## Feature Description

Fix the progress bar reset issue in the Adobe I/O CLI prerequisite card. Currently, when installing Adobe I/O CLI across multiple Node versions (Node 20 and Node 24), the progress bar fills correctly through Step 1's substeps but resets to 0% when starting Step 2 instead of continuing from where Step 1 left off to reach 100%.

## Problem Statement

The Adobe I/O CLI prerequisite has `perNodeVersion: true` and shows TWO separate installation steps (Node 20 and Node 24). The progress bar should show continuous progress (0-100%) across both Node version installations, but currently resets when moving from Node 20 to Node 24 installation.

## Root Cause

From research findings:
- **File**: `src/features/prerequisites/handlers/installHandler.ts` lines 210-214
- **Issue**: The `total` step count calculation doesn't account for version expansion when `stepsAreVersionSpecific === true`
- **Expected**: When steps are dynamically generated for multiple Node versions, `total` should equal the ACTUAL number of expanded steps (2)
- **Actual**: `total = 1` (counting base template steps instead of expanded steps)
- **Result**: Progress calculation shows Step 0: 0→100%, Step 1: 100→200% (capped at 100%, appears as reset)

## Test Strategy

### Test Approach
- Unit tests for progress calculation logic
- Integration tests for multi-step prerequisite installation
- Focus on `perNodeVersion` prerequisites with multiple versions

### Coverage Target
- 85% minimum coverage for modified code
- All edge cases covered (1 version, 2 versions, 3+ versions)

### Test Files
- `tests/features/prerequisites/handlers/installHandler-progress.test.ts` (new)
- Update existing: `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

## Acceptance Criteria

- [ ] Progress bar shows continuous 0-100% progress across all Adobe I/O CLI installation steps
- [ ] Step 1 (Node 20) fills progress from 0% to ~50%
- [ ] Step 2 (Node 24) fills progress from ~50% to 100%
- [ ] Progress calculation uses correct total (2 steps for 2 Node versions)
- [ ] All existing tests still pass
- [ ] New tests verify multi-version progress calculation
- [ ] No regression for single-version prerequisites

## Files to Modify

1. `src/features/prerequisites/handlers/installHandler.ts` - Fix total calculation (lines 210-214)
2. `src/features/prerequisites/services/PrerequisitesManager.ts` - Verify step expansion logic (lines 342-360)
3. Add tests: `tests/features/prerequisites/handlers/installHandler-progress.test.ts`

## Dependencies

None - this is a bug fix in existing code

## Risks

- **Low Risk**: Isolated to progress calculation logic
- **Mitigation**: Comprehensive tests ensure no regression
- **Edge Cases**: Ensure fix works for 1, 2, and 3+ Node versions

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled (progress bar calculation is not security-sensitive)

## Implementation Constraints

- File size: Keep changes minimal and focused on bug fix
- Simplicity: No abstractions - direct fix to calculation logic
- Testing: Must test all multi-version scenarios (1, 2, 3+ versions)
- Backward compatibility: Must not break single-version prerequisites
