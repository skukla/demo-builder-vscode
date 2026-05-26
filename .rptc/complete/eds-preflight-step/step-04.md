# Step 4: Implement Cancel/Cleanup Handling

## Purpose
Handle user cancellation during preflight operations and clean up any orphaned resources (GitHub repo, DA.live content) that were created before cancellation.

## Prerequisites
- Step 1 complete: EdsPreflightStep component exists with phase state machine
- Step 3 complete: Executor integration with preflight flag
- Understanding of `CleanupService` API and `EdsPartialState` tracking

## Implementation Details

### Cancel Detection
The preflight step already supports `AbortSignal` via `EdsProjectConfig.abortSignal`. Cancel detection works at two levels:

1. **User clicks Cancel button**: Send `cancel-eds-preflight` message to extension
2. **AbortController propagation**: Extension aborts the running operation via signal

### Partial State Tracking
Track created resources in component state:

```typescript
interface PreflightPartialState {
    repoCreated: boolean;
    repoUrl?: string;          // For cleanup
    contentCopied: boolean;
    phase: EdsSetupPhase;
}
```

Update partial state after each successful phase operation.

### Cleanup Invocation
Convert `PreflightPartialState` to `EdsMetadata` and call `CleanupService`:

```typescript
// In cancel handler
const metadata: EdsMetadata = {
    githubRepo: partialState.repoUrl?.replace('https://github.com/', ''),
    daLiveOrg: wizardState.edsConfig?.daLiveOrg,
    daLiveSite: wizardState.edsConfig?.daLiveSite,
};

const options: EdsCleanupOptions = {
    deleteGitHub: partialState.repoCreated,
    deleteDaLive: partialState.contentCopied,
    archiveInsteadOfDelete: false,  // Full delete for preflight
};

await cleanupService.cleanupEdsResources(metadata, options);
```

### User Confirmation
Show confirmation dialog before cleanup when resources exist:

```typescript
if (partialState.repoCreated || partialState.contentCopied) {
    const confirm = await vscode.window.showWarningMessage(
        'Cancel will delete the GitHub repo and DA.live content created so far. Continue?',
        { modal: true },
        'Yes, Cancel'
    );
    if (confirm !== 'Yes, Cancel') return;
}
```

## Files to Modify

### `src/features/eds/ui/steps/EdsPreflightStep.tsx`
- Add `partialState` tracking alongside phase state
- Add Cancel button that sends `cancel-eds-preflight` message
- Update partial state after each phase completes
- Disable Cancel during cleanup operation

### `src/features/eds/handlers/edsPreflightHandlers.ts` (new file)
- Add `handleCancelEdsPreflight` handler
- Store `AbortController` in `sharedState.edsPreflightAbortController`
- Call cleanup service with partial state
- Return cleanup result to UI
- Register `cancel-eds-preflight` in EDS handler map
- Leverage existing `CleanupService` from `@/features/eds`

## Expected Outcome
- User can cancel preflight at any phase
- Created resources are cleaned up automatically
- Confirmation dialog prevents accidental data loss
- UI returns to previous state after cancel

## Acceptance Criteria
- [ ] Cancel button visible during preflight operations
- [ ] Confirmation dialog shown when resources exist
- [ ] GitHub repo deleted on cancel (if created)
- [ ] DA.live content deleted on cancel (if copied)
- [ ] AbortSignal stops in-progress operations
- [ ] UI updates to show "Cancelling..." state
- [ ] Error handling if cleanup fails (log and continue)

## Dependencies from Other Steps
- **Depends on Step 1**: Phase state machine provides current phase info
- **Provides to Step 5**: Cancel/cleanup pattern can be reused for error recovery
