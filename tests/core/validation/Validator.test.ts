/**
 * Validator Tests
 *
 * Tests for composable validation functions.
 */

import {
    required,
    minLength,
    maxLength,
    pattern,
    compose,
    url,
    alphanumeric,
    lowercase,
    optional,
    email,
    normalizeUrl,
    isUrlValue,
    normalizeIfUrl,
} from '@/core/validation/Validator';

describe('Validator', () => {
    describe('required', () => {
        it('should pass for non-empty string', () => {
            const validator = required();
            const result = validator('hello');
            expect(result.valid).toBe(true);
        });

        it('should fail for empty string', () => {
            const validator = required();
            const result = validator('');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('This field is required');
        });

        it('should fail for null/undefined', () => {
            const validator = required();
            expect(validator(null as unknown as string).valid).toBe(false);
            expect(validator(undefined as unknown as string).valid).toBe(false);
        });

        it('should fail for whitespace-only input', () => {
            // Trimmed, not merely compared to '': a field holding two spaces is as
            // empty as one holding nothing.
            const validator = required();
            expect(validator('   ').valid).toBe(false);
            expect(validator('\t\n').valid).toBe(false);
        });

        it('should use custom error message', () => {
            const validator = required('Custom required error');
            const result = validator('');
            expect(result.error).toBe('Custom required error');
        });
    });

    describe('minLength', () => {
        it('should pass when length meets minimum', () => {
            const validator = minLength(3);
            expect(validator('abc').valid).toBe(true);
            expect(validator('abcd').valid).toBe(true);
        });

        it('should fail when length below minimum', () => {
            const validator = minLength(3);
            const result = validator('ab');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('at least 3');
        });

        it('should use custom error message', () => {
            const validator = minLength(3, 'Custom min length error');
            const result = validator('ab');
            expect(result.error).toBe('Custom min length error');
        });
    });

    describe('maxLength', () => {
        it('should pass when length within maximum', () => {
            const validator = maxLength(5);
            expect(validator('abc').valid).toBe(true);
            expect(validator('abcde').valid).toBe(true);
        });

        it('should fail when length exceeds maximum', () => {
            const validator = maxLength(5);
            const result = validator('abcdef');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('at most 5');
        });

        it('should use custom error message', () => {
            const validator = maxLength(5, 'Custom max length error');
            const result = validator('abcdef');
            expect(result.error).toBe('Custom max length error');
        });
    });

    describe('pattern', () => {
        it('should pass when value matches pattern', () => {
            const validator = pattern(/^[a-z]+$/, 'lowercase letters only');
            expect(validator('abc').valid).toBe(true);
        });

        it('should fail when value does not match pattern', () => {
            const validator = pattern(/^[a-z]+$/, 'lowercase letters only');
            const result = validator('ABC');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('lowercase letters only');
        });
    });

    describe('compose', () => {
        it('should run all validators and return first error', () => {
            const validator = compose(required(), minLength(3), maxLength(10));

            // Empty fails required
            expect(validator('').error).toBe('This field is required');

            // Too short fails minLength
            expect(validator('ab').error).toContain('at least 3');

            // Valid passes all
            expect(validator('hello').valid).toBe(true);
        });

        it('should return valid when all validators pass', () => {
            const validator = compose(required(), minLength(1));
            const result = validator('test');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });

    describe('url', () => {
        const urlValidator = url();

        it('should pass for valid HTTP URLs', () => {
            expect(urlValidator('http://example.com').valid).toBe(true);
            expect(urlValidator('http://example.com/path').valid).toBe(true);
            expect(urlValidator('http://localhost:3000').valid).toBe(true);
        });

        it('should pass for valid HTTPS URLs', () => {
            expect(urlValidator('https://example.com').valid).toBe(true);
            expect(urlValidator('https://example.com/path?query=1').valid).toBe(true);
        });

        it('should fail for non-URL strings', () => {
            const result = urlValidator('not-a-url');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid URL format');
        });

        it('should fail for URLs without protocol', () => {
            expect(urlValidator('example.com').valid).toBe(false);
            expect(urlValidator('www.example.com').valid).toBe(false);
        });

        it('should allow empty values', () => {
            expect(urlValidator('').valid).toBe(true);
            expect(urlValidator('   ').valid).toBe(true);
        });

        it('should use custom error message', () => {
            const customValidator = url('Custom URL error');
            const result = customValidator('invalid');
            expect(result.error).toBe('Custom URL error');
        });

        // The protocol check is not redundant with the URL constructor: these parse
        // perfectly well and are still not something the extension can open.
        it('should fail for a well-formed URL on another scheme', () => {
            expect(urlValidator('ftp://example.com').valid).toBe(false);
            expect(urlValidator('mailto:user@example.com').valid).toBe(false);
        });

        // Right protocol, unparseable rest — the only route into the catch.
        it('should fail when the protocol is right but the URL will not parse', () => {
            const result = urlValidator('http://');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid URL format. Must start with http:// or https://');
            expect(urlValidator('https://').valid).toBe(false);
        });

        it('should use the custom message for an unparseable URL too', () => {
            const customValidator = url('Custom URL error');
            expect(customValidator('http://').error).toBe('Custom URL error');
        });
    });

    describe('alphanumeric', () => {
        const alphanumValidator = alphanumeric();

        it('should pass for alphanumeric strings', () => {
            expect(alphanumValidator('abc123').valid).toBe(true);
            expect(alphanumValidator('project-name').valid).toBe(true);
            expect(alphanumValidator('project_name_123').valid).toBe(true);
        });

        it('should fail for strings with special characters', () => {
            const result = alphanumValidator('project@name');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Only letters, numbers');
        });

        it('should fail for strings with spaces by default', () => {
            expect(alphanumValidator('project name').valid).toBe(false);
        });

        it('should allow spaces when allowSpaces is true', () => {
            const withSpaces = alphanumeric(undefined, true);
            expect(withSpaces('project name 123').valid).toBe(true);
            expect(withSpaces('hello world').valid).toBe(true);
        });

        // Allowing spaces must not also stop anchoring: the whole value has to be
        // alphanumeric, not just some run in the middle of it.
        it('should still reject a bad character anywhere when spaces are allowed', () => {
            const withSpaces = alphanumeric(undefined, true);
            expect(withSpaces('project name@').valid).toBe(false);
            expect(withSpaces('@project name').valid).toBe(false);
        });

        it('should allow empty values', () => {
            expect(alphanumValidator('').valid).toBe(true);
            expect(alphanumValidator('   ').valid).toBe(true);
        });

        it('should use custom error message', () => {
            const customValidator = alphanumeric('Custom alphanumeric error');
            const result = customValidator('invalid@');
            expect(result.error).toBe('Custom alphanumeric error');
        });
    });

    describe('lowercase', () => {
        const lowercaseValidator = lowercase();

        it('should pass for lowercase strings', () => {
            expect(lowercaseValidator('hello').valid).toBe(true);
            expect(lowercaseValidator('project-name').valid).toBe(true);
            expect(lowercaseValidator('test123').valid).toBe(true);
        });

        it('should fail for strings with uppercase letters', () => {
            const result = lowercaseValidator('Hello');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Must be lowercase');
        });

        it('should fail for mixed case strings', () => {
            expect(lowercaseValidator('ProjectName').valid).toBe(false);
            expect(lowercaseValidator('project-Name').valid).toBe(false);
        });

        it('should allow empty values', () => {
            expect(lowercaseValidator('').valid).toBe(true);
            expect(lowercaseValidator('   ').valid).toBe(true);
        });

        it('should answer valid for a missing value instead of throwing', () => {
            // The `!value` half of the guard has to short-circuit: reaching .trim()
            // or .toLowerCase() on a missing value throws, and these validators run
            // against form fields that have not been filled in yet.
            expect(lowercaseValidator(null as unknown as string).valid).toBe(true);
            expect(lowercaseValidator(undefined as unknown as string).valid).toBe(true);
        });

        it('should use custom error message', () => {
            const customValidator = lowercase('Custom lowercase error');
            const result = customValidator('Upper');
            expect(result.error).toBe('Custom lowercase error');
        });
    });

    describe('optional', () => {
        const optionalEmailValidator = optional(email());
        const optionalUrlValidator = optional(url());

        it('should pass for empty values', () => {
            expect(optionalEmailValidator('').valid).toBe(true);
            expect(optionalEmailValidator('   ').valid).toBe(true);
            expect(optionalUrlValidator('').valid).toBe(true);
        });

        it('should not call the wrapped validator at all for a blank value', () => {
            // Asserting the ARGUMENT the wrapped validator receives, not its answer:
            // a wrapper that hands a blank value through is indistinguishable from
            // one that skips it whenever the inner validator happens to pass on blanks.
            const inner = jest.fn().mockReturnValue({ valid: true });
            const wrapped = optional(inner);

            expect(wrapped('').valid).toBe(true);
            expect(wrapped('   ').valid).toBe(true);
            expect(inner).not.toHaveBeenCalled();

            wrapped('actual value');
            expect(inner).toHaveBeenCalledWith('actual value');
        });

        it('should validate non-empty values with wrapped validator', () => {
            expect(optionalEmailValidator('user@example.com').valid).toBe(true);
            expect(optionalUrlValidator('https://example.com').valid).toBe(true);
        });

        it('should fail when wrapped validator fails', () => {
            const emailResult = optionalEmailValidator('not-an-email');
            expect(emailResult.valid).toBe(false);
            expect(emailResult.error).toContain('email');

            const urlResult = optionalUrlValidator('not-a-url');
            expect(urlResult.valid).toBe(false);
            expect(urlResult.error).toContain('URL');
        });

        it('should work with compose', () => {
            const validator = compose(optional(minLength(5)), lowercase());

            // Empty passes optional
            expect(validator('').valid).toBe(true);

            // Valid lowercase >=5 chars passes
            expect(validator('hello').valid).toBe(true);

            // Too short fails minLength
            expect(validator('hi').valid).toBe(false);

            // Uppercase fails lowercase
            expect(validator('Hello').valid).toBe(false);
        });
    });

    describe('email', () => {
        const emailValidator = email();

        it('should pass for valid email addresses', () => {
            expect(emailValidator('user@example.com').valid).toBe(true);
            expect(emailValidator('test.user@example.co.uk').valid).toBe(true);
            expect(emailValidator('user+tag@example.com').valid).toBe(true);
        });

        it('should fail for invalid email formats', () => {
            const result = emailValidator('not-an-email');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid email');
        });

        it('should fail for emails without domain', () => {
            expect(emailValidator('user@').valid).toBe(false);
            expect(emailValidator('user').valid).toBe(false);
        });

        it('should fail for emails without username', () => {
            expect(emailValidator('@example.com').valid).toBe(false);
        });

        it('should allow empty values', () => {
            expect(emailValidator('').valid).toBe(true);
            expect(emailValidator('   ').valid).toBe(true);
        });

        it('should use custom error message', () => {
            const customValidator = email('Custom email error');
            const result = customValidator('invalid');
            expect(result.error).toBe('Custom email error');
        });

        // The regex is anchored at BOTH ends. Without those anchors an address with
        // rubbish before or after it still matches somewhere in the middle and passes.
        it('should fail when a valid address is only PART of the value', () => {
            expect(emailValidator('a b@example.com').valid).toBe(false);
            expect(emailValidator('user@example.com extra').valid).toBe(false);
        });
    });

    describe('normalizeUrl', () => {
        it('should strip a trailing slash', () => {
            expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
            expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
        });

        it('should strip EVERY trailing slash, not just the last one', () => {
            expect(normalizeUrl('https://example.com///')).toBe('https://example.com');
        });

        it('should leave a URL with no trailing slash alone', () => {
            // The interior '//' after the protocol must survive: only the END is stripped.
            expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
        });

        it('should return falsy input unchanged rather than throwing', () => {
            expect(normalizeUrl('')).toBe('');
            expect(normalizeUrl(undefined as unknown as string)).toBeUndefined();
        });
    });

    describe('isUrlValue', () => {
        it('should be true for http and https values', () => {
            expect(isUrlValue('http://example.com')).toBe(true);
            expect(isUrlValue('https://example.com')).toBe(true);
        });

        it('should be false for other schemes and for plain text', () => {
            expect(isUrlValue('ftp://example.com')).toBe(false);
            expect(isUrlValue('example.com')).toBe(false);
            // The scheme has to be at the START, not anywhere in the value.
            expect(isUrlValue('see http://example.com')).toBe(false);
        });

        it('should be false for empty and non-string values', () => {
            expect(isUrlValue('')).toBe(false);
            // Config values arrive untyped from settings, so a number must answer
            // false rather than blow up on startsWith.
            expect(isUrlValue(42 as unknown as string)).toBe(false);
        });
    });

    describe('normalizeIfUrl', () => {
        it('should normalize a value that is a URL', () => {
            expect(normalizeIfUrl('https://example.com/')).toBe('https://example.com');
        });

        it('should leave a non-URL value untouched, trailing slash and all', () => {
            expect(normalizeIfUrl('some/path/')).toBe('some/path/');
            expect(normalizeIfUrl('')).toBe('');
        });
    });
});
