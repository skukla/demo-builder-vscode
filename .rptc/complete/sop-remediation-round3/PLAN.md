# SOP Remediation Plan - Round 3

## Overview

**Generated**: 2025-11-28
**SOP Version**: code-patterns.md v2.0.0
**Total Violations**: 36
**Estimated Effort**: Medium (3-4 hours)

This plan addresses all violations found in the SOP compliance scan, organized into 3 phases by impact and dependency.

---

## Phase 1: High Impact - TIMEOUTS Constants (15 violations) ✅ COMPLETED

### Step 1.1: Add New TIMEOUTS Constants

**File**: `src/core/utils/timeoutConfig.ts`

**Add these constants**:
```typescript
// Webview communication
WEBVIEW_HANDSHAKE: 10000,        // Handshake protocol timeout
WEBVIEW_RETRY_DELAY: 1000,       // Retry delay for failed messages
LOADING_MIN_DISPLAY: 1500,       // Minimum spinner display time

// API Mesh specific
API_MESH_CHECK: 60000,           // Check mesh status timeout

// Polling service defaults
POLL_INITIAL_DELAY: 500,         // Initial poll delay
POLL_MAX_DELAY: 5000,            // Maximum poll delay with backoff

// Lifecycle management
DEMO_STARTUP_TIMEOUT: 30000,     // Wait for demo server to start
PORT_CHECK_INTERVAL: 1000,       // Interval between port checks
PROCESS_GRACEFUL_SHUTDOWN: 5000, // Graceful shutdown timeout

// File operations
FILE_DELETE_RETRY_BASE: 100,     // Base delay for delete retry backoff
FILE_HANDLE_RELEASE: 100,        // Wait for OS to release file handles

// Authentication retry
TOKEN_RETRY_BASE: 500,           // Base delay for token retry backoff
```

**Test**: Verify constants are exported and have correct values.

---

### Step 1.2: Update webviewCommunicationManager.ts (4 violations)

**File**: `src/core/communication/webviewCommunicationManager.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 50 | `'check-api-mesh': 60000` | `'check-api-mesh': TIMEOUTS.API_MESH_CHECK` |
| 93 | `handshakeTimeout: config.handshakeTimeout \|\| 10000` | `handshakeTimeout: config.handshakeTimeout \|\| TIMEOUTS.WEBVIEW_HANDSHAKE` |
| 94 | `messageTimeout: config.messageTimeout \|\| 30000` | `messageTimeout: config.messageTimeout \|\| TIMEOUTS.COMMAND_DEFAULT` |
| 96 | `retryDelay: config.retryDelay \|\| 1000` | `retryDelay: config.retryDelay \|\| TIMEOUTS.WEBVIEW_RETRY_DELAY` |

**Test**: Existing tests should pass; verify timeout values match.

---

### Step 1.3: Update pollingService.ts (3 violations)

**File**: `src/core/shell/pollingService.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 24 | `initialDelay = 500` | `initialDelay = TIMEOUTS.POLL_INITIAL_DELAY` |
| 25 | `maxDelay = 5000` | `maxDelay = TIMEOUTS.POLL_MAX_DELAY` |
| 27 | `timeout = 120000` | `timeout = TIMEOUTS.API_MESH_UPDATE` |

**Test**: Existing polling tests should pass.

---

### Step 1.4: Update loadingHTML.ts (2 violations)

**File**: `src/core/utils/loadingHTML.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 8 | `const MIN_DISPLAY_TIME = 1500` | `const MIN_DISPLAY_TIME = TIMEOUTS.LOADING_MIN_DISPLAY` |
| 9 | `const INIT_DELAY = 100` | `const INIT_DELAY = TIMEOUTS.WEBVIEW_INIT_DELAY` |

**Test**: Loading HTML generation should work correctly.

---

### Step 1.5: Update startDemo.ts (3 violations)

**File**: `src/features/lifecycle/commands/startDemo.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 28 | `STARTUP_TIMEOUT = 30000` | `STARTUP_TIMEOUT = TIMEOUTS.DEMO_STARTUP_TIMEOUT` |
| 31 | `PORT_CHECK_INTERVAL = 1000` | `PORT_CHECK_INTERVAL = TIMEOUTS.PORT_CHECK_INTERVAL` |
| 38 | `ProcessCleanup({ gracefulTimeout: 5000 })` | `ProcessCleanup({ gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN })` |

