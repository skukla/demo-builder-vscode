# SOP Remediation Plan - Round 4

**Created**: 2025-01-28
**SOP Version**: 2.0.0
**Total Violations**: 30
**Estimated Steps**: 12

---

## Overview

This plan addresses 30 SOP violations identified by `/rptc:helper-sop-scan`:

| Pattern | Section | Violations | Phase |
|---------|---------|------------|-------|
| Inline Object Operations | §4 | 14 | 1 |
| Magic Timeouts | §1 | 9 | 2 |
| Long Validation Chains | §10 | 3 | 3 |
| Nested Ternaries | §3 | 2 | 3 |
| Callback Body Complexity | §6 | 2 | 3 |

---

## Phase 1: Inline Object Operations (14 violations)

### Step 1.1: Add componentInstance helpers to typeGuards.ts

**File**: `src/types/typeGuards.ts`

**Add these helper functions**:

```typescript
/**
 * Get component instance entries from project
 *
 * Replaces inline: `Object.entries(project.componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param project - Project to extract entries from
 * @returns Array of [id, instance] tuples
 */
export function getComponentInstanceEntries(
    project: Project | undefined | null,
): Array<[string, ComponentInstance]> {
    if (!project?.componentInstances) return [];
    return Object.entries(project.componentInstances);
}

/**
 * Get component instance values from project
 *
 * Replaces inline: `Object.values(project.componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param project - Project to extract values from
 * @returns Array of ComponentInstance
 */
export function getComponentInstanceValues(
    project: Project | undefined | null,
): ComponentInstance[] {
    if (!project?.componentInstances) return [];
    return Object.values(project.componentInstances);
}

/**
 * Get component instances by type
 *
 * Replaces inline: `Object.values(componentInstances).filter(c => c.type === type)`
 * SOP §4: Extracted inline object operation with filter to named helper
 *
 * @param project - Project to search
 * @param type - Component type to filter by
 * @returns Array of matching ComponentInstance
 */
export function getComponentInstancesByType(
    project: Project | undefined | null,
    type: string,
): ComponentInstance[] {
    if (!project?.componentInstances) return [];
    return Object.values(project.componentInstances).filter(c => c.type === type);
}
```

**Tests**: Add unit tests in `tests/types/typeGuards-componentInstances.test.ts`

---

### Step 1.2: Apply helpers to configure.ts (6 locations)

**File**: `src/features/dashboard/commands/configure.ts`

**Changes**:
- Line 305: Replace `Object.entries(project.componentInstances)` with `getComponentInstanceEntries(project)`
- Line 380: Replace `Object.entries(project.componentInstances)` with `getComponentInstanceEntries(project)`
- Line 405: Replace `Object.entries(project.componentInstances)` with `getComponentInstanceEntries(project)`
- Lines 441-442, 449, 482: Apply appropriate helpers for Object operations

**Import**: Add `getComponentInstanceEntries` to imports from `@/types/typeGuards`

---

### Step 1.3: Apply helpers to ConfigureScreen.tsx (2 locations)

**File**: `src/features/dashboard/ui/configure/ConfigureScreen.tsx`

**Changes**:
- Line 186: Replace `Object.entries(componentInstances)` with helper or direct for-of
- Line 593: Replace `Object.entries(componentConfigs)` with helper

---

### Step 1.4: Apply helpers to lifecycle and dashboard commands

**Files**:
- `src/features/lifecycle/commands/startDemo.ts` (line 283)
- `src/features/dashboard/commands/showDashboard.ts` (line 255)
- `src/features/mesh/commands/deployMesh.ts` (line 319)
- `src/features/components/providers/componentTreeProvider.ts` (line 72)

**Changes**: Replace `Object.values/entries(project.componentInstances)` with helpers

---

### Step 1.5: Apply helpers to remaining files

**Files**:
- `src/features/components/services/componentManager.ts` (line 459) - use `getComponentInstancesByType()`
- `src/features/components/services/ComponentRegistryManager.ts` (line 186)
- `src/features/mesh/services/stalenessDetector.ts` (line 359)
- `src/core/logging/stepLogger.ts` (lines 78, 241)
- `src/commands/diagnostics.ts` (line 486)

---

## Phase 2: Magic Timeouts (9 violations)

### Step 2.1: Add new TIMEOUTS constants

**File**: `src/core/utils/timeoutConfig.ts`

**Add these constants**:

```typescript
// Retry strategy delays
FILE_RETRY_INITIAL: 200,         // Initial delay for file operation retry (200ms)
FILE_RETRY_MAX: 1000,            // Maximum delay for file operation retry (1 second)

// Progress and status display
PROGRESS_UPDATE_INTERVAL: 1000,  // Interval for progress bar updates (1 second)
STATUS_BAR_SUCCESS: 5000,        // Duration for success status bar message (5 seconds)

// Extended webview timeouts
WEBVIEW_HANDSHAKE_EXTENDED: 15000, // Extended handshake for slow systems (15 seconds)
WEBVIEW_MESSAGE_TIMEOUT: 30000,    // Message response timeout (30 seconds)
```

---

### Step 2.2: Apply TIMEOUTS to retryStrategyManager.ts (4 locations)

**File**: `src/core/shell/retryStrategyManager.ts`

**Changes**:
- Line 28-29 (network): Use `TIMEOUTS.POLL_INITIAL_DELAY`, `TIMEOUTS.POLL_MAX_DELAY`
- Line 41-42 (filesystem): Use `TIMEOUTS.FILE_RETRY_INITIAL`, `TIMEOUTS.FILE_RETRY_MAX`
- Line 55-56 (adobe-cli): Use `TIMEOUTS.POLL_INITIAL_DELAY`, `TIMEOUTS.POLL_MAX_DELAY`
- Line 106-107 (default): Use `TIMEOUTS.POLL_INITIAL_DELAY`, `TIMEOUTS.POLL_MAX_DELAY`

---

### Step 2.3: Apply TIMEOUTS to remaining files

**Files**:
- `src/core/base/baseWebviewCommand.ts` (lines 267-268): Use `TIMEOUTS.WEBVIEW_HANDSHAKE_EXTENDED`, `TIMEOUTS.WEBVIEW_MESSAGE_TIMEOUT`
- `src/core/shell/fileWatcher.ts` (lines 24, 44-45): Use existing constants
- `src/core/utils/progressUnifier.ts` (line 465): Use `TIMEOUTS.PROGRESS_UPDATE_INTERVAL`
- `src/features/project-creation/handlers/executor.ts` (line 75): Use `TIMEOUTS.STATUS_BAR_SUCCESS`

---

### Step 2.4: Create PERFORMANCE_THRESHOLDS for performanceTracker.ts

**File**: `src/features/authentication/services/performanceTracker.ts`

**Option A**: Add to timeoutConfig.ts as separate object:
```typescript
export const PERFORMANCE_THRESHOLDS = {
    QUICK_AUTH: 2500,
    TOKEN_REFRESH: 3000,
    SDK_INIT: 5000,
    FULL_AUTH: 30000,
} as const;
```

**Option B**: Keep in performanceTracker.ts but document as intentional benchmark values (not operational timeouts)

---

## Phase 3: Remaining Violations (7 violations)

### Step 3.1: Extract validation chain predicates

**File**: `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` (line 172-177)

**Extract**:
```typescript
/**
 * Check if a prerequisite check has reached a terminal state
 * SOP §10: Extracted 4-condition OR chain to named predicate
 */
function isTerminalStatus(status: PrerequisiteStatus): boolean {
    return status === 'success' ||
           status === 'error' ||
           status === 'warning' ||
           status === 'pending';
}
```

**File**: `src/features/mesh/utils/errorFormatter.ts` (line 162-167)

**Extract**:
```typescript
/**
 * Check if a line is meaningful error content (not noise)
 * SOP §10: Extracted 4-condition AND chain to named predicate
 */
function isMeaningfulErrorLine(line: string): boolean {
    if (!line.trim()) return false;
    if (line.includes('Building Mesh')) return false;
    if (line.includes('💡')) return false;
    if (line.includes('Cleaning existing')) return false;
    return true;
}
```

---

### Step 3.2: Extract nested ternaries in classNames.ts

**File**: `src/core/ui/utils/classNames.ts`

**Extract at line 263-267**:
```typescript
/**
 * Get timeline step dot status class
 * SOP §3: Extracted nested ternary to named helper
 */
function getTimelineStepDotStatusClass(
    status: 'completed' | 'current' | 'upcoming' | 'completed-current'
): string {
    if (status === 'completed' || status === 'completed-current') {
        return 'timeline-step-dot-completed';
    }
    if (status === 'current') {
        return 'timeline-step-dot-current';
    }
    return 'timeline-step-dot-upcoming';
}
```

**Extract at line 277-281**:
```typescript
/**
 * Get timeline step label color class
 * SOP §3: Extracted nested ternary to named helper
 */
function getTimelineStepLabelColor(
    status: 'completed' | 'current' | 'upcoming' | 'completed-current'
): string {
    if (status === 'current' || status === 'completed-current') {
        return 'text-blue-700';
    }
    if (status === 'completed') {
        return 'text-gray-800';
    }
    return 'text-gray-600';
}
```

---

### Step 3.3: Extract callback transformations

**File**: `src/features/prerequisites/handlers/checkHandler.ts` (line 236-243)

**Extract**:
```typescript
/**
 * Transform prerequisite state to summary object
 * SOP §6: Extracted 6-property callback to named transformation
 */
function toPrerequisiteSummary(
    id: string,
    state: PrerequisiteState,
): PrerequisiteSummary {
    return {
        id,
        name: state.prereq.name,
        required: !state.prereq.optional,
        installed: state.result.installed,
        version: state.result.version,
        canInstall: state.result.canInstall,
    };
}
```

**File**: `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` (line 92-103)

**Extract**:
```typescript
/**
 * Transform prerequisite data to initial check state
 * SOP §6: Extracted 8-property callback to named transformation
 */
function toPrerequisiteCheckState(p: PrerequisiteData): PrerequisiteCheck {
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: 'pending' as const,
        canInstall: false,
        isOptional: p.optional || false,
        plugins: p.plugins,
        message: 'Waiting...',
    };
}
```

---

## Phase 4: Final Verification

### Step 4.1: Run tests

```bash
npm run test:fast
```

### Step 4.2: Run TypeScript compilation

```bash
npm run compile:typescript
```

### Step 4.3: Re-run SOP scan to verify

```bash
/rptc:helper-sop-scan
```

**Expected Result**: 0 violations

---

## Implementation Order

| Step | Description | Files | Violations Fixed |
|------|-------------|-------|------------------|
| 1.1 | Add componentInstance helpers | typeGuards.ts | 0 (setup) |
| 1.2 | Apply to configure.ts | configure.ts | 6 |
| 1.3 | Apply to ConfigureScreen.tsx | ConfigureScreen.tsx | 2 |
| 1.4 | Apply to lifecycle/dashboard | 4 files | 4 |
| 1.5 | Apply to remaining | 5 files | 2 |
| 2.1 | Add TIMEOUTS constants | timeoutConfig.ts | 0 (setup) |
| 2.2 | Apply to retryStrategyManager | retryStrategyManager.ts | 4 |
| 2.3 | Apply to remaining | 4 files | 4 |
| 2.4 | Handle performanceTracker | performanceTracker.ts | 1 |
| 3.1 | Extract validation predicates | 2 files | 3 |
| 3.2 | Extract nested ternaries | classNames.ts | 2 |
| 3.3 | Extract callback transforms | 2 files | 2 |
| **Total** | | **~20 files** | **30** |

---

## Notes

- All changes follow existing patterns established in rounds 1-3
- Helper functions follow naming conventions from code-patterns.md
- Each step should be individually testable
- Run `npm run test:fast` after each phase to catch regressions
