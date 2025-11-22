# Research: Mesh Status Stuck on "Deployed" After Config Change

**Research Date**: November 20, 2025
**Topic**: Dashboard shows "Deployed" instead of "Redeploy Needed" after mesh config changes
**Scope**: Codebase analysis
**Status**: Two bugs identified

---

## Executive Summary

When a user changes mesh configuration and clicks "Later" on the redeploy prompt, the dashboard continues showing "Deployed" status instead of "Redeploy Needed". Investigation revealed **two separate bugs**:

1. **Primary Bug**: Logic error in `dashboardHandlers.ts` causes `meshStatus = 'deployed'` to override the correct `'config-changed'` status
2. **Secondary Bug**: No "user declined update" state is tracked when user clicks "Later"

---

## Bug #1: Mesh Status Always Shows "Deployed" (Primary Issue)

### Root Cause

**Location**: `src/features/dashboard/handlers/dashboardHandlers.ts:138-153`

There's a **logic error** where `meshStatus = 'deployed'` gets set twice in sequence, and the second assignment overwrites the first even when there are changes:

```typescript
// Line 138-142: First assignment when shouldSaveProject is true
if (meshChanges.shouldSaveProject) {
    context.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
    await context.stateManager.saveProject(project);
    meshStatus = 'deployed';  // ← Sets to 'deployed'
}

// Line 144-153: Second assignment block
if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
    meshStatus = 'deployed';  // ← ❌ BUG: Unconditionally overwrites to 'deployed'

    if (meshChanges.hasChanges) {
        meshStatus = 'config-changed';  // ← Should set 'config-changed', but...

        if (meshChanges.unknownDeployedState) {
            context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
        }
    }
}
```

### Why This Breaks

**Scenario**: User changes mesh config → clicks "Later" → dashboard refreshes

1. **Configure Save** (`configure.ts:177`):
   - `detectMeshChanges(project, newComponentConfigs)` called **before** saving
   - Correctly detects changes and returns `{ hasChanges: true }`
   - New config saved to `project.componentConfigs`

2. **Dashboard Refresh** (`dashboardHandlers.ts:136`):
   - `detectMeshChanges(project, project.componentConfigs)` called again
   - **If `meshState.envVars` was empty**: Fetches deployed config from Adobe I/O
   - Populates `meshState.envVars` with deployed config
   - Returns `{ hasChanges: false, shouldSaveProject: true }` (baseline just populated)

3. **Status Assignment Logic** (lines 138-153):
   - `shouldSaveProject = true` → Saves project, sets `meshStatus = 'deployed'`
   - Enters second block → Sets `meshStatus = 'deployed'` **AGAIN**
   - `hasChanges = false` → Never reaches `meshStatus = 'config-changed'`
   - **Result**: Status stuck on `'deployed'`

### The Fix

**Remove the redundant assignment at line 141**:

```typescript
if (meshChanges.shouldSaveProject) {
    context.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
    await context.stateManager.saveProject(project);
    // ❌ REMOVE THIS LINE: meshStatus = 'deployed';
}

if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
    meshStatus = 'deployed';  // ✅ Keep this one

    if (meshChanges.hasChanges) {
        meshStatus = 'config-changed';  // ✅ Now this works correctly

        if (meshChanges.unknownDeployedState) {
            context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
        }
    }
}
```

**Alternative (cleaner)**:

```typescript
if (meshChanges.shouldSaveProject) {
    context.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
    await context.stateManager.saveProject(project);
}

if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
    // Set deployed first, then override if there are changes
    meshStatus = meshChanges.hasChanges ? 'config-changed' : 'deployed';
}
```

### Files to Fix

| File | Lines | Fix |
|------|-------|-----|
| `src/features/dashboard/handlers/dashboardHandlers.ts` | 138-142 | Remove `meshStatus = 'deployed'` |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | 466-481 | Same fix (duplicate async path) |

---

## Bug #2: No "User Declined Update" Tracking (Secondary Issue)

### Current Behavior

When user clicks "Later" on the redeploy prompt:
- Notification is dismissed
- **No state is persisted** to track that user declined
- Dashboard cannot distinguish between:
  - "Config changed but user hasn't been prompted yet"
  - "Config changed, user was prompted and clicked Later"

### Missing State

**Current `meshState` structure** (`src/types/base.ts:36-40`):

```typescript
meshState?: {
    envVars: Record<string, string>;
    sourceHash: string | null;
    lastDeployed: string;
};
```

**Missing fields**:

```typescript
meshState?: {
    envVars: Record<string, string>;
    sourceHash: string | null;
    lastDeployed: string;
    userDeclinedUpdate?: boolean;   // NEW: User clicked "Later"
    declinedAt?: string;            // NEW: When user declined
};
```

### Files That Need Changes

| File | Lines | Change |
|------|-------|--------|
| `src/types/base.ts` | 36-40 | Add `userDeclinedUpdate` and `declinedAt` fields |
| `src/features/dashboard/commands/configure.ts` | 223-231 | Track decline when user clicks "Later" |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | 147-153 | Check decline flag for different status |
| `src/features/mesh/commands/deployMesh.ts` | 252-254 | Clear decline flag after deployment |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | 163-186 | Show different badge for declined state |

### Implementation Details

**Track decline** (`configure.ts:223-231`):

```typescript
).then(selection => {
    if (selection === 'Redeploy Mesh') {
        vscode.commands.executeCommand('demoBuilder.deployMesh');
    } else if (selection === 'Later') {
        // NEW: Track user decline
        project.meshState!.userDeclinedUpdate = true;
        project.meshState!.declinedAt = new Date().toISOString();
        stateManager.saveProject(project);
    }
});
```

**Check decline in dashboard** (`dashboardHandlers.ts:147-153`):

```typescript
if (meshChanges.hasChanges) {
    if (project.meshState?.userDeclinedUpdate) {
        meshStatus = 'update-declined';  // NEW: Orange badge
    } else {
        meshStatus = 'config-changed';   // Yellow badge
    }
}
```

**Clear decline after deployment** (`deployMesh.ts:252-254`):

```typescript
project.meshState = updateMeshState(project);
project.meshState.userDeclinedUpdate = undefined;
project.meshState.declinedAt = undefined;
await stateManager.saveProject(project);
```

---

## Current vs. Desired Behavior

| Scenario | Current Behavior | Desired Behavior |
|----------|------------------|------------------|
| User changes mesh config | Shows "Deployed" ❌ | Shows "Redeploy Needed" |
| User clicks "Later" | No change (still "Deployed") ❌ | Shows "Update Declined" (orange) |
| Extension reloads | Forgets everything | Remembers decline, shows status |
| User deploys mesh | Clears to "Deployed" ✅ | Clears staleness AND decline flag |

---

## Relevant Files Summary

### Configuration Change Handling
- `src/features/dashboard/commands/configure.ts:167-254` - Config save and mesh prompt
- `src/features/dashboard/commands/configure.ts:206-231` - "Redeploy Mesh" / "Later" handler

### Dashboard Status Display
- `src/features/dashboard/handlers/dashboardHandlers.ts:46-191` - `handleRequestStatus`
- `src/features/dashboard/handlers/dashboardHandlers.ts:138-153` - **Bug location**
- `src/features/dashboard/handlers/dashboardHandlers.ts:466-481` - **Bug location (async path)**
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx:163-186` - Status badge display

### Mesh Staleness Detection
- `src/features/mesh/services/stalenessDetector.ts:217-319` - `detectMeshChanges()`
- `src/features/mesh/services/stalenessDetector.ts:324-339` - `updateMeshState()`

### State Persistence
- `src/types/base.ts:36-40` - `meshState` structure
- `src/core/state/stateManager.ts` - Project state persistence

---

## Recommended Fix Order

1. **Fix Bug #1 first** - This is blocking the basic functionality
   - Simple fix: Remove one line of code in two places
   - Immediate result: Dashboard shows "Redeploy Needed" when config changes

2. **Fix Bug #2 second** - This is an enhancement for better UX
   - Requires new state fields and logic
   - Result: Dashboard distinguishes between "needs update" and "user declined"

---

## Verification Steps

After fixing Bug #1:

1. Create a project with mesh deployed
2. Change mesh config in Configure UI
3. Click Save → Should prompt to redeploy
4. Click "Later" → Close prompt
5. Open Dashboard → **Should show "Redeploy Needed"** (not "Deployed")

After fixing Bug #2:

1. Complete steps above
2. Dashboard → Should show "Update Declined" (orange badge)
3. Reload extension → Status should persist
4. Deploy mesh → Should clear to "Deployed"

---

## Key Takeaways

1. **Bug #1 is a simple logic error** - Redundant status assignment overrides the correct value
2. **Bug #2 is missing functionality** - No state tracking for user's decline decision
3. **Staleness detection works correctly** - The underlying `detectMeshChanges()` function is fine
4. **Fix Bug #1 first** - One-line removal in two places restores basic functionality
