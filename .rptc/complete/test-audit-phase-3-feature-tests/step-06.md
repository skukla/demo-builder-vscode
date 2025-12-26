# Step 6: Dashboard Feature Tests (28 files)

> **Phase:** 3 - Feature Tests
> **Step:** 6 of 9
> **Feature:** dashboard
> **Test Files:** 28
> **Estimated Time:** 2-3 hours

---

## Purpose

Audit all 28 dashboard test files to ensure tests accurately reflect the current project dashboard handlers, status updates, and configure UI. Dashboard is the main control panel after project creation.

---

## Prerequisites

- [ ] Steps 1-5 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current dashboard implementation structure

---

## Test Files to Audit

### UI Root (1 file)

- [ ] `tests/features/dashboard/ui/dashboardPredicates.test.ts`

### UI Configure (6 files)

- [ ] `tests/features/dashboard/ui/configure/ConfigureScreen-operations.test.tsx`
- [ ] `tests/features/dashboard/ui/configure/ConfigureScreen-rendering.test.tsx`
- [ ] `tests/features/dashboard/ui/configure/ConfigureScreen-validation.test.tsx`
- [ ] `tests/features/dashboard/ui/configure/configureHelpers-accessors.test.tsx`
- [ ] `tests/features/dashboard/ui/configure/hooks/useSmartFieldFocusScroll.test.tsx`

### UI Components (1 file)

- [ ] `tests/features/dashboard/ui/components/ActionGrid.test.tsx`

### UI Hooks (3 files)

- [ ] `tests/features/dashboard/ui/hooks/useDashboardActions.test.ts`
- [ ] `tests/features/dashboard/ui/hooks/useDashboardStatus.test.ts`
- [ ] `tests/features/dashboard/ui/hooks/useFieldSyncWithBackend.test.tsx`

### UI Screens (4 files)

- [ ] `tests/features/dashboard/ui/ProjectDashboardScreen-actions.test.tsx`
- [ ] `tests/features/dashboard/ui/ProjectDashboardScreen-mesh.test.tsx`
- [ ] `tests/features/dashboard/ui/ProjectDashboardScreen-navigation.test.tsx`
- [ ] `tests/features/dashboard/ui/ProjectDashboardScreen-rendering.test.tsx`

### Commands (2 files)

- [ ] `tests/features/dashboard/commands/configure.test.ts`
- [ ] `tests/features/dashboard/commands/showDashboard.test.ts`

### Handlers (12 files)

- [ ] `tests/features/dashboard/handlers/dashboardHandlers-actions.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-deployMesh.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-lifecycle.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-openDevConsole.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-reAuthenticate.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-ready.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-requestStatus.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-toggles.test.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-unknownDeployed.test.ts`
- [ ] `tests/features/dashboard/handlers/meshStatusHelpers.test.ts`
- [ ] `tests/features/dashboard/handlers/navigateBack.test.ts`

### Services (1 file)

- [ ] `tests/features/dashboard/services/dashboardStatusService.test.ts`

---

## Audit Checklist Per File

### 1. Dashboard State Structure

```typescript
// VERIFY: Dashboard state matches current type
// Check src/features/dashboard/types.ts

// Example: DashboardState
interface DashboardState {
  project: ProjectInfo;
  status: DemoStatus;
  meshStatus: MeshStatus;
  // Verify all fields
}
```

### 2. Handler Response Shapes

```typescript
// VERIFY: Handler responses match current implementation
// Check src/features/dashboard/handlers/

// Example: requestStatus handler
expect(result).toEqual({
  success: true,
  data: {
    running: boolean,
    meshStatus: 'deployed' | 'stale' | '...',
    // Verify all fields
  }
});
```

### 3. Action Types

```typescript
// VERIFY: Dashboard actions match current definitions
// Check src/features/dashboard/types.ts

// Example: Dashboard actions
const actions = [
  'start',
  'stop',
  'configure',
  'deployMesh',
  'openDevConsole',
  'showLogs',
  // Verify all action types
];
```

### 4. Configure Screen Fields

```typescript
// VERIFY: Configure field tests match current component config
// Check templates/components.json for configFields

// Example: Config field rendering
const field = {
  name: 'commerceUrl',
  type: 'text',
  label: 'Commerce URL',
  // Verify field structure
};
```

### 5. Mesh Status Integration

```typescript
// VERIFY: Mesh status tests match current mesh integration
// Check src/features/dashboard/handlers/meshStatusHelpers.ts

// Key areas:
// - Mesh status polling
// - Status display mapping
// - Staleness handling
```

### 6. Lifecycle Actions

```typescript
// VERIFY: Start/stop action tests match current lifecycle
// Check src/features/dashboard/handlers/

// Example: Start handler
expect(startHandler).toHaveBeenCalledWith({
  projectPath: '/path/to/project',
  // Verify parameters
});
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/dashboard/types.ts` | Type definitions |
| `src/features/dashboard/handlers/` | Handler implementations |
| `src/features/dashboard/ui/` | UI components |
| `src/features/dashboard/services/` | Services |
| `templates/components.json` | Config field definitions |

---

## Common Issues to Look For

### Issue 1: Outdated Status Values

```typescript
// OLD: String literals
expect(status).toBe('running');

// CURRENT: May use enum/constants
expect(status).toBe(DemoStatus.RUNNING);
```

### Issue 2: Changed Handler Parameters

```typescript
// OLD: Direct parameters
await handler.start(projectPath);

// CURRENT: Context object (verify)
await handler.start({ context, projectPath, logger });
```

### Issue 3: Configure Field Updates

```typescript
// OLD: Direct field access
field.value = 'new value';

// CURRENT: May use setter/callback
onFieldChange(field.name, 'new value');
```

### Issue 4: Mesh Status Shape

```typescript
// OLD: Simple status string
const meshStatus = 'deployed';

// CURRENT: May include additional info
const meshStatus = {
  status: 'deployed',
  isStale: false,
  url: 'https://...',
};
```

---

## Expected Outcomes

After auditing all 28 dashboard test files:

- [ ] All dashboard state tests match current types
- [ ] All handler tests match current response shapes
- [ ] All action tests use current action types
- [ ] All configure tests match current field structure
- [ ] All mesh integration tests match current logic
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 28 dashboard test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] Handler responses match current implementation
- [ ] Action types match current definitions
- [ ] Configure fields match component config
- [ ] All dashboard tests pass
- [ ] No hardcoded values (timeouts use TIMEOUTS.*)
- [ ] No version-specific logic remains

---

## Notes

- Dashboard tests integrate with multiple features (auth, mesh, lifecycle)
- Watch for cross-feature mock consistency
- Configure screen uses component definitions - verify match
- Mesh status integration should match mesh feature

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
