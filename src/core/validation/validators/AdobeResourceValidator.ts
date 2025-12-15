/**
 * Adobe Resource ID Validators
 *
 * Validates Adobe resource identifiers (org, project, workspace, mesh)
 * to prevent command injection attacks in Adobe CLI commands.
 */

/**
 * Validates an Adobe resource ID for safe use in CLI commands
 *
 * @param id - The resource ID to validate
 * @param type - The type of resource (for error messages)
 * @throws Error if ID is invalid
 */
export function validateAdobeResourceId(id: string, type: string): void {
    if (!id || typeof id !== 'string') {
        throw new Error(`Invalid ${type}: must be a non-empty string`);
    }

    // Check length (Adobe IDs are typically 20-50 chars, allow up to 100 for safety)
    if (id.length > 100) {
        throw new Error(`Invalid ${type}: too long (max 100 characters)`);
    }

    // Allow only alphanumeric, hyphens, and underscores
    // This blocks shell metacharacters: $ ( ) ; & | < > ` ' " \
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error(`Invalid ${type}: contains illegal characters (only letters, numbers, hyphens, and underscores allowed)`);
    }
}

/**
 * Validates organization ID
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateOrgId(orgId: string): void {
    validateAdobeResourceId(orgId, 'organization ID');
}

/**
 * Validates project ID
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateProjectId(projectId: string): void {
    validateAdobeResourceId(projectId, 'project ID');
}

/**
 * Validates workspace ID
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateWorkspaceId(workspaceId: string): void {
    validateAdobeResourceId(workspaceId, 'workspace ID');
}

/**
 * Validates mesh ID
 *
 * SECURITY: Prevents command injection in Adobe API Mesh CLI commands
 * Example attack: meshId = "abc123; rm -rf / #"
 *
 * @param meshId - Mesh ID to validate
 * @throws Error if mesh ID contains illegal characters
 */
export function validateMeshId(meshId: string): void {
    validateAdobeResourceId(meshId, 'mesh ID');
}
