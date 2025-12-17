# Step 4: Authentication Feature

## Purpose

Refactor logging in the authentication feature - ~15 `info()` calls with `[Component]` prefix.

## Prerequisites

- Step 3 complete (mesh refactored)

## Tests to Write First

### Test: Verify Authentication Tests Still Pass

```bash
npm run test:fast -- tests/features/authentication/
```

### Test: Grep Verification After Changes

```bash
grep -n "logger\.info.*\[" src/features/authentication/ --include="*.ts" -r
```

## Implementation

### Files to Modify

1. **`src/features/authentication/handlers/authenticationHandlers.ts`** (13 info → ~11 debug)

   **Change to `debug()`**:
   - `[Adobe Setup] Selecting organization...`
   - `[Adobe Setup] Organization selected: ${orgId}`
   - `[Adobe Setup] Loading projects...`
   - `[Adobe Setup] Project selected: ${projectId}`
   - `[Adobe Setup] Loading workspaces...`
   - `[Adobe Setup] Workspace selected: ${workspaceId}`
   - `[Auth] Token-only check completed in Xms`
   - All SDK call details and timing

   **Keep as `info()`**:
   - `Authentication successful` (no prefix - user milestone)
   - `Authentication failed` (user should see this)

2. **`src/features/authentication/handlers/projectHandlers.ts`** (4 info → ~4 debug)

3. **`src/features/authentication/services/authenticationService.ts`** (1 info → ~1 debug)

4. **`src/features/authentication/services/adobeEntityService.ts`** (1 info → ~1 debug)

## Categorization Logic

```typescript
// KEEP as info() - user milestone (no component prefix)
logger.info('Authentication successful');
logger.info('Please complete authentication in browser');

// CHANGE to debug() - technical detail
logger.debug('[Adobe Setup] Selecting organization...');
logger.debug('[Adobe Setup] Organization selected: 3397333');
logger.debug('[Auth] Token-only check completed in 2519ms: false');
```

## Expected Outcome

- Authentication feature uses `debug()` for technical flow
- User sees only auth success/failure and prompts
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast -- tests/features/authentication/` passes
- [ ] Selection/loading steps changed to `debug()`
- [ ] User-facing prompts and results preserved as `info()`
