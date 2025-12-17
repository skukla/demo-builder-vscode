# Step 3: Mesh Feature

## Purpose

Refactor logging in the mesh feature - second highest impact with ~36 `info()` calls with `[Component]` prefix.

## Prerequisites

- Step 2 complete (project-creation refactored)

## Tests to Write First

### Test: Verify Mesh Tests Still Pass

```bash
npm run test:fast -- tests/features/mesh/
```

### Test: Grep Verification After Changes

```bash
# After changes, verify only milestone messages remain
grep -n "logger\.info.*\[" src/features/mesh/ --include="*.ts" -r
```

## Implementation

### Files to Modify

1. **`src/features/mesh/handlers/checkHandler.ts`** (10 info → ~9 debug)

   **Change to `debug()`**:
   - `[API Mesh] Checking API Mesh availability for workspace`
   - `[API Mesh] Layer 1: Downloading workspace configuration`
   - `[API Mesh] API Mesh API is enabled (confirmed via workspace config)`
   - `[API Mesh] Layer 2: Checking for existing mesh`
   - `[API Mesh] API enabled, no mesh exists yet`
   - `[API Mesh] Existing mesh found and deployed`
   - `[API Mesh] Mesh exists but is still provisioning`
   - `[API Mesh] Layer 2 (fallback): Checking API status and mesh`
   - `[API Mesh] API enabled, no mesh exists yet (fallback check)`
   - `[API Mesh] Existing mesh found (fallback check)`

2. **`src/features/mesh/handlers/createHandler.ts`** (9 info → ~8 debug)

   **Change to `debug()`**:
   - Layer/step progress messages
   - Configuration details
   - Status checks

   **Keep as `info()` if present**:
   - Final deployment success messages

3. **`src/features/mesh/handlers/createHandlerHelpers.ts`** (3 info → ~3 debug)

4. **`src/features/mesh/handlers/deleteHandler.ts`** (2 info → ~2 debug)

5. **`src/features/mesh/services/meshDeployment.ts`** (3 info → ~2 debug)

6. **`src/features/mesh/services/meshEndpoint.ts`** (2 info → ~2 debug)

7. **`src/features/mesh/services/stalenessDetector.ts`** (3 info → ~3 debug)

8. **`src/features/mesh/commands/deployMesh.ts`** (7 info → review)
   - Keep deployment success/failure as `info()`
   - Change technical steps to `debug()`

## Categorization Logic

```typescript
// KEEP as info() - user milestone
logger.info('Mesh deployed successfully');
logger.info('Mesh deployment failed: ${error}');

// CHANGE to debug() - technical detail
logger.debug('[API Mesh] Layer 1: Downloading workspace configuration');
logger.debug('[API Mesh] Checking API Mesh availability for workspace');
logger.debug('[Mesh Verification] Attempt 1/10 (20s elapsed)');
logger.debug('[Mesh Verification] Status: building');
```

## Expected Outcome

- Mesh feature uses `debug()` for technical flow
- User sees only deployment success/failure in Logs channel
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast -- tests/features/mesh/` passes
- [ ] Technical flow messages changed to `debug()`
- [ ] Milestone messages preserved as `info()`
- [ ] Verification status/attempt messages are `debug()`
