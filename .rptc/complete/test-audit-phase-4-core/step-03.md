# Step 3: Validation + Utils Tests (20 files)

> **Phase:** 4 - Core Infrastructure
> **Step:** 3 of 5
> **Focus:** Security validation, field validation, utility functions

## Overview

**Purpose:** Audit all validation and utils module tests to ensure they accurately reflect current security validation patterns, field validation dispatcher, and utility functions.

**Estimated Time:** 2-3 hours

**Prerequisites:**
- [ ] Step 2 (State) complete
- [ ] All current tests pass
- [ ] Access to src/core/validation/*.ts and src/core/utils/*.ts for reference

---

## Source Files for Reference

### Validation Module

```
src/core/validation/
├── Validator.ts              # Composable validation functions
├── fieldValidation.ts        # Field validation dispatcher
├── normalizers.ts            # Input normalizers
├── index.ts                  # Public exports
└── validators/
    ├── securityValidation.ts # Security validators (injection, path traversal)
    ├── networkValidation.ts  # Network/URL validation
    └── nodeVersionValidation.ts # Node version validation
```

### Utils Module

```
src/core/utils/
├── bundleUri.ts              # Webview bundle URI utilities
├── disposableStore.ts        # Disposable collection management
├── envParser.ts              # Environment file parsing
├── envVarExtraction.ts       # Environment variable extraction
├── executionLock.ts          # Execution locking
├── getWebviewHTMLWithBundles.ts # Webview HTML generation
├── loadingHTML.ts            # Loading state HTML
├── promiseUtils.ts           # Promise utilities
├── quickPickUtils.ts         # VS Code QuickPick helpers
├── timeFormatting.ts         # Time formatting utilities
├── timeoutConfig.ts          # Centralized timeout configuration
├── webviewHTMLBuilder.ts     # Webview HTML builder
├── progressUnifier/          # Progress tracking strategies
└── index.ts                  # Public exports
```

---

## Test Files to Audit

### Validation Tests (8 files)

#### 1. Validator.test.ts

**File:** `tests/core/validation/Validator.test.ts`

**Audit Checklist:**
- [ ] Composable validator API matches current implementation
- [ ] `required()`, `minLength()`, `maxLength()`, `pattern()` signatures verified
- [ ] `ValidationResult` type: `{ valid: boolean, error?: string }`
- [ ] Validator composition (chain) pattern verified

**Key Verification Points:**
```typescript
// Verify these match current implementation:
type Validator = (value: string) => ValidationResult
interface ValidationResult { valid: boolean; error?: string }
required(message?: string): Validator
minLength(min: number, message?: string): Validator
maxLength(max: number, message?: string): Validator
pattern(regex: RegExp, errorMessage: string): Validator
```

#### 2. fieldValidation-dispatcher.test.ts

**File:** `tests/core/validation/fieldValidation-dispatcher.test.ts`

**Audit Checklist:**
- [ ] Dispatcher pattern matches current implementation
- [ ] Field type routing verified
- [ ] Validation result shape verified

#### 3. fieldValidation-commerceUrl.test.ts

**File:** `tests/core/validation/fieldValidation-commerceUrl.test.ts`

**Audit Checklist:**
- [ ] Commerce URL validation patterns verified
- [ ] HTTPS requirement verified
- [ ] Valid/invalid URL test cases current

#### 4. fieldValidation-projectName.test.ts

**File:** `tests/core/validation/fieldValidation-projectName.test.ts`

**Audit Checklist:**
- [ ] Project name validation rules verified
- [ ] Character restrictions current
- [ ] Length limits verified

#### 5. securityValidation-input.test.ts

**File:** `tests/core/validation/securityValidation-input.test.ts`

**Audit Checklist:**
- [ ] `validateAdobeResourceId()` API matches current
- [ ] `validateProjectNameSecurity()` API matches current
- [ ] `validateProjectPath()` API matches current
- [ ] Command injection attack tests comprehensive
- [ ] Shell metacharacter tests current (;, |, &, `, $(), etc.)
- [ ] Error messages match current implementation

**Critical Security Tests:**
```typescript
// Verify these attack vectors are tested:
- Semicolon injection: 'abc; rm -rf /'
- Pipe injection: 'abc | cat /etc/passwd'
- Ampersand injection: 'abc && whoami'
- Backtick injection: 'abc`whoami`'
- Command substitution: 'abc$(whoami)'
- Path traversal: '../../../etc/passwd'
```

#### 6. securityValidation-network.test.ts

**File:** `tests/core/validation/securityValidation-network.test.ts`

**Audit Checklist:**
- [ ] URL validation patterns verified
- [ ] SSRF prevention tests current
- [ ] Private IP rejection verified
- [ ] Localhost rejection verified (if applicable)

#### 7. securityValidation-nodeVersion.test.ts

**File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

**Audit Checklist:**
- [ ] `validateNodeVersion()` API matches current
- [ ] Version format validation verified
- [ ] Malicious version string rejection verified

#### 8. normalizers.test.ts

**File:** `tests/core/validation/normalizers.test.ts`

**Audit Checklist:**
- [ ] Normalizer functions match current exports
- [ ] Name normalization patterns verified
- [ ] Input sanitization behavior verified

**Note:** This is a new test file (untracked in git status). Verify alignment with src/core/validation/normalizers.ts.

---

### Utils Tests (12 files)

#### 9. bundleUri.test.ts

**File:** `tests/core/utils/bundleUri.test.ts`

**Audit Checklist:**
- [ ] Bundle URI generation matches current
- [ ] VS Code URI handling verified
- [ ] Path resolution verified

#### 10. disposableStore.test.ts

**File:** `tests/core/utils/disposableStore.test.ts`

**Audit Checklist:**
- [ ] DisposableStore API matches current
- [ ] LIFO disposal ordering verified
- [ ] `add()`, `dispose()` signatures verified
- [ ] Idempotent dispose behavior verified

**Key Verification Points:**
```typescript
// Verify these match current implementation:
class DisposableStore {
  add(disposable: vscode.Disposable): void
  dispose(): void  // LIFO order
}
```

#### 11. disposableStore.error.test.ts

**File:** `tests/core/utils/disposableStore.error.test.ts`

**Audit Checklist:**
- [ ] Error handling during dispose verified
- [ ] Continue-on-error behavior verified
- [ ] Error logging behavior verified

#### 12. envVarExtraction.test.ts

**File:** `tests/core/utils/envVarExtraction.test.ts`

**Audit Checklist:**
- [ ] Environment variable extraction patterns verified
- [ ] .env file parsing behavior verified
- [ ] Variable substitution handling verified

#### 13. executionLock.test.ts

**File:** `tests/core/utils/executionLock.test.ts`

**Audit Checklist:**
- [ ] Lock acquisition/release patterns verified
- [ ] Concurrent execution prevention verified
- [ ] Lock timeout handling verified

#### 14. getWebviewHTMLWithBundles.test.ts

**File:** `tests/core/utils/getWebviewHTMLWithBundles.test.ts`

**Audit Checklist:**
- [ ] HTML generation matches current template
- [ ] Bundle inclusion verified
- [ ] CSP nonce handling verified

#### 15. loadingHTML.test.ts

**File:** `tests/core/utils/loadingHTML.test.ts`

**Audit Checklist:**
- [ ] Loading HTML generation matches current
- [ ] Spinner/message customization verified

#### 16. promiseUtils.test.ts

**File:** `tests/core/utils/promiseUtils.test.ts`

**Audit Checklist:**
- [ ] Promise utility functions match current exports
- [ ] Timeout wrapper verified
- [ ] Retry logic verified (if present)

#### 17. quickPickUtils.test.ts

**File:** `tests/core/utils/quickPickUtils.test.ts`

**Audit Checklist:**
- [ ] QuickPick helper functions verified
- [ ] VS Code QuickPick mock correct
- [ ] Option formatting verified

#### 18. timeFormatting.test.ts

**File:** `tests/core/utils/timeFormatting.test.ts`

**Audit Checklist:**
- [ ] Time formatting functions verified
- [ ] Duration formatting verified
- [ ] Locale handling verified (if applicable)

#### 19. timeoutConfig.test.ts

**File:** `tests/core/utils/timeoutConfig.test.ts`

**Audit Checklist:**
- [ ] TIMEOUTS constants match current values
- [ ] All timeout categories verified
- [ ] No hardcoded values in other tests (use TIMEOUTS.*)

**Key Constants to Verify:**
```typescript
// Verify these match current implementation:
TIMEOUTS.MIN_COMMAND_TIMEOUT
TIMEOUTS.COMMAND_DEFAULT
TIMEOUTS.CONFIG_WRITE
TIMEOUTS.ADOBE_CLI
TIMEOUTS.PREREQUISITE_CHECK
// etc.
```

#### 20. webviewHTMLBuilder.test.ts

**File:** `tests/core/utils/webviewHTMLBuilder.test.ts`

**Audit Checklist:**
- [ ] HTML builder API matches current
- [ ] Template construction verified
- [ ] Script/style injection verified

---

## Audit Process

For each file:

1. **Read current source** in src/core/validation/ or src/core/utils/
2. **Open test file** in tests/core/validation/ or tests/core/utils/
3. **Verify mock setup** matches current dependencies
4. **For security tests:** Ensure attack vectors are comprehensive
5. **Check each test** for:
   - Correct API calls
   - Correct expected values
   - TIMEOUTS.* usage for timeout values
   - No version references (v2/v3)
6. **Run tests** after changes: `npm test -- tests/core/[validation|utils]/[file].test.ts`
7. **Commit** after each file passes

---

## Common Issues to Fix

### Issue 1: Outdated ValidationResult Shape

**Before:**
```typescript
expect(result).toEqual({
  isValid: true,
  message: ''
});
```

**After:**
```typescript
expect(result).toEqual({
  valid: true
  // error not present when valid
});
```

### Issue 2: Missing Security Attack Vectors

**Before:**
```typescript
// Only tests basic injection
it('should reject semicolon', () => {
  expect(() => validateAdobeResourceId('abc;def')).toThrow();
});
```

**After:**
```typescript
// Comprehensive attack vector testing
it.each([
  ['abc; rm -rf /', 'semicolon'],
  ['abc | cat /etc/passwd', 'pipe'],
  ['abc && whoami', 'ampersand'],
  ['abc`whoami`', 'backtick'],
  ['abc$(whoami)', 'command substitution'],
])('should reject %s injection', (input, _type) => {
  expect(() => validateAdobeResourceId(input, 'test')).toThrow(/illegal characters/);
});
```

### Issue 3: Hardcoded Timeout Values

**Before:**
```typescript
expect(TIMEOUTS.CONFIG_WRITE).toBe(10000);
```

**After:**
```typescript
// Test that constant exists and is reasonable, not exact value
expect(TIMEOUTS.CONFIG_WRITE).toBeGreaterThanOrEqual(5000);
expect(TIMEOUTS.CONFIG_WRITE).toBeLessThanOrEqual(30000);
```

### Issue 4: Outdated Normalizer Tests

If normalizers.test.ts exists but normalizers.ts was recently added/modified, verify all functions are tested.

---

## Security Validation Critical Checks

For security validation tests, ensure these patterns are tested:

### Command Injection Prevention
- [ ] Shell metacharacters: `;`, `|`, `&`, `\``, `$()`
- [ ] Null byte injection: `\0`
- [ ] Newline injection: `\n`, `\r`
- [ ] Quote escaping: `'`, `"`

### Path Traversal Prevention
- [ ] Relative paths: `../`, `..\\`
- [ ] Absolute paths: `/etc/passwd`, `C:\Windows`
- [ ] URL-encoded traversal: `%2e%2e%2f`

### Adobe Resource ID Validation
- [ ] Valid characters: alphanumeric, `-`, `_`
- [ ] Invalid characters: all shell metacharacters
- [ ] Length limits: if any

---

## Completion Criteria

- [ ] All 8 validation test files audited
- [ ] All 12 utils test files audited
- [ ] Security tests comprehensive for all attack vectors
- [ ] All TIMEOUTS.* constants verified
- [ ] All tests pass: `npm test -- tests/core/validation/ tests/core/utils/`
- [ ] No TypeScript errors

---

## Files Modified (Tracking)

### Validation Files

| File | Status | Notes |
|------|--------|-------|
| Validator.test.ts | [ ] | |
| fieldValidation-dispatcher.test.ts | [ ] | |
| fieldValidation-commerceUrl.test.ts | [ ] | |
| fieldValidation-projectName.test.ts | [ ] | |
| securityValidation-input.test.ts | [ ] | Critical security tests |
| securityValidation-network.test.ts | [ ] | |
| securityValidation-nodeVersion.test.ts | [ ] | |
| normalizers.test.ts | [ ] | New file |

### Utils Files

| File | Status | Notes |
|------|--------|-------|
| bundleUri.test.ts | [ ] | |
| disposableStore.test.ts | [ ] | |
| disposableStore.error.test.ts | [ ] | |
| envVarExtraction.test.ts | [ ] | |
| executionLock.test.ts | [ ] | |
| getWebviewHTMLWithBundles.test.ts | [ ] | |
| loadingHTML.test.ts | [ ] | |
| promiseUtils.test.ts | [ ] | |
| quickPickUtils.test.ts | [ ] | |
| timeFormatting.test.ts | [ ] | |
| timeoutConfig.test.ts | [ ] | |
| webviewHTMLBuilder.test.ts | [ ] | |

---

## Next Step

After completing Step 3, proceed to:
**Step 4: UI + Handlers + DI + Cache Tests (25 files)**
