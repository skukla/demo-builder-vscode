# Step 1: Fix Reset All Command to Clear Adobe CLI State

## Purpose

Fix critical bug where Reset All command doesn't clear Adobe CLI authentication state, causing "Already authenticated" after reset instead of "Not signed in".

**Bug Impact**: Users expect "Reset All" to completely clear state. Currently, Adobe CLI token in `~/.aio/config.json` persists, violating expectations and making authentication testing difficult.

## Prerequisites

- [ ] Understanding of ResetAllCommand.ts (src/core/commands/ResetAllCommand.ts:77-98)
- [ ] Access to AuthenticationService.logout() via ServiceLocator
- [ ] Knowledge of Adobe CLI authentication state (token + console context)

## Tests to Write First (TDD - RED Phase)

### Unit Tests (6 tests)

**File**: `tests/core/commands/ResetAllCommand.test.ts`

- [x] Test: ResetAllCommand calls authenticationService.logout()
- [x] Test: ResetAllCommand handles logout() errors gracefully (non-fatal)
- [x] Test: ResetAllCommand continues with extension reset after Adobe CLI errors
- [x] Test: Success case - all cleanup completes, window reloads
- [x] Test: Execution order - Adobe CLI cleared BEFORE status bar reset
- [x] Test: Logger messages are clear and actionable

### Integration Tests (3 tests)

**File**: `tests/core/commands/ResetAllCommand.integration.test.ts`

- [x] Test: Full reset clears Adobe CLI token (verify ~/.aio/config.json)
- [x] Test: Full reset clears console context (org/project/workspace)
- [x] Test: After reset + reload, extension shows "Not signed in" (not "Already authenticated")

### Manual Tests (4 scenarios)

- [ ] Reset All → Extension reload → Should see "Not signed in"
- [ ] Reset All with Adobe CLI error → Still resets extension
- [ ] Verify logger messages are helpful for troubleshooting
- [ ] Verify ~/.aio/config.json cleared or token removed

## Files to Create/Modify

**Modify:**
- `src/core/commands/ResetAllCommand.ts` (lines 77-98)
  - Import: ServiceLocator from `@/core/di`
  - Add: Adobe CLI cleanup after step 5 (global state clear)
  - Add: try-catch for non-fatal error handling
  - Update: Step numbering in comments (steps 6-8 become 7-9)

**Create (if doesn't exist):**
- `tests/core/commands/ResetAllCommand.test.ts` - Unit tests
- `tests/core/commands/ResetAllCommand.integration.test.ts` - Integration tests

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase (Write Failing Tests)

1. Create test file: `tests/core/commands/ResetAllCommand.test.ts`
2. Mock ServiceLocator and AuthenticationService
3. Write 6 unit tests (see above)
4. Run tests - should FAIL (functionality doesn't exist yet)

### GREEN Phase (Implement Minimum Code)

**Add import** (top of ResetAllCommand.ts):
```typescript
import { ServiceLocator } from '@/core/di';
```

**Insert after line 86** (after clearing global state, before status bar reset):

```typescript
// 6. Clear Adobe CLI authentication state
try {
    const authService = ServiceLocator.getInstance().resolve('authManager');
    await authService.logout();
    this.logger.info('Cleared Adobe CLI authentication state');
} catch (error) {
    // Non-fatal - warn but continue reset
    this.logger.warn('Failed to clear Adobe CLI state:', error as Error);
    this.logger.warn('You may need to manually run: aio auth logout');
}

// 7. Reset status bar (was step 6)
this.statusBar.reset();

// 8. Delete .demo-builder directory (was step 7)
// ... existing code continues
```

**Update step comments**: Renumber steps 6-8 to 7-9

**Run tests** - should PASS

### REFACTOR Phase

1. **Verify error messages are actionable**:
   - Warn message mentions manual cleanup command
   - Info message confirms successful logout

2. **Verify non-fatal behavior**:
   - try-catch prevents logout errors from blocking reset
   - Reset continues even if Adobe CLI unavailable

3. **Check step ordering**:
   - Adobe CLI cleared AFTER workspace/global state
   - Adobe CLI cleared BEFORE status bar reset
   - Adobe CLI cleared BEFORE .demo-builder deletion

4. **Code review**: Follows project patterns (ServiceLocator, path aliases, error handling)

## Expected Outcome

- Reset All command clears Adobe CLI token (`~/.aio/config.json`)
- Reset All clears console context (console.org/project/workspace)
- After reset + reload, extension shows "Not signed in" (not "Already authenticated")
- Errors in Adobe CLI cleanup are logged but don't block reset
- User gets expected "fully reset" experience

## Acceptance Criteria

- [x] All unit tests pass (6 tests)
- [x] All integration tests pass (3 tests)
- [ ] Manual test: Reset All → Reload → See "Not signed in"
- [ ] Manual test: Reset All with Adobe CLI error → Still resets extension
- [ ] Manual test: ~/.aio/config.json cleared or token removed
- [x] Code review: Error handling is non-fatal (verified in implementation)
- [x] Code review: Logger messages are clear and actionable (verified in implementation)
- [x] Code review: Step numbering consistent (verified in implementation)
- [x] No regressions in existing Reset All functionality (verified - only adds functionality)

## Dependencies from Other Steps

None (single-step plan)

## Estimated Time

**2-3 hours**
- Test writing (RED): 1 hour
- Implementation (GREEN): 30 minutes
- Refactoring (REFACTOR): 30 minutes
- Manual testing: 1 hour

---

**References:**
- Research: `.rptc/research/authentication-token-validation-flows.md` (lines 255-292)
- Bug location: `src/core/commands/ResetAllCommand.ts` (lines 77-98)
- Service method: AuthenticationService.logout() (authenticationService.ts:350-367)
