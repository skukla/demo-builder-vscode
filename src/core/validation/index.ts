/**
 * Core Validation Infrastructure
 *
 * Provides input sanitization, field validation, and security validation.
 */

// Sensitive data redaction
export {
    sanitizeErrorForLogging,
    sanitizeError,
} from './SensitiveDataRedactor';

// Path safety validation
export {
    validatePathSafety,
    validateProjectPath,
} from './PathSafetyValidator';

// URL validation
export {
    validateURL,
    validateGitHubDownloadURL,
} from './URLValidator';

// Domain-specific validators
export {
    validateAdobeResourceId,
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateMeshId,
    validateProjectNameSecurity,
    validateAccessToken,
    validateNodeVersion,
} from './validators';

// UI field validation
export {
    validateProjectNameUI,
    validateCommerceUrlUI,
    validateFieldUI,
    FieldValidation,
} from './fieldValidation';

// Composable validators
export {
    required,
    minLength,
    maxLength,
    pattern,
    compose,
    type Validator,
    type ValidationResult,
} from './Validator';
