# Step 4: Timeout Configuration Simplification

## Purpose

Consolidate 70+ named timeout constants (176 lines, 231 usages across 101 files) to 5-7 semantic categories. Most values are never tuned or changed after initial definition. The current pattern creates unnecessary coupling: every caller must import and know the specific constant name.

**Why This Matters:** The current approach violates the Rule of Three - each timeout was extracted to a named constant on first use, not after 3+ uses proved the need. This creates cognitive overhead (which constant do I use?) and maintenance burden (50+ constants to understand).

## Current State Analysis

### Problem: Over-Specified Constants

```typescript
// Current: 70+ named constants (176 lines)
export const TIMEOUTS = {
    CONFIG_READ: 5000,              // 5s - one usage
    TOKEN_READ: 10000,              // 10s - one usage
    CONFIG_WRITE: 20000,            // 20s - 7 usages
    API_CALL: 10000,                // 10s - 5 usages
    ORG_LIST: 30000,                // 30s - one usage
    PROJECT_LIST: 30000,            // 30s - one usage (identical to ORG_LIST!)
    WORKSPACE_LIST: 30000,          // 30s - one usage (identical!)
    PROJECT_DETAILS: 30000,         // 30s - one usage (identical!)
    WORKSPACE_DETAILS: 30000,       // 30s - one usage (identical!)
    // ... 60+ more constants
};
```

### Root Cause: Premature Abstraction

- **Observation:** 5 constants (ORG_LIST, PROJECT_LIST, WORKSPACE_LIST, PROJECT_DETAILS, WORKSPACE_DETAILS) all = 30000ms
- **Pattern:** Each was named on first use rather than using a semantic category
- **Cost:** Every new timeout operation requires a new constant name

### Target State

```typescript
// Target: 7 semantic categories + optional overrides
export const TIMEOUTS = {
    // Core operation categories
    QUICK: 5000,        // <5s: Config reads, shell checks, fast operations
    NORMAL: 30000,      // <30s: API calls, data loading, standard operations
    LONG: 180000,       // <3min: Installations, mesh operations, builds
    VERY_LONG: 300000,  // <5min: Large npm installs, component downloads
    EXTENDED: 600000,   // <10min: Data ingestion, full workflows

    // UI-specific (must stay granular - CSS-coupled)
    UI: {
        ANIMATION: 150,         // CSS animation duration
        UPDATE_DELAY: 100,      // State settling
        TRANSITION: 300,        // Step transitions (matches CSS)
        NOTIFICATION: 2000,     // User-visible messages
        MIN_LOADING: 1500,      // Prevent flash-of-content
    },

    // Polling/retry (backoff algorithms need these)
    POLL: {
        INITIAL: 500,           // Starting delay
        MAX: 5000,              // Maximum backoff
        INTERVAL: 1000,         // Standard poll interval
    },
};
```

## Prerequisites

- [ ] Steps 1-3 complete (no dependency, but order follows plan)
- [ ] All 267 tests passing before starting
- [ ] Understand which timeouts are used in multiple places (CONFIG_WRITE: 7, API_CALL: 5)

## Tests to Write First (RED Phase)

### Test Scenario 1: Category Coverage

**Given:** The simplified TIMEOUTS constant
**When:** Each category is accessed
**Then:** All 7 categories exist with correct types

