# Step 4: Rename Misleading Method

## Purpose

Rename `isAuthenticatedQuick()` to `isAuthenticated()` throughout the codebase to remove misleading performance implications. The "Quick" suffix incorrectly suggests sub-second performance when reality is 2-3 seconds due to Adobe CLI `aio config get` commands. The method is "token-only" (no org validation), not actually "quick".

**Secondary change:** Rename existing `isAuthenticated()` to `isFullyAuthenticated()` to distinguish full validation (token + org access) from token-only checks.

## Prerequisites

- [ ] Development environment ready with TypeScript watch mode
- [ ] Test environment configured for Jest backend testing

**Note:** This step is pure refactoring (method renaming) and has no functional dependencies on Steps 1-3. It can be implemented in any order, but implementing it LAST avoids needing to update new code added by other steps.

## Tests to Write First (RED Phase)

### Unit Tests - Method Renaming

- [ ] Test: `isAuthenticated()` (renamed from Quick) works identically to old implementation
  - **Given:** Valid token in Adobe CLI config
  - **When:** Call `authService.isAuthenticated()`
  - **Then:** Returns `true` and uses cache correctly
  - **File:** `tests/features/authentication/services/authenticationService.test.ts`

- [ ] Test: `isFullyAuthenticated()` (renamed) validates org context
  - **Given:** Valid token but no org context
  - **When:** Call `authService.isFullyAuthenticated()`
  - **Then:** Calls `validateAndClearInvalidOrgContext()` and returns result
  - **File:** `tests/features/authentication/services/authenticationService.test.ts`

- [ ] Test: Performance tracker uses updated threshold (2500ms for isAuthenticated)
  - **Given:** `isAuthenticated()` takes 2200ms
  - **When:** Performance tracking completes
  - **Then:** No warning logged (within threshold)
  - **File:** `tests/features/authentication/services/performanceTracker.test.ts`

- [ ] Test: Performance tracker warns at correct threshold
  - **Given:** `isAuthenticated()` takes 3000ms
  - **When:** Performance tracking completes
  - **Then:** Warning logged for exceeding 2500ms threshold
  - **File:** `tests/features/authentication/services/performanceTracker.test.ts`

### Integration Tests - Call Sites Updated

- [ ] Test: `authenticationHandlers.ts` uses renamed method correctly
  - **Given:** Handler receives CHECK_AUTHENTICATION message
  - **When:** Handler calls `authManager.isAuthenticated()`
  - **Then:** Authentication check completes and returns status
  - **File:** `tests/features/authentication/handlers/authenticationHandlers-checkAuth.test.ts`

- [ ] Test: `dashboardHandlers.ts` uses renamed method correctly
  - **Given:** Dashboard loads
  - **When:** Handler calls `authManager.isAuthenticated()`
  - **Then:** Quick auth check completes without org validation
  - **File:** `tests/features/dashboard/handlers/dashboardHandlers.test.ts`

## Files to Create/Modify

**Files to Modify:**

- [ ] `src/features/authentication/services/authenticationService.ts`
  - Rename method `isAuthenticatedQuick()` → `isAuthenticated()` (lines 116-146)
  - Rename method `isAuthenticated()` → `isFullyAuthenticated()` (lines 156-219)
  - Update JSDoc: "Token-only authentication check (2-3s, no org validation)"
  - Update cross-references in JSDoc (line 154 comment)

- [ ] `src/features/authentication/services/performanceTracker.ts`
  - Update threshold: `'isAuthenticated': 2500` (was 1000ms for Quick, line 15)
  - Remove old `'isAuthenticatedQuick'` entry (line 15)
  - Add `'isFullyAuthenticated': 3000` entry if needed

- [ ] `src/features/authentication/handlers/authenticationHandlers.ts`
  - Update call sites: `authManager.isAuthenticated()` (lines 36, 161)
  - **Note:** If Step 2 implemented first, also update new token expiry code (lines ~300-320)
  - Update any comments referencing the method

- [ ] `src/features/dashboard/handlers/dashboardHandlers.ts`
  - Update call site: `authManager.isAuthenticated()` (line 383)
  - Update any comments referencing the method

**Documentation Files to Update:**

- [ ] `src/commands/CLAUDE.md` - Update method references (lines 257, 441, 476)
- [ ] `docs/CLAUDE.md` - Update usage examples (lines 469, 499)
- [ ] `src/features/authentication/README.md` - Update method documentation
- [ ] `src/features/dashboard/README.md` - Update call examples (lines 143, 159, 317, 362)

**Test Files to Update:**

- [ ] `tests/features/authentication/services/authenticationService.test.ts`
  - Rename test describe block: `'isAuthenticated'` (was `'isAuthenticatedQuick'`, line 136)
  - Update all test method calls to `isAuthenticated()`
  - Add new test block for `isFullyAuthenticated()` if needed

