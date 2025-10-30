/**
 * UI Field Validation
 *
 * Provides user-friendly validation functions for form fields in the UI.
 * Returns validation results with user-facing error messages.
 *
 * Usage: Import these functions in helper files and UI components for
 * validating user input before submission.
 */

export interface FieldValidation {
    isValid: boolean;
    message: string;
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
    if (!value || value.trim().length === 0) {
        return {
            isValid: false,
            message: 'Project name is required',
        };
    }

    if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
        return {
            isValid: false,
            message: 'Project name can only contain letters, numbers, hyphens, and underscores',
        };
    }

    if (value.length > 50) {
        return {
            isValid: false,
            message: 'Project name must be 50 characters or less',
        };
    }

    return {
        isValid: true,
        message: '',
    };
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
    // Empty value is valid (optional field)
    if (!value || value.trim().length === 0) {
        return {
            isValid: true,
            message: '',
        };
    }

    try {
        new URL(value);
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
            return {
                isValid: false,
                message: 'URL must start with http:// or https://',
            };
        }
    } catch {
        return {
            isValid: false,
            message: 'Invalid URL format',
        };
    }

    return {
        isValid: true,
        message: '',
    };
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
