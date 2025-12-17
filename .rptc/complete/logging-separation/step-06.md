# Step 6: Dashboard Feature

## Purpose

Refactor logging in the dashboard feature - ~10 `info()` calls with `[Component]` prefix.

## Prerequisites

- Step 5 complete (prerequisites refactored)

## Tests to Write First

### Test: Verify Dashboard Tests Still Pass

```bash
npm run test:fast -- tests/features/dashboard/
```

### Test: Grep Verification After Changes

```bash
grep -n "logger\.info.*\[" src/features/dashboard/ --include="*.ts" -r
```

## Implementation

### Files to Modify

1. **`src/features/dashboard/handlers/dashboardHandlers.ts`** (9 info → ~8 debug)

   **Change to `debug()`**:
   - `[Dashboard] Populated meshState.envVars`
   - `[Dashboard] Loading project data...`
   - `[Dashboard] Refreshing mesh status...`
   - State update details

   **Keep as `info()` if present**:
   - User-facing status changes

2. **`src/features/dashboard/commands/showDashboard.ts`** (1 info → review)

3. **`src/features/dashboard/commands/configure.ts`** (1 info → review)

## Categorization Logic

```typescript
// KEEP as info() - user action result
logger.info('Configuration saved');
logger.info('Dashboard opened');

// CHANGE to debug() - internal state
logger.debug('[Dashboard] Populated meshState.envVars');
logger.debug('[Dashboard] Loading project data...');
logger.debug('[Dashboard] Mesh status check complete');
```

## Expected Outcome

- Dashboard feature uses `debug()` for internal operations
- User sees only action results in Logs channel
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast -- tests/features/dashboard/` passes
- [ ] Internal operations changed to `debug()`
- [ ] User actions preserved as `info()`
