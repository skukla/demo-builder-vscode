/**
 * Core Validation Infrastructure
 *
 * Provides input sanitization, field validation, and security validation.
 */

// Security validation for backend handlers
export {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateMeshId,
    validateAccessToken,
    validateAdobeResourceId,
    validateProjectNameSecurity,
    validateProjectPath,
    validateURL,
    sanitizeErrorForLogging,
    sanitizeError,
    validatePathSafety,
    validateGitHubDownloadURL,
} from './securityValidation';

// UI field validation
export {
    validateProjectNameUI,
    validateCommerceUrlUI,
    validateFieldUI,
    FieldValidation,
} from './fieldValidation';
