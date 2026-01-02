# Step 2: Update checkHandler to use filtered versions

## Purpose

Replace the raw `getNodeVersionKeys(nodeVersionMapping)` call in checkHandler.ts with `getPluginNodeVersions()` so that per-node-version prerequisites (like Adobe I/O CLI) only show and check Node versions that actually require them based on the `requiredFor` array.

**Why This Step Second:**
- Depends on `getPluginNodeVersions()` from Step 1
- Directly fixes the user-visible bug (wrong Node versions displayed)
- Small, targeted change to existing code path

## Prerequisites

- [x] **Step 1 complete**: `getPluginNodeVersions()` function available in shared.ts
  - **Verify**: `npm run test:file -- tests/features/prerequisites/handlers/shared-getPluginNodeVersions.test.ts` passes
- [x] Understanding of checkHandler.ts perNodeVersion flow (lines 179-232)

## Tests to Write First (RED Phase)

### Integration Tests for checkHandler Plugin Display

**Test File:** `tests/features/prerequisites/handlers/checkHandler-operations.test.ts` (existing file)

Add new test cases to verify filtered Node version display:

- [x] **Test 1: Per-node-version prerequisite shows only filtered Node versions**
  - **Given:** nodeVersionMapping `{'18': 'eds', '20': 'commerce-paas'}`, perNodeVersion prereq with `requiredFor: ['commerce-paas']`
  - **When:** `handleCheckPrerequisites()` checks the prerequisite
  - **Then:** `prerequisite-status` message contains `nodeVersionStatus` with only Node 20 entries

- [x] **Test 2: Per-node-version prerequisite with no matching components shows empty status**
  - **Given:** nodeVersionMapping `{'18': 'eds'}`, perNodeVersion prereq with `requiredFor: ['api-mesh']`
  - **When:** `handleCheckPrerequisites()` checks the prerequisite
  - **Then:** `prerequisite-status` message contains empty `nodeVersionStatus` array

- [x] **Test 3: Per-node-version prerequisite filters correctly with dependencies**
  - **Given:** nodeVersionMapping `{'20': 'commerce-paas'}`, perNodeVersion prereq with `requiredFor: ['commerce-mesh']`, dependencies `['commerce-mesh']`
  - **When:** `handleCheckPrerequisites()` checks the prerequisite
  - **Then:** `prerequisite-status` message contains `nodeVersionStatus` with Node 20 entry

- [x] **Test 4: Backward compatibility - non-perNodeVersion prerequisites unchanged**
  - **Given:** Standard prerequisite (not perNodeVersion)
  - **When:** `handleCheckPrerequisites()` checks the prerequisite
  - **Then:** Behavior unchanged from existing tests (no nodeVersionStatus filtering)

## Files to Create/Modify

### Modified: `src/features/prerequisites/handlers/checkHandler.ts`

**Changes:**
1. Add `getPluginNodeVersions` to imports from shared.ts (line 12)
2. Replace `getNodeVersionKeys(nodeVersionMapping)` with `getPluginNodeVersions()` call at line 180

**Line 12 - Update imports:**
```typescript
// Before:
import { getNodeVersionMapping, checkPerNodeVersionStatus, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteDisplayMessage, formatProgressMessage, formatVersionSuffix, hasNodeVersions, getNodeVersionKeys } from '@/features/prerequisites/handlers/shared';

// After:
import { getNodeVersionMapping, checkPerNodeVersionStatus, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteDisplayMessage, formatProgressMessage, formatVersionSuffix, hasNodeVersions, getNodeVersionKeys, getPluginNodeVersions } from '@/features/prerequisites/handlers/shared';
```

**Line 180 - Filter Node versions by requiredFor:**
```typescript
// Before:
const requiredMajors = getNodeVersionKeys(nodeVersionMapping);

// After:
const requiredMajors = prereq.requiredFor && prereq.requiredFor.length > 0
    ? getPluginNodeVersions(
        nodeVersionMapping,
        prereq.requiredFor,
        context.sharedState.currentComponentSelection?.dependencies,
    )
    : getNodeVersionKeys(nodeVersionMapping);
```

## Implementation Details

### RED Phase (Write Failing Tests First)

Add to `tests/features/prerequisites/handlers/checkHandler-operations.test.ts`:

