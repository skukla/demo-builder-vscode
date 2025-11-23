/**
 * Validator Tests
 *
 * Tests for composable validation functions.
 */

import {
    Validator,
    ValidationResult,
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
            const validator = compose(
                required(),
                minLength(3),
                maxLength(10),
            );

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
            const validator = compose(
                optional(minLength(5)),
                lowercase()
            );

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
    });
});
