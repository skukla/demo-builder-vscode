# Step 1: Magic Timeout Constants (§1)

**Priority**: HIGH
**Violations**: 10
**Effort**: 45-60 minutes

---

## Objective

Centralize all magic timeout numbers by adding new constants to `timeoutConfig.ts` and updating usage sites.

---

## New Constants to Add

Add to `src/core/utils/timeoutConfig.ts`:

```typescript
// Auto-update system
AUTO_UPDATE_CHECK_INTERVAL: 4 * 60 * 60 * 1000,  // 4 hours - periodic update check
STARTUP_UPDATE_CHECK_DELAY: 10000,               // 10 seconds - delay at activation

// UI notification timing
STATUS_BAR_SUCCESS: 5000,                        // Success message duration
STATUS_BAR_INFO: 3000,                           // Info message duration
STATUS_BAR_UPDATE_INTERVAL: 5000,                // Status bar polling interval
NOTIFICATION_AUTO_DISMISS: 2000,                 // Progress notification auto-dismiss

// File watcher
PROGRAMMATIC_WRITE_CLEANUP: 5000,                // Auto-cleanup tracking timeout

// Project creation
PROJECT_OPEN_TRANSITION: 1500,                   // Transition delay before open
```

---

## Violations to Fix

### 1. src/utils/autoUpdater.ts:26
**Current**: `}, 4 * 60 * 60 * 1000);`
**Fix**: `}, TIMEOUTS.AUTO_UPDATE_CHECK_INTERVAL);`

### 2. src/extension.ts:283
**Current**: `}, 10000);`
**Fix**: `}, TIMEOUTS.STARTUP_UPDATE_CHECK_DELAY);`

### 3. src/core/base/baseCommand.ts:134
**Current**: `timeout = 5000`
**Fix**: `timeout = TIMEOUTS.STATUS_BAR_SUCCESS`

### 4. src/core/base/baseCommand.ts:137
**Current**: `2000`
**Fix**: `TIMEOUTS.NOTIFICATION_AUTO_DISMISS`

### 5. src/core/base/baseCommand.ts:148
**Current**: `duration = 2000`
**Fix**: `duration = TIMEOUTS.NOTIFICATION_AUTO_DISMISS`

### 6. src/core/base/baseCommand.ts:167
**Current**: `timeout = 3000`
**Fix**: `timeout = TIMEOUTS.STATUS_BAR_INFO`

### 7. src/core/vscode/StatusBarManager.ts:35
**Current**: `}, 5000);`
**Fix**: `}, TIMEOUTS.STATUS_BAR_UPDATE_INTERVAL);`

### 8. src/core/vscode/envFileWatcherService.ts:309
**Current**: `}, 5000);`
**Fix**: `}, TIMEOUTS.PROGRAMMATIC_WRITE_CLEANUP);`

### 9. src/features/project-creation/ui/steps/ProjectCreationStep.tsx:31
**Current**: `}, 1500);`
**Fix**: `}, TIMEOUTS.PROJECT_OPEN_TRANSITION);`

### 10. src/core/commands/ResetAllCommand.ts:131
**Current**: `3000`
**Fix**: `TIMEOUTS.STATUS_BAR_INFO`

---

## TDD Approach

### RED Phase
Add tests to `tests/core/utils/timeoutConfig.test.ts`:

```typescript
describe('UI notification timeouts', () => {
    it('should have STATUS_BAR_SUCCESS timeout', () => {
        expect(TIMEOUTS.STATUS_BAR_SUCCESS).toBe(5000);
    });

    it('should have STATUS_BAR_INFO timeout', () => {
        expect(TIMEOUTS.STATUS_BAR_INFO).toBe(3000);
    });

    it('should have NOTIFICATION_AUTO_DISMISS timeout', () => {
        expect(TIMEOUTS.NOTIFICATION_AUTO_DISMISS).toBe(2000);
    });

    it('should have STATUS_BAR_UPDATE_INTERVAL timeout', () => {
        expect(TIMEOUTS.STATUS_BAR_UPDATE_INTERVAL).toBe(5000);
    });
});

describe('Auto-update timeouts', () => {
    it('should have AUTO_UPDATE_CHECK_INTERVAL (4 hours)', () => {
        expect(TIMEOUTS.AUTO_UPDATE_CHECK_INTERVAL).toBe(4 * 60 * 60 * 1000);
    });

    it('should have STARTUP_UPDATE_CHECK_DELAY timeout', () => {
        expect(TIMEOUTS.STARTUP_UPDATE_CHECK_DELAY).toBe(10000);
    });
});

describe('File watcher timeouts', () => {
    it('should have PROGRAMMATIC_WRITE_CLEANUP timeout', () => {
        expect(TIMEOUTS.PROGRAMMATIC_WRITE_CLEANUP).toBe(5000);
    });
});

describe('Project creation timeouts', () => {
    it('should have PROJECT_OPEN_TRANSITION timeout', () => {
        expect(TIMEOUTS.PROJECT_OPEN_TRANSITION).toBe(1500);
    });
});
```

### GREEN Phase
1. Add constants to `timeoutConfig.ts`
2. Update each usage site with import and constant reference

### REFACTOR Phase
1. Run full test suite
2. Verify no behavioral changes
3. Update SOP reference table if needed

---

## Verification

```bash
# Run tests for timeout config
npm run test:fast -- tests/core/utils/timeoutConfig.test.ts

# Verify no magic numbers remain
grep -E "setTimeout\(.*, [0-9]+" src/utils/autoUpdater.ts
grep -E "setTimeout\(.*, [0-9]+" src/extension.ts
# ... etc for each file
```

---

## Files Modified

1. `src/core/utils/timeoutConfig.ts` - Add 8 new constants
2. `src/utils/autoUpdater.ts` - Update 1 usage
3. `src/extension.ts` - Update 1 usage
4. `src/core/base/baseCommand.ts` - Update 4 usages
5. `src/core/vscode/StatusBarManager.ts` - Update 1 usage
6. `src/core/vscode/envFileWatcherService.ts` - Update 1 usage
7. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Update 1 usage
8. `src/core/commands/ResetAllCommand.ts` - Update 1 usage
9. `tests/core/utils/timeoutConfig.test.ts` - Add tests