- [ ] `tests/features/authentication/services/performanceTracker.test.ts`
  - Update test expectations for new threshold (lines 118-130)

- [ ] `tests/features/authentication/handlers/authenticationHandlers-checkAuth.test.ts`
  - Update all mock calls: `.isAuthenticated` (was `.isAuthenticatedQuick`)
  - Update test descriptions referencing the method (line 162)

- [ ] `tests/features/authentication/handlers/authenticationHandlers-messages.test.ts`
  - Update all mock calls: `.isAuthenticated` (was `.isAuthenticatedQuick`)

- [ ] `tests/features/authentication/handlers/testUtils.ts`
  - Update mock interface: `isAuthenticated: jest.fn()` (line 49)

## Implementation Details (RED-GREEN-REFACTOR)

### RED: Write Failing Tests First

**1. Update test files to reference new method names:**

```typescript
// tests/features/authentication/services/authenticationService.test.ts
describe('isAuthenticated', () => {  // Was: 'isAuthenticatedQuick'
    it('should return cached result if not expired', async () => {
        // Mock cache with valid result
        jest.spyOn(authService['cacheManager'], 'getCachedAuthStatus')
            .mockReturnValue({ isAuthenticated: true, isExpired: false });

        const result = await authService.isAuthenticated();  // Renamed method

        expect(result).toBe(true);
    });
});

describe('isFullyAuthenticated', () => {  // Was: 'isAuthenticated'
    it('should validate org context in addition to token', async () => {
        jest.spyOn(authService['tokenManager'], 'isTokenValid')
            .mockResolvedValue(true);
        jest.spyOn(authService['organizationValidator'], 'validateAndClearInvalidOrgContext')
            .mockResolvedValue();

        const result = await authService.isFullyAuthenticated();

        expect(result).toBe(true);
        expect(authService['organizationValidator'].validateAndClearInvalidOrgContext)
            .toHaveBeenCalled();
    });
});
```

**2. Update performance tracker tests:**

```typescript
// tests/features/authentication/services/performanceTracker.test.ts
it('should NOT warn when isAuthenticated() takes 2200ms (within 2500ms threshold)', () => {
    const tracker = new PerformanceTracker();
    const warnSpy = jest.spyOn(console, 'warn');

    tracker.startTiming('isAuthenticated');
    jest.advanceTimersByTime(2200);
    tracker.endTiming('isAuthenticated');

    expect(warnSpy).not.toHaveBeenCalled();
});

it('should warn when isAuthenticated() exceeds 2500ms threshold', () => {
    const tracker = new PerformanceTracker();

    tracker.startTiming('isAuthenticated');
    jest.advanceTimersByTime(3000);
    const warnings = tracker.endTiming('isAuthenticated');

    expect(warnings).toContain('SLOW');
    expect(warnings).toContain('expected <2500ms');
});
```

**3. Update handler test mocks:**

```typescript
// tests/features/authentication/handlers/testUtils.ts
const mockContext: HandlerContext = {
    authManager: {
        isAuthenticated: jest.fn(),  // Was: isAuthenticatedQuick
        isFullyAuthenticated: jest.fn(),  // Was: isAuthenticated
        // ... other methods
    },
    // ... rest of context
};
```

### GREEN: Minimal Implementation

**1. Rename methods in `authenticationService.ts`:**

```typescript
// Line 106-116: Update JSDoc
/**
 * Token-only authentication check - verifies token existence and expiry
 * Does NOT validate org access or initialize SDK
 * Typical duration: 2-3 seconds (Adobe CLI config read overhead)
 *
 * Use this for dashboard loads and non-critical paths.
 * For full validation including org context, use isFullyAuthenticated()
 */
async isAuthenticated(): Promise<boolean> {  // Was: isAuthenticatedQuick
    this.performanceTracker.startTiming('isAuthenticated');  // Update tracking key

    // ... rest of implementation unchanged ...

    this.performanceTracker.endTiming('isAuthenticated');  // Update tracking key
}

// Line 148-156: Update method name and JSDoc
/**
 * Full authentication check - validates token AND organization access
 * Includes org context validation via validateAndClearInvalidOrgContext()
 * Typical duration: 3-10 seconds (includes org API calls)
 *
 * For token-only checks without org validation, use isAuthenticated()
 */
async isFullyAuthenticated(): Promise<boolean> {  // Was: isAuthenticated
    this.performanceTracker.startTiming('isFullyAuthenticated');  // Update tracking key

    // ... rest of implementation unchanged ...

    this.performanceTracker.endTiming('isFullyAuthenticated');  // Update tracking key
}
```

**2. Update `performanceTracker.ts`:**

```typescript
// Line 13-26: Update thresholds
private readonly expectedTimes: Record<string, number> = {
    'isAuthenticated': 2500,        // Was: 'isAuthenticatedQuick': 1000
    'isFullyAuthenticated': 3000,   // Was: 'isAuthenticated': 3000
    'getOrganizations': 5000,
    // ... rest unchanged
};
```

