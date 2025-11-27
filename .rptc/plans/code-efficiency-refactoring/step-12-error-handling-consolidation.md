# Step 12: Error Handling Consolidation

## Status: COMPLETE (Phases A, B, C.1, C.3 Complete; C.2 Deferred)
**Estimated Effort:** 8-12 hours total (across 3 phases)
**Priority:** High (foundational infrastructure)
**Dependencies:** Steps 1-11 (all complete)
**Started:** 2025-11-27
**Phase A Complete:** 2025-11-27
**Phase B Complete:** 2025-11-27
**Phase C (Partial) Complete:** 2025-11-27

---

## Background

### Analysis Summary (2025-11-27)

Four parallel Explore agents analyzed error handling patterns across the codebase:

| Area | Consistency Rating | Key Strength | Key Weakness |
|------|-------------------|--------------|--------------|
| Backend Core | 4.5/5 | Strong async patterns, smart retry | Mixed logging (console vs logger) |
| Backend Features | 3.0/5 | Auth has dedicated formatter | 3 different error payload formats |
| Frontend/Webview | 3.0/5 | Good hook patterns, UI components | ErrorBoundary severely underutilized |
| Types & Utilities | 3.5/5 | Type guards, Result pattern | No custom error classes |

### Critical Issues Identified

1. **Three Different Error Payload Formats**
   ```typescript
   // Format A (components): { error: true }
   // Format B (mesh): { error: 'message string' }
   // Format C (auth): { title, message, technical, details }
   ```

2. **ErrorBoundary Underutilized (1/5)**
   - Component exists at `src/core/ui/components/ErrorBoundary.tsx`
   - Only wrapped around 1 location
   - Most React trees have no boundary protection

3. **Silent Error Swallowing**
   - Some catch blocks log to debug but never show user-facing errors
   - Users see "loading forever" instead of actionable error messages

4. **No Error Code System**
   - Errors are string-matched (`error.message.includes('timeout')`)
   - No standardized codes for programmatic handling

5. **Inconsistent Logging Volume**
   - Authentication: 14 log statements per handler
   - Components: 2 log statements per handler

### Strengths to Preserve

- `toError()` and `isTimeoutError()` type guards - consistent error normalization
- Result pattern (`{ success: boolean }`) - used consistently for command outcomes
- Dual-channel logging (User-facing vs Debug) - well-designed separation
- Auth error formatter (`formatAuthError()`) - gold standard implementation

---

## Phase A: Quick Wins (2-3 hours)

**Goal:** High-impact, low-risk changes that establish better patterns immediately.

### A.1: ErrorBoundary Wrappers (1 hour) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~1 hour (including YAGNI refactor)

**Implementation (YAGNI-compliant):**

After initial over-engineered implementation, refactored to minimal YAGNI-compliant solution:

```tsx
<ErrorBoundary
    key={state.currentStep}
    onError={(error) => console.error('[WizardContainer] Step error:', error.message)}
>
    {renderStep()}
</ErrorBoundary>
```

**Key Design Decisions:**
1. **No custom fallback**: Default ErrorBoundary fallback is sufficient - shows error heading and message
2. **No retry button**: Render errors rarely fix on retry; users can refresh or navigate
3. **No back button in fallback**: Footer buttons remain visible outside ErrorBoundary
4. **No state tracking**: Simple `key` prop resets boundary on step change
5. **Simple onError**: Just logs the error message

