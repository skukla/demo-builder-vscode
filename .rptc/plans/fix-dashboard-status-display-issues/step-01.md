# Step 1: Fix mesh status detection fallback logic

## Purpose

Correctly handle `unknownDeployedState` when deployed mesh config fetch fails (timeout, network error, etc.). Currently, the system incorrectly shows "Not Deployed" when a mesh IS deployed but the fetch times out. This fix distinguishes between "can't verify" (checking/unknown) vs "confirmed not deployed".

**Why this is first**: This is the core bug fix. The StatusCard verification (Step 2) depends on accurate status values being passed to the UI.

## Prerequisites

- [ ] Project has existing mesh deployment functionality
- [ ] Test infrastructure in place (Jest with ts-jest)
- [ ] Existing tests for `dashboardHandlers.ts` and `stalenessDetector.ts`

## Tests to Write First

### Unit Tests - `stalenessDetector.ts`

- [ ] Test: Fetch timeout returns `unknownDeployedState: true` but `hasChanges: false`
  - **Given:** `meshState.envVars` is empty (no baseline), `fetchDeployedMeshConfig()` returns `null` (timeout)
  - **When:** `detectMeshChanges()` is called
  - **Then:** Returns `{ hasChanges: false, unknownDeployedState: true, envVarsChanged: false }`
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

- [ ] Test: Fetch success with populated envVars sets baseline and returns `shouldSaveProject: true`
  - **Given:** `meshState.envVars` is empty, `fetchDeployedMeshConfig()` returns deployed config
  - **When:** `detectMeshChanges()` is called
  - **Then:** Returns `{ hasChanges: false, shouldSaveProject: true, unknownDeployedState: false }` and populates `project.meshState.envVars`
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

- [ ] Test: Empty meshState with no deployed config (legitimately not deployed)
  - **Given:** `meshState.envVars` is empty, `fetchDeployedMeshConfig()` returns `null`, but mesh instance doesn't exist
  - **When:** `detectMeshChanges()` is called
  - **Then:** Returns `{ hasChanges: true, unknownDeployedState: false }` (no mesh = needs deployment)
  - **File:** `tests/unit/features/mesh/services/stalenessDetector.test.ts`

### Unit Tests - `dashboardHandlers.ts`

- [ ] Test: `unknownDeployedState: true` shows "checking" status, not "not-deployed"
  - **Given:** `detectMeshChanges()` returns `{ unknownDeployedState: true, hasChanges: false }`
  - **When:** `handleRequestStatus()` is called (synchronous path)
  - **Then:** Mesh status is `'checking'` with message "Unable to verify deployment status"
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

- [ ] Test: `checkMeshStatusAsync()` handles `unknownDeployedState: true` correctly
  - **Given:** Async mesh check with `unknownDeployedState: true`
  - **When:** `checkMeshStatusAsync()` completes
  - **Then:** Sends `statusUpdate` message with mesh status `'checking'` and helpful message
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

- [ ] Test: Empty `meshState.envVars` with fetch success populates envVars
  - **Given:** `meshState.envVars` is empty, `fetchDeployedMeshConfig()` succeeds
  - **When:** `handleRequestStatus()` is called
  - **Then:** `stateManager.saveProject()` is called, mesh status is `'deployed'`
  - **File:** `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts`

## Files to Create/Modify

- [ ] `src/features/mesh/services/stalenessDetector.ts` - Modify line 267-274 to return `hasChanges: false` when fetch fails
- [ ] `src/features/dashboard/handlers/dashboardHandlers.ts` - Modify lines 159-161 and 467-469 to use `'checking'` status instead of `'not-deployed'`
- [ ] `tests/unit/features/mesh/services/stalenessDetector.test.ts` - Create if doesn't exist, add tests for `unknownDeployedState` scenarios
- [ ] `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts` - Add tests for new status handling (file exists, add test cases)

## Implementation Details

### RED Phase (Write failing tests)

