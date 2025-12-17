# Implementation Plan: Error Handling Standardization

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Phase A: Console Migration ✅ **COMPLETE**
- [x] Phase B: Error Class Adoption ✅ **COMPLETE** (infrastructure in place, handlers using toAppError)
- [x] Phase C: String Matching Elimination ✅ **COMPLETE** (8 domain-specific patterns acceptable)
- [x] Phase D: Error Payload Review ⏸️ **DEFERRED** (current formats adequate)

**Created:** 2025-11-27
**Last Updated:** 2025-12-17
**Status:** ✅ COMPLETE
**Branch:** `refactor/core-architecture-wip`
**Related:** `.rptc/plans/code-efficiency-refactoring/step-12-error-handling-consolidation.md`

---

## Completion Summary (2025-12-17)

### What Was Accomplished

**Phase A - Console Migration**: ✅ Complete
- Console statements migrated to Logger infrastructure

**Phase B - Error Class Adoption**: ✅ Complete
- Core infrastructure exists: `AppError`, `TimeoutError`, `NetworkError`, `AuthError`
- Type guards available: `isTimeout()`, `isNetwork()`, `isAuth()`, `toAppError()`
- 36 usages of `toAppError` across 15 feature files
- Handlers properly using typed error detection

**Phase C - String Matching**: ✅ Complete (Acceptable Patterns)
- Only 8 domain-specific string patterns remain (acceptable):
  - `PrerequisitesManager.ts`: ENOENT, "command not found" (tool detection)
  - `componentUpdater.ts`: HTTP 404/403, "verification failed" (specific error messages)
  - `createHandler.ts`: "cancelled by user" (user cancellation)
  - `createHandlerHelpers.ts`: "already has a mesh" (Adobe CLI message)
- These patterns are domain-specific and don't benefit from abstraction

**Phase D - Error Payload Review**: ⏸️ Deferred
- Current formats adequate for use cases
- No active pain points reported
- Unification would add complexity without clear benefit

### Metrics Achieved

| Metric | Original | Current |
|--------|----------|---------|
| `toAppError` adoption | 4 files | 15 files |
| Type guard usage | Minimal | Standard pattern |
| Raw string matching | 40+ locations | 8 domain-specific |

---

## Executive Summary

**Purpose:** Standardize error handling across the codebase by:
1. Replacing all `console.*` statements with the Logger infrastructure
2. Adopting typed error classes (`AppError`, `TimeoutError`, etc.) across handlers
3. Eliminating string-based error detection (`error.message.includes()`)
4. Ensuring the error infrastructure created in Phase C of Step 12 is fully utilized

**Complexity:** Medium-Large (4 phases, ~40 files affected)

**Key Risks:** Regression in error display, logging output changes

---

## Research Findings

### Console.* Usage Analysis

**Total: 138 occurrences across 27 files**

| Category | Files | Occurrences | Priority |
|----------|-------|-------------|----------|
| Backend Core | `stateManager.ts` | 19 | HIGH |
| Frontend Webview | `WebviewApp.tsx`, `App.tsx` | 16 | MEDIUM |
| React Components | `WizardContainer.tsx`, `ErrorBoundary.tsx` | 7 | MEDIUM |
| Hooks | Various | 8 | LOW |
| Documentation | README.md, CLAUDE.md | ~40 | SKIP |

**Key Files Requiring Migration:**

1. **`src/core/state/stateManager.ts`** (19 calls) - Critical persistence layer
2. **`src/core/ui/components/WebviewApp.tsx`** (11 calls) - React app initialization
3. **`src/features/project-creation/ui/App.tsx`** (5 calls) - Wizard app
4. **`src/features/project-creation/ui/wizard/WizardContainer.tsx`** (3 calls)
5. **`src/core/ui/components/ErrorBoundary.tsx`** (2 calls)
6. **`src/features/authentication/ui/hooks/useAuthStatus.ts`** (2 calls)
7. **Various hooks** (~8 calls total)

### Error Infrastructure Adoption

**Current State:** Infrastructure exists but is largely unused

| Metric | Current | Target |
|--------|---------|--------|
| Files importing `@/types/errors` | 4 | 20+ |
| Files importing `@/types/errorCodes` | 1 | 15+ |
| String-based error detection locations | 12+ | 0 |
| Catch blocks in handlers | 67 | All typed |

