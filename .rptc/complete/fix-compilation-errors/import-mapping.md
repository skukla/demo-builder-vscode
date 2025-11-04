# Import Path Mapping

**Purpose**: Authoritative mapping of incorrect @/core/* imports to correct paths

**Generated**: 2025-10-28
**Step 1 Reference**: error-analysis.md
**Actual Error Count**: 91 errors total, 25 "Cannot find module" errors
**Total Incorrect @/core/* Imports**: 7 unique paths

---

## Incorrect → Correct Import Mappings

| Incorrect Import | Correct Import | Affected Files | Resolution | Notes |
|------------------|----------------|----------------|------------|-------|
| `@/core/logging` | `@/shared/logging` | 7 | ✅ VERIFIED | Directory exists, exports DebugLogger, StepLogger, ErrorLogger, getLogger() |
| `@/core/validation` | ✅ ALREADY CORRECT | 4 | ⚠️ ADD INDEX | Directory exists but missing barrel export index.ts |
| `@/core/shell` | `@/shared/command-execution` | 4 | ✅ VERIFIED | CommandExecutor class lives here, not shell types |
| `@/core/di` | ❌ REMOVE IMPORT | 3 | 🔧 REFACTOR | Does not exist - remove DI framework usage, use direct imports |
| `@/core/utils/promiseUtils` | `@/utils/promiseUtils` | 2 | ✅ VERIFIED | File exists at src/utils/promiseUtils.ts (legacy location) |
| `@/core/errors` | ❌ REMOVE OR INLINE | 2 | 🔧 REFACTOR | Does not exist - no error base classes found, use inline Error classes |
| `@/core/state` | `@/shared/state` | 1 | ✅ VERIFIED | StateManager and StateCoordinator live here |

**Total Mappings**: 7

---

## Correct @/core/* Imports (DO NOT CHANGE)

These imports are CORRECT and should be excluded from automated replacements:

| Import Path | Location | Purpose | Status |
|-------------|----------|---------|--------|
| `@/core/ui/*` | `src/core/ui/` | React UI components (Modal, LoadingDisplay, etc.) | ✅ KEEP |
| `@/core/ui/hooks/*` | `src/core/ui/hooks/` | React hooks (useVSCodeRequest, useAsyncData, etc.) | ✅ KEEP |
| `@/core/ui/components/*` | `src/core/ui/components/` | UI components (TwoColumnLayout, StatusCard, etc.) | ✅ KEEP |
| `@/core/ui/types` | `src/core/ui/types/` | UI type definitions | ✅ KEEP |
| `@/core/config/*` | `src/core/config/` | ConfigurationLoader | ✅ KEEP |
| `@/core/commands/*` | `src/core/commands/` | Core commands (ResetAllCommand) | ✅ KEEP |
| `@/core/validation/securityValidation` | `src/core/validation/securityValidation.ts` | Security validation utilities | ✅ KEEP |

---

## Detailed Mapping Analysis

### 1. @/core/logging → @/shared/logging ✅

**Affected Files (7):**
- `src/features/authentication/services/adobeEntityService.ts`
- `src/features/authentication/services/adobeSDKClient.ts`
- `src/features/authentication/services/authCacheManager.ts`
- `src/features/authentication/services/authenticationService.ts`
- `src/features/authentication/services/organizationValidator.ts`
- `src/features/authentication/services/performanceTracker.ts`
- `src/features/authentication/services/tokenManager.ts`

**Current Import Pattern:**
```typescript
import { getLogger, Logger, StepLogger } from '@/core/logging';
```

**Correct Import:**
```typescript
import { getLogger, Logger, StepLogger } from '@/shared/logging';
```

**Verification:**
- ✅ Directory exists: `src/shared/logging/`
- ✅ Exports verified: `getLogger()`, `Logger`, `DebugLogger`, `StepLogger`, `ErrorLogger`
- ✅ No breaking changes: All required functions/classes exported

---

### 2. @/core/validation → ADD INDEX.TS ⚠️

**Affected Files (4):**
- `src/features/authentication/services/adobeEntityService.ts`
- `src/features/authentication/services/adobeSDKClient.ts`
- `src/features/authentication/handlers/projectHandlers.ts`
- `src/features/authentication/handlers/workspaceHandlers.ts`

**Current Import Pattern:**
```typescript
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
```

**Problem:**
- Directory exists at `src/core/validation/`
- Contains `securityValidation.ts` with validation functions
- **Missing** `index.ts` barrel export

**Resolution:**
Create `src/core/validation/index.ts`:
```typescript
export {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateInput,
    sanitizeInput
} from './securityValidation';
```

**Verification:**
- ✅ Directory exists: `src/core/validation/`
- ✅ Source file exists: `src/core/validation/securityValidation.ts`
- ⚠️ Missing: `index.ts` (will create in Step 3)

---

### 3. @/core/shell → @/shared/command-execution ✅

**Affected Files (4):**
- `src/features/authentication/services/adobeEntityService.ts`
- `src/features/authentication/services/authenticationService.ts`
- `src/features/authentication/services/organizationValidator.ts`
- `src/features/authentication/services/tokenManager.ts`

**Current Import Pattern:**
```typescript
import type { CommandExecutor } from '@/core/shell';
```

**Correct Import:**
```typescript
import type { CommandExecutor } from '@/shared/command-execution';
```

**Verification:**
- ✅ Directory exists: `src/shared/command-execution/`
- ✅ File exists: `src/shared/command-execution/commandExecutor.ts`
- ✅ Export verified: `CommandExecutor` class exported from `index.ts`

**Note:** `src/types/shell.ts` exists but only exports `DEFAULT_SHELL` constant, not `CommandExecutor`.

---

### 4. @/core/di → REMOVE IMPORT ❌

**Affected Files (3):**
- `src/features/authentication/handlers/projectHandlers.ts`
- `src/features/authentication/services/adobeSDKClient.ts`
- `src/features/components/services/ComponentManager.ts`

**Current Import Pattern:**
```typescript
import { getService, ServiceLocator } from '@/core/di';
```

**Problem:**
- File does not exist
- No DI framework implemented in project
- Services use direct imports and constructor injection

**Resolution:**
Remove DI imports entirely and use direct imports:

**Before:**
```typescript
import { getService } from '@/core/di';
const authService = getService<AuthenticationService>('AuthenticationService');
```

**After:**
```typescript
import { AuthenticationService } from '@/features/authentication/services/authenticationService';
const authService = new AuthenticationService(dependencies);
```

**Impact:** Low - DI pattern not widely used, easy to refactor to direct imports

---

### 5. @/core/utils/promiseUtils → @/utils/promiseUtils ✅

**Affected Files (2):**
- `src/features/authentication/handlers/projectHandlers.ts`
- `src/features/authentication/handlers/workspaceHandlers.ts`

**Current Import Pattern:**
```typescript
import { withTimeout, retryWithBackoff } from '@/core/utils/promiseUtils';
```

**Correct Import:**
```typescript
import { withTimeout, retryWithBackoff } from '@/utils/promiseUtils';
```

**Verification:**
- ✅ File exists: `src/utils/promiseUtils.ts` (legacy location, not yet migrated to shared)
- ⚠️ Need to verify exports match expected functions in Step 3

**Note:** This file is in legacy `src/utils/` location. Future migration to `@/shared/utils/` may be desirable but not blocking.

---

### 6. @/core/errors → REMOVE OR INLINE ❌

**Affected Files (2):**
- `src/features/authentication/services/authenticationService.ts`
- `src/features/authentication/services/tokenManager.ts`

**Current Import Pattern:**
```typescript
import { AuthenticationError, TokenError } from '@/core/errors';
```

**Problem:**
- File `src/core/errors.ts` does not exist
- No error base classes found in `src/shared/base/` (only baseCommand.ts, baseWebviewCommand.ts)

**Resolution Options:**

**Option A: Inline error classes in feature**
```typescript
// src/features/authentication/services/errors.ts
export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class TokenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TokenError';
    }
}
```

**Option B: Use standard Error class**
```typescript
throw new Error('Authentication failed: ' + reason);
```

**Recommended:** Option A - Create feature-specific error classes in `src/features/authentication/services/errors.ts`

**Action:** Implement in Step 3 or Step 6

---

### 7. @/core/state → @/shared/state ✅

**Affected Files (1):**
- `src/features/components/providers/componentTreeProvider.ts`

**Current Import Pattern:**
```typescript
import { StateManager, StateCoordinator } from '@/core/state';
```

**Correct Import:**
```typescript
import { StateManager, StateCoordinator } from '@/shared/state';
```

**Verification:**
- ✅ Directory exists: `src/shared/state/`
- ✅ Exports verified: `StateManager`, `StateCoordinator`
- ✅ No breaking changes

---

## Verification Results

### File Existence Check

| Replacement Path | File Location | Status |
|------------------|---------------|--------|
| `@/shared/logging` | `src/shared/logging/index.ts` | ✅ EXISTS |
| `@/core/validation/index.ts` | `src/core/validation/index.ts` | ⚠️ CREATE IN STEP 3 |
| `@/shared/command-execution` | `src/shared/command-execution/index.ts` | ✅ EXISTS |
| `@/core/di` | N/A | ❌ REMOVE IMPORTS |
| `@/utils/promiseUtils` | `src/utils/promiseUtils.ts` | ✅ EXISTS |
| `@/core/errors` | N/A | ❌ CREATE IN STEP 3 OR 6 |
| `@/shared/state` | `src/shared/state/index.ts` | ✅ EXISTS |

### Export Validation

| Import | Expected Exports | Verification Status |
|--------|------------------|---------------------|
| `@/shared/logging` | `getLogger`, `Logger`, `DebugLogger`, `StepLogger`, `ErrorLogger` | ✅ VERIFIED |
| `@/core/validation` | `validateOrgId`, `validateProjectId`, `validateWorkspaceId` | ⚠️ CREATE INDEX |
| `@/shared/command-execution` | `CommandExecutor` class | ✅ VERIFIED |
| `@/shared/state` | `StateManager`, `StateCoordinator` | ✅ VERIFIED |
| `@/utils/promiseUtils` | `withTimeout`, `retryWithBackoff` | ⚠️ VERIFY EXPORTS IN STEP 3 |
| Feature-specific errors | `AuthenticationError`, `TokenError` | ❌ CREATE IN STEP 3 OR 6 |

---

## Missing Implementations

### @/types/results - Missing DataResult Export

**Affected Files (2):**
- `src/features/authentication/handlers/projectHandlers.ts`
- `src/features/authentication/handlers/workspaceHandlers.ts`

**Current Import:**
```typescript
import { DataResult } from '@/types/results';
```

**Problem:**
- File `src/types/results.ts` exists
- Exports `SimpleResult<T>` and `OperationResult<T>`
- **Missing export:** `DataResult` type not exported

**Resolution:**
`DataResult<T>` is likely an alias for `SimpleResult<T>` (same structure). Add type alias:

```typescript
// src/types/results.ts
export type DataResult<T> = SimpleResult<T>;
```

**Verification:**
- ✅ File exists: `src/types/results.ts`
- ✅ `SimpleResult<T>` has identical structure to expected `DataResult<T>`
- ⚠️ Missing: `DataResult` type alias export

**Action:** Add type alias in Step 3

---

## Risk Assessment

### High Confidence Mappings (Safe to automate)

1. ✅ `@/core/logging` → `@/shared/logging` (7 files)
2. ✅ `@/core/shell` → `@/shared/command-execution` (4 files)
3. ✅ `@/core/state` → `@/shared/state` (1 file)

**Total:** 12 files with high-confidence automated fixes

### Medium Confidence (Verify before fix)

4. ⚠️ `@/core/validation` → Add index.ts (4 files)
5. ✅ `@/core/utils/promiseUtils` → `@/utils/promiseUtils` verified (2 files)
6. ❌ `@/core/errors` → Create feature-specific errors (2 files)

**Total:** 6 files with straightforward fixes, 2 files requiring error class creation

### Manual Intervention Required

7. ❌ `@/core/di` → Remove DI pattern (3 files)

**Total:** 3 files requiring manual refactoring

---

## Batch Strategy

### Step 4 (Batch 1): High-Confidence Automated Fixes

Fix these imports with automation (12 files):
- All `@/core/logging` → `@/shared/logging` (7 files)
- All `@/core/shell` → `@/shared/command-execution` (4 files)
- All `@/core/state` → `@/shared/state` (1 file)

**Expected outcome:** Reduce errors from 25 to 13

### Step 5 (Batch 2): Verified Fixes After Step 3

After Step 3 creates missing exports, fix:
- All `@/core/validation` imports (4 files) - use barrel export
- All `@/core/utils/promiseUtils` imports (2 files) - verified location
- All `@/core/errors` imports (2 files) - use verified error classes

**Expected outcome:** Reduce errors from 13 to 5

### Step 6 (Manual): DI Refactoring

Manually refactor:
- Remove `@/core/di` imports (3 files)
- Replace with direct imports
- Update constructor injection patterns

**Expected outcome:** Reduce errors from 5 to 0 (for module not found errors)

---

## Next Actions

- [x] Import mapping document created
- [ ] Proceed to Step 3: Add Missing Exports (index.ts, DataResult)
- [ ] Verify promiseUtils and errors file locations
- [ ] Execute Step 4: High-confidence automated fixes
- [ ] Execute Step 5: Verified fixes after Step 3
- [ ] Execute Step 6: Manual DI refactoring

---

**Mapping Status:** ✅ Complete
**Confidence Level:** High for 12/23 files, Medium for 8/23 files, Manual for 3/23 files
**Next Step:** Step 3 - Add Missing Exports and Verify File Locations