**3. Update call sites in `authenticationHandlers.ts`:**

```typescript
// Line 36: Update method call
const isAuthenticated = await context.authManager?.isAuthenticated();  // Was: isAuthenticatedQuick

// Line 161: Update method call
const isAlreadyAuth = await context.authManager?.isAuthenticated();  // Was: isAuthenticatedQuick
```

**4. Update call site in `dashboardHandlers.ts`:**

```typescript
// Line 383: Update method call
const isAuthenticated = await authManager.isAuthenticated();  // Was: isAuthenticatedQuick
```

**5. Update all test files:**

Use global find-replace to update:
- Test describe blocks: `'isAuthenticatedQuick'` → `'isAuthenticated'`
- Mock method names: `.isAuthenticatedQuick` → `.isAuthenticated`
- Test descriptions and comments

**6. Update documentation files:**

Update method references in:
- `src/commands/CLAUDE.md`
- `docs/CLAUDE.md`
- `src/features/authentication/README.md`
- `src/features/dashboard/README.md`

### REFACTOR: Clean Up

**1. Search for remaining references:**

```bash
# Ensure no stale references remain
grep -r "isAuthenticatedQuick" src/
grep -r "isAuthenticatedQuick" tests/
grep -r "isAuthenticatedQuick" docs/
```

**2. Verify no naming collisions:**

- Confirm `checkAuthentication()` in `AdobeAuthStep.tsx` is unaffected (local function)
- Confirm no other `isAuthenticated()` methods exist in other services

**3. Update log messages:**

Search for any log messages referencing "quick check" or "quick authentication":
- Update to: "Token-only authentication check"
- Clarify: "Does not validate org access"

**4. Verify TypeScript compilation:**

```bash
npm run build
# Should complete with no errors
```

## Expected Outcome

**Behavior After This Step:**

1. Method `isAuthenticated()` performs token-only check (2-3s typical duration)
2. Method `isFullyAuthenticated()` performs token + org validation (3-10s)
3. Performance warnings align with reality (2500ms threshold for token-only)
4. All call sites updated across handlers, tests, and documentation
5. No compilation errors or test failures
6. JSDoc comments clearly explain method purpose and performance characteristics

**Verification:**

1. **Compile check:** `npm run build` succeeds
2. **Test check:** `npm test` passes all tests
3. **Grep check:** No references to `isAuthenticatedQuick` remain
4. **Runtime check:** Dashboard loads using `isAuthenticated()` without warnings in normal scenarios
5. **Performance check:** Debug logs show realistic timing expectations

## Acceptance Criteria

- [ ] Method renamed from `isAuthenticatedQuick()` to `isAuthenticated()` in `authenticationService.ts`
- [ ] Existing `isAuthenticated()` renamed to `isFullyAuthenticated()`
- [ ] Performance threshold updated to 2500ms (from 1000ms)
- [ ] All call sites updated in handlers (authentication, dashboard)
- [ ] All test files updated (describe blocks, mocks, assertions)
- [ ] All documentation updated (CLAUDE.md files, README.md files)
- [ ] JSDoc comments clarified: "Token-only check (2-3s, no org validation)"
- [ ] No naming collision with `checkAuthentication()` (confirmed separate function)
- [ ] TypeScript compilation succeeds with no errors
- [ ] All existing tests pass after renaming
- [ ] No console warnings for performance under 2500ms
- [ ] Grep search confirms no stale `isAuthenticatedQuick` references remain

## Dependencies from Other Steps

**Depends on:** Steps 1-3 completed (method may be referenced in Step 2 token expiry logic)

**Impact:** This is a refactoring step - does not change functional behavior, only method names and performance expectations. Previous steps will continue to work identically after renaming.

## Estimated Time

30-45 minutes

---

**Key Implementation Notes:**

1. **Two renames required:**
   - `isAuthenticatedQuick()` → `isAuthenticated()` (main rename)
   - `isAuthenticated()` → `isFullyAuthenticated()` (avoid collision)

2. **Performance threshold rationale:**
   - Old: 1000ms (unrealistic, caused false warnings)
   - New: 2500ms (accounts for 2-3s Adobe CLI overhead)
   - Alternative: Remove warning entirely (but threshold helps detect regressions)

3. **Naming collision avoided:**
   - `checkAuthentication()` exists in `AdobeAuthStep.tsx` but is local function (no conflict)
   - Using `isAuthenticated()` for token-only check (most common use case)
   - Using `isFullyAuthenticated()` for comprehensive validation (less common)

4. **Documentation clarity:**
   - Emphasize "token-only" vs "token + org" distinction
   - Remove misleading "quick" language that implies sub-second performance
   - Set realistic performance expectations (2-3s, not <1s)