```typescript
// tests/core/utils/timeoutConfig.test.ts
describe('Timeout Configuration - Simplified', () => {
  it('should have core operation categories', () => {
    expect(TIMEOUTS.QUICK).toBe(5000);
    expect(TIMEOUTS.NORMAL).toBe(30000);
    expect(TIMEOUTS.LONG).toBe(180000);
    expect(TIMEOUTS.VERY_LONG).toBe(300000);
    expect(TIMEOUTS.EXTENDED).toBe(600000);
  });

  it('should have UI timing constants', () => {
    expect(TIMEOUTS.UI.ANIMATION).toBe(150);
    expect(TIMEOUTS.UI.UPDATE_DELAY).toBe(100);
    expect(TIMEOUTS.UI.TRANSITION).toBe(300);
    expect(TIMEOUTS.UI.NOTIFICATION).toBe(2000);
    expect(TIMEOUTS.UI.MIN_LOADING).toBe(1500);
  });

  it('should have polling constants', () => {
    expect(TIMEOUTS.POLL.INITIAL).toBe(500);
    expect(TIMEOUTS.POLL.MAX).toBe(5000);
    expect(TIMEOUTS.POLL.INTERVAL).toBe(1000);
  });
});
```

### Test Scenario 2: Backward Compatibility Aliases

**Given:** Existing code uses old constant names
**When:** Old names are accessed
**Then:** They resolve to appropriate category values (deprecation period)

```typescript
describe('Backward Compatibility Aliases', () => {
  it('should provide deprecated aliases for migration period', () => {
    // These will be removed in future version
    expect(TIMEOUTS.CONFIG_READ).toBe(TIMEOUTS.QUICK);
    expect(TIMEOUTS.API_CALL).toBe(TIMEOUTS.NORMAL);
    expect(TIMEOUTS.PROJECT_LIST).toBe(TIMEOUTS.NORMAL);
    expect(TIMEOUTS.API_MESH_CREATE).toBe(TIMEOUTS.LONG);
    expect(TIMEOUTS.COMPONENT_INSTALL).toBe(TIMEOUTS.VERY_LONG);
    expect(TIMEOUTS.DATA_INGESTION).toBe(TIMEOUTS.EXTENDED);
  });
});
```

### Test Scenario 3: Frontend Timeout Sync

**Given:** Frontend must mirror backend timeouts
**When:** Comparing FRONTEND_TIMEOUTS to TIMEOUTS.UI
**Then:** Values match exactly

```typescript
// tests/core/ui/utils/frontendTimeouts.test.ts
describe('Frontend Timeout Sync', () => {
  it('should match backend UI timeouts', () => {
    expect(FRONTEND_TIMEOUTS.SCROLL_ANIMATION).toBe(TIMEOUTS.UI.ANIMATION);
    expect(FRONTEND_TIMEOUTS.UI_UPDATE_DELAY).toBe(TIMEOUTS.UI.UPDATE_DELAY);
    expect(FRONTEND_TIMEOUTS.LOADING_MIN_DISPLAY).toBe(TIMEOUTS.UI.MIN_LOADING);
  });
});
```

### Test Scenario 4: Type Safety

**Given:** The TIMEOUTS constant
**When:** Accessing unknown property
**Then:** TypeScript compilation fails

```typescript
describe('Type Safety', () => {
  it('should have readonly properties', () => {
    // @ts-expect-error - TIMEOUTS is readonly
    TIMEOUTS.QUICK = 999;
  });

  it('should prevent unknown property access', () => {
    // @ts-expect-error - UNKNOWN_TIMEOUT does not exist
    const x = TIMEOUTS.UNKNOWN_TIMEOUT;
  });
});
```

## Files to Modify

### Primary Changes

- [ ] `src/core/utils/timeoutConfig.ts` - Simplify from 176 lines to ~50 lines
- [ ] `src/core/ui/utils/frontendTimeouts.ts` - Update to reference new structure

### Migration (231 usages across 101 files)

See **Migration Strategy** section below for file-by-file mapping.

## Implementation Details

### RED Phase