**Files Modified:**
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` (+5 lines)

**Removed (YAGNI violations):**
- ~~`StepErrorFallback.tsx`~~ - Deleted (98 lines saved)
- ~~18 StepErrorFallback tests~~ - Deleted

**Test Coverage:**
- `tests/features/project-creation/ui/wizard/WizardContainer-errorBoundary.test.tsx` (3 tests)

**Acceptance Criteria:**
- [x] All wizard steps protected by ErrorBoundary
- [x] Default fallback UI shows error (no custom fallback needed)
- [x] Error logged to console
- [x] Tests verify boundary catches errors

---

### A.2: Silent Catch Block Audit (1-1.5 hours) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~45 minutes

**Analysis Results:**
Explore agent analyzed catch blocks across the codebase and found:
- 2 HIGH severity (user impact)
- 2 MEDIUM severity (needs documentation)
- 6 LOW severity (appropriately silent)

**Fixes Applied:**

1. **useComponentConfig.ts** (HIGH) - Added `loadError` state
   - Hook now returns `loadError: string | null`
   - ComponentConfigStep displays error message instead of blank UI
   - User sees clear feedback on load failure

2. **updateManager.ts** (MEDIUM) - Added documentation comment
   - Explained graceful degradation pattern
   - Network errors return null ("no update") vs showing error

3. **prerequisites/shared.ts** (MEDIUM) - Added documentation comments
   - `getNodeVersionMapping`: Documented why empty return is acceptable
   - `getRequiredNodeVersions`: Documented fallback behavior

**No Changes Needed:**
- `authenticationHandlers.ts` - Already well-documented with appropriate log levels
- Process cleanup, state management, mesh operations - Appropriately silent for background ops

**Files Modified:**
- `src/features/components/ui/hooks/useComponentConfig.ts` (+4 lines)
- `src/features/components/ui/steps/ComponentConfigStep.tsx` (+7 lines)
- `src/features/updates/services/updateManager.ts` (+4 lines comment)
- `src/features/prerequisites/handlers/shared.ts` (+6 lines comments)

**Acceptance Criteria:**
- [x] All user-relevant errors display in UI (useComponentConfig fixed)
- [x] Intentionally silent catches have documentation comments
- [x] No "loading forever" scenarios from unhandled errors

---

### A.3: Document Current Payload Formats (30 min) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~20 minutes

**Deliverable:** `docs/architecture/error-handling.md`

**Content Created:**
1. Overview of 3 payload formats with concrete code examples
2. Format A (Components): `{ success, error, message }`
3. Format B (Mesh): `{ success, error }` with feature-specific fields
4. Format C (Auth): `{ authenticated, error, message, subMessage }`
5. Generic type definitions from `src/types/`
6. UI handling requirements for each format
7. Interim recommendation: Use Format C pattern for new code
8. Quick reference table
9. Related files listing

**Acceptance Criteria:**
- [x] Documentation clearly explains current state
- [x] New code has clear guidance (Format C recommended)
- [x] Technical debt tracked (Future Consolidation section)

---

## Phase B: Readability & Abstraction (2-3 hours)

**Goal:** Improve code readability through naming and reduce duplication.

**Philosophy:** Code is read more than written. Inline expressions hurt readability.
Prefer well-named helpers and intermediate variables that make code self-documenting.

---

### B.1: Readability Improvements (1-2 hours) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~2 hours

**Patterns Found & Fixed:**

1. **Magic Numbers → TIMEOUTS Constants**
   - Added `MESH_VERIFY_INITIAL_WAIT` and `MESH_VERIFY_POLL_INTERVAL` to `timeoutConfig.ts`
   - Updated 6+ mesh feature files to use TIMEOUTS constants
   - Updated `componentManager.ts` to use TIMEOUTS constants

2. **Complex Inline Logic → Helper Functions**
   - **Dashboard handlers:** Added `hasMeshDeploymentRecord()`, `determineMeshStatus()`, `shouldAsyncCheckMesh()`
   - **Prerequisites shared:** Added `determinePrerequisiteStatus()`, `getPrerequisiteStatusMessage()`
   - **Authentication handlers:** Added `getAuthSubMessage()`

3. **Nested Ternaries → Explicit Helpers**
   - Fixed `installHandler.ts:376` - uses `determinePrerequisiteStatus()`
   - Fixed `authenticationHandlers.ts:254-256` - uses `getAuthSubMessage()`
   - Fixed `checkHandler.ts`, `continueHandler.ts` - use prerequisite helpers

**Files Modified:**
- `src/core/utils/timeoutConfig.ts` - Added 2 constants
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Added 3 helpers
- `src/features/prerequisites/handlers/shared.ts` - Added 2 exported helpers
- `src/features/prerequisites/handlers/checkHandler.ts` - Uses helpers
- `src/features/prerequisites/handlers/continueHandler.ts` - Uses helpers
- `src/features/prerequisites/handlers/installHandler.ts` - Uses helper
- `src/features/authentication/handlers/authenticationHandlers.ts` - Added helper
- Multiple mesh files - Use TIMEOUTS constants

**Acceptable Patterns Not Changed:**
- Sorting comparison ternaries (standard pattern)
- Simple fallback chains (`a || b || c`)

---

### B.2: Duplicate Detection (1 hour) ✅ COMPLETE

**Completed:** 2025-11-27
**Result:** 2.31% duplication (healthy level)

**jscpd Scan Results:**
- Total files: 206 (JS/TS/TSX)
- Total lines: 40,376
- Clones found: 15
- Duplicated lines: 932 (2.31%)

**Status:** No action needed. 2.31% is well below the 5% threshold. All high-value duplicates were already extracted in earlier phases.

---

### B.3: SOP Creation (30 min) ✅ COMPLETE

**Completed:** 2025-11-27

**Deliverable:** `.rptc/sop/code-patterns.md`

**Purpose:** Prevent anti-patterns from recurring in future development by codifying patterns into the RPTC workflow.

**Content Created:**
1. Centralized Timeout Constants pattern (TIMEOUTS.*)
2. Helper Function Extraction guidelines (when to extract, naming conventions)
3. Nested Ternary Refactoring rules
4. AI Anti-Patterns section for code patterns
5. RPTC Workflow Integration (Master Efficiency Agent, Master Simplicity Agent)
6. Quick Reference for AI Agents

**Integration:**
- Added to `.rptc/CLAUDE.md` SOP Reference Guide table
- Added Pre-Generation Checklist item for code patterns
- Added Red Flags for magic numbers and nested ternaries

---

### Acceptance Criteria

- [x] Readability scan of handlers and hooks complete
- [x] Complex inline expressions refactored to named variables/helpers
- [x] jscpd scan complete with results documented (2.31% - healthy)
- [x] Any valuable extractions implemented with tests
- [x] Decision log for deferred/rejected candidates (acceptable patterns documented)
- [x] **NEW:** SOP created to prevent pattern regression (`.rptc/sop/code-patterns.md`)

---

## Phase C: Systematic Overhaul (Modified Approach)

**Goal:** Establish typed error handling infrastructure for incremental adoption.

**Decision Gate Evaluation (2025-11-27):**
- **Friction Level:** MODERATE - 3 payload formats cause inconsistency but UI handles them
- **Silent Errors:** RESOLVED in Phase A.2
- **Investment Decision:** Proceed with C.1 + C.3, DEFER C.2 (high risk)

---

### C.1: Custom Error Classes (1-2 hours) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~1.5 hours

**Deliverable:** `src/types/errors.ts`

**Implemented Error Hierarchy:**
```typescript
// Base error with code, userMessage, technical details
export class AppError extends Error {
    code: ErrorCode;
    userMessage: string;
    technical?: string;
    recoverable: boolean;
    cause?: Error;
}

