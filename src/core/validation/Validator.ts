/**
 * Validator
 *
 * Composable validation functions for input validation.
 * Provides a functional approach to building complex validators.
 */

/**
 * Result of a validation check
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validator function type
 */
export type Validator = (value: string) => ValidationResult;

/**
 * Create a valid result
 */
const valid = (): ValidationResult => ({ valid: true });

/**
 * Create an invalid result with error message
 */
const invalid = (error: string): ValidationResult => ({ valid: false, error });

/**
 * Validates that a value is not empty
 * @param message - Custom error message (optional)
 */
export const required = (message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (value === null || value === undefined || value.trim() === '') {
            return invalid(message || 'This field is required');
        }
        return valid();
    };
};

/**
 * Creates a validator for minimum string length
 * @param min - Minimum length required
 * @param message - Custom error message (optional)
 */
export const minLength = (min: number, message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.length < min) {
            return invalid(message || `Must be at least ${min} characters`);
        }
        return valid();
    };
};

/**
 * Creates a validator for maximum string length
 * @param max - Maximum length allowed
 * @param message - Custom error message (optional)
 */
export const maxLength = (max: number, message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (value && value.length > max) {
            return invalid(message || `Must be at most ${max} characters`);
        }
        return valid();
    };
};

/**
 * Creates a validator for regex pattern matching
 */
export const pattern = (regex: RegExp, errorMessage: string): Validator => {
    return (value: string): ValidationResult => {
        if (!regex.test(value)) {
            return invalid(errorMessage);
        }
        return valid();
    };
};

/**
 * Compose multiple validators into a single validator.
 * Validators are run in order; first failure is returned.
 */
export const compose = (...validators: Validator[]): Validator => {
    return (value: string): ValidationResult => {
        for (const validator of validators) {
            const result = validator(value);
            if (!result.valid) {
                return result;
            }
        }
        return valid();
    };
};

/**
 * Validates URL format (http:// or https://)
 *
 * @param message - Custom error message (optional)
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const urlValidator = url();
 * urlValidator('https://example.com'); // { valid: true }
 * urlValidator('not-a-url'); // { valid: false, error: 'Invalid URL format...' }
 * ```
 */
export const url = (message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.trim() === '') return valid();

        // Check protocol first
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
            return invalid(message || 'Invalid URL format. Must start with http:// or https://');
        }

        // Validate URL format using native URL constructor
        try {
            new URL(value);
            return valid();
        } catch {
            return invalid(message || 'Invalid URL format. Must start with http:// or https://');
        }
    };
};

/**
 * Validates alphanumeric characters (letters, numbers, hyphens, underscores)
 *
 * @param message - Custom error message (optional)
 * @param allowSpaces - Whether to allow spaces (default: false)
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const alphanumValidator = alphanumeric();
 * alphanumValidator('project-name_123'); // { valid: true }
 * alphanumValidator('project@name'); // { valid: false, error: '...' }
 *
 * const withSpaces = alphanumeric(undefined, true);
 * withSpaces('project name 123'); // { valid: true }
 * ```
 */
export const alphanumeric = (message?: string, allowSpaces: boolean = false): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.trim() === '') return valid();
        const regex = allowSpaces ? /^[a-zA-Z0-9-_ ]+$/ : /^[a-zA-Z0-9-_]+$/;
        if (!regex.test(value)) {
            return invalid(message || 'Only letters, numbers, hyphens, and underscores allowed');
        }
        return valid();
    };
};

/**
 * Validates that string is lowercase
 *
 * @param message - Custom error message (optional)
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const lowercaseValidator = lowercase();
 * lowercaseValidator('project-name'); // { valid: true }
 * lowercaseValidator('ProjectName'); // { valid: false, error: 'Must be lowercase' }
 * ```
 */
export const lowercase = (message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.trim() === '') return valid();
        if (value !== value.toLowerCase()) {
            return invalid(message || 'Must be lowercase');
        }
        return valid();
    };
};

/**
 * Makes another validator optional (skip if empty)
 *
 * Wraps a validator to skip validation if the value is empty.
 * Useful for optional fields that should be validated only when provided.
 *
 * @param validator - Validator to apply if value is not empty
 * @returns Validator function that skips validation for empty values
 *
 * @example
 * ```typescript
 * const optionalEmailValidator = optional(email());
 * optionalEmailValidator(''); // { valid: true } - empty is ok
 * optionalEmailValidator('user@example.com'); // { valid: true }
 * optionalEmailValidator('not-email'); // { valid: false, error: 'Invalid email' }
 *
 * const optionalUrlValidator = optional(url());
 * optionalUrlValidator(''); // { valid: true } - empty is ok
 * optionalUrlValidator('https://example.com'); // { valid: true }
 * ```
 */
export const optional = (validator: Validator): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.trim() === '') return valid();
        return validator(value);
    };
};

/**
 * Validates email format
 *
 * @param message - Custom error message (optional)
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const emailValidator = email();
 * emailValidator('user@example.com'); // { valid: true }
 * emailValidator('not-an-email'); // { valid: false, error: 'Invalid email format' }
 * ```
 */
export const email = (message?: string): Validator => {
    return (value: string): ValidationResult => {
        if (!value || value.trim() === '') return valid();
        // Simple email regex - matches most common email formats
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            return invalid(message || 'Invalid email format');
        }
        return valid();
    };
};
