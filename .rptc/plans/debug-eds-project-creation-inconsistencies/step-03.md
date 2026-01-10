# Step 3: Add Pre-Flight Check Logs

## Purpose

Add detailed logging to track component lifecycle (mount/unmount), useEffect execution, and pre-flight check triggers. The critical insight: the useEffect has empty deps `[]`, so checks only run on mount. If the component does not fully unmount on cancel/retry, checks will not re-run.

## Prerequisites

- [ ] Steps 1-2 completed (GitHub and DA.live listing logs)

## Implementation Details

**File**: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/features/project-creation/ui/steps/ProjectCreationStep.tsx`

**Add unique instance ID** (after line 51, after `githubAppInstallData` state):

```typescript
// Debug: Track component instance
const instanceId = useMemo(() => `PCS-${Date.now().toString(36)}`, []);
```

**Add mount/unmount logging** (after line 51, before the `needsMeshCheck` line):

```typescript
// Debug: Track mount/unmount lifecycle
useEffect(() => {
    console.log(`[ProjectCreationStep:${instanceId}] MOUNTED`, {
        selectedStack: state.selectedStack,
        hasEdsConfig: !!state.edsConfig,
        repoMode: state.edsConfig?.repoMode,
        timestamp: new Date().toISOString(),
    });
    return () => {
        console.log(`[ProjectCreationStep:${instanceId}] UNMOUNTED`, {
            timestamp: new Date().toISOString(),
        });
    };
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Enhance existing mount useEffect** (line 246-249), add instanceId:

```typescript
useEffect(() => {
    console.log(`[ProjectCreationStep:${instanceId}] useEffect triggered - starting pre-flight checks`);
    runPreFlightChecks();
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Add entry/exit to runPreFlightChecks** (line 145), include instanceId:

```typescript
const runPreFlightChecks = useCallback(async () => {
    console.log(`[Pre-Flight:${instanceId}] ENTER runPreFlightChecks`, {
        needsMeshCheck,
        needsGitHubAppCheck,
        hasEdsConfig: !!state.edsConfig,
        timestamp: new Date().toISOString(),
    });
    // ... existing code ...
    // At end of function (before final closing brace):
    console.log(`[Pre-Flight:${instanceId}] EXIT runPreFlightChecks - proceeding to creation`);
}, [/* deps */]);
```

## Expected Outcome

Console logs will show:
- Unique instance ID per component mount (e.g., `PCS-lx1abc`)
- Mount timestamp with initial props
- Unmount timestamp (if component actually unmounts)
- Pre-flight check entry/exit with same instance ID

**Debug scenario**: On cancel + retry, if same instanceId appears without UNMOUNTED log between, the component is not remounting.

## Acceptance Criteria

- [ ] Unique instanceId generated per component instance
- [ ] Mount log shows initial state props
- [ ] Unmount log fires on cancel
- [ ] Pre-flight logs include instanceId for correlation
- [ ] Build succeeds with no TypeScript errors
