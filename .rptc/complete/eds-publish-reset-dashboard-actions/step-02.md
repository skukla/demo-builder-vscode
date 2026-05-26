# Step 2: Add Reset Handler

## Purpose

Implement `handleResetEds` to orchestrate full EDS project reset with confirmation dialog, cleanup of existing resources (GitHub, DA.live, Helix), and recreation from template.

## Prerequisites

- [ ] Step 1 completed (handlePublishEds handler)
- [ ] Confirmation dialog pattern understood (ResetAllCommand.ts:25-28)

## Tests to Write First (RED Phase)

**Test File**: `tests/features/dashboard/handlers/dashboardHandlers-eds.test.ts`

**Test Setup**:
```typescript
jest.setTimeout(5000);

// Mock vscode.window.showWarningMessage
const mockShowWarningMessage = jest.fn();
jest.mock('vscode', () => ({
    window: { showWarningMessage: mockShowWarningMessage },
}), { virtual: true });

// Mock ServiceLocator for CleanupService and EdsProjectService
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCleanupService: jest.fn(),
        getEdsProjectService: jest.fn(),
    },
}));
```

### Test 1: Shows confirmation dialog before reset

- **Description**: Verifies modal confirmation dialog is displayed
- **Given**: Valid EDS project with edsMetadata
- **When**: handleResetEds is called
- **Then**: `showWarningMessage` called with modal:true and "Reset Project" option

### Test 2: Returns cancelled when user declines

- **Description**: Verifies early exit on cancellation
- **Given**: User clicks Cancel (showWarningMessage returns undefined)
- **When**: handleResetEds is called
- **Then**: Returns `{ success: false, cancelled: true }`, no cleanup called

### Test 3: Calls CleanupService with correct options

- **Description**: Verifies cleanup orchestration
- **Given**: User confirms reset
- **When**: handleResetEds is called
- **Then**: `CleanupService.cleanupEdsResources()` called with full cleanup options

### Test 4: Calls EdsProjectService.setupProject after cleanup

- **Description**: Verifies recreation after cleanup
- **Given**: User confirms, cleanup succeeds
- **When**: handleResetEds is called
- **Then**: `EdsProjectService.setupProject()` called with project config

### Test 5: Returns success when reset completes

- **Description**: Verifies success response
- **Given**: Cleanup and setup both succeed
- **When**: handleResetEds is called
- **Then**: Returns `{ success: true }`

### Test 6: Returns error when cleanup fails

- **Description**: Verifies cleanup error handling
- **Given**: CleanupService throws error
- **When**: handleResetEds is called
- **Then**: Returns `{ success: false, error: '...' }`, setupProject NOT called

### Test 7: Returns error when project has no EDS metadata

- **Description**: Verifies validation of EDS metadata
- **Given**: Project without edsMetadata
- **When**: handleResetEds is called
- **Then**: Returns `{ success: false, error: 'No EDS metadata' }`

## Files to Modify

### `src/features/dashboard/handlers/dashboardHandlers.ts`

- Add `handleResetEds` handler function (after `handleOpenLiveSite`)
- Register `'resetEds'` in `dashboardHandlers` map

## Implementation Details (GREEN Phase)

### Handler Implementation

```typescript
import { ServiceLocator } from '@/core/di';
import { ErrorCode } from '@/types/errorCodes';

/**
 * Handle 'resetEds' message - Reset EDS project to fresh state
 *
 * Orchestrates: Confirmation -> Cleanup -> Recreation -> Publish
 */
export const handleResetEds: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();

    // 1. Validate EDS metadata exists
    if (!project?.edsMetadata) {
        context.logger.warn('[Dashboard] resetEds called without EDS metadata');
        return { success: false, error: 'No EDS metadata', code: ErrorCode.CONFIG_INVALID };
    }

    // 2. Show confirmation dialog (modal: true for destructive action)
    const selection = await vscode.window.showWarningMessage(
        'This will delete and recreate your EDS project. All changes will be lost. Continue?',
        { modal: true },
        'Reset Project'
    );

    if (selection !== 'Reset Project') {
        context.logger.debug('[Dashboard] Reset cancelled by user');
        return { success: false, cancelled: true };
    }

    try {
        // 3. Clean up existing resources
        context.logger.info('[Dashboard] Starting EDS reset - cleanup phase');
        const cleanupService = ServiceLocator.getCleanupService();
        await cleanupService.cleanupEdsResources(project.edsMetadata, {
            cleanupBackendData: true,
            deleteGitHub: true,
            archiveInsteadOfDelete: false,
            deleteDaLive: true,
            unpublishHelix: true,
        });

        // 4. Recreate project from template
        context.logger.info('[Dashboard] Starting EDS reset - recreation phase');
        const edsProjectService = ServiceLocator.getEdsProjectService();
        const config = buildEdsConfigFromProject(project);
        const result = await edsProjectService.setupProject(config);

        if (!result.success) {
            return { success: false, error: result.error || 'Recreation failed' };
        }

        context.logger.info('[Dashboard] EDS reset complete');
        return { success: true };
    } catch (error) {
        context.logger.error('[Dashboard] EDS reset failed', error as Error);
        return { success: false, error: (error as Error).message };
    }
};
```

### Handler Registration

```typescript
export const dashboardHandlers = defineHandlers({
    // ... existing handlers ...

    // EDS handlers
    'resetEds': handleResetEds,
});
```

## Refactor Phase

- Extract `buildEdsConfigFromProject()` helper if logic is complex
- Consider shared validation logic with handlePublishEds (Step 1)
- Ensure error messages are user-friendly

## Expected Outcome

- [x] Handler registered and responds to 'resetEds' message type
- [x] Confirmation dialog prevents accidental execution
- [x] Cleanup and recreation orchestrated correctly
- [x] All 7 tests pass

## Acceptance Criteria

- [ ] Unit tests cover: confirmation shown, cancelled, success, error paths
- [ ] Modal confirmation required before destructive action
- [ ] Handler follows existing pattern (HandlerContext, HandlerResponse)
- [ ] No integration tests added (per PM constraint)
- [ ] CleanupService and EdsProjectService accessed via ServiceLocator (DI)