**Test**: Demo start functionality should work; verify timeouts.

---

### Step 1.6: Update stopDemo.ts (1 violation)

**File**: `src/features/lifecycle/commands/stopDemo.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 33 | `ProcessCleanup({ gracefulTimeout: 5000 })` | `ProcessCleanup({ gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN })` |

**Test**: Demo stop functionality should work.

---

### Step 1.7: Update deleteProject.ts (2 violations)

**File**: `src/features/lifecycle/commands/deleteProject.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 10 | `BASE_DELAY = 100` | `BASE_DELAY = TIMEOUTS.FILE_DELETE_RETRY_BASE` |
| 12 | `HANDLE_RELEASE_DELAY = 100` | `HANDLE_RELEASE_DELAY = TIMEOUTS.FILE_HANDLE_RELEASE` |

**Test**: Delete project with retry should work.

---

### Step 1.8: Update tokenManager.ts (1 violation)

**File**: `src/features/authentication/services/tokenManager.ts`

**Changes**:
| Line | Current | Replace With |
|------|---------|--------------|
| 166 | `backoffMs = 500 * Math.pow(2, attempt - 1)` | `backoffMs = TIMEOUTS.TOKEN_RETRY_BASE * Math.pow(2, attempt - 1)` |

**Test**: Token retry backoff should use correct base value.

---

## Phase 2: Medium Impact - Helper Extractions (18 violations) ✅ MOSTLY COMPLETE

**Completed Steps**: 2.1-2.7, 2.9 (15 violations fixed)
**Remaining**: Step 2.8 (component transformations - optional, lower priority)

### Step 2.1: Create extractErrorMessage() helper (2 violations + DRY)

**File**: `src/types/errors.ts`

**Add helper** (near line 70):
```typescript
/**
 * Extracts error message from unknown error type.
 * Handles Error instances, strings, and unknown types.
 */
export function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}
```

**Update usages**:
- Line 74-78: Replace nested ternary with `extractErrorMessage(error)`
- Line 354-358: Replace nested ternary with `extractErrorMessage(error)`

**Test**: Error message extraction for Error, string, and unknown types.

---

### Step 2.2: Create getProjectFrontendPort() getter (2 violations)

**File**: `src/core/utils/projectHelpers.ts` (new file)

```typescript
import { Project } from '@/types/project';

/**
 * Gets the frontend port from a project's component instances.
 * Extracts deeply nested optional chain to named getter.
 */
export function getProjectFrontendPort(project: Project | null | undefined): number | undefined {
    return project?.componentInstances?.['citisignal-nextjs']?.port;
}
```

**Update usages**:
- `src/extension.ts:166`: Replace chain with `getProjectFrontendPort(project)`
- `src/features/dashboard/handlers/dashboardHandlers.ts:247`: Replace chain with `getProjectFrontendPort(currentProject)`

**Test**: Returns port when present, undefined when not.

---

### Step 2.3: Create getComponentIds() helper (3 violations)

**File**: `src/types/typeGuards.ts` (add to existing)

```typescript
/**
 * Gets component IDs from component instances object.
 * Handles null/undefined safely.
 */
export function getComponentIds(
    instances: Record<string, ComponentInstance> | undefined | null
): string[] {
    if (!instances) return [];
    return Object.keys(instances);
}
```

**Update usages**:
- `src/features/project-creation/handlers/executor.ts:370`
- `src/features/project-creation/handlers/executor.ts:398`
- `src/core/state/stateManager.ts:170`

**Test**: Returns empty array for null/undefined, keys for valid object.

---

### Step 2.4: Create getComponentsByType() helper (1 violation)

**File**: `src/features/components/services/componentManager.ts`

**Add helper** (file-local, near top):
```typescript
function getComponentsByType(
    instances: Record<string, ComponentInstance> | undefined,
    type: ComponentInstance['type']
): ComponentInstance[] {
    if (!instances) return [];
    return Object.values(instances).filter(comp => comp.type === type);
}
```

**Update usage**:
- Line 459: Replace `Object.values(project.componentInstances).filter(...)` with `getComponentsByType(project.componentInstances, type)`

**Test**: Returns filtered components of specified type.

---

### Step 2.5: Create getPrerequisiteMessage() helper (1 violation)