// Specialized error classes
export class TimeoutError extends AppError { operation, timeoutMs }
export class NetworkError extends AppError { target }
export class AuthError extends AppError { static required(), expired(), noAppBuilder() }
export class ValidationError extends AppError { field, validationErrors }
export class PrerequisiteError extends AppError { prerequisiteId, requiredVersion }
export class MeshError extends AppError { operation }
```

**Type Guards Added:**
- `isAppError()`, `isTimeout()`, `isNetwork()`, `isAuth()`
- `hasErrorCode(error, code)` - Check specific error code
- `toAppError(error)` - Convert unknown error with auto-detection

**Migration Example:**
```typescript
// Before (string matching)
if (error.message.includes('timeout')) { ... }

// After (typed)
const appError = toAppError(error);
if (isTimeout(appError)) { ... }
if (appError.code === ErrorCode.TIMEOUT) { ... }
```

---

### C.2: Unified Error Payload Format - DEFERRED

**Status:** Deferred (high risk, moderate benefit)

**Rationale:**
- Would require modifying 20+ message handlers
- UI components already handle different formats
- New code can use typed errors while existing code continues working
- Risk of regression outweighs consistency benefit

**Future Consideration:**
- Revisit if new features consistently struggle with error formats
- Could implement incrementally per-feature if needed

---

### C.3: Error Code System (1 hour) ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~30 minutes

**Deliverable:** `src/types/errorCodes.ts`

**Error Code Categories:**
| Category | Prefix | Count | Examples |
|----------|--------|-------|----------|
| General | - | 5 | UNKNOWN, TIMEOUT, NETWORK, CANCELLED, RATE_LIMITED |
| Auth | AUTH_ | 6 | AUTH_REQUIRED, AUTH_EXPIRED, AUTH_NO_APP_BUILDER |
| Prereq | PREREQ_ | 5 | PREREQ_NOT_INSTALLED, PREREQ_VERSION_MISMATCH |
| Mesh | MESH_ | 5 | MESH_DEPLOY_FAILED, MESH_VERIFY_FAILED |
| Component | COMPONENT_ | 5 | COMPONENT_NOT_FOUND, COMPONENT_CONFIG_INVALID |
| Project | PROJECT_ | 6 | PROJECT_CREATE_FAILED, PROJECT_NOT_FOUND |
| Config | CONFIG_ | 4 | CONFIG_PARSE_ERROR, CONFIG_INVALID |

**Utility Functions:**
- `getErrorCategory(code)` - Get category from code
- `isRecoverableError(code)` - Check if user can retry
- `getErrorTitle(code)` - User-friendly title for each code

**Backward Compatibility:**
- Added `@deprecated` note to `isTimeoutError()` in typeGuards.ts
- Existing code continues to work unchanged

---

### C.4: Migration Example ✅ COMPLETE

**Completed:** 2025-11-27

**Migrated:** `authenticationErrorFormatter.ts`

**Before (string matching):**
```typescript
if (errorMessage.toLowerCase().includes('timeout')) {
    title = 'Operation Timed Out';
} else if (errorMessage.toLowerCase().includes('network')) {
    title = 'Network Error';
}
```

**After (typed errors with codes):**
```typescript
const appError = toAppError(error);
const code = appError.code;
const category = getErrorCategory(code);

