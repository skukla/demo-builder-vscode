# Step 7: Remaining Features and Core

## Purpose

Refactor logging in remaining areas: lifecycle, updates, core, commands, utils.

## Prerequisites

- Step 6 complete (dashboard refactored)

## Tests to Write First

### Test: Verify All Tests Still Pass

```bash
npm run test:fast
```

### Test: Grep Verification After Changes

```bash
# Should return very few results - only true user milestones
grep -rn "logger\.info.*\[" src/ --include="*.ts"
```

## Implementation

### Files to Modify

#### Lifecycle Feature
1. **`src/features/lifecycle/handlers/lifecycleHandlers.ts`** (12 info → review)
2. **`src/features/lifecycle/commands/startDemo.ts`** (7 info → review)

#### Updates Feature
3. **`src/features/updates/services/componentUpdater.ts`** (7 info → review)
4. **`src/features/updates/services/extensionUpdater.ts`** (6 info → review)
5. **`src/features/updates/commands/checkUpdates.ts`** (6 info → review)

#### Core
6. **`src/core/logging/stepLogger.ts`** (2 info → review)
7. **`src/core/utils/progressUnifier.ts`** (3 info → review)
8. **`src/core/vscode/envFileWatcherService.ts`** (2 info → review)
9. **`src/core/shell/environmentSetup.ts`** (2 info → review)

#### Commands
10. **`src/commands/commandManager.ts`** (5 info → review)
11. **`src/extension.ts`** (6 info → review carefully - some are startup messages)

#### Utils
12. **`src/utils/autoUpdater.ts`** (5 info → review)

#### Other Features
13. **`src/features/welcome/commands/showWelcome.ts`** (2 info → review)
14. **`src/features/components/services/componentManager.ts`** (1 info → review)

## Special Considerations

### Extension Startup (`extension.ts`)
Some startup messages should remain as `info()`:
- `Adobe Demo Builder v${version} starting...` - keep as `info()` (user milestone)
- Technical initialization details → `debug()`

### Lifecycle Commands
- `Demo started` - keep as `info()` (user milestone)
- `Demo stopped` - keep as `info()` (user milestone)
- Port/process details → `debug()`

### Updates
- `Update available: v${version}` - keep as `info()` (user should see)
- `Installing update...` - keep as `info()` (user should see)
- Download progress details → `debug()`

## Categorization Logic

Apply same rules:
```typescript
// KEEP as info() - user milestones
logger.info('Adobe Demo Builder v1.0.0 starting...');
logger.info('Demo started on port 3000');
logger.info('Update available: v1.1.0');

// CHANGE to debug() - technical details
logger.debug('[Lifecycle] Checking for running processes...');
logger.debug('[ComponentManager] Loading component definitions');
logger.debug('[Update] Downloading from GitHub releases...');
```

## Expected Outcome

- All remaining features use `debug()` for technical flow
- Extension startup shows only version info
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast` passes (full test suite)
- [ ] Technical flow messages changed to `debug()`
- [ ] User milestones preserved as `info()`
- [ ] Extension startup message remains as `info()`