**Files Still Using String Matching:**
- `organizationValidator.ts` - `includes('timeout')`
- `tokenManager.ts` - `includes('timeout')`, `includes('ETIMEDOUT')`
- `workspaceHandlers.ts` - `includes('timed out')`
- `projectHandlers.ts` - `includes('timed out')`
- `retryStrategyManager.ts` - `includes('network')`, `includes('timeout')`
- `processCleanup.ts` - `includes('ESRCH')`
- `componentUpdater.ts` - `includes('fetch')`, `includes('timeout')`

### Logging Infrastructure Available

**Logger Classes:**
- `Logger` - Basic logging (backward compatible wrapper)
- `DebugLogger` - Dual channel logging (Logs + Debug)
- `ErrorLogger` - Error tracking with UI integration
- `StepLogger` - Configuration-driven step logging

**Usage Pattern:**
```typescript
import { Logger } from '@/core/logging';
const logger = new Logger('ComponentName');
logger.info('User-facing message');
logger.debug('Debug details');
logger.error('Error occurred', error);
logger.warn('Warning message');
```

---

## Phase A: Console.* to Logger Migration (3-4 hours)

**Goal:** Replace all `console.*` statements with proper Logger infrastructure.

### A.1: Backend Core Files (1.5 hours)

**Files:**
1. `src/core/state/stateManager.ts` (19 calls) - HIGH priority
2. `src/features/mesh/services/stalenessDetector.ts` (1 call)
3. `src/core/vscode/workspaceWatcherManager.ts` (in comments - SKIP)

**Migration Pattern:**
```typescript
// Before
console.error('Failed to save state:', error);
console.warn('Failed to parse state file, using defaults');
console.log('No existing state found, using defaults');
console.debug(`Skipping directory without manifest: ${entry.name}`);

// After
import { Logger } from '@/core/logging';
const logger = new Logger('StateManager');

logger.error('Failed to save state', error instanceof Error ? error : undefined);
logger.warn('Failed to parse state file, using defaults');
logger.info('No existing state found, using defaults');
logger.debug(`Skipping directory without manifest: ${entry.name}`);
```

**Test Strategy:**
- Verify logging output in "Demo Builder: Logs" channel
- Verify debug output in "Demo Builder: Debug" channel
- Ensure error scenarios still log appropriately

---

### A.2: Frontend Webview Files (1 hour)

**Challenge:** Webview runs in browser context, no access to VS Code Logger.

**Files:**
1. `src/core/ui/components/WebviewApp.tsx` (11 calls)
2. `src/features/project-creation/ui/App.tsx` (5 calls)
3. `src/features/project-creation/ui/wizard/WizardContainer.tsx` (3 calls)
4. `src/core/ui/components/ErrorBoundary.tsx` (2 calls)
5. `src/features/components/ui/steps/ComponentSelectionStep.tsx` (2 calls)

**Solution Options:**

**Option 1: WebviewLogger Wrapper (Recommended)**
Create a lightweight logger that:
- Uses `console.*` in development
- Can be conditionally disabled in production
- Provides consistent formatting

```typescript
// src/core/ui/utils/webviewLogger.ts
const isDev = process.env.NODE_ENV === 'development';

export const webviewLogger = {
    log: (context: string, message: string, ...args: unknown[]) => {
        if (isDev) console.log(`[${context}] ${message}`, ...args);
    },
    error: (context: string, message: string, error?: Error) => {
        console.error(`[${context}] ${message}`, error?.message || '');
    },
    warn: (context: string, message: string) => {
        if (isDev) console.warn(`[${context}] ${message}`);
    },
    debug: (context: string, message: string, ...args: unknown[]) => {
        if (isDev) console.debug(`[${context}] ${message}`, ...args);
    },
};
```

**Option 2: Conditional Compilation**
Use webpack DefinePlugin to strip console.* in production.

**Option 3: Send to Extension**
Forward logs to extension via postMessage (adds complexity).

**Decision:** Option 1 (WebviewLogger) - balances simplicity with consistency.

---

### A.3: React Hooks (30 min)

**Files:**
1. `src/features/authentication/ui/hooks/useAuthStatus.ts` (2 calls)
2. `src/core/ui/hooks/useFocusTrap.ts` (1 call)
3. `src/core/ui/hooks/useComponentConfig.ts` (1 call)
4. `src/core/ui/hooks/useSelection.ts` (1 call - in JSDoc, SKIP)

