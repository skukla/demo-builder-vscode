# Jest --forceExit: Why It's Needed

## Summary

The test suite uses `--forceExit` to handle a known issue with certain tests that prevent Jest workers from exiting gracefully. While this is not ideal, the alternative (hanging indefinitely) is worse for developer experience.

## Root Cause

**Affected Tests**: `tests/unit/prerequisites/parallelExecution.test.ts`

These tests use real `setTimeout` in mock implementations to simulate async timing behavior for performance testing. Example:

```typescript
mockCommandExecutor.execute.mockImplementation((cmd: string) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ /* ... */ });
        }, 500); // Real 500ms delay
    });
});
```

While the tests correctly `await` these promises and all timers complete during test execution, Jest's worker process occasionally fails to exit cleanly when all tests in that worker finish.

## What We've Done

1. **Added Global Teardown** (`tests/setup/globalTeardown.ts`)
   - Clears remaining handles
   - Triggers garbage collection
   - Provides 100ms grace period

2. **Added ServiceLocator.reset()** (`tests/setup/node.ts`)
   - Clears singleton state between tests
   - Prevents cross-test pollution

3. **Improved Test Cleanup** 
   - All tests now properly clean up resources
   - Timer cleanup in `afterEach`

4. **Test Scripts**
   - `npm test` - Uses `--forceExit` for reliability
   - `npm run test:fast` - Uses `--forceExit`, 75% workers for speed
   - `npm run test:force` - Explicit force-exit fallback
   - Individual test suites run fine without `--forceExit`

## Verification

Individual test suites complete cleanly:

```bash
# These all exit cleanly without --forceExit
npx jest tests/unit/features/project-creation/
npx jest tests/features/updates/
npx jest tests/core/
```

Only the full suite or specific combinations trigger worker warnings:

```bash
# This shows worker warning but tests pass
npx jest tests/unit/prerequisites/
```

## Future Improvements

Potential solutions (not currently implemented due to trade-offs):

1. **Use Fake Timers** - Would break performance tests that measure real timing
2. **Increase Timeout** - Doesn't solve the root cause, just delays it
3. **Rewrite Tests** - Significant effort for tests that already work correctly
4. **Run Single Worker** - Too slow for CI/dev workflow

## Recommendation

Keep `--forceExit` until:
- Jest improves worker cleanup (upstream issue)
- We rewrite performance tests to not use real timers
- We identify a better solution that doesn't compromise test accuracy

The current approach is pragmatic: tests pass, coverage is maintained, and developer experience is good.