```typescript
/**
 * Integration tests for per-node-version filtering
 *
 * NOTE: These tests do NOT mock getPluginNodeVersions - they use the real
 * implementation from shared.ts (Step 1). This validates the integration
 * between checkHandler and the new filtering function.
 */
describe('Prerequisites Check Handler - Per-Node-Version Filtering', () => {
    it('should show only filtered Node versions for perNodeVersion prerequisites', async () => {
        const perNodePrereq = {
            id: 'aio-cli',
            name: 'Adobe I/O CLI',
            description: 'Adobe CLI',
            perNodeVersion: true,
            requiredFor: ['commerce-paas'], // Only needed for commerce-paas
            check: { command: 'aio --version' },
        };
        const config = {
            version: '1.0',
            prerequisites: [perNodePrereq],
        };

        const context = createMockContext();
        // Set component selection with both eds (Node 18) and commerce-paas (Node 20)
        context.sharedState.currentComponentSelection = {
            frontend: 'eds',
            backend: 'commerce-paas',
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(config);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([perNodePrereq]);
        // Return mapping with both Node versions
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'eds',
            '20': 'commerce-paas',
        });
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            canInstall: true,
        });
        // Mock getCacheManager for perNodeVersion path
        const mockCacheManager = {
            getPerVersionResults: jest.fn().mockReturnValue([
                { version: 'Node 20', major: '20', component: '', installed: true },
            ]),
        };
        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue(mockCacheManager);

        await handleCheckPrerequisites(context);

        // Should only include Node 20 (commerce-paas), NOT Node 18 (eds)
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Adobe I/O CLI',
                nodeVersionStatus: expect.arrayContaining([
                    expect.objectContaining({ major: '20' }),
                ]),
            }),
        );
        // Should NOT contain Node 18 entry
        const statusCalls = (context.sendMessage as jest.Mock).mock.calls
            .filter(call => call[0] === 'prerequisite-status' && call[1].name === 'Adobe I/O CLI');
        const nodeVersionStatus = statusCalls[statusCalls.length - 1]?.[1]?.nodeVersionStatus || [];
        expect(nodeVersionStatus.some((v: any) => v.major === '18')).toBe(false);
    });

    it('should fall back to all Node versions when no requiredFor specified', async () => {
        const perNodePrereq = {
            id: 'aio-cli',
            name: 'Adobe I/O CLI',
            description: 'Adobe CLI',
            perNodeVersion: true,
            // No requiredFor - should check all Node versions
            check: { command: 'aio --version' },
        };
        const config = {
            version: '1.0',
            prerequisites: [perNodePrereq],
        };

        const context = createMockContext();
        context.sharedState.currentComponentSelection = {
            frontend: 'eds',
            backend: 'commerce-paas',
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(config);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([perNodePrereq]);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'eds',
            '20': 'commerce-paas',
        });
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18', '20']);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            canInstall: true,
        });
        const mockCacheManager = {
            getPerVersionResults: jest.fn().mockReturnValue([
                { version: 'Node 18', major: '18', component: '', installed: true },
                { version: 'Node 20', major: '20', component: '', installed: true },
            ]),
        };
        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue(mockCacheManager);

        await handleCheckPrerequisites(context);

        // Should include BOTH Node versions when no requiredFor
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Adobe I/O CLI',
                nodeVersionStatus: expect.arrayContaining([
                    expect.objectContaining({ major: '18' }),
                    expect.objectContaining({ major: '20' }),
                ]),
            }),
        );
    });
});
```

### GREEN Phase (Minimal Implementation)

1. Update imports in checkHandler.ts to include `getPluginNodeVersions`
2. Replace line 180 with conditional filtering logic

### REFACTOR Phase (Improve While Tests Stay Green)

1. Consider extracting the conditional to a local helper if needed
2. Ensure logging accurately reflects filtered vs full check
3. Verify no regression in existing test coverage

## Expected Outcome

After completing this step:

- [x] Plugin prerequisites display only Node versions that require them
- [x] "Adobe I/O CLI (Node 20, Node 24)" becomes "Adobe I/O CLI (Node 20)" for EDS+PaaS config
- [x] Fallback behavior preserved when `requiredFor` not specified
- [x] All existing tests continue to pass
- [x] New integration tests validate filtering behavior

## Acceptance Criteria

- [x] `getPluginNodeVersions` imported and used in checkHandler.ts
- [x] Per-node-version prerequisites filter by `requiredFor` array
- [x] Fallback to `getNodeVersionKeys()` when `requiredFor` is empty/undefined
- [x] Dependencies from component selection passed to filtering
- [x] All new tests pass
- [x] All existing tests pass (no regression)
- [x] Code coverage maintained at 80%+

## Dependencies from Other Steps

- **Step 1**: Requires `getPluginNodeVersions()` function exported from shared.ts

## Estimated Complexity

**Simple** (1-2 hours)

- Import change: 5 minutes
- Logic change: 15 minutes (one conditional replacement)
- Tests: 45-60 minutes
- Verification: 15 minutes
