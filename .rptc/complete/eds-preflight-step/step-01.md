# Step 1: Create EdsPreflightStep Component

## Purpose

Create the new wizard step UI component that combines GitHub repo creation, DA.live content population, and Helix configuration into a single preflight step. This component executes before project creation to ensure all EDS resources are ready.

## Prerequisites

- [ ] Understanding of existing EDS services (`GitHubRepoPhase`, `ContentPhase`, `HelixConfigPhase`)
- [ ] Understanding of wizard step patterns (`MeshDeploymentStep`, `ProjectCreationStep`)

## Implementation Details

### Phase Management

Define phase states to track operation progress:

```typescript
type PreflightPhase =
  | 'idle'           // Initial state before operations start
  | 'github-repo'    // Creating/fetching GitHub repository
  | 'helix-config'   // Configuring Helix 5 fstab.yaml
  | 'code-sync'      // Verifying code bus synchronization
  | 'github-app'     // Waiting for GitHub App installation
  | 'dalive-content' // Populating DA.live content
  | 'completed'      // All operations successful
  | 'error';         // Operation failed
```

State interface pattern (follow `MeshDeploymentState`):

```typescript
interface PreflightState {
  phase: PreflightPhase;
  message: string;
  subMessage?: string;
  progress: number;  // 0-100 percentage
  error?: string;
  githubAppData?: GitHubAppInstallData;
}
```

### UI Structure

Follow `MeshDeploymentStep.tsx` layout pattern:

1. **Outer container**: `div.flex-column.h-full.w-full`
2. **Content area**: `SingleColumnLayout` with `Heading` and `Text` description
3. **Feedback display**: `CenteredFeedbackContainer` wrapping state-specific content
4. **Footer**: `PageFooter` with Cancel button during operations

State-specific content rendering:
- **Active phases** (`github-repo`, `helix-config`, `code-sync`, `dalive-content`): Show `LoadingDisplay` with progress
- **GitHub App phase**: Show `GitHubAppInstallDialog` component
- **Completed phase**: Show success icon and Continue button
- **Error phase**: Show error icon, message, and Retry/Cancel buttons

### Message Handlers Required

Register these handlers in the step or parent wizard:

1. **`eds-preflight-start`**: Trigger preflight operations (called on mount)
2. **`eds-preflight-progress`**: Receive progress updates from extension
3. **`eds-preflight-complete`**: Handle successful completion with results
4. **`eds-preflight-error`**: Handle operation failures
5. **`eds-preflight-github-app-required`**: Trigger GitHub App install dialog

### Progress Display

Use `LoadingDisplay` with granular messaging:

```typescript
// Progress ranges (match edsProjectService.ts PROGRESS constants)
const PROGRESS_RANGES = {
  'github-repo': { start: 0, end: 15 },
  'helix-config': { start: 15, end: 35 },
  'code-sync': { start: 35, end: 45 },
  'dalive-content': { start: 45, end: 95 },
  'complete': 100,
};
```

Display pattern:
- `message`: Current operation ("Creating GitHub Repository")
- `subMessage`: Specific action ("Cloning CitiSignal template...")
- `helperText`: Context ("This may take 1-2 minutes")

### Error Handling

Follow `MeshDeploymentStep` error display pattern:

1. **Error state UI**: AlertCircle icon + error message + action buttons
2. **Recovery actions**: Retry (restart preflight) and Cancel (back to previous step)
3. **GitHub App errors**: Transition to `github-app` phase, show `GitHubAppInstallDialog`

## Files to Create

### `src/features/eds/ui/steps/EdsPreflightStep.tsx`

Key implementation points:

1. **Props interface**: Accept `state: WizardState`, `updateState`, `onBack`, `onContinue` callbacks
2. **Local state**: `preflightState` using `useState<PreflightState>`
3. **Effect hook**: Start preflight on mount (similar to `ProjectCreationStep.runPreFlightChecks`)
4. **Message listeners**: Subscribe to progress/completion/error messages via `vscode.onMessage`
5. **Conditional rendering**: Switch on `preflightState.phase` for appropriate UI
6. **Footer rendering**: Show Cancel during active phases, Continue on completion

Follow existing patterns:
- Import layout components from `@/core/ui/components/layout/*`
- Import `LoadingDisplay` from `@/core/ui/components/feedback/LoadingDisplay`
- Import `GitHubAppInstallDialog` from `@/features/eds/ui/components`
- Use `webviewClient` for request/response, `vscode.onMessage` for push notifications

## Expected Outcome

When this step is complete:
- EdsPreflightStep component renders in wizard
- Component shows loading states during each phase
- GitHubAppInstallDialog appears when AEM Code Sync not installed
- Error states display with retry/cancel options
- Success state shows with Continue button to proceed

## Acceptance Criteria

- [ ] Component uses `SingleColumnLayout` and `CenteredFeedbackContainer` for consistent layout
- [ ] Phase state machine handles all transitions (`idle` -> `github-repo` -> ... -> `completed`)
- [ ] `LoadingDisplay` shows current operation with progress percentage
- [ ] `GitHubAppInstallDialog` integration works with `onInstallDetected` callback
- [ ] Error state shows AlertCircle icon with error message and Retry/Cancel buttons
- [ ] Success state shows CheckmarkCircle icon with Continue button
- [ ] Footer shows Cancel button during active operations
- [ ] Component follows TypeScript strict mode (no `any` types)

## Dependencies from Other Steps

**Provides to other steps:**
- Component structure ready for wiring in Step 5 (WizardContainer integration)
- Phase definitions used by Step 4 (cancel/cleanup handling)

**Depends on:**
- None (this is the first step)
