# Step 3: Mesh Feature Tests (44 files)

> **Phase:** 3 - Feature Tests
> **Step:** 3 of 9
> **Feature:** mesh
> **Test Files:** 44
> **Estimated Time:** 4-5 hours

---

## Purpose

Audit all 44 mesh test files to ensure tests accurately reflect the current API Mesh deployment, verification, and staleness detection logic. Mesh is critical for Adobe Commerce integration.

---

## Prerequisites

- [ ] Steps 1-2 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current mesh implementation structure

---

## Test Files to Audit

### UI Steps (11 files)

- [ ] `tests/features/mesh/ui/steps/ApiMeshStep-configuration.test.tsx`
- [ ] `tests/features/mesh/ui/steps/ApiMeshStep-deployment.test.tsx`
- [ ] `tests/features/mesh/ui/steps/ApiMeshStep-display.test.tsx`
- [ ] `tests/features/mesh/ui/steps/ApiMeshStep-errors.test.tsx`
- [ ] `tests/features/mesh/ui/steps/MeshDeploymentStep.test.tsx`
- [ ] `tests/features/mesh/ui/steps/meshDeploymentPredicates.test.ts`
- [ ] `tests/features/mesh/ui/steps/meshDeploymentTypes.test.ts`
- [ ] `tests/features/mesh/ui/steps/useMeshDeployment.test.tsx`

### UI Step Components (3 files)

- [ ] `tests/features/mesh/ui/steps/components/MeshErrorDialog-errorCodes.test.tsx`
- [ ] `tests/features/mesh/ui/steps/components/MeshErrorDialog.test.tsx`
- [ ] `tests/features/mesh/ui/steps/components/MeshStatusDisplay.test.tsx`

### UI Hooks (2 files)

- [ ] `tests/features/mesh/ui/hooks/useMeshOperations-errorCodes.test.tsx`
- [ ] `tests/features/mesh/ui/hooks/useMeshStatus.test.tsx`

### Utils (2 files)

- [ ] `tests/features/mesh/utils/errorFormatter.test.ts`
- [ ] `tests/features/mesh/utils/meshHelpers.test.ts`

### Handlers (8 files)

- [ ] `tests/features/mesh/handlers/checkHandler-apiMeshEnabled.test.ts`
- [ ] `tests/features/mesh/handlers/checkHandler-fallbackCheck.test.ts`
- [ ] `tests/features/mesh/handlers/checkHandler-meshExistence.test.ts`
- [ ] `tests/features/mesh/handlers/checkHandler.test.ts`
- [ ] `tests/features/mesh/handlers/createHandler-meshAlreadyExists.test.ts`
- [ ] `tests/features/mesh/handlers/createHandler-progressCallback.test.ts`
- [ ] `tests/features/mesh/handlers/createHandler.test.ts`
- [ ] `tests/features/mesh/handlers/shared.test.ts`

### Services (18 files)

- [ ] `tests/features/mesh/services/meshDeployer-config.test.ts`
- [ ] `tests/features/mesh/services/meshDeployer-deletion.test.ts`
- [ ] `tests/features/mesh/services/meshDeployer-deployment.test.ts`
- [ ] `tests/features/mesh/services/meshDeployer-errors.test.ts`
- [ ] `tests/features/mesh/services/meshDeployer-update.test.ts`
- [ ] `tests/features/mesh/services/meshDeployment-errors.test.ts`
- [ ] `tests/features/mesh/services/meshDeployment-operations.test.ts`
- [ ] `tests/features/mesh/services/meshDeployment-progress.test.ts`
- [ ] `tests/features/mesh/services/meshDeploymentVerifier-deployment.test.ts`
- [ ] `tests/features/mesh/services/meshDeploymentVerifier-edge-cases.test.ts`
- [ ] `tests/features/mesh/services/meshDeploymentVerifier-errors.test.ts`
- [ ] `tests/features/mesh/services/meshDeploymentVerifier-status.test.ts`
- [ ] `tests/features/mesh/services/meshEndpoint.test.ts`
- [ ] `tests/features/mesh/services/meshVerifier-di.test.ts`
- [ ] `tests/features/mesh/services/meshVerifier.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-di.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-edgeCases.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-fileComparison.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-hashCalculation.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-initialization.test.ts`
- [ ] `tests/features/mesh/services/stalenessDetector-stateDetection.test.ts`

