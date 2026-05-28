# Step 1: Add Publish Handler

## Purpose

Implement `handlePublishEds` handler in dashboard handlers to trigger a full CDN content refresh by calling the existing `HelixService.publishAllSiteContent()` method.

## Prerequisites

- [ ] Overview.md reviewed
- [ ] Existing handler patterns understood (`dashboardHandlers.ts:324-344`)
- [ ] HelixService.publishAllSiteContent API understood

## Tests to Write First (RED Phase)

**Test File**: `tests/features/dashboard/handlers/dashboardHandlers-eds.test.ts`

### Test 1: Returns success when publish completes

- **Description**: Handler returns success when HelixService publish succeeds
- **Given**: Project with valid EDS metadata (repoFullName), mocked HelixService
- **When**: `handlePublishEds` is called
- **Then**: Returns `{ success: true }`, HelixService.publishAllSiteContent called with repoFullName

### Test 2: Returns error when EDS metadata missing

- **Description**: Handler returns error when project lacks edsMetadata.repoFullName
- **Given**: Project without edsMetadata or without repoFullName
- **When**: `handlePublishEds` is called
- **Then**: Returns `{ success: false, error: 'EDS metadata not available' }`

### Test 3: Returns error when HelixService throws

- **Description**: Handler catches and returns HelixService errors
- **Given**: Project with valid EDS metadata, HelixService throws error
- **When**: `handlePublishEds` is called
- **Then**: Returns `{ success: false, error: [error message] }`

### Test 4: Returns error when project not found

- **Description**: Handler returns error when no current project
- **Given**: stateManager.getCurrentProject returns null
- **When**: `handlePublishEds` is called
- **Then**: Returns `{ success: false, error: 'No project found' }`

## Files to Modify

### `src/features/dashboard/handlers/dashboardHandlers.ts`

- Add `handlePublishEds` handler function (after `handleOpenDaLive`, ~line 370)
- Register `'publishEds'` in `dashboardHandlers` map (~line 567)

### `src/core/di/serviceLocator.ts` (if needed)

- Verify HelixService is accessible via ServiceLocator (may already exist)

## Implementation Details (GREEN Phase)

### Handler Implementation

```typescript
/**
 * Handle 'publishEds' message - Publish all EDS content to live CDN
 */
export const handlePublishEds: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    if (!project.edsMetadata?.repoFullName) {
        context.logger.warn('[Dashboard] publishEds called without EDS metadata');
        return { success: false, error: 'EDS metadata not available', code: ErrorCode.CONFIG_INVALID };
    }

    try {
        context.logger.info(`[Dashboard] Publishing EDS content for ${project.edsMetadata.repoFullName}`);

        const authService = ServiceLocator.getAuthenticationService();
        const helixService = new HelixService(authService);

        await helixService.publishAllSiteContent(project.edsMetadata.repoFullName);

        context.logger.info('[Dashboard] EDS publish completed successfully');
        return { success: true };
    } catch (error) {
        context.logger.error('[Dashboard] EDS publish failed', error as Error);
        return {
            success: false,
            error: (error as Error).message || 'Failed to publish EDS content',
            code: ErrorCode.OPERATION_FAILED
        };
    }
};
```

### Handler Registration

```typescript
// In dashboardHandlers map, add:
'publishEds': handlePublishEds,
```

## Refactor Phase

- Ensure handler follows existing patterns (same structure as handleOpenLiveSite)
- Verify error codes are consistent with other handlers
- Remove any duplication in error handling

## Expected Outcome

- [x] Handler registered and responds to 'publishEds' message type
- [x] Returns success when publish completes
- [x] Returns error with message when EDS metadata missing
- [x] Returns error with message when HelixService fails
- [x] All 4 unit tests pass

## Acceptance Criteria

- [ ] Unit tests cover success and all error paths
- [ ] Handler follows existing pattern (MessageHandler signature, HandlerResponse)
- [ ] Uses ServiceLocator for dependency injection
- [ ] No integration tests added (per PM constraint)
- [ ] Mocks HelixService, ServiceLocator, and stateManager in tests

## Estimated Time

1-2 hours
