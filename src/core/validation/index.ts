/**
 * Core Validation Barrel Export
 *
 * Re-exports validation functions from shared validation layer.
 * This allows imports from @/core/validation to resolve correctly.
 */

export {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateMeshId,
    validateAccessToken,
    validateAdobeResourceId,
    validateProjectNameSecurity,
    validateProjectPath,
    validateURL
} from '@/shared/validation';
