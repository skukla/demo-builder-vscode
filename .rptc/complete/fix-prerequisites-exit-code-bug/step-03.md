# Step 3: Refactor installHandler pre-check to use shared utility

## Purpose

Eliminate code duplication by replacing inline loop (lines 185-204) with call to `checkPerNodeVersionStatus()`

## Prerequisites

- [x] Step 2 completed (shared utility fixed)
- [x] All existing tests passing

## Tests to Write First

### Test: Pre-check uses `checkPerNodeVersionStatus()` instead of inline logic

- **Given:** Per-node prerequisite needs pre-installation check
- **When:** `handleInstallPrerequisite()` executes
- **Then:** Spy verifies `checkPerNodeVersionStatus()` was called
- **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

## Files to Create/Modify

- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Add spy test
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Replace lines 185-204

## Implementation Details

**RED Phase** (Add test for shared utility usage):

```typescript
describe('Prerequisites Install Handler - Shared Utility Integration', () => {
    it('should use checkPerNodeVersionStatus for pre-installation check', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Spy on checkPerNodeVersionStatus
        const checkPerNodeSpy = jest.spyOn(shared, 'checkPerNodeVersionStatus');

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Verify shared utility was called
        expect(checkPerNodeSpy).toHaveBeenCalledWith(
            mockAdobeCliPrereq,
            expect.arrayContaining(['18', '20']),
            mockContext
        );
    });
});
```

**GREEN Phase** (Replace inline logic with shared utility call):

```typescript
// In handleInstallPrerequisite() around lines 185-204

// BEFORE (DUPLICATED LOGIC):
const commandManager = ServiceLocator.getCommandExecutor();
const fnmListResult = await commandManager.execute('fnm list', {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
    shell: DEFAULT_SHELL,
});
const installedVersions = fnmListResult.stdout.trim().split('\n').filter(v => v.trim());
const installedMajors = new Set<string>();
for (const version of installedVersions) {
    const match = /v?(\d+)/.exec(version);
    if (match) {
        installedMajors.add(match[1]);
    }
}

const missingNodeVersions: string[] = [];

for (const nodeVer of versionsToCheck) {
    if (!installedMajors.has(nodeVer)) {
        context.debugLogger.debug(`[Prerequisites] Node ${nodeVer} not installed, cannot install ${prereq.name} for this version yet`);
        continue;
    }

    context.debugLogger.debug(`[Prerequisites] Checking ${prereq.name} for Node ${nodeVer}: command="${prereq.check.command}", shell=${DEFAULT_SHELL}`);
    const result = await commandManager.execute(prereq.check.command, {
        useNodeVersion: nodeVer,
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
        shell: DEFAULT_SHELL,
    });

    if (result.code === 0) {
        context.debugLogger.debug(`[Prerequisites] ${prereq.name} already installed for Node ${nodeVer}, skipping`);
    } else {
        context.debugLogger.debug(`[Prerequisites] ${prereq.name} not found for Node ${nodeVer} (exit code: ${result.code}), will install`);
        missingNodeVersions.push(nodeVer);
    }
}

// AFTER (USING SHARED UTILITY):
const perNodeStatus = await checkPerNodeVersionStatus(prereq, versionsToCheck, context);
const missingNodeVersions = perNodeStatus.missingVariantMajors;
```

**REFACTOR Phase** (Simplify and verify):

1. Remove now-unused `commandManager` variable from this block
2. Remove duplicated debug logging (already in shared utility)
3. Verify all debug logs still output correctly

## Expected Outcome

- Pre-check logic replaced with single shared utility call
- ~30 lines of code eliminated
- All tests still pass
- Debug logging preserved (via shared utility)

## Acceptance Criteria

- [ ] Lines 185-204 replaced with `checkPerNodeVersionStatus()` call
- [ ] Spy test passes verifying shared utility usage
- [ ] All existing installHandler tests still pass
- [ ] Debug logging output identical to before
- [ ] Code significantly simplified

## Estimated Time

0.5 hours