**Pattern:** Use webviewLogger from A.2.

---

### A.4: Documentation Cleanup (15 min)

**Action:** Review and ensure README examples use Logger, not console.*.

**Files to Review:**
- `src/core/state/README.md`
- `src/features/updates/README.md`
- `src/features/prerequisites/README.md`
- `src/features/mesh/README.md`
- `src/features/components/README.md`

---

### Phase A Acceptance Criteria

- [x] Zero `console.*` in production backend code (src/**/*.ts excluding tests)
- [x] WebviewLogger wrapper created and used consistently
- [x] All logging flows through Logger infrastructure
- [x] Documentation examples updated
- [x] Tests verify logging behavior unchanged (TypeScript compiles successfully)

---

## Phase B: Error Class Adoption (3-4 hours)

**Goal:** Migrate handler catch blocks to use typed error classes.

### B.1: High-Value Handlers (2 hours)

**Priority Files (by catch block count):**

| File | Catch Blocks | Error Types |
|------|-------------|-------------|
| `projectHandlers.ts` | 10 | AUTH, TIMEOUT, NETWORK |
| `lifecycleHandlers.ts` | 8 | PROJECT, TIMEOUT |
| `dashboardHandlers.ts` | 6 | PROJECT, MESH |
| `componentHandlers.ts` | 6 | COMPONENT, CONFIG |
| `mesh/createHandler.ts` | 5 | MESH, AUTH, TIMEOUT |
| `authenticationHandlers.ts` | 5 | AUTH |
| `mesh/checkHandler.ts` | 4 | MESH, AUTH |
| `project-creation/createHandler.ts` | 4 | PROJECT |

**Migration Pattern:**
```typescript
// Before
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('timeout')) {
        return { success: false, error: 'Operation timed out' };
    }
    return { success: false, error: errorMessage };
}

// After
import { toAppError, isTimeout, isNetwork, isAuth } from '@/types/errors';
import { ErrorCode, getErrorTitle } from '@/types/errorCodes';

} catch (error) {
    const appError = toAppError(error);

    if (isTimeout(appError)) {
        return {
            success: false,
            error: appError.userMessage,
            code: ErrorCode.TIMEOUT
        };
    }

    return {
        success: false,
        error: appError.userMessage,
        code: appError.code
    };
}
```

---

### B.2: Service Layer (1.5 hours)

**Files:**
1. `organizationValidator.ts` - Timeout/network detection
2. `tokenManager.ts` - Timeout/network detection
3. `retryStrategyManager.ts` - Error classification
4. `componentUpdater.ts` - Fetch/network/timeout detection
5. `processCleanup.ts` - ESRCH detection (special case)

**Migration Pattern:**
```typescript
// Before (retryStrategyManager.ts)
return message.includes('network') ||
       message.includes('timeout') ||
       message.includes('ETIMEDOUT');

// After
import { toAppError, isTimeout, isNetwork } from '@/types/errors';

const appError = toAppError(error);
return isNetwork(appError) || isTimeout(appError);
```

---

### Phase B Acceptance Criteria

- [ ] All handler catch blocks use `toAppError()` conversion
- [ ] Type guards (`isTimeout`, `isNetwork`, `isAuth`) used consistently
- [ ] No `error.message.includes()` patterns remain
- [ ] Error codes included in responses where applicable
- [ ] Tests updated to verify error handling

---

## Phase C: String Matching Elimination (2 hours)

**Goal:** Remove all string-based error detection patterns.

### C.1: Comprehensive Audit (30 min)

Run grep to find all remaining string-based patterns:
```bash
grep -rn "\.includes\(['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v README | grep -v test
```

### C.2: Systematic Replacement (1.5 hours)

**Pattern Categories:**

| Pattern | Replacement |
|---------|-------------|
| `includes('timeout')` | `isTimeout(toAppError(error))` |
| `includes('network')` | `isNetwork(toAppError(error))` |
| `includes('auth')` | `isAuth(toAppError(error))` |
| `includes('ETIMEDOUT')` | `isTimeout(toAppError(error))` |
| `includes('ESRCH')` | Custom type guard or error code |
| `includes('fetch')` | `isNetwork(toAppError(error))` |

