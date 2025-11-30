# Adobe CLI Installation Regression - False Positive Detection

## Feature Description

Fix critical regression where Adobe I/O CLI installation fails silently when user clicks 'Install'. The loading spinner shows but no installation steps execute, leaving the CLI uninstalled.

## Root Cause

File: `src/features/prerequisites/handlers/installHandler.ts` (lines 158-167)

The pre-check using `checkPerNodeVersionStatus()` returns a false positive (reports CLI as installed when it's not). This causes `targetVersions` to become an empty array, triggering early return before installation steps can execute.

## Evidence from Debug Logs

```
[19:48:08.670Z] DEBUG: [WebviewComm] Received: install-prerequisite
[19:48:08.672Z] DEBUG: [Prerequisites] install-prerequisite payload { "id": 3, "name": "Adobe I/O CLI" }
[19:48:08.673Z] DEBUG: [Prerequisites] Detected component Node requirements { "versions": ["20", "24"] }
[19:48:08.700Z] DEBUG: [Command Executor] fnm exec --using=20 aio --version
[19:48:08.701Z] DEBUG: [Command Executor] fnm exec --using=24 aio --version
[19:48:09.926Z] DEBUG: [Prerequisites] Parallel check for Adobe I/O CLI across 2 Node versions completed in 1226ms
[SILENCE] ← Bug occurs here - no installation steps logged
[19:48:10.430Z] DEBUG: [WebviewComm] Received: continue-prerequisites
```

**Critical Gap**: No logs showing what the parallel check returned or what `missingVariantMajors` was calculated as.

## Test Strategy

### Primary Test: Reproduce False Positive

Write test that reproduces the exact scenario:
1. Adobe CLI is NOT installed
2. `checkPerNodeVersionStatus()` is called with Node versions [20, 24]
3. Mock command execution to return exit code **0** (false positive scenario)
4. Verify that `missingVariantMajors` is **empty** (the bug)
5. Verify that installation steps **DO NOT execute** (user-visible symptom)

### Secondary Test: Correct Detection

Write test for correct behavior:
1. Adobe CLI is NOT installed
2. Command returns appropriate error indicator
3. Verify that `missingVariantMajors` contains [20, 24]
4. Verify that installation steps **DO execute**

### Coverage Targets

- Unit tests: 100% coverage for bug fix logic
- Integration test: End-to-end install flow with mocked prerequisites
- Minimum overall coverage: 85%

## Acceptance Criteria

- [ ] Debug logging added at line 161 showing pre-check results (`perNodeStatus`, `missingVariantMajors`, `targetVersions`)
- [ ] Root cause identified (why `checkPerNodeVersionStatus()` returns false positive)
- [ ] Fix implemented to correctly detect missing CLI
- [ ] Installation proceeds when CLI is actually missing
- [ ] All existing tests pass
- [ ] New regression test prevents this bug from recurring

## Risks and Dependencies

**Risk**: Exit code checking logic in `shared.ts` may need adjustment
**Dependency**: Understanding of fnm command behavior and exit codes
**Introduced By**: Recent refactoring that added `checkPerNodeVersionStatus()` pre-check optimization

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled (bug fix, no security implications)

## Files to Modify

### Implementation Files
- `src/features/prerequisites/handlers/installHandler.ts` (add debug logging, potentially fix detection logic)
- `src/features/prerequisites/handlers/shared.ts` (potentially fix `checkPerNodeVersionStatus()` exit code handling)

### Test Files
- `tests/features/prerequisites/handlers/installHandler.test.ts` (add regression test)
- `tests/features/prerequisites/handlers/shared.test.ts` (add unit tests for false positive detection)

## Implementation Constraints

- **File size**: All implementation files must be <500 lines (current files within limits)
- **Simplicity**: No new abstractions - fix existing logic only
- **Test compatibility**: 100% of existing tests must pass (BLOCKING)
- **Debug logging**: Add comprehensive logging to expose root cause without cluttering production logs
- **Performance**: No regression in prerequisite check performance (<2s per check)
