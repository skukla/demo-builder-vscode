# Step 4: Add State Cleanup Logs

## Purpose

Log wizard cancel/retry state transitions to understand why cached state persists between wizard sessions. This is critical for diagnosing issues where:
- AEM Code Sync checks do not re-run on retry
- GitHub repos or DA.live projects fail to refresh on second attempt
- Abort controllers remain in stale state

## Prerequisites

- [ ] Steps 1-3 completed (GitHub, DA.live, and pre-flight logging in place)

## Implementation Details

### 4.1 Add Cancel Handler Logging in createProject.ts

**File:** `src/features/project-creation/commands/createProject.ts`

Add logging when the wizard panel is disposed (cancel or close):

```typescript
// In dispose() method (around line 446)
public dispose(): void {
    this.logger.debug('[Wizard] dispose() called - cleaning up');
    this.logger.debug('[Wizard] sharedState before cleanup:', {
        hasAbortController: !!this.sharedState.projectCreationAbortController,
        meshCreatedForWorkspace: this.sharedState.meshCreatedForWorkspace,
        meshExistedBeforeSession: this.sharedState.meshExistedBeforeSession,
        hasComponentSelection: !!this.sharedState.currentComponentSelection,
        hasComponentsData: !!this.sharedState.componentsData,
    });
    // ... existing cleanup code
}
```

### 4.2 Add Service Cache Logging in edsHelpers.ts

**File:** `src/features/eds/handlers/edsHelpers.ts`

Log cache state in service getter and clearer functions:

```typescript
// In getGitHubServices() (around line 59)
export function getGitHubServices(context: HandlerContext): GitHubServices {
    const logger = getLogger();
    logger.debug('[EDS Services] getGitHubServices called', {
        hasCachedServices: !!cachedGitHubServices,
        willCreateNew: !cachedGitHubServices,
    });
    // ... existing code
}

// In clearServiceCache() (around line 124)
export function clearServiceCache(): void {
    const logger = getLogger();
    logger.debug('[EDS Services] clearServiceCache called', {
        hadGitHubServices: !!cachedGitHubServices,
        hadDaLiveServices: !!cachedDaLiveServices,
        hadDaLiveAuthService: !!cachedDaLiveAuthService,
    });
    // ... existing code
    logger.debug('[EDS Services] All service caches cleared');
}
```

### 4.3 Add Instance Detection in createProject.ts

**File:** `src/features/project-creation/commands/createProject.ts`

Add instance ID to detect new vs reused command instances:

```typescript
// In class definition (around line 85)
export class CreateProjectWebviewCommand extends BaseWebviewCommand {
    private static instanceCounter = 0;
    private readonly instanceId: number;

    constructor(...) {
        super(...);
        this.instanceId = ++CreateProjectWebviewCommand.instanceCounter;
        this.logger.debug(`[Wizard] Instance #${this.instanceId} created`);
        // ... existing constructor code
    }
}

// In execute() method (around line 374)
public async execute(options?: {...}): Promise<void> {
    this.logger.debug(`[Wizard] execute() called on instance #${this.instanceId}`, {
        hasExistingPanel: !!this.panel,
        hasCommunicationManager: !!this.communicationManager,
        sharedStateSnapshot: {
            hasAbortController: !!this.sharedState.projectCreationAbortController,
            hasComponentSelection: !!this.sharedState.currentComponentSelection,
        },
    });
    // ... existing code
}
```

### 4.4 Add Abort Controller Reset Logging in createHandler.ts

**File:** `src/features/project-creation/handlers/createHandler.ts`

Log abort controller state transitions:

```typescript
// Before creating new abort controller (around line 137)
context.logger.debug('[Project Creation] Abort controller state before reset:', {
    hadPreviousController: !!context.sharedState.projectCreationAbortController,
    previousWasAborted: context.sharedState.projectCreationAbortController?.signal?.aborted,
});
context.sharedState.projectCreationAbortController = new AbortController();
context.logger.debug('[Project Creation] New abort controller created');

// In finally block (around line 254)
} finally {
    context.logger.debug('[Project Creation] Finally block - cleaning up sharedState', {
        hadAbortController: !!context.sharedState.projectCreationAbortController,
        abortControllerAborted: context.sharedState.projectCreationAbortController?.signal?.aborted,
        meshCreatedForWorkspace: context.sharedState.meshCreatedForWorkspace,
    });
    context.sharedState.projectCreationAbortController = undefined;
    context.sharedState.meshCreatedForWorkspace = undefined;
    context.sharedState.meshExistedBeforeSession = undefined;
    context.logger.debug('[Project Creation] sharedState cleanup complete');
}
```

## Expected Outcome

After implementation, logs will reveal:
- Whether wizard instance is reused or new on retry
- What cached state exists from previous attempt
- Whether abort controller is properly reset
- Whether EDS service caches are cleared between attempts
- Timing of state cleanup relative to retry

## Acceptance Criteria

- [ ] Wizard dispose() logs sharedState contents
- [ ] Service cache getters log cache hit/miss
- [ ] clearServiceCache() logs what was cached before clearing
- [ ] Instance ID tracks new vs reused command instances
- [ ] Abort controller state logged before/after reset
- [ ] Finally block logs cleanup actions

## Estimated Time

30 minutes
