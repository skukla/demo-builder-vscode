# Step 4: Refactor installHandler post-check to use shared utility

## Purpose

Eliminate remaining duplication by replacing inline loop (lines 342-361) with call to `checkPerNodeVersionStatus()`

## Prerequisites

- [x] Step 3 completed (pre-check refactored)
- [x] All tests passing

## Tests to Write First

### Test: Post-check uses `checkPerNodeVersionStatus()` instead of inline logic

- **Given:** Per-node prerequisite just installed
- **When:** Post-installation verification executes
- **Then:** Spy verifies `checkPerNodeVersionStatus()` was called
- **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

## Files to Create/Modify

- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Add spy test
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Replace lines 342-361

## Implementation Details

**RED Phase** (Add test for shared utility usage):

```typescript
describe('Prerequisites Install Handler - Shared Utility Integration', () => {
    // ... existing test from Step 3 ...

    it('should use checkPerNodeVersionStatus for post-installation verification', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Spy on checkPerNodeVersionStatus
        const checkPerNodeSpy = jest.spyOn(shared, 'checkPerNodeVersionStatus');

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Verify shared utility was called for post-check (should be called twice total)
        expect(checkPerNodeSpy).toHaveBeenCalledTimes(2); // Pre-check + post-check
    });
});
```

**GREEN Phase** (Replace inline logic with shared utility call):

```typescript
// In handleInstallPrerequisite() around lines 342-361

// BEFORE (DUPLICATED LOGIC):
if (requiredMajors.length > 0) {
    finalPerNodeVersionStatus = [];
    const commandManager = ServiceLocator.getCommandExecutor();
    for (const major of requiredMajors) {
        const result = await commandManager.execute(prereq.check.command, { useNodeVersion: major });

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
            finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
        } else {
            finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
        }
    }
}

// AFTER (USING SHARED UTILITY):
if (requiredMajors.length > 0) {
    const postCheckStatus = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
    finalPerNodeVersionStatus = postCheckStatus.perNodeVersionStatus;
}
```

**REFACTOR Phase** (Final cleanup):

1. Verify no other duplicated logic remains
2. Ensure consistent error handling across all uses
3. Validate debug logging completeness

## Expected Outcome

- Post-check logic replaced with single shared utility call
- ~20 additional lines of code eliminated
- Total ~50 lines eliminated across both refactorings
- All tests still pass
- Complete elimination of duplication

## Acceptance Criteria

- [ ] Lines 342-361 replaced with `checkPerNodeVersionStatus()` call
- [ ] Spy test passes verifying shared utility usage (2 calls)
- [ ] All existing installHandler tests still pass
- [ ] No duplicated logic remains in installHandler
- [ ] Code maintainability significantly improved

## Estimated Time

0.5 hours
