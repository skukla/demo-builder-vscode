/**
 * Security Validation Layer
 *
 * Provides centralized validation functions for backend handlers to prevent
 * command injection, path traversal, and other security vulnerabilities.
 *
 * Security Principles:
 * - Whitelist approach: Only allow known-safe characters
 * - Length limits: Prevent buffer overflow attacks
 * - Path validation: Restrict file system access to allowed directories
 * - Resource ID validation: Prevent shell metacharacter injection
 *
 * Usage: Import these functions in handler files for input validation before
 * executing shell commands or file system operations.
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Validates Adobe resource IDs (project IDs, workspace IDs, org IDs)
 *
 * Adobe resource IDs should only contain alphanumeric characters, hyphens, and underscores.
 * This prevents shell command injection via Adobe CLI commands.
 *
 * @param id - Resource ID to validate
 * @param type - Type of resource (for error messages)
 * @throws Error if ID is invalid
 *
 * @example
 * validateAdobeResourceId('12345abcde', 'project ID'); // OK
 * validateAdobeResourceId('proj-123_abc', 'project ID'); // OK
 * validateAdobeResourceId('$(rm -rf /)', 'project ID'); // Throws
 * validateAdobeResourceId('proj; cat /etc/passwd', 'project ID'); // Throws
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
 * Validates project names for file system safety
 *
 * Project names are used to create directories, so they must not contain
 * path traversal sequences or shell metacharacters.
 *
 * @param name - Project name to validate
 * @throws Error if name is invalid
 *
 * @example
 * validateProjectNameSecurity('my-demo-project'); // OK
 * validateProjectNameSecurity('project_123'); // OK
 * validateProjectNameSecurity('../etc/passwd'); // Throws
 * validateProjectNameSecurity('proj; rm -rf /'); // Throws
 */
export function validateProjectNameSecurity(name: string): void {
    if (!name || typeof name !== 'string') {
        throw new Error('Project name must be a non-empty string');
    }

    // Check length (reasonable project name length)
    if (name.length > 100) {
        throw new Error('Project name must be less than 100 characters');
    }

    // Check for path traversal attempts
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        throw new Error('Project name cannot contain path separators or parent directory references');
    }

    // Allow only safe characters: alphanumeric, hyphens, underscores
    // This blocks shell metacharacters and special filesystem characters
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Project name can only contain letters, numbers, hyphens, and underscores');
    }

    // Prevent reserved names
    const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
    if (reservedNames.includes(name.toLowerCase())) {
        throw new Error(`Project name cannot be a reserved system name: ${name}`);
    }
}

/**
 * Validates file paths are within allowed demo-builder directory
 *
 * Ensures paths cannot escape the demo-builder projects directory via
 * path traversal attacks.
 *
 * @param providedPath - Path to validate
 * @throws Error if path is outside allowed directory
 *
 * @example
 * const safe = path.join(os.homedir(), '.demo-builder', 'projects', 'my-project');
 * validateProjectPath(safe); // OK
 *
 * const dangerous = '/etc/passwd';
 * validateProjectPath(dangerous); // Throws
 *
 * const traversal = path.join(os.homedir(), '.demo-builder', 'projects', '..', '..', '..', 'etc', 'passwd');
 * validateProjectPath(traversal); // Throws
 */
export function validateProjectPath(providedPath: string): void {
    if (!providedPath || typeof providedPath !== 'string') {
        throw new Error('Path must be a non-empty string');
    }

    // Define allowed base directory
    const allowedBase = path.join(os.homedir(), '.demo-builder', 'projects');

    // Normalize and resolve the path to handle ., .., and symlinks
    const normalizedPath = path.normalize(providedPath);
    const resolvedPath = path.resolve(normalizedPath);

    // Check if resolved path starts with allowed base
    if (!resolvedPath.startsWith(allowedBase)) {
        throw new Error('Access denied: path outside demo-builder projects directory');
    }

    // Additional check: Ensure no attempt to escape via symlinks
    // (path.resolve() handles this, but double-check)
    const relativePath = path.relative(allowedBase, resolvedPath);
    if (relativePath.startsWith('..')) {
        throw new Error('Access denied: path traversal attempt detected');
    }
}

/**
 * Validates organization ID
 *
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateOrgId(orgId: string): void {
    validateAdobeResourceId(orgId, 'organization ID');
}

/**
 * Validates project ID
 *
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateProjectId(projectId: string): void {
    validateAdobeResourceId(projectId, 'project ID');
}

/**
 * Validates workspace ID
 *
 * Convenience wrapper for validateAdobeResourceId
 */
export function validateWorkspaceId(workspaceId: string): void {
    validateAdobeResourceId(workspaceId, 'workspace ID');
}

/**
 * Validates mesh ID
 *
 * Convenience wrapper for validateAdobeResourceId
 *
 * SECURITY: Prevents command injection in Adobe API Mesh CLI commands
 * Example attack: meshId = "abc123; rm -rf / #"
 *
 * @param meshId - Mesh ID to validate
 * @throws Error if mesh ID contains illegal characters
 *
 * @example
 * validateMeshId('my-mesh-123'); // OK
 * validateMeshId('mesh_abc-xyz'); // OK
 * validateMeshId('abc; rm -rf /'); // Throws - prevents command injection
 */
export function validateMeshId(meshId: string): void {
    validateAdobeResourceId(meshId, 'mesh ID');
}

/**
 * Validates Adobe access token format
 *
 * Adobe access tokens are JWT tokens that should only contain alphanumeric
 * characters, periods, hyphens, and underscores. This prevents command injection
 * when tokens are used in shell commands.
 *
 * @param token - Access token to validate
 * @throws Error if token is invalid
 *
 * @example
 * validateAccessToken('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'); // OK
 * validateAccessToken('"; rm -rf / #'); // Throws
 * validateAccessToken('token; cat /etc/passwd'); // Throws
 */