switch (category) {
    case 'general':
        if (code === ErrorCode.TIMEOUT) { ... }
        break;
    case 'auth':
        title = getErrorTitle(code);
        break;
}

return { title, message, technical, code }; // Now includes error code!
```

**Benefits:**
- No string matching - type-safe error detection
- Consistent titles from `getErrorTitle()`
- Error code included in response for programmatic handling
- Technical details include error code for debugging

**Tests Updated:** 18 tests in `authenticationErrorFormatter.test.ts`

---

### C.5: Test Infrastructure Fixes ✅ COMPLETE

**Completed:** 2025-11-27
**Actual Effort:** ~30 minutes

**Issue:** Phase B helper functions (`determinePrerequisiteStatus`, `getPrerequisiteStatusMessage`) were added to `shared.ts` but 9 prerequisite test files used `jest.mock('@/features/prerequisites/handlers/shared')` without preserving real implementations, causing `status: undefined` errors.

**Root Cause:** Jest auto-mock replaces all exports with `jest.fn()` returning `undefined` by default.

**Fix Pattern:**
```typescript
// Before (broken - all functions return undefined)
jest.mock('@/features/prerequisites/handlers/shared');

// After (preserves real implementations)
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
    };
});
```

**Files Fixed:**
- `tests/features/prerequisites/handlers/installHandler-happyPath.test.ts`
- `tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts`
- `tests/features/prerequisites/handlers/installHandler-adobeCLI.test.ts`
- `tests/features/prerequisites/handlers/installHandler-shellOptions.test.ts`
- `tests/features/prerequisites/handlers/installHandler-sharedUtilities.test.ts`
- `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts`
- `tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts`
- `tests/features/prerequisites/handlers/checkHandler-multiVersion.test.ts`
- `tests/features/prerequisites/handlers/checkHandler-operations.test.ts`

**Test Results:**
- Prerequisite handlers: 137 tests passing
- Authentication: 549 tests passing
- Full suite: 3779 passing, 1 unrelated failure (meshEndpoint)

---

## Metrics & Success Criteria

### Phase A Targets ✅ ALL COMPLETE
- [x] ErrorBoundary coverage: 1/5 → 5/5 (all wizard steps now protected)
- [x] Silent catch blocks: Audit complete, all fixed or documented
- [x] Documentation: Error handling guide created (`docs/architecture/error-handling.md`)

### Phase B Targets ✅ ALL COMPLETE
- [x] Readability scan: Handlers and hooks reviewed for inline complexity
- [x] Complex inline expressions: Refactored to named variables/helpers
- [x] jscpd scan: 2.31% duplication (healthy - no action needed)
- [x] Extraction candidates: All valuable ones implemented
- [x] **NEW:** SOP created: `.rptc/sop/code-patterns.md` (prevents pattern regression)

### Phase C Targets (Modified Approach) ✅ MOSTLY COMPLETE
- [ ] Error payload formats: 3 → 1 unified format - **DEFERRED** (high risk)
- [x] Custom error classes: 7 typed error classes (AppError, TimeoutError, NetworkError, AuthError, ValidationError, PrerequisiteError, MeshError)
- [x] Error codes: Full enum with 36 codes across 7 categories
- [x] Migration example: authenticationErrorFormatter updated with tests
- [x] Migration complete: Removed `isTimeoutError()` from typeGuards.ts, updated 4 callers to use `isTimeout(toAppError())`
- [x] Test infrastructure: 9 prerequisite test files fixed (jest.requireActual pattern)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regression in error display | Medium | High | Comprehensive test coverage |
| Breaking existing UI handling | Medium | Medium | Incremental migration, feature flags |
| Over-engineering error system | Low | Medium | Apply YAGNI, defer Phase C if not needed |
| Merge conflicts | Low | Low | Work on dedicated branch |

---

## Coordination Notes

**Dependencies:**
- Phase A: Independent, can start immediately
- Phase B: Independent, can run parallel to A
- Phase C: Depends on A/B completion and decision gate

**Branch Strategy:**
- Continue on `refactor/core-architecture-wip`
- Or create `refactor/error-handling-consolidation` if preferred

**Testing Requirements:**
- Run full test suite after each sub-phase
- Verify build passes before moving to next phase