**File**: `src/features/prerequisites/handlers/checkHandler.ts`

**Add helper** (file-local or in shared.ts):
```typescript
function getPrerequisiteMessage(
    prereq: Prerequisite,
    perNodeVersionStatus: string | undefined,
    perNodeVariantMissing: boolean,
    checkResult: PrerequisiteCheckResult
): string {
    if (prereq.perNodeVersion && perNodeVersionStatus) {
        return `Installed for Node ${perNodeVersionStatus}`;
    }
    if (prereq.perNodeVersion && perNodeVariantMissing) {
        return getPrerequisiteStatusMessage(prereq.name, false, undefined, true, checkResult.missingVariantMajors);
    }
    return getPrerequisiteStatusMessage(prereq.name, checkResult.installed, checkResult.version);
}
```

**Update usage**:
- Lines 206-210: Replace nested ternary with `getPrerequisiteMessage(...)`

**Test**: Returns correct message for each prerequisite state.

---

### Step 2.6: Create getProjectNameValidationState() helper (1 violation - also fixes JSX complexity)

**File**: `src/features/project-creation/ui/steps/WelcomeStep.tsx`

**Add helper** (file-local):
```typescript
function getProjectNameValidationState(
    projectName: string | undefined
): 'valid' | 'invalid' | undefined {
    if (!projectName) return undefined;
    const error = validateProjectName(projectName);
    return error ? 'invalid' : 'valid';
}
```

**Update usage**:
- Lines 88-93: Replace nested ternary with `getProjectNameValidationState(state.projectName)`

**Test**: Returns undefined for empty, 'invalid' for invalid, 'valid' for valid.

---

### Step 2.7: Create getInfrastructureNodeVersion() helper (1 violation)

**File**: `src/core/shell/environmentSetup.ts`

**Add helper** (file-local):
```typescript
function getInfrastructureNodeVersion(
    componentsData: ComponentsData | undefined,
    component: string
): string | undefined {
    return componentsData?.infrastructure?.[component]?.nodeVersion;
}
```

**Update usage**:
- Line 178: Replace chain with `getInfrastructureNodeVersion(componentsData, component)`

**Test**: Returns node version when present, undefined otherwise.

---

### Step 2.8: Extract component transformation helpers (3 violations, 10+ occurrences)

**File**: `src/features/components/handlers/componentTransforms.ts` (new file)

```typescript
import { Component, Dependency } from '@/types/components';

export interface ComponentDataDTO {
    id: string;
    name: string;
    description: string;
    features?: string[];
    configuration?: Record<string, unknown>;
    recommended?: boolean;
}

export interface DependencyDataDTO {
    id: string;
    name: string;
    description: string;
    required: boolean;
}

export function toComponentData(
    component: Component,
    recommendedId?: string
): ComponentDataDTO {
    return {
        id: component.id,
        name: component.name,
        description: component.description,
        features: component.features,
        configuration: component.configuration,
        recommended: component.id === recommendedId,
    };
}

export function toDependencyData(
    dep: Dependency,
    required: boolean
): DependencyDataDTO {
    return {
        id: dep.id,
        name: dep.name,
        description: dep.description,
        required,
    };
}
```

**Update usages in componentHandlers.ts**:
- Lines 86-117: Replace repeated `.map()` callbacks with `toComponentData()`
- Lines 156-190: Replace repeated `.map()` callbacks with `toComponentData()`
- Lines 271-284: Replace dependency mappings with `toDependencyData()`

**Test**: Transformation functions produce correct DTOs.

---

### Step 2.9: Extract toNavigationSection() helper (1 violation)

**File**: `src/features/dashboard/ui/configure/ConfigureScreen.tsx`

**Add helper** (file-local):
```typescript
interface NavigationSection {
    id: string;
    label: string;
    fields: Array<{ key: string; label: string; isComplete: boolean }>;
    isComplete: boolean;
    completedCount: number;
    totalCount: number;
}

function toNavigationSection(
    group: ServiceGroup,
    isFieldComplete: (field: FieldDefinition) => boolean
): NavigationSection {
    const requiredFields = group.fields.filter(f => f.required);
    const completedFields = requiredFields.filter(f => isFieldComplete(f));

    return {
        id: group.id,
        label: group.label,
        fields: group.fields.map(f => ({
            key: f.key,
            label: f.label,
            isComplete: isFieldComplete(f),
        })),
        isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length,
        completedCount: completedFields.length,
        totalCount: requiredFields.length,
    };
}
```

