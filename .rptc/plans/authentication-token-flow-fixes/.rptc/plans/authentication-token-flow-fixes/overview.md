# Authentication Token Flow Fix - Reset All Bug

**Plan Status**: ✅ Complete

**Created**: 2025-10-27
**Last Updated**: 2025-10-28

---

## Status Tracking

- [x] **Planned** - Plan approved and ready
- [x] **In Progress** - Implementation started
- [x] **Reviews** - Quality gates (Efficiency + Security) passed
- [x] **Complete** - All tests passing, code reviewed, ready for manual verification

---

## Executive Summary

### Feature
Fix critical bug where "Reset All (Dev Only)" command doesn't clear Adobe CLI authentication state.

### Purpose
When developers use Reset All to get a clean slate, they expect complete reset. Currently, the Adobe CLI token persists in `~/.aio/config.json`, causing the extension to show "Already authenticated" after reset instead of "Not signed in".

This violates user expectations and makes testing authentication flows difficult.

### Approach
Use existing `AuthenticationService.logout()` method (via ServiceLocator) to clear Adobe CLI token and console context before performing extension reset.

### Complexity
**Low** - Single file modification, uses existing service methods, straightforward error handling.

### Timeline
**2-3 hours** - Test writing (1 hour), implementation (30 min), manual testing (1 hour)

### Key Risks
1. Adobe CLI commands may fail (aio not installed, network issues)
   - **Mitigation**: Non-fatal error handling, log warning, continue reset
2. ServiceLocator may not expose AuthenticationService
   - **Mitigation**: Research confirmed ServiceLocator pattern exists, use `resolve('authManager')`

---

## Test Strategy

### Framework
- **Jest** for unit tests
- **Manual testing** for integration verification

### Coverage Goals
- **Target**: 85% (per project config)
- **Focus**: Error handling paths, non-fatal behavior

### Test Scenarios Summary

**Unit Tests (6 tests)**:
- [x] Calls authenticationService.logout()
- [x] Handles logout() errors gracefully (non-fatal)
- [x] Continues with extension reset after Adobe CLI errors
- [x] Success case - all cleanup completes, window reloads
- [x] Execution order - Adobe CLI cleared BEFORE status bar reset
- [x] Logger messages are clear and actionable

**Integration Tests (3 tests)**:
- [x] Full reset clears Adobe CLI token (verify ~/.aio/config.json)
- [x] Full reset clears console context (org/project/workspace)
- [x] After reset + reload, extension shows "Not signed in" (not "Already authenticated")

**Manual Tests (4 scenarios)**:
- [ ] Reset All → Extension reload → Should see "Not signed in"
- [ ] Reset All with Adobe CLI error → Still resets extension
- [ ] Verify logger messages are helpful for troubleshooting
- [ ] Verify non-fatal behavior (reset continues even if Adobe CLI fails)

*Detailed test scenarios are in step-01.md*

---

## Acceptance Criteria

**Definition of Done**:

- [x] All unit tests pass (6 tests)
- [x] All integration tests pass (3 tests)
- [ ] Manual test: Reset All → Reload → See "Not signed in" state
- [ ] Manual test: Reset All with Adobe CLI error → Extension still resets
- [x] Code review: Error handling is non-fatal
- [x] Code review: Logger messages are clear and actionable
- [x] No regressions in existing Reset All functionality
- [x] Code follows project patterns (ServiceLocator, path aliases, canonical result types)

---

## Risk Assessment

### Risk 1: Adobe CLI Command Failures
- **Category**: Technical
- **Likelihood**: Medium (CLI may not be installed, network issues)
- **Impact**: Low (non-fatal, reset continues)
- **Mitigation**:
  - Wrap logout() in try-catch
  - Log warning with actionable message
  - Continue with extension reset regardless
- **Contingency**: If logout() consistently fails, provide manual cleanup instructions in error message

### Risk 2: ServiceLocator API Changes
- **Category**: Technical
- **Likelihood**: Low (API is stable)
- **Impact**: Medium (implementation blocked)
- **Mitigation**: Research confirmed ServiceLocator pattern exists in codebase
- **Contingency**: Use direct import if ServiceLocator unavailable

### Risk 3: Testing Reset Behavior
- **Category**: Testing
- **Likelihood**: Low
- **Impact**: Medium (hard to verify reset works correctly)
- **Mitigation**:
  - Check file system directly (read ~/.aio/config.json)
  - Verify extension state after reload
  - Use comprehensive manual test scenarios
- **Contingency**: Add debug logging to trace reset operations

---

## Dependencies

### New Packages
None required.

### Configuration Changes
None required.

### External Services
- **Adobe I/O CLI** (`aio` command)
  - Used for: `aio auth logout`, `aio config delete console.*`
  - Availability: Already required by extension
  - Failure mode: Non-fatal (warn and continue)

---

## File Reference Map

### Existing Files to Modify

**Core Commands**:
- `src/core/commands/ResetAllCommand.ts` (lines 77-98)
  - Add: Adobe CLI cleanup via authenticationService.logout()
  - Add: Try-catch for non-fatal error handling
  - Add: Helpful logger messages

**Tests** (create if doesn't exist):
- `tests/core/commands/ResetAllCommand.test.ts`
  - Add: 6 unit tests
  - Add: 3 integration tests

### New Files to Create
None.

---

## Coordination Notes

### Step Dependencies
N/A - Single step plan.

### Integration Points
- **ServiceLocator**: Access to AuthenticationService via `resolve('authManager')`
- **AuthenticationService**: `logout()` method clears token + caches
- **Logger**: Error messages must be actionable for developers

### Execution Order
1. Tests first (TDD RED phase)
2. Implementation (TDD GREEN phase)
3. Refactor (improve error messages, verify non-fatal behavior)
4. Manual testing (full reset workflow)

---

## Next Actions

1. **Review this plan** - Approve or request modifications
2. **Start implementation**: `/rptc:tdd "@authentication-token-flow-fixes/step-01.md"`
3. **After completion**: Commit with conventional commit message

---

## Research Reference

This plan is based on comprehensive authentication flow research:
- **Research Document**: `.rptc/research/authentication-token-validation-flows.md`
- **Bug Identified**: Lines 255-292 (Scenario 2: Reset All)
- **Root Cause**: Reset All only clears extension state, not Adobe CLI state
- **Impact**: User confusion - "Reset All" doesn't actually reset authentication
- **Proposed Fix**: Lines 285-292 (use authenticationService.logout())