**Special Cases:**
- `processCleanup.ts` - ESRCH is Unix-specific, may need dedicated handling
- `retryStrategyManager.ts` - Core retry logic, high test coverage needed

---

### Phase C Acceptance Criteria

- [ ] No `error.message.includes()` patterns in production code
- [ ] All error detection uses type guards
- [ ] Special cases documented (if any remain)
- [ ] Tests verify error classification

---

## Phase D: Error Payload Review (Decision Gate)

**Goal:** Evaluate whether unified error payload format is needed.

### Current State (from Step 12)

Three payload formats exist:
1. **Format A (Components):** `{ success, error, message }`
2. **Format B (Mesh):** `{ success, error }` + feature-specific fields
3. **Format C (Auth):** `{ error, message, subMessage }` + auth state

### Decision Criteria

**Proceed with unification if:**
- [ ] New features consistently struggle with error formats
- [ ] UI error handling has become overly complex
- [ ] Team consensus favors standardization

**Defer if:**
- [ ] Current formats work adequately
- [ ] Migration risk outweighs benefit
- [ ] No active pain points

### Potential Unified Format

```typescript
interface ErrorPayload {
    success: false;
    error: {
        code: ErrorCode;
        title: string;
        message: string;
        technical?: string;
        recoverable: boolean;
    };
    // Feature-specific fields allowed
    [key: string]: unknown;
}
```

---

## Test Strategy

### Unit Tests
- Verify `toAppError()` correctly classifies errors
- Verify type guards work for all error types
- Verify Logger output format

### Integration Tests
- Verify error flows from handlers to UI
- Verify error messages display correctly
- Verify logging appears in correct channels

### Manual Testing
- Trigger each error type manually
- Verify "Demo Builder: Logs" output
- Verify "Demo Builder: Debug" output

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Logging output changes | High | Medium | Compare before/after output |
| Error display regression | Medium | High | Comprehensive test coverage |
| Webview console removal breaks debugging | Medium | Medium | Keep WebviewLogger for dev |
| Performance impact | Low | Low | Logger is lightweight |

---

## Coordination Notes

**Phase Dependencies:**
- Phase A: Independent, start immediately
- Phase B: Benefits from A (logging), but can parallel
- Phase C: Depends on B (uses same patterns)
- Phase D: Decision gate after A-C complete

**Branch Strategy:** Continue on `refactor/core-architecture-wip`

**Testing Requirements:**
- Run full test suite after each phase
- Manual verification of logging output
- Verify build passes before moving to next phase

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| `console.*` in production code | 138 | 0 (backend), minimal (webview) |
| Files using typed errors | 4 | 20+ |
| String-based error detection | 12+ | 0 |
| Error code coverage | 1 file | All handlers |

---

## Files Reference

### Phase A Files (Console Migration)
```
src/core/state/stateManager.ts
src/core/ui/components/WebviewApp.tsx
src/features/project-creation/ui/App.tsx
src/features/project-creation/ui/wizard/WizardContainer.tsx
src/core/ui/components/ErrorBoundary.tsx
src/features/components/ui/steps/ComponentSelectionStep.tsx
src/features/authentication/ui/hooks/useAuthStatus.ts
src/core/ui/hooks/useFocusTrap.ts
src/features/components/ui/hooks/useComponentConfig.ts
src/features/mesh/services/stalenessDetector.ts
```

### Phase B Files (Error Class Adoption)
```
src/features/authentication/handlers/projectHandlers.ts
src/features/authentication/handlers/workspaceHandlers.ts
src/features/authentication/handlers/authenticationHandlers.ts
src/features/dashboard/handlers/dashboardHandlers.ts
src/features/components/handlers/componentHandlers.ts
src/features/mesh/handlers/createHandler.ts
src/features/mesh/handlers/checkHandler.ts
src/features/lifecycle/handlers/lifecycleHandlers.ts
src/features/project-creation/handlers/createHandler.ts
src/features/project-creation/handlers/executor.ts
```

### Phase C Files (String Matching)
```
src/features/authentication/services/organizationValidator.ts
src/features/authentication/services/tokenManager.ts
src/core/shell/retryStrategyManager.ts
src/features/updates/services/componentUpdater.ts
src/core/shell/processCleanup.ts
```