1. Create new test file `tests/core/utils/timeoutConfig.test.ts`
2. Write tests for simplified structure (scenarios 1-4 above)
3. Tests will fail (current structure doesn't match)

### GREEN Phase

**Step 1: Define New Structure**

```typescript
// src/core/utils/timeoutConfig.ts

/**
 * Centralized timeout configuration - Simplified
 *
 * PHILOSOPHY: Use semantic categories, not operation-specific names.
 * Most operations fit into a small set of timeout buckets.
 *
 * USAGE:
 * - QUICK: Fast checks, config reads, shell commands
 * - NORMAL: Standard API calls, data fetching
 * - LONG: Installations, builds, complex operations
 * - VERY_LONG: Large downloads, full npm installs
 * - EXTENDED: Data ingestion, complete workflows
 *
 * OVERRIDE: Pass explicit timeout when operation truly differs:
 *   await execute('aio', args, { timeout: 60000 }); // 60s for auth flow
 */

export const TIMEOUTS = {
    // === Core Operation Categories ===
    QUICK: 5000,        // 5 seconds
    NORMAL: 30000,      // 30 seconds
    LONG: 180000,       // 3 minutes
    VERY_LONG: 300000,  // 5 minutes
    EXTENDED: 600000,   // 10 minutes

    // === UI Timing (CSS-coupled, must be granular) ===
    UI: {
        ANIMATION: 150,         // Scroll/transition animations
        UPDATE_DELAY: 100,      // State settling before DOM ops
        TRANSITION: 300,        // Step transitions (matches CSS)
        NOTIFICATION: 2000,     // User-visible notifications
        MIN_LOADING: 1500,      // Prevent flash-of-content
        FOCUS_FALLBACK: 1000,   // MutationObserver fallback
    },

    // === Polling/Retry (algorithm-specific) ===
    POLL: {
        INITIAL: 500,           // Initial delay before first poll
        MAX: 5000,              // Maximum backoff delay
        INTERVAL: 1000,         // Standard polling interval
        PROCESS_CHECK: 100,     // Tight polling for process exit
    },

    // === Auth-specific (browser interaction) ===
    AUTH: {
        BROWSER: 60000,         // Browser auth flow
        OAUTH: 120000,          // Full OAuth with callback
    },

    // === Backward Compatibility Aliases (DEPRECATED - remove in v2.0) ===
    // These map old names to new categories for gradual migration
    /** @deprecated Use TIMEOUTS.QUICK */
    CONFIG_READ: 5000,
    /** @deprecated Use TIMEOUTS.QUICK */
    TOKEN_READ: 10000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    CONFIG_WRITE: 20000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    API_CALL: 10000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    ORG_LIST: 30000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    PROJECT_LIST: 30000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    WORKSPACE_LIST: 30000,
    /** @deprecated Use TIMEOUTS.NORMAL */
    COMMAND_DEFAULT: 30000,
    /** @deprecated Use TIMEOUTS.AUTH.BROWSER */
    BROWSER_AUTH: 60000,
    /** @deprecated Use TIMEOUTS.AUTH.OAUTH */
    OAUTH_FLOW: 120000,
    /** @deprecated Use TIMEOUTS.LONG */
    API_MESH_CREATE: 180000,
    /** @deprecated Use TIMEOUTS.LONG */
    API_MESH_UPDATE: 120000,
    /** @deprecated Use TIMEOUTS.LONG */
    MESH_DEPLOY_TOTAL: 180000,
    /** @deprecated Use TIMEOUTS.VERY_LONG */
    COMPONENT_INSTALL: 300000,
    /** @deprecated Use TIMEOUTS.VERY_LONG */
    NPM_INSTALL: 300000,
    /** @deprecated Use TIMEOUTS.EXTENDED */
    DATA_INGESTION: 600000,
    /** @deprecated Use TIMEOUTS.EXTENDED */
    PROJECT_CREATION_OVERALL: 1800000,
} as const;

/**
 * Cache TTL configurations (separate concern from operation timeouts)
 */
export const CACHE_TTL = {
    SHORT: 60000,       // 1 minute - frequently changing data
    MEDIUM: 300000,     // 5 minutes - auth, validation
    LONG: 3600000,      // 1 hour - rarely changing data
} as const;
```

**Step 2: Update Frontend Timeouts**

```typescript
// src/core/ui/utils/frontendTimeouts.ts
export const FRONTEND_TIMEOUTS = {
    SCROLL_ANIMATION: 150,      // = TIMEOUTS.UI.ANIMATION
    UI_UPDATE_DELAY: 100,       // = TIMEOUTS.UI.UPDATE_DELAY
    UI_DEBOUNCE: 100,           // = TIMEOUTS.UI.UPDATE_DELAY
    CONTINUE_CHECK_DELAY: 500,  // = TIMEOUTS.POLL.INITIAL
    SCROLL_SETTLE: 200,         // Slightly > ANIMATION
    MICROTASK_DEFER: 0,
    LOADING_MIN_DISPLAY: 1500,  // = TIMEOUTS.UI.MIN_LOADING
    DOUBLE_CLICK_PREVENTION: 1000,
    COMPONENT_DEBOUNCE: 500,
} as const;
```

**Step 3: Migrate Usages (Prioritized by Count)**

### REFACTOR Phase

1. Remove deprecated aliases after all usages migrated
2. Simplify CACHE_TTL to 3 categories
3. Add JSDoc with usage guidance
4. Update documentation to reference new structure

## Migration Strategy

### Priority 1: High-Usage Constants (7+ usages)

These constants are used frequently and should be migrated first:

| Old Constant | Usages | New Value | Files |
|--------------|--------|-----------|-------|
| `CONFIG_WRITE` | 7 | `TIMEOUTS.NORMAL` | webviewCommunicationManager, entitySelector, etc. |
| `API_CALL` | 5 | `TIMEOUTS.NORMAL` | meshHandlers, organizationOps, etc. |
| `COMMAND_DEFAULT` | 4 | `TIMEOUTS.NORMAL` | commandExecutor, pollingService, etc. |

### Priority 2: Medium-Usage Constants (3-6 usages)

| Old Constant | Usages | New Value | Files |
|--------------|--------|-----------|-------|
| `STATUS_BAR_*` | 5 | `TIMEOUTS.UI.NOTIFICATION` | baseCommand, StatusBarManager |
| `PREREQUISITE_*` | 6 | `TIMEOUTS.QUICK` / `TIMEOUTS.LONG` | PrerequisitesManager, handlers |
| `MESH_*` | 6 | `TIMEOUTS.LONG` | meshDeployment, meshVerifier |

### Priority 3: Low-Usage Constants (1-2 usages)

These 50+ constants have 1-2 usages each. They should use:
- The semantic category that fits their duration
- OR inline values if truly unique (browser auth = 60s)

### Migration by Category

**Category: QUICK (5s) - 15 constants collapsed**

```
CONFIG_READ, SDK_INIT, QUICK_SHELL, PREREQUISITE_CHECK, PORT_CHECK,
FILE_WATCH_INITIAL, FILE_WATCH_MAX, UI_UPDATE_DELAY, SCROLL_ANIMATION,
WEBVIEW_INIT_DELAY, FILE_RETRY_INITIAL, FILE_RETRY_MAX, PROJECT_STATE_PERSIST_DELAY,
POLL_INITIAL_DELAY, TOKEN_RETRY_BASE
```

**Category: NORMAL (30s) - 20 constants collapsed**

```
TOKEN_READ, CONFIG_WRITE, API_CALL, ORG_LIST, PROJECT_LIST, WORKSPACE_LIST,
PROJECT_DETAILS, WORKSPACE_DETAILS, MESH_DESCRIBE, UPDATE_CHECK, COMMAND_DEFAULT,
WEBVIEW_HANDSHAKE, WEBVIEW_MESSAGE_TIMEOUT, DA_LIVE_API, EDS_HELIX_CONFIG,
DEMO_STARTUP_TIMEOUT, FILE_WATCH_TIMEOUT, ELAPSED_TIME_THRESHOLD, DEFAULT_STEP_DURATION
```

**Category: LONG (3min) - 12 constants collapsed**

```
BROWSER_AUTH, API_MESH_CREATE, API_MESH_UPDATE, API_MESH_CHECK, MESH_DEPLOY_TOTAL,
COMPONENT_CLONE, COMPONENT_BUILD, PREREQUISITE_INSTALL, TOOL_CLONE, TOOL_INSTALL,
UPDATE_DOWNLOAD, DA_LIVE_COPY
```

**Category: VERY_LONG (5min) - 3 constants collapsed**

```
COMPONENT_INSTALL, NPM_INSTALL, OAUTH_FLOW (if truly needs 2min)
```

**Category: EXTENDED (10min) - 2 constants collapsed**

```
DATA_INGESTION, EDS_CODE_SYNC_TOTAL
```

**Keep Granular (UI/Polling - justified)**

```
// UI timing - CSS-coupled, need exact values
STEP_TRANSITION: 300
STEP_CONTENT_FOCUS: 300
FOCUS_FALLBACK: 1000
NOTIFICATION_AUTO_DISMISS: 2000
LOADING_MIN_DISPLAY: 1500

// Polling - algorithm-specific
POLL_INITIAL_DELAY: 500
POLL_MAX_DELAY: 5000
MESH_VERIFY_POLL_INTERVAL: 10000
PORT_CHECK_INTERVAL: 1000
PROCESS_CHECK_INTERVAL: 100
```

## File-by-File Migration Guide

### Phase 1: Core Infrastructure (10 files)

```
src/core/shell/commandExecutor.ts
  - TIMEOUTS.COMMAND_DEFAULT → TIMEOUTS.NORMAL
  - TIMEOUTS.MIN_COMMAND_TIMEOUT → 1000 (inline, only used for validation)

src/core/shell/pollingService.ts
  - TIMEOUTS.POLL_INITIAL_DELAY → TIMEOUTS.POLL.INITIAL
  - TIMEOUTS.POLL_MAX_DELAY → TIMEOUTS.POLL.MAX
  - TIMEOUTS.API_MESH_UPDATE → TIMEOUTS.LONG

src/core/communication/webviewCommunicationManager.ts
  - TIMEOUTS.BROWSER_AUTH → TIMEOUTS.AUTH.BROWSER
  - TIMEOUTS.PROJECT_LIST → TIMEOUTS.NORMAL
  - TIMEOUTS.CONFIG_WRITE → TIMEOUTS.NORMAL
  - TIMEOUTS.API_MESH_* → TIMEOUTS.LONG

src/core/base/baseCommand.ts
  - TIMEOUTS.STATUS_BAR_SUCCESS → TIMEOUTS.UI.NOTIFICATION
  - TIMEOUTS.STATUS_BAR_INFO → TIMEOUTS.UI.NOTIFICATION
  - TIMEOUTS.NOTIFICATION_AUTO_DISMISS → TIMEOUTS.UI.NOTIFICATION

src/core/base/baseWebviewCommand.ts
  - TIMEOUTS.WEBVIEW_HANDSHAKE_EXTENDED → TIMEOUTS.NORMAL
  - TIMEOUTS.WEBVIEW_MESSAGE_TIMEOUT → TIMEOUTS.NORMAL
  - TIMEOUTS.UI_UPDATE_DELAY → TIMEOUTS.UI.UPDATE_DELAY
```

### Phase 2: Feature Files (40+ files)

**Authentication (8 files)**
```
src/features/authentication/services/*.ts
  - All use TIMEOUTS.NORMAL for API calls
  - TIMEOUTS.BROWSER_AUTH → TIMEOUTS.AUTH.BROWSER
```

**Mesh (12 files)**
```
src/features/mesh/**/*.ts
  - TIMEOUTS.API_MESH_* → TIMEOUTS.LONG
  - TIMEOUTS.MESH_VERIFY_POLL_INTERVAL → TIMEOUTS.POLL.INTERVAL * 10
```

**Prerequisites (6 files)**
```
src/features/prerequisites/**/*.ts
  - TIMEOUTS.PREREQUISITE_CHECK → TIMEOUTS.QUICK
  - TIMEOUTS.PREREQUISITE_INSTALL → TIMEOUTS.LONG
```

**Lifecycle (4 files)**
```
src/features/lifecycle/**/*.ts
  - TIMEOUTS.DEMO_* → TIMEOUTS.UI.NOTIFICATION (status delays)
  - TIMEOUTS.PORT_CHECK → TIMEOUTS.QUICK
```

**Components (4 files)**
```
src/features/components/**/*.ts
  - TIMEOUTS.COMPONENT_* → TIMEOUTS.LONG or TIMEOUTS.VERY_LONG
```

**Updates (4 files)**
```
src/features/updates/**/*.ts
  - TIMEOUTS.UPDATE_CHECK → TIMEOUTS.NORMAL
  - TIMEOUTS.UPDATE_DOWNLOAD → TIMEOUTS.LONG
```

### Phase 3: UI Files (15 files)

```
src/core/ui/**/*.ts
src/features/*/ui/**/*.tsx
  - Use TIMEOUTS.UI.* for all UI timing
  - FRONTEND_TIMEOUTS mirrors TIMEOUTS.UI
```

## Expected Outcome

After this step:

1. **LOC Reduction:** 176 lines → ~50 lines (126 lines removed)
2. **Constants Reduction:** 70+ named → 7 categories + 10 UI/Poll specifics
3. **Cognitive Load:** Developers choose from 5 categories, not 70 names
4. **Backward Compat:** Deprecated aliases allow gradual migration

## Acceptance Criteria

- [ ] All 267 existing tests pass
- [ ] New structure has 5 core categories + UI/Poll sub-objects
- [ ] Deprecated aliases exist for all removed constants
- [ ] FRONTEND_TIMEOUTS synced with TIMEOUTS.UI
- [ ] TypeScript compilation succeeds with new structure
- [ ] No runtime behavior changes (values preserved via aliases)
- [ ] Documentation updated with new usage pattern

## Dependencies from Other Steps

**None** - This step is independent and can be done in parallel with steps 1-3 or 5-7.

## Risk Assessment

### Risk: Breaking Existing Code

- **Likelihood:** Low (aliases provide backward compatibility)
- **Impact:** Medium (compile errors if aliases missing)
- **Mitigation:** Keep all deprecated aliases until v2.0; run full test suite after migration

### Risk: Incorrect Category Assignment

- **Likelihood:** Low (categories based on actual values, not guesses)
- **Impact:** Low (can adjust category boundaries if needed)
- **Mitigation:** Review actual timeout values in current code; most map obviously

## Estimated Time

3-4 hours:
- 30 min: Create new structure and tests (RED)
- 1 hour: Implement simplified config (GREEN)
- 2 hours: Migrate high-priority usages
- 30 min: Documentation and cleanup (REFACTOR)

## Notes

### Why Keep UI Timing Granular?

UI timing constants (100-500ms) are coupled to CSS animations and user perception. They need exact values:
- 150ms scroll animation = matches CSS transition duration
- 300ms step transition = matches Spectrum component animation
- 100ms update delay = React state settling time

### Why Keep Polling Separate?

Polling/retry algorithms need specific delays for exponential backoff:
- Initial delay: Starting point for backoff
- Max delay: Cap on exponential growth
- Interval: Consistent time between checks

These are algorithm inputs, not operation timeouts.

### Migration Approach: Aliases First

The safest migration is:
1. Add new structure alongside old
2. Add deprecated aliases mapping old → new
3. Migrate code file-by-file
4. Remove aliases after all migrations complete

This allows incremental migration without breaking existing code.