**1. Create test file for `stalenessDetector.ts` (if doesn't exist)**

```typescript
// tests/unit/features/mesh/services/stalenessDetector.test.ts
import { detectMeshChanges, fetchDeployedMeshConfig } from '@/features/mesh/services/stalenessDetector';
import { Project } from '@/types';

jest.mock('@/core/di');
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    ...jest.requireActual('@/features/mesh/services/stalenessDetector'),
    fetchDeployedMeshConfig: jest.fn(),
}));

describe('detectMeshChanges - unknownDeployedState handling', () => {
    let mockProject: Project;

    beforeEach(() => {
        mockProject = {
            name: 'test-project',
            path: '/path/to/project',
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    path: '/path/to/mesh',
                    status: 'deployed',
                },
            },
            meshState: {
                envVars: {}, // Empty - no baseline
                sourceHash: null,
                lastDeployed: '',
            },
        } as unknown as Project;
    });

    it('should return unknownDeployedState=true and hasChanges=false when fetch fails', async () => {
        // Arrange: Fetch returns null (timeout/error)
        (fetchDeployedMeshConfig as jest.Mock).mockResolvedValue(null);

        // Act
        const result = await detectMeshChanges(mockProject, {});

        // Assert: Unknown state, but NOT flagged as changed
        expect(result.unknownDeployedState).toBe(true);
        expect(result.hasChanges).toBe(false); // ⬅️ Key fix
        expect(result.envVarsChanged).toBe(false);
    });

    it('should populate meshState.envVars and set shouldSaveProject when fetch succeeds', async () => {
        // Arrange: Fetch returns deployed config
        const deployedConfig = {
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
        };
        (fetchDeployedMeshConfig as jest.Mock).mockResolvedValue(deployedConfig);

        // Act
        const result = await detectMeshChanges(mockProject, {});

        // Assert: Baseline populated, project should be saved
        expect(result.shouldSaveProject).toBe(true);
        expect(result.hasChanges).toBe(false);
        expect(mockProject.meshState!.envVars).toEqual(deployedConfig);
    });
});
```

**2. Add tests to existing `dashboardHandlers.test.ts`**

```typescript
// tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts
// Add to existing describe block

it('should show "checking" status when unknownDeployedState is true', async () => {
    // Arrange: Mock detectMeshChanges to return unknownDeployedState
    const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
    detectMeshChanges.mockResolvedValue({
        hasChanges: false,
        unknownDeployedState: true,
        envVarsChanged: false,
        sourceFilesChanged: false,
        changedEnvVars: [],
    });
    detectFrontendChanges.mockReturnValue(false);

    // Mock authentication
    const { ServiceLocator } = require('@/core/di');
    const mockAuthManager = {
        isAuthenticated: jest.fn().mockResolvedValue(true),
    };
    ServiceLocator.getAuthenticationService = jest.fn().mockReturnValue(mockAuthManager);

    // Act
    await handleRequestStatus(mockContext);

    // Assert: Status is "checking", NOT "not-deployed"
    expect(mockContext.panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            type: 'statusUpdate',
            payload: expect.objectContaining({
                mesh: expect.objectContaining({
                    status: 'checking', // ⬅️ Key assertion
                    message: expect.stringContaining('Unable to verify'), // Helpful message
                }),
            }),
        })
    );
});
```

**Run tests - all should FAIL (RED phase)**

### GREEN Phase (Minimal implementation)

**1. Fix `stalenessDetector.ts` (line 264-275)**

```typescript
// src/features/mesh/services/stalenessDetector.ts
if (!hasEnvVars) {
    logger.debug('[MeshStaleness] meshState.envVars is empty, attempting to fetch deployed config from Adobe I/O');

    const deployedConfig = await fetchDeployedMeshConfig();

    if (deployedConfig) {
        // Successfully fetched deployed config - use it as baseline
        logger.info('[MeshStaleness] Successfully fetched deployed config, populating meshState.envVars');

        project.meshState!.envVars = deployedConfig;
        didPopulateFromDeployedConfig = true;

        // Now continue with normal comparison using the fetched baseline
        currentState.envVars = deployedConfig;
        // Fall through to regular comparison logic below
    } else {
        // Failed to fetch - can't verify deployed state
        // Conservative approach: Flag as unknown but don't force redeployment
        logger.warn('[MeshStaleness] Failed to fetch deployed config, unable to verify deployment status');
        return {
            hasChanges: false,        // ⬅️ CHANGED: Don't force redeployment
            envVarsChanged: false,    // ⬅️ CHANGED: No changes detected
            sourceFilesChanged: false,
            changedEnvVars: [],
            unknownDeployedState: true, // Still flag as unknown
        };
    }
}
```

**2. Fix `dashboardHandlers.ts` (lines 159-161 and 467-469)**

```typescript
// src/features/dashboard/handlers/dashboardHandlers.ts

// Line 159-161 (synchronous path)
} else if (meshChanges.unknownDeployedState) {
    meshStatus = 'checking';  // ⬅️ CHANGED from 'not-deployed'
    context.logger.debug('[Dashboard] Unable to verify mesh deployment status');
}

// Line 467-469 (async path)
} else if (meshChanges.unknownDeployedState) {
    meshStatus = 'checking';  // ⬅️ CHANGED from 'not-deployed'
    meshMessage = 'Unable to verify deployment status'; // ⬅️ ADD helpful message
    context.logger.debug('[Dashboard] Unable to verify mesh deployment status');
}
```

**Run tests - should now PASS (GREEN phase)**

### REFACTOR Phase (Improve quality)

**1. Extract status message constant**

```typescript
// src/features/mesh/services/types.ts (or appropriate constants file)
export const MESH_STATUS_MESSAGES = {
    CHECKING: 'Verifying deployment status...',
    UNKNOWN: 'Unable to verify deployment status',
    NOT_DEPLOYED: 'No mesh deployed',
    DEPLOYED: 'Mesh deployed successfully',
    CONFIG_CHANGED: 'Configuration changes detected',
} as const;
```

**2. Use constant in handler**

```typescript
// src/features/dashboard/handlers/dashboardHandlers.ts
import { MESH_STATUS_MESSAGES } from '@/features/mesh/services/types';

// Update both locations
} else if (meshChanges.unknownDeployedState) {
    meshStatus = 'checking';
    meshMessage = MESH_STATUS_MESSAGES.UNKNOWN;
    context.logger.debug('[Dashboard] Unable to verify mesh deployment status');
}
```

**3. Improve logging clarity**

```typescript
// src/features/mesh/services/stalenessDetector.ts
} else {
    // Failed to fetch - can't verify deployed state
    logger.warn('[MeshStaleness] Failed to fetch deployed config from Adobe I/O', {
        reason: 'Timeout, network error, or API unavailable',
        recommendation: 'Status shown as "checking" until verification succeeds',
    });
    return {
        hasChanges: false,
        envVarsChanged: false,
        sourceFilesChanged: false,
        changedEnvVars: [],
        unknownDeployedState: true,
    };
}
```

**Run tests again - ensure still passing after refactor**

## Expected Outcome

After completing this step:

- **Mesh status logic correctly distinguishes**:
  - `unknownDeployedState: true` → Status: "checking" (can't verify)
  - Empty `meshState.envVars` + fetch success → Populate baseline, status: "deployed"
  - No mesh instance → Status: "not-deployed" (legitimately not deployed)

- **Tests passing**:
  - 3 new tests in `stalenessDetector.test.ts`
  - 3 new tests in `dashboardHandlers.test.ts`

- **Dashboard displays**:
  - "Checking..." when deployed config fetch fails (not "Not Deployed")
  - "Deployed" when baseline successfully established
  - Helpful messages for each state

## Acceptance Criteria

- [ ] All new tests passing
- [ ] Existing tests still passing (no regression)
- [ ] Code follows project style guide (TypeScript strict mode, ESLint rules)
- [ ] No console.log or debugger statements
- [ ] Coverage ≥ 90% for modified functions
- [ ] Logging uses structured format with context
- [ ] Status messages are user-friendly and accurate

## Dependencies from Other Steps

**None** - This step is independent and implements the core bug fix.

**Feeds into Step 2**: StatusCard verification will use the corrected status values.

## Estimated Time

**2-3 hours**

- Test creation: 1 hour
- Implementation: 45 minutes
- Refactoring: 30 minutes
- Manual verification: 15 minutes
