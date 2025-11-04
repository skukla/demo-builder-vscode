# Step 5: Update Authentication Test Mocks

## Summary

Update authentication test mocks to match refactored authentication service interfaces. Fix security validation test expectations for sanitization patterns. Update token manager and auth cache mocks to align with current service structure.

---

## Purpose

Authentication code was refactored from `src/utils/auth/*` to `src/features/authentication/services/*` with new service boundaries (AuthenticationService, AuthCacheManager, TokenManager, AdobeSDKClient, etc.). Test mocks reference old interfaces and expect outdated behavior patterns. This step updates mocks and test expectations to match current authentication architecture.

---

## Prerequisites

- [x] Step 1 complete (jest-dom matchers configured)
- [x] Step 2 complete (test file paths updated)
- [x] Step 3 complete (logger interface mismatches fixed)
- [x] Step 4 complete (type/export mismatches fixed)

---

## Tests to Write First

**Verification Tests** (confirm fixes work):

- [x] **Test:** Authentication handler tests compile and pass
  - **Given:** Updated auth mocks matching current AuthenticationService interface
  - **When:** Run `npm test authenticationHandlers.test.ts`
  - **Then:** Tests pass without mock interface errors
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [x] **Test:** Token manager tests pass with correct mock interfaces
  - **Given:** Updated TokenManager mock matching current implementation
  - **When:** Run `npm test tokenManager.test.ts`
  - **Then:** Tests pass without type errors
  - **File:** `tests/features/authentication/services/tokenManager.test.ts`

- [x] **Test:** Security validation tests pass with updated expectations
  - **Given:** Corrected sanitization pattern expectations
  - **When:** Run `npm test securityValidation.test.ts`
  - **Then:** All sanitization tests pass
  - **Files:** `tests/core/validation/securityValidation.test.ts`, `tests/utils/securityValidation.test.ts`

- [x] **Test:** Auth service tests pass with updated cache manager mocks
  - **Given:** AuthCacheManager mocks match current TTL-based caching
  - **When:** Run `npm test authenticationService.test.ts`
  - **Then:** Tests pass without cache interface errors
  - **File:** `tests/features/authentication/services/authenticationService.test.ts`

- [x] **Test:** Full test suite shows ~10 additional passing tests
  - **Given:** All auth-related mocks updated
  - **When:** Run `npm test`
  - **Then:** ~10 fewer failures (down to ~48 from ~58)

---

## Files to Modify

### Authentication Handler Tests
- [x] `tests/features/authentication/handlers/authenticationHandlers.test.ts`
  - Update HandlerContext mock with current AuthenticationService methods
  - Add new service methods: `ensureSDKInitialized`, `getCachedOrganization`, `getCachedProject`
  - Update method signatures for cache-aware operations

- [x] `tests/commands/handlers/authenticationHandlers.test.ts`
  - Align mock with features/authentication version (if duplicate exists)
  - Ensure consistent mock factory pattern

### Authentication Service Tests
- [x] `tests/features/authentication/services/authenticationService.test.ts`
  - Update AuthCacheManager mock with TTL-based methods
  - Add `getCachedOrganization`, `setCachedOrganization`, `clearCache` mocks
  - Update TokenManager mock with current interface

### Security Validation Tests
- [x] `tests/core/validation/securityValidation.test.ts`
  - Fix sanitization pattern expectations (paths, tokens, API keys)
  - Update redaction expectations to match current sanitizer patterns
  - Verify `sanitizeErrorForLogging` vs `sanitizeError` behavior

- [x] `tests/utils/securityValidation.test.ts`
  - Sync with core/validation tests (may be legacy duplicate)
  - Update or remove if redundant with core tests

### Mock Utility Files
- [x] `tests/utils/mocks/auth.ts` (if exists)
  - Update shared auth mock factory with current service interfaces
  - Export reusable mock patterns for AuthenticationService

### Other Auth-Related Tests (~6 additional files)
- [x] Search for and update other tests importing auth services:
  - Tests importing from old `@/utils/adobeAuthManager` paths
  - Tests with outdated auth method signatures
  - Tests expecting synchronous auth operations (now async with SDK)

---

## Implementation Details

### RED Phase (Current State - Failing)

**Current Errors:**

**1. Mock Method Signature Mismatches:**
```typescript
// Test expects old interface
mockContext.authManager.isAuthenticated() // ❌ Method doesn't exist

// Current interface uses:
mockContext.authManager.isAuthenticatedQuick() // ✅ Correct method
```

**2. Missing Cache Methods:**
```typescript
// Tests fail - methods missing from mock
mockContext.authManager.getCachedOrganization() // ❌ Not in mock
mockContext.authManager.ensureSDKInitialized() // ❌ Not in mock
```

**3. Security Validation Expectations:**
```typescript
// Test expects old sanitization pattern
expect(sanitized).toContain('[REDACTED]'); // ❌ Wrong pattern

// Current pattern uses:
expect(sanitized).toContain('<redacted>'); // ✅ Correct pattern
```

**Failing Tests (~10 files):**
- `authenticationHandlers.test.ts` (features & commands versions)
- `authenticationService.test.ts`
- `tokenManager.test.ts`
- `securityValidation.test.ts` (core & utils versions)
- Other auth-dependent tests

---

### GREEN Phase (Minimal Implementation)

**Step 1: Update HandlerContext Auth Mock Factory**

Update `tests/features/authentication/handlers/authenticationHandlers.test.ts`:
- Replace `isAuthenticated()` with `isAuthenticatedQuick()`
- Add cache-aware methods: `getCachedOrganization()`, `getCachedProject()`, `ensureSDKInitialized()`
- Add validation methods: `getValidationCache()`, `wasOrgClearedDueToValidation()`, `setOrgRejectedFlag()`
- See AuthenticationService interface for complete method list

**Step 2: Update Security Validation Test Expectations**

In `tests/core/validation/securityValidation.test.ts`:
- Change `[REDACTED]` → `<redacted>` (tokens/secrets)
- Change to `<path>` for file paths
- Change to `<token>` for JWT tokens
- Update all sanitization pattern assertions to match current implementation

**Step 3: Update AuthCacheManager Mock**
- Add TTL-based cache methods: `getCachedOrganization()`, `setCachedOrganization()`, etc.
- Add cache management: `clearCache()`, `clearOrganizationCache()`
- Add validation: `getValidationCache()`, `setValidationCache()`

**Step 4: Update TokenManager Mock**
- Use real TokenManager with mocked CommandExecutor and AuthCache dependencies

**Step 5: Search and Update Other Auth Test Files**
- Find: `grep -r "from '@/utils/adobeAuthManager'" tests/`
- Update old import paths and method names

**Step 6: Verify**
- Run: `npm test -- --testPathPattern="authentication"`
- Confirm ~10 additional tests now pass

---

### REFACTOR Phase (Improve Quality)

Optional improvements:
- Consolidate duplicate mock factories to `tests/utils/mocks/authenticationMocks.ts`
- Remove legacy `tests/utils/securityValidation.test.ts` if duplicate of core version
- Document mock patterns with interface structure comments

Run full suite: `npm test` - verify ~10 additional tests pass (down to ~48 failures)

---

## Expected Outcome

- ~10 auth-related tests passing (down to ~48 failures from ~58)
- All auth mocks match current AuthenticationService interface
- All security sanitization tests pass
- No auth-related TypeScript errors

---

## Acceptance Criteria

- [x] All auth mock factories updated to match current service interfaces
- [x] `authenticationHandlers.test.ts` tests pass (both features & commands versions)
- [x] `authenticationService.test.ts` tests pass
- [x] `tokenManager.test.ts` tests pass
- [x] Security validation tests pass with correct sanitization patterns
- [x] No references to old `@/utils/adobeAuthManager` import paths in tests
- [x] No mock method signature mismatches (TypeScript errors resolved)
- [x] Test suite shows ~10 additional passing tests
- [x] No new test failures introduced

---

## Dependencies

**No New Dependencies Required**

This step only updates existing test mocks and expectations to match refactored authentication services.

---

## Estimated Time

**30-40 minutes** (largest category of fixes)

- Update HandlerContext auth mock factory: 10 minutes
- Fix security validation test expectations: 5 minutes
- Update auth service and token manager tests: 10 minutes
- Search and update other auth tests: 10 minutes
- Verify and refactor: 5-10 minutes

---

## Reference

- **SOP:** `testing-guide.md` - Mock patterns and test organization
- **SOP:** `security-and-performance.md` - Security validation patterns
- **Source:** `src/features/authentication/services/authenticationService.ts` - Current auth interface
- **Source:** `src/features/authentication/services/authCacheManager.ts` - Cache manager interface
- **Source:** `src/core/validation/securityValidation.ts` - Sanitization patterns
