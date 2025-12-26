# Step 5: Extract 6 Custom Hooks

## Purpose

Extract reusable hook logic following SOP Pattern A (Data Fetching) and Pattern D (Async Action). This reduces component complexity and enables independent testing.

## Prerequisites

- [ ] Can run in parallel with Steps 4-6 (per overview coordination notes)
- [ ] Existing hooks reviewed: `useDashboardStatus`, `useFieldFocusTracking`, `useMeshOperations`

## Tests to Write First (RED Phase)

### 5.1 useVerificationMessage

- [ ] Test: Returns formatted message based on status
  - **Given:** Status 'checking'
  - **When:** Hook called
  - **Then:** Returns `{ text: 'Verifying...', type: 'info' }`
  - **File:** `tests/core/ui/hooks/useVerificationMessage.test.ts`

- [ ] Test: Handles error status with message
  - **Given:** Status 'error', message 'Auth failed'
  - **When:** Hook called
  - **Then:** Returns `{ text: 'Auth failed', type: 'error' }`

### 5.2 usePollingWithTimeout

- [ ] Test: Polls at specified interval until condition met
  - **Given:** Fetcher returns false 2x, then true
  - **When:** Hook with 100ms interval, 1s timeout
  - **Then:** Stops polling after condition true
  - **File:** `tests/core/ui/hooks/usePollingWithTimeout.test.ts`

- [ ] Test: Stops on timeout and returns timeout error
  - **Given:** Fetcher always returns false
  - **When:** Timeout of 500ms reached
  - **Then:** Returns `{ timedOut: true, error: 'Timeout' }`

### 5.3 useMeshStatus

- [ ] Test: Subscribes to mesh status updates
  - **Given:** WebviewClient message 'meshStatusUpdate'
  - **When:** Message received with status 'deployed'
  - **Then:** Returns `{ status: 'deployed', color: 'green' }`
  - **File:** `tests/features/mesh/ui/hooks/useMeshStatus.test.ts`

### 5.4 useStepValidation

- [ ] Test: Validates step based on wizard state
  - **Given:** Step 'adobe-auth', state has `isAuthenticated: true`
  - **When:** Hook called
  - **Then:** Returns `{ isValid: true, canProceed: true }`
  - **File:** `tests/features/project-creation/ui/hooks/useStepValidation.test.ts`

### 5.5 useFieldSyncWithBackend

- [ ] Test: Debounces field updates before sync
  - **Given:** Field value changes 3 times in 100ms
  - **When:** Debounce delay 200ms passes
  - **Then:** Backend called once with final value
  - **File:** `tests/features/dashboard/ui/hooks/useFieldSyncWithBackend.test.ts`

### 5.6 useSmartFieldFocusScroll

- [ ] Test: Scrolls to section header on first field focus
  - **Given:** Focus moves to first field in new section
  - **When:** Field receives focus
  - **Then:** Section header scrolled into view
  - **File:** `tests/features/dashboard/ui/hooks/useSmartFieldFocusScroll.test.ts`

## Files to Create/Modify

- [ ] `src/core/ui/hooks/useVerificationMessage.ts` - Status-to-message formatting
- [ ] `src/core/ui/hooks/usePollingWithTimeout.ts` - Generic polling with timeout
- [ ] `src/features/mesh/ui/hooks/useMeshStatus.ts` - Mesh status subscription
- [ ] `src/features/project-creation/ui/hooks/useStepValidation.ts` - Step validation logic
- [ ] `src/features/dashboard/ui/hooks/useFieldSyncWithBackend.ts` - Debounced backend sync
- [ ] `src/features/dashboard/ui/configure/hooks/useSmartFieldFocusScroll.ts` - Smart scroll logic
- [ ] `src/core/ui/hooks/index.ts` - Add exports

## Implementation Details (GREEN Phase)

### useVerificationMessage

```typescript
interface VerificationMessage {
    text: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export function useVerificationMessage(
    status: string,
    message?: string
): VerificationMessage {
    return useMemo(() => {
        const messageMap: Record<string, VerificationMessage> = {
            checking: { text: message || 'Verifying...', type: 'info' },
            success: { text: message || 'Verified', type: 'success' },
            error: { text: message || 'Verification failed', type: 'error' },
        };
        return messageMap[status] || { text: 'Unknown', type: 'info' };
    }, [status, message]);
}
```

### usePollingWithTimeout

```typescript
interface UsePollingWithTimeoutOptions<T> {
    fetcher: () => Promise<T>;
    condition: (result: T) => boolean;
    interval: number;
    timeout: number;
    enabled?: boolean;
}

export function usePollingWithTimeout<T>({
    fetcher, condition, interval, timeout, enabled = true
}: UsePollingWithTimeoutOptions<T>) {
    // Uses useEffect with setInterval + setTimeout for timeout
    // Returns { data, loading, timedOut, error }
}
```

### useMeshStatus (Extract from useDashboardStatus)

```typescript
export function useMeshStatus(): {
    status: MeshStatus | undefined;
    display: StatusDisplay | null;
} {
    // Subscribe to 'meshStatusUpdate' messages
    // Return formatted status display
}
```

## Expected Outcome

- 6 new reusable hooks created
- Reduced complexity in `useDashboardStatus`, `useFieldFocusTracking`
- Independent test coverage for each hook
- Pattern alignment with SOP hooks-extraction.md

## Acceptance Criteria

- [ ] All 6 hooks have passing tests
- [ ] Hooks follow Pattern A/D from SOP
- [ ] Existing components refactored to use new hooks
- [ ] No functionality regression

## Estimated Time

3-4 hours