**Update usage**:
- Lines 495-511: Replace callback with `toNavigationSection(group, isFieldComplete)`

**Test**: Navigation section computed correctly with completion status.

---

## Phase 3: Low Impact - Final Cleanups (3 violations)

### Step 3.1: Extract renderStepIndicator() helper (1 violation)

**File**: `src/features/project-creation/ui/wizard/TimelineNav.tsx`

**Add helper** (file-local):
```typescript
function renderStepIndicator(status: TimelineStatus): React.ReactNode {
    if (status === 'completed' || status === 'completed-current') {
        return <CheckmarkCircle size="XS" UNSAFE_className={cn('text-white', 'icon-xs')} />;
    }
    if (status === 'current') {
        return (
            <View
                width="size-100"
                height="size-100"
                UNSAFE_className={cn('rounded-full', 'bg-white', 'animate-pulse')}
            />
        );
    }
    return (
        <View
            width="size-100"
            height="size-100"
            UNSAFE_className={cn('rounded-full', 'bg-gray-400')}
        />
    );
}
```

**Update usage**:
- Lines 83-97: Replace JSX ternary chain with `{renderStepIndicator(status)}`

**Test**: Correct indicator rendered for each status.

---

### Step 3.2: Extract renderFormField() helper (1 violation)

**File**: `src/features/dashboard/ui/configure/ConfigureScreen.tsx`

**Add helper** (file-local):
```typescript
interface FormFieldContext {
    getFieldValue: (field: FieldDefinition) => unknown;
    updateField: (field: FieldDefinition, value: string) => void;
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    selectableDefaultProps: object;
}

function renderFormField(
    field: FieldDefinition,
    context: FormFieldContext
): JSX.Element {
    const value = context.getFieldValue(field);
    const error = context.validationErrors[field.key];
    const showError = error && context.touchedFields.has(field.key);
    const hasDefault = value && field.default && value === field.default;

    return (
        <FormField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            type={field.type as 'text' | 'url' | 'password' | 'select' | 'number'}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(val) => context.updateField(field, val)}
            placeholder={field.placeholder}
            description={field.description}
            required={field.required}
            error={error}
            showError={!!showError}
            options={field.options}
            selectableDefaultProps={hasDefault ? context.selectableDefaultProps : undefined}
        />
    );
}
```

**Update usage**:
- Lines 620-643: Replace callback with `renderFormField(field, formFieldContext)`

**Test**: Form fields render correctly with validation state.

---

### Step 3.3: Extract forEachComponentInstance() helper (1 violation)

**File**: `src/features/dashboard/ui/configure/ConfigureScreen.tsx`

**Add helper** (file-local):
```typescript
function forEachComponentInstance(
    instances: Record<string, ComponentInstance> | undefined,
    callback: (id: string, instance: ComponentInstance) => void
): void {
    if (!instances) return;
    Object.entries(instances).forEach(([id, instance]) => callback(id, instance));
}
```

**Update usage**:
- Line 174: Replace `Object.entries(...).forEach(...)` with `forEachComponentInstance(...)`

**Test**: Callback invoked for each component instance.

---

## Definition of Done

For each step:
- [ ] Helper function/constant added
- [ ] Original inline code replaced with helper call
- [ ] Import statement added where needed
- [ ] All existing tests pass
- [ ] New tests added for new helpers (where applicable)
- [ ] No TypeScript errors

---

## Summary

| Phase | Steps | Violations Fixed | New Files |
|-------|-------|------------------|-----------|
| Phase 1 | 8 | 15 | 0 |
| Phase 2 | 9 | 18 | 2 (`projectHelpers.ts`, `componentTransforms.ts`) |
| Phase 3 | 3 | 3 | 0 |
| **Total** | **20** | **36** | **2** |

---

## Notes

- All changes are backward compatible
- Existing tests should continue to pass
- New helpers follow existing naming conventions (`get*`, `to*`, `has*`, `render*`)
- Phase 1 can be done independently and has highest impact
- Phase 2 has the most violations but involves more careful refactoring
- Phase 3 is optional polish for complete SOP compliance
