/**
 * UI Field Validation
 *
 * Provides user-friendly validation functions for form fields in the UI.
 * Returns validation results with user-facing error messages.
 *
 * Usage: Import these functions in helper files and UI components for
 * validating user input before submission.
 *
 * **Implementation**: Uses composable validators from `@/core/validation/Validator`
 * for consistent validation logic across the codebase.
 */

import {
    required,
    alphanumeric,
    maxLength,
    optional,
    url,
    compose,
    type ValidationResult,
} from '@/core/validation/Validator';

export interface FieldValidation {
    isValid: boolean;
    message: string;
}

/**
 * Convert ValidationResult to FieldValidation format
 * @internal
 */
function toFieldValidation(result: ValidationResult): FieldValidation {
    return {
        isValid: result.valid,
        message: result.error || '',
    };
}

/**
 * Validate project name for UI display
 * - Must not be empty
 * - Can only contain letters, numbers, hyphens, and underscores
 * - Must be 50 characters or less
 *
 * @param value - Project name to validate
 * @returns FieldValidation with user-friendly error message
 *
 * @example
 * validateProjectNameUI('my-project'); // { isValid: true, message: '' }
 * validateProjectNameUI(''); // { isValid: false, message: 'Project name is required' }
 * validateProjectNameUI('my project!'); // { isValid: false, message: 'Project name can only contain...' }
 */
export function validateProjectNameUI(value: string): FieldValidation {
    const validator = compose(
        required('Project name is required'),
        alphanumeric('Project name can only contain letters, numbers, hyphens, and underscores'),
        maxLength(50, 'Project name must be 50 characters or less'),
    );

    return toFieldValidation(validator(value));
}

/**
 * Validate Commerce URL for UI display
 * - If provided, must be a valid URL
 * - Must start with http:// or https://
 *
 * @param value - URL to validate
 * @returns FieldValidation with user-friendly error message
 *
 * @example
 * validateCommerceUrlUI('https://example.com'); // { isValid: true, message: '' }
 * validateCommerceUrlUI(''); // { isValid: true, message: '' } (optional field)
 * validateCommerceUrlUI('invalid'); // { isValid: false, message: 'Invalid URL format' }
 */
export function validateCommerceUrlUI(value: string): FieldValidation {
    const validator = optional(url('Invalid URL format. Must start with http:// or https://'));
    return toFieldValidation(validator(value));
}

/**
 * Validate field value based on field name
 * Main dispatcher for all UI validation types
 *
 * @param field - Field name to validate
 * @param value - Field value to validate
 * @returns FieldValidation with user-friendly error message
 *
 * @example
 * validateFieldUI('projectName', 'my-project'); // { isValid: true, message: '' }
 * validateFieldUI('commerceUrl', 'https://example.com'); // { isValid: true, message: '' }
 * validateFieldUI('unknown', 'value'); // { isValid: true, message: '' } (no validation)
 */
export function validateFieldUI(field: string, value: string): FieldValidation {
    switch (field) {
        case 'projectName':
            return validateProjectNameUI(value);

        case 'commerceUrl':
            return validateCommerceUrlUI(value);

        default:
            return {
                isValid: true,
                message: '',
            };
    }
}
