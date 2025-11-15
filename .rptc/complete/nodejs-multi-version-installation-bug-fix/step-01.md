# Step 1: Fix installHandler bug (pass nodeVersions array)

## Purpose
Fixes the root cause of the Node.js multi-version installation bug where undefined is passed instead of the nodeVersions array, causing only Node 18 to be installed when multiple versions are required by components.

## Prerequisites
- [ ] Overview reviewed and bug understood
- [ ] Development environment ready with test suite runnable

## Tests to Write First (TDD RED Phase)

- [ ] Test: Should pass nodeVersions array for Node.js installation when multiple versions required
  - **Given:** Node.js prerequisite with multiple required versions (18, 20, 24) from components
  - **When:** getInstallSteps is called for Node.js prerequisite
  - **Then:** nodeVersions parameter contains ['18', '20', '24'] instead of undefined
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] Test: Should still handle single version installation when version specified
  - **Given:** Node.js prerequisite with specific version parameter provided
  - **When:** getInstallSteps is called with version='20'
  - **Then:** nodeVersions parameter contains ['20']
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

- [ ] Test: Should pass nodeVersions for Node.js even when no version specified
  - **Given:** Node.js prerequisite with no version parameter but components require multiple versions
  - **When:** getInstallSteps is called without version parameter
  - **Then:** nodeVersions parameter contains all required versions from getRequiredNodeVersions()
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

## Files to Create/Modify

**Files to Modify:**
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Fix line 50 to pass nodeVersions array
- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Add test cases for the fix

## Implementation Details (RED-GREEN-REFACTOR)

### RED: Write Failing Tests

Add these test cases to the test file:

```typescript
describe('nodeVersions parameter passing', () => {
    it('should pass nodeVersions array for Node.js when multiple versions required', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Spy on getInstallSteps to verify parameters
        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Verify nodeVersions array was passed correctly
        expect(getInstallStepsSpy).toHaveBeenCalledWith(
            mockNodePrereq,
            expect.objectContaining({
                nodeVersions: ['18', '20']  // From getRequiredNodeVersions mock
            })
        );
    });

    it('should handle version parameter override for Node.js', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

        // When version specified, should pass that version
        expect(getInstallStepsSpy).toHaveBeenCalledWith(
            mockNodePrereq,
            expect.objectContaining({
                nodeVersions: ['24']
            })
        );
    });
});
```

### GREEN: Minimal Implementation

Change line 50 in `src/features/prerequisites/handlers/installHandler.ts` from:
```typescript
: (prereq.id === 'node' ? (version ? [version] : undefined) : undefined),
```

To:
```typescript
: (prereq.id === 'node' ? (version ? [version] : (nodeVersions.length ? nodeVersions : undefined)) : undefined),
```

This ensures that when no specific version is provided, the function uses the nodeVersions array from components instead of passing undefined.

### REFACTOR: Improve Code Quality

Consider extracting the logic for clarity:
```typescript
// Determine node versions to pass
const getNodeVersionsForInstall = () => {
    if (prereq.perNodeVersion) {
        return nodeVersions.length ? nodeVersions : [version || '20'];
    }
    if (prereq.id === 'node') {
        return version ? [version] : (nodeVersions.length ? nodeVersions : undefined);
    }
    return undefined;
};

const installPlan = context.prereqManager?.getInstallSteps(prereq, {
    nodeVersions: getNodeVersionsForInstall(),
});
```

## Expected Outcome

- Node.js installation correctly receives the array of required versions from components
- Multi-version installation works as intended (installs all required versions, not just Node 18)
- Single version installation with explicit version parameter still works
- Per-node-version prerequisites continue to work correctly

## Acceptance Criteria

- [ ] All new tests pass (nodeVersions array verification)
- [ ] All existing tests continue to pass
- [ ] Node.js multi-version installation installs all required versions (18, 20, 24)
- [ ] No regression in single-version installation
- [ ] No regression in per-node-version prerequisite installation
- [ ] Code follows project TypeScript conventions
- [ ] Coverage maintained at 80%+ for modified code

## Dependencies from Other Steps

None (this is step 1 - the root cause fix)

## Estimated Time

30 minutes