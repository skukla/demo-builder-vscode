# Step 2: Audit Critical (Security) Coverage Gaps

## Purpose

Address security-critical coverage gaps identified in Step 1. Security code requires 100% coverage to prevent vulnerabilities like input validation bypass, authentication failures, and path traversal attacks.

## Prerequisites

- [ ] Step 1 complete (coverage analysis done)
- [ ] Security-critical files identified from coverage report
- [ ] All existing tests still passing

---

## Security-Critical Code Areas

### Expected Files to Audit

Based on codebase structure, security-critical code includes:

**Input Validation:**
- `src/core/validation/Validator.ts`
- `src/core/validation/fieldValidation.ts`
- `src/core/validation/PathSafetyValidator.ts`
- `src/core/validation/URLValidator.ts`
- `src/core/validation/SensitiveDataRedactor.ts`
- `src/core/validation/validators/*.ts`

**Authentication:**
- `src/features/authentication/services/tokenManager.ts`
- `src/features/authentication/services/authenticationService.ts`
- `src/features/authentication/services/authCacheManager.ts`

**Path Security:**
- `src/core/logging/debugLogger.ts` (path validation)
- `src/core/shell/commandExecutor.ts` (command injection prevention)

---

## Tasks

### 2.1 Validation Module Coverage

**Target:** 100% branch coverage for all validation code

- [ ] Review `src/core/validation/Validator.ts` coverage
  - [ ] Test all validation methods
  - [ ] Test invalid input handling
  - [ ] Test edge cases (null, undefined, empty)

- [ ] Review `src/core/validation/fieldValidation.ts` coverage
  - [ ] Test project name validation
  - [ ] Test URL validation
  - [ ] Test Commerce URL validation
  - [ ] Test all error conditions

- [ ] Review `src/core/validation/PathSafetyValidator.ts` coverage
  - [ ] Test path traversal prevention (.., /)
  - [ ] Test absolute path handling
  - [ ] Test symlink detection (if applicable)

- [ ] Review `src/core/validation/URLValidator.ts` coverage
  - [ ] Test valid URL formats
  - [ ] Test invalid URL rejection
  - [ ] Test protocol validation (http, https)
  - [ ] Test malicious URL patterns

- [ ] Review `src/core/validation/SensitiveDataRedactor.ts` coverage
  - [ ] Test credential redaction
  - [ ] Test API key patterns
  - [ ] Test token patterns
  - [ ] Test partial match handling

**Tests to Write:**

- [ ] Test: Invalid input types rejected
  - **Given:** Non-string input to string validators
  - **When:** Validation called
  - **Then:** Appropriate error returned
  - **File:** `tests/core/validation/Validator-types.test.ts`

- [ ] Test: Path traversal attempts blocked
  - **Given:** Path containing `../` or absolute paths
  - **When:** PathSafetyValidator called
  - **Then:** Validation fails with security error
  - **File:** `tests/core/validation/PathSafetyValidator-traversal.test.ts`

- [ ] Test: All sensitive patterns redacted
  - **Given:** String containing various credential patterns
  - **When:** SensitiveDataRedactor processes string
  - **Then:** All patterns replaced with redaction markers
  - **File:** `tests/core/validation/SensitiveDataRedactor-patterns.test.ts`

### 2.2 Authentication Service Coverage

**Target:** 100% branch coverage for token handling

- [ ] Review `tokenManager.ts` coverage
  - [ ] Test token validation
  - [ ] Test token expiry checking
  - [ ] Test token refresh paths
  - [ ] Test invalid token handling

- [ ] Review `authenticationService.ts` coverage
  - [ ] Test authentication flow
  - [ ] Test re-authentication
  - [ ] Test auth failure handling
  - [ ] Test session management

- [ ] Review `authCacheManager.ts` coverage
  - [ ] Test cache invalidation
  - [ ] Test TTL expiry
  - [ ] Test cache size limits
  - [ ] Test concurrent access

**Tests to Write:**

- [ ] Test: Expired tokens rejected
  - **Given:** Token with past expiry timestamp
  - **When:** Token validation called
  - **Then:** Token rejected, re-auth triggered
  - **File:** `tests/features/authentication/services/tokenManager-expiry.test.ts`