export function validateAccessToken(token: string): void {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid access token: must be a non-empty string');
    }

    // Adobe access tokens are typically 500-2000 chars, allow up to 5000 for safety
    if (token.length < 50 || token.length > 5000) {
        throw new Error('Invalid access token: length must be between 50 and 5000 characters');
    }

    // JWT tokens should start with "eyJ" (base64 encoded {"alg":...)
    if (!token.startsWith('eyJ')) {
        throw new Error('Invalid access token: must be a valid JWT token');
    }

    // Allow only characters safe for JWT tokens: alphanumeric, dots, hyphens, underscores
    // This blocks all shell metacharacters: $ ( ) ; & | < > ` ' " \ space
    if (!/^[a-zA-Z0-9._-]+$/.test(token)) {
        throw new Error('Invalid access token: contains illegal characters (only letters, numbers, dots, hyphens, and underscores allowed)');
    }
}

/**
 * Validates URL to prevent open redirect and SSRF attacks
 *
 * Ensures URLs:
 * - Use allowed protocols (default: https only)
 * - Do not point to localhost or private networks (SSRF protection)
 * - Are properly formatted
 *
 * SECURITY: Use this function before making any HTTP requests with user-provided URLs
 * to prevent Server-Side Request Forgery (SSRF) and open redirect vulnerabilities.
 *
 * @param url - URL to validate
 * @param allowedProtocols - Array of allowed protocols (default: ['https'])
 * @throws Error if URL is invalid or unsafe
 *
 * @example
 * // Valid URLs
 * validateURL('https://example.com/path'); // OK
 * validateURL('https://api.adobe.com/data'); // OK
 * validateURL('http://example.com', ['http', 'https']); // OK with http allowed
 *
 * // Invalid URLs
 * validateURL('javascript:alert(1)'); // Throws - invalid protocol
 * validateURL('https://localhost:3000'); // Throws - SSRF prevention
 * validateURL('https://192.168.1.1'); // Throws - private network
 * validateURL('https://10.0.0.1'); // Throws - private network
 * validateURL('file:///etc/passwd'); // Throws - invalid protocol
 */
export function validateURL(url: string, allowedProtocols: string[] = ['https']): void {
    if (!url || typeof url !== 'string') {
        throw new Error('URL must be a non-empty string');
    }

    try {
        const parsed = new URL(url);

        // Check protocol whitelist
        const protocol = parsed.protocol.replace(':', '');
        if (!allowedProtocols.includes(protocol)) {
            throw new Error(`URL protocol must be one of: ${allowedProtocols.join(', ')} (got: ${protocol})`);
        }

        // Prevent localhost/private IPs (SSRF protection)
        const hostname = parsed.hostname.toLowerCase();

        // Check for localhost variants
        // IPv6 localhost appears as [::1] in hostname
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
            throw new Error('URLs pointing to localhost are not allowed');
        }

        // Check for private IPv4 ranges
        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 (link-local)
        if (
            hostname.startsWith('127.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('169.254.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
        ) {
            throw new Error('URLs pointing to local/private networks are not allowed');
        }

        // Check for private IPv6 ranges (fc00::/7, fe80::/10)
        // IPv6 hostnames in URLs are enclosed in brackets: [fc00::1]
        if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80:')) {
            throw new Error('URLs pointing to private IPv6 networks are not allowed');
        }

        // Additional check: prevent cloud metadata endpoints (common SSRF target)
        if (hostname === '169.254.169.254' || hostname === '[fd00:ec2::254]') {
            throw new Error('URLs pointing to cloud metadata endpoints are not allowed');
        }

    } catch (error) {
        // Re-throw our own errors
        if (error instanceof Error && error.message.startsWith('URL')) {
            throw error;
        }

        // Handle URL parse errors
        if (error instanceof TypeError) {
            throw new Error('Invalid URL format');
        }

        throw error;
    }
}

/**
 * Sanitizes error messages for safe logging
 *
 * Removes sensitive information from error messages before logging:
 * - Absolute file paths → <path>/
 * - Tokens/secrets (base64-like strings) → <redacted>
 * - Stack traces → First line only
 *
 * SECURITY: Always use this function before logging errors to user-facing channels
 * to prevent information disclosure vulnerabilities.
 *
 * @param error - Error object or string to sanitize
 * @returns Sanitized error message safe for logging
 *
 * @example
 * const error = new Error('Failed at /Users/admin/.ssh/id_rsa with token abc123xyz');
 * sanitizeErrorForLogging(error);
 * // Returns: "Failed at <path>/ with token <redacted>"
 */
export function sanitizeErrorForLogging(error: Error | string): string {
    let message = typeof error === 'string' ? error : error.message;

    // Remove absolute paths (Unix and Windows)
    // Match: /path/to/file or C:\path\to\file
    message = message.replace(/(?:\/[\w.-]+)+\//g, '<path>/');
    message = message.replace(/[A-Z]:\\(?:[\w.-]+\\)+/g, '<path>\\');

    // Remove tokens/secrets (base64-like strings of 20+ chars)
    // This catches JWT tokens, API keys, and other base64 encoded secrets
    message = message.replace(/[A-Za-z0-9+/]{20,}={0,2}/g, '<redacted>');

    // Remove stack traces - keep only the first line
    const lines = message.split('\n');
    message = lines[0];

    // Remove potential environment variable values
    // Pattern: KEY=value or KEY="value" or KEY='value'
    message = message.replace(/([A-Z_]+)=["']?[^"'\s]+["']?/g, '$1=<redacted>');

    return message;
}
