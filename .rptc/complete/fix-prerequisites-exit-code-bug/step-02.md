# Step 2: Fix exit code handling in `checkPerNodeVersionStatus()`

## Purpose

Correct the bug by checking `result.code === 0` instead of using try-catch

## Prerequisites

- [x] Step 1 tests written and failing

## Tests to Write First

No new tests - fixing implementation to pass Step 1 tests.

## Files to Create/Modify

- [ ] `src/features/prerequisites/handlers/shared.ts` - Fix lines 210-247

## Implementation Details

**GREEN Phase** (Fix to pass Step 1 tests):

```typescript
// In checkPerNodeVersionStatus() function (lines 210-247)

// BEFORE (BROKEN - assumes execute() throws on non-zero exit):
try {
    const result = await commandManager.execute(
        prereq.check.command,
        {
            useNodeVersion: major,
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
        },
    );

    // Parse CLI version if regex provided
    let cliVersion = '';
    if (prereq.check.parseVersion) {
        try {
            const match = new RegExp(prereq.check.parseVersion).exec(result.stdout);
            if (match) cliVersion = match[1] || '';
        } catch {
            // Ignore regex parse errors
        }
    }

    return {
        major,
        version: `Node ${major}`,
        component: cliVersion,
        installed: true,
        isMissing: false,
    };
} catch {
    return {
        major,
        version: `Node ${major}`,
        component: '',
        installed: false,
        isMissing: true,
    };
}

// AFTER (FIXED - checks result.code):
const result = await commandManager.execute(
    prereq.check.command,
    {
        useNodeVersion: major,
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
    },
);

// Check exit code to determine if command succeeded
if (result.code === 0) {
    // Parse CLI version if regex provided
    let cliVersion = '';
    if (prereq.check.parseVersion) {
        try {
            const match = new RegExp(prereq.check.parseVersion).exec(result.stdout);
            if (match) cliVersion = match[1] || '';
        } catch {
            // Ignore regex parse errors
        }
    }

    return {
        major,
        version: `Node ${major}`,
        component: cliVersion,
        installed: true,
        isMissing: false,
    };
} else {
    return {
        major,
        version: `Node ${major}`,
        component: '',
        installed: false,
        isMissing: true,
    };
}
```

**REFACTOR Phase** (Improve while keeping tests green):

1. Consider extracting version parsing to helper function (optional - only if >3 uses)
2. Ensure debug logging preserved
3. Verify no other logic changes

## Expected Outcome

- Step 1 tests now PASS (GREEN phase)
- `checkPerNodeVersionStatus()` correctly handles non-zero exit codes
- Existing tests still pass
- No behavior change for process errors (ENOENT still throws)

## Acceptance Criteria

- [ ] All tests passing for shared-per-node-status.test.ts
- [ ] No try-catch around `commandManager.execute()`
- [ ] Explicit check for `result.code === 0`
- [ ] No other logic changes
- [ ] Debug logging preserved

## Estimated Time

0.5 hours
