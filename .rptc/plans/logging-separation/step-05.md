# Step 5: Prerequisites Feature

## Purpose

Refactor logging in the prerequisites feature - ~7 `info()` calls with `[Component]` prefix.

## Prerequisites

- Step 4 complete (authentication refactored)

## Tests to Write First

### Test: Verify Prerequisites Tests Still Pass

```bash
npm run test:fast -- tests/features/prerequisites/
```

### Test: Grep Verification After Changes

```bash
grep -n "logger\.info.*\[" src/features/prerequisites/ --include="*.ts" -r
```

## Implementation

### Files to Modify

1. **`src/features/prerequisites/handlers/installHandler.ts`** (5 info → ~4 debug)

   **Change to `debug()`**:
   - `[Prerequisites] Installing ${tool}...`
   - `[Prerequisites] Installation command: ${cmd}`
   - `[Prerequisites] ${tool} installed successfully` (internal step)

   **Keep as `info()` if present**:
   - Final "All prerequisites installed" message

2. **`src/features/prerequisites/handlers/checkHandler.ts`** (2 debug already - verify correct)

3. **`src/features/prerequisites/handlers/continueHandler.ts`** (1 debug already)

4. **`src/features/prerequisites/handlers/shared.ts`** (2 debug already)

5. **`src/features/prerequisites/services/PrerequisitesManager.ts`** (12 debug already - good!)

6. **`src/features/prerequisites/services/prerequisitesCacheManager.ts`** (4 debug already)

## Categorization Logic

```typescript
// KEEP as info() - user milestone
logger.info('Prerequisites check complete - all installed');
logger.info('Missing prerequisites: Node.js, npm');

// CHANGE to debug() - technical detail
logger.debug('[Prerequisites] Checking Homebrew...');
logger.debug('[Prerequisites] Homebrew version: 5.0.3');
logger.debug('[Prerequisites] Installing Node.js via fnm...');
```

## Expected Outcome

- Prerequisites feature uses `debug()` for check/install details
- User sees only summary results in Logs channel
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast -- tests/features/prerequisites/` passes
- [ ] Installation steps changed to `debug()`
- [ ] Summary messages preserved as `info()`