- [ ] Test: Invalid token format rejected
  - **Given:** Malformed token string
  - **When:** Token parsed/validated
  - **Then:** Error thrown with appropriate message
  - **File:** `tests/features/authentication/services/tokenManager-format.test.ts`

- [ ] Test: Cache entries expire correctly
  - **Given:** Cache entry with TTL
  - **When:** TTL expires
  - **Then:** Entry removed, fresh fetch triggered
  - **File:** `tests/features/authentication/services/authCacheManager-expiry.test.ts`

### 2.3 Command Execution Security

**Target:** 100% coverage for command sanitization

- [ ] Review `commandExecutor.ts` security paths
  - [ ] Test command argument sanitization
  - [ ] Test shell escape handling
  - [ ] Test environment variable handling
  - [ ] Test timeout enforcement

**Tests to Write:**

- [ ] Test: Shell metacharacters escaped
  - **Given:** Command with shell metacharacters (;, |, &, etc.)
  - **When:** Command executed
  - **Then:** Characters properly escaped or rejected
  - **File:** `tests/core/shell/commandExecutor-sanitization.test.ts`

- [ ] Test: Environment variables not leaked
  - **Given:** Command execution with sensitive env vars
  - **When:** Command logged/reported
  - **Then:** Sensitive values redacted
  - **File:** `tests/core/shell/commandExecutor-envRedaction.test.ts`

### 2.4 Debug Logger Path Security

**Target:** 100% coverage for path validation in logging

- [ ] Review `debugLogger.ts` path handling
  - [ ] Test file path sanitization
  - [ ] Test log destination validation
  - [ ] Test error message sanitization

**Tests to Write:**

- [ ] Test: Log paths validated
  - **Given:** Suspicious file path for log output
  - **When:** Logger configured
  - **Then:** Invalid paths rejected
  - **File:** `tests/core/logging/debugLogger-pathSecurity.test.ts`

---

## Implementation Details

### RED Phase (Write failing tests)

For each uncovered security path:

```typescript
describe('Security: [Component]', () => {
  describe('input validation', () => {
    it('should reject [malicious input pattern]', () => {
      // Arrange: Create malicious input
      const maliciousInput = '...';

      // Act: Call validation
      const result = validate(maliciousInput);

      // Assert: Validation fails
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('security');
    });
  });
});
```

### GREEN Phase (Make tests pass)

- Verify existing code handles the cases
- If code doesn't handle case, document as security issue
- Add handling code if missing (with security review)

### REFACTOR Phase

- Consolidate similar security tests
- Extract common security test utilities
- Ensure consistent error messages

---

## Expected Outcome

After completing this step:
- All validation code at 100% branch coverage
- All authentication code at 100% branch coverage
- Command execution security paths tested
- Logging path security verified
- Any security gaps documented for immediate fix

---

## Acceptance Criteria

- [ ] `src/core/validation/*.ts` at 100% branch coverage
- [ ] `src/features/authentication/services/tokenManager.ts` at 100% coverage
- [ ] `src/features/authentication/services/authCacheManager.ts` at 100% coverage
- [ ] `src/core/shell/commandExecutor.ts` security paths tested
- [ ] `src/core/logging/debugLogger.ts` path validation tested
- [ ] All security tests passing
- [ ] No security vulnerabilities introduced

---

## Security Review Checklist

After completing tests, verify:

- [ ] All input validation tested with malicious inputs
- [ ] All authentication paths tested (valid/invalid/expired)
- [ ] All error messages don't leak sensitive info
- [ ] All file paths validated for traversal
- [ ] All command inputs sanitized

---

## Time Estimate

**Estimated:** 2-3 hours

- Validation module tests: 45-60 minutes
- Authentication service tests: 45-60 minutes
- Command execution tests: 30 minutes
- Debug logger tests: 15-30 minutes
- Review and cleanup: 15-30 minutes

---

## Notes

- Security tests should be paranoid - test every edge case
- When in doubt about security, add the test
- Document any security concerns found during testing
- Consider fuzz testing for validation functions
- Ensure error messages don't reveal implementation details