---

## Audit Checklist Per File

### 1. Mesh Status Types

```typescript
// VERIFY: Mesh status types match current definitions
// Check src/features/mesh/types.ts

// Example: MeshStatus enum/type
type MeshStatus =
  | 'not-deployed'
  | 'deployed'
  | 'stale'
  | 'checking'
  | 'deploying'
  | 'error';
// Verify all status values still exist
```

### 2. Staleness Detection Logic

```typescript
// VERIFY: Staleness tests match current detection algorithm
// Check src/features/mesh/services/stalenessDetector.ts

// Key areas:
// - Hash calculation method
// - File comparison logic
// - Local vs deployed config comparison
// - Change detection triggers
```

### 3. Deployment Flow

```typescript
// VERIFY: Deployment tests match current flow
// Check src/features/mesh/services/meshDeployer.ts

// Example: Deployment steps
const deploymentSteps = [
  'preparing',
  'authenticating',
  'uploading',
  'verifying',
  'complete'
];
// Verify steps match current implementation
```

### 4. Error Handling

```typescript
// VERIFY: Error codes match current definitions
// Check src/features/mesh/types.ts or error definitions

// Example: Error codes
const meshErrorCodes = {
  MESH_NOT_FOUND: 'MESH_NOT_FOUND',
  DEPLOY_FAILED: 'DEPLOY_FAILED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  // Verify all codes exist
};
```

### 5. Mesh Configuration Structure

```typescript
// VERIFY: Mesh config shape matches current schema
// Check templates/components.json mesh section

// Example: Mesh config
const meshConfig = {
  sources: [...],
  transforms: [...],
  // Verify structure matches current schema
};
```

### 6. Handler Response Shapes

```typescript
// VERIFY: Handler responses match current implementation
// Check src/features/mesh/handlers/

// Example: checkMesh handler response
expect(result).toEqual({
  success: true,
  data: {
    status: 'deployed',
    isStale: false,
    meshUrl: 'https://...',
    // Verify all fields
  }
});
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/mesh/types.ts` | Type definitions |
| `src/features/mesh/handlers/` | Handler implementations |
| `src/features/mesh/services/` | Service implementations |
| `src/features/mesh/ui/` | UI components and hooks |
| `templates/components.json` | Mesh component definition |
| `src/utils/meshManager.ts` | Legacy mesh utilities (if exists) |

---

## Common Issues to Look For

### Issue 1: Outdated Status Values

```typescript
// OLD: Might use string literals
expect(status).toBe('deployed');

// CURRENT: May use enum or constants
expect(status).toBe(MeshStatus.DEPLOYED);
// Verify status constants/enums
```

### Issue 2: Changed Staleness Detection

```typescript
// OLD: Simple timestamp comparison
const isStale = localTimestamp > deployedTimestamp;

// CURRENT: Hash-based comparison (verify)
const isStale = localHash !== deployedHash;
```

### Issue 3: Deployment Progress Shape

```typescript
// OLD: Simple progress number
onProgress(50);

// CURRENT: May use structured progress
onProgress({ step: 'uploading', percent: 50, message: '...' });
```

### Issue 4: Error Dialog Props

```typescript
// OLD: Simple error message
<MeshErrorDialog error="Failed" />

// CURRENT: Structured error object
<MeshErrorDialog error={{ code: 'DEPLOY_FAILED', message: '...', details: {} }} />
```

---

## Expected Outcomes

After auditing all 44 mesh test files:

- [ ] All mesh status tests use current status types
- [ ] All staleness detection tests match current algorithm
- [ ] All deployment tests match current flow and progress
- [ ] All error handling tests use current error codes
- [ ] All handler tests match current response shapes
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 44 mesh test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] Status types match current definitions
- [ ] Staleness logic tests match current algorithm
- [ ] Error codes match current implementation
- [ ] All mesh tests pass
- [ ] No hardcoded values (timeouts use TIMEOUTS.*)
- [ ] No version-specific logic remains

---

## Notes

- Mesh tests are critical for Adobe Commerce integration
- Staleness detection is complex - verify hash/comparison logic carefully
- Error handling is user-facing - verify error messages are current
- Watch for integration with authentication context

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
