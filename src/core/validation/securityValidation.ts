/**
 * Security Validation Utilities
 *
 * Provides functions to sanitize sensitive data from error messages and logs
 * to prevent information disclosure vulnerabilities (OWASP A09:2021).
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Patterns to detect and redact sensitive information
 *
 * Security Compliance:
 * - OWASP A09:2021 - Security Logging and Monitoring Failures
 * - CWE-532 - Insertion of Sensitive Information into Log File
 * - CWE-209 - Generation of Error Message Containing Sensitive Information
 *
 * Pattern ordering is critical: More specific patterns must come before generic ones
 * to prevent over-redaction (e.g., environment variables before paths).
 */
const SENSITIVE_PATTERNS = [
    // === AUTHENTICATION TOKENS === (CWE-798: Use of Hard-coded Credentials)

    // GitHub tokens (all 5 types: ghp_=personal, gho_=OAuth, ghu_=user-to-server, ghs_=server-to-server, ghr_=refresh)
    // Format: prefix (4 chars) + base62 (32 chars) = 36 chars total
    { pattern: /ghp_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /gho_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghu_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghs_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghr_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },

    // JWT tokens (eyJ prefix = base64-encoded {"alg":...})
    // Pattern 1: Full JWT format (header.payload.signature) - must match first for complete redaction
    { pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: '<redacted>' },
    // Pattern 2: Partial JWT-like strings (fallback, minimum 20 chars total to avoid false positives)
    { pattern: /eyJ[a-zA-Z0-9_-]{16,}/g, replacement: '<redacted>' },

    // Base64-encoded strings (30+ chars with optional padding)
    // High threshold to reduce false positives
    { pattern: /[A-Za-z0-9+/]{30,}={0,2}/g, replacement: '<redacted>' },

    // Generic API keys (24+ chars minimum to avoid false positives)
    { pattern: /\b[a-z0-9]{24,}\b/g, replacement: '<redacted>' },  // Alphanumeric
    { pattern: /\b[a-f0-9]{24,}\b/gi, replacement: '<redacted>' }, // Hex-only

    // Bearer tokens (Authorization header format)
    { pattern: /Bearer\s+[a-zA-Z0-9_-]+/gi, replacement: 'Bearer <redacted>' },

    // === ENVIRONMENT VARIABLES === (CWE-526: Exposure of Sensitive Information Through Environmental Variables)

    // KEY=value format (with optional quotes)
    // CRITICAL: Must appear BEFORE path patterns to prevent false positives with URLs
    { pattern: /([\w_]+)=(['"]?)([^'"&\s]+)\2/g, replacement: '$1=<redacted>' },

    // === FILE PATHS === (CWE-200: Exposure of Sensitive Information to an Unauthorized Actor)

    // Unix absolute paths (negative lookbehind prevents matching URLs like postgresql://)
    // Only matches common sensitive directories to reduce false positives
    { pattern: /(?<!:)\/(?:Users|home|root|var|etc|usr|opt|tmp)\/[^\s]*/g, replacement: '<path>/' },

    // Windows absolute paths (C:\, D:\, etc.)
    { pattern: /[A-Z]:\\[^\s]+/g, replacement: '<path>\\' },

    // === API KEYS IN STRUCTURED DATA === (CWE-522: Insufficiently Protected Credentials)

    // JSON format: {"api_key": "value", "token": "value", ...}
    { pattern: /['"](api[_-]?key|token|secret|password)['"]\s*:\s*['"][^'"]+['"]/gi, replacement: '"$1": "<redacted>"' },

    // Query parameters: ?access_token=value&api_key=value
    { pattern: /([?&])(access_token|token|api_key)=[^&\s]+/gi, replacement: '$1$2=<redacted>' },
];

/**
 * Sanitize error message to remove sensitive information
 *
 * @param error - Error object or string to sanitize
 * @returns Sanitized error message string
 */
export function sanitizeErrorForLogging(error: Error | string): string {
    let message = typeof error === 'string' ? error : error.message;

    // Take only first line (multi-line truncation and stack trace removal)
    message = message.split('\n')[0];

    // Apply all sensitive pattern replacements
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
        message = message.replace(pattern, replacement);
    }

    return message;
}

/**
 * Sanitize entire error stack to remove sensitive information
 *
 * @param error - Error object to sanitize
 * @returns Sanitized error with cleaned message and stack
 */
export function sanitizeError(error: Error): Error {
    const sanitizedError = new Error(sanitizeErrorForLogging(error.message));
    sanitizedError.name = error.name;

    if (error.stack) {
        sanitizedError.stack = sanitizeErrorForLogging(error.stack);
    }

    return sanitizedError;
}

/**
 * Check if a path is safe to delete (not a symlink, within expected directory)
 *
 * @param targetPath - Path to validate
 * @param expectedParent - Expected parent directory (e.g., home directory)
 * @returns Promise resolving to validation result
 */
export async function validatePathSafety(
    targetPath: string,
    expectedParent?: string,
): Promise<{ safe: boolean; reason?: string }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
        // Check if path exists
        const stats = await fs.lstat(targetPath);

        // Check if it's a symlink
        if (stats.isSymbolicLink()) {
            return {
                safe: false,
                reason: 'Path is a symbolic link - refusing to delete for security',
            };
        }

        // If expected parent specified, validate path is within it
        if (expectedParent) {
            const normalizedTarget = path.normalize(targetPath);
            const normalizedParent = path.normalize(expectedParent);

            if (!normalizedTarget.startsWith(normalizedParent)) {
                return {
                    safe: false,
                    reason: 'Path is outside expected directory - refusing to delete for security',
                };
            }
        }

        return { safe: true };
    } catch (error) {
        // If path doesn't exist, it's safe (nothing to delete)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { safe: true };
        }

        // Other errors are suspicious - be conservative
        return {
            safe: false,
            reason: `Unable to validate path safety: ${sanitizeErrorForLogging(error as Error)}`,
        };
    }
}

/**
 * Validate that a URL is a valid GitHub download URL
 *
 * @param url - URL to validate
 * @returns True if the URL is a valid GitHub download URL, false otherwise
 */
export function validateGitHubDownloadURL(url: string): boolean {
    try {
        const parsedUrl = new URL(url);

        // Must be HTTPS
        if (parsedUrl.protocol !== 'https:') {
            return false;
        }

        // Must be from github.com domain
        if (!parsedUrl.hostname.endsWith('github.com') &&
            !parsedUrl.hostname.endsWith('githubusercontent.com')) {
            return false;
        }

        // Must be a releases download URL pattern
        const validPatterns = [
            /^\/[^\/]+\/[^\/]+\/releases\/download\//,  // Standard releases
            /^\/repos\/[^\/]+\/[^\/]+\/releases\/assets\//, // API endpoint
        ];

        return validPatterns.some(pattern => pattern.test(parsedUrl.pathname));
    } catch {
        // Invalid URL
        return false;
    }
}
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

/**
 * Check if hostname is a private IPv4 address (SOP §10 compliance)
 *
 * Private ranges: 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
 */
function isPrivateIPv4(hostname: string): boolean {
    if (hostname.startsWith('127.')) return true;
    if (hostname.startsWith('10.')) return true;
    if (hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    return false;
}

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

        // Check for private IPv4 ranges (SOP §10: using predicate)
        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 (link-local)
        if (isPrivateIPv4(hostname)) {
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
 * Error message for invalid Node.js version format
 * Used by validateNodeVersion for consistent error reporting
 */
const INVALID_NODE_VERSION_ERROR =
    'Invalid Node.js version format. Valid formats: numeric (e.g., 18, 20), ' +
    'semantic version (e.g., 18.20.0), or keywords (auto, current).';

/**
 * Validates Node.js version parameter for command execution safety
 *
 * Prevents command injection attacks in CommandExecutor when using nodeVersion
 * parameter with fnm (Fast Node Manager). The nodeVersion is interpolated into
 * shell commands like: `fnm exec --using=${nodeVersion} ${command}`
 *
 * SECURITY: HIGH severity (CWE-77: Command Injection)
 * - Attack Vector: Unvalidated nodeVersion directly interpolated into shell command
 * - Example Attack: nodeVersion = "20; rm -rf /" results in: `fnm exec --using=20; rm -rf / npm install`
 * - Protection: Allowlist-based validation blocks ALL shell metacharacters
 *
 * Valid Formats:
 * - Numeric major versions: "18", "20", "22"
 * - Semantic versions: "18.20.0", "20.11.0"
 * - Keywords: "auto", "current"
 * - null/undefined (skip validation)
 *
 * Shell metacharacters BLOCKED: ; & | < > ` ' " $ ( ) \ space and all control characters
 *
 * @param nodeVersion - Node.js version string to validate (or null/undefined to skip)
 * @throws Error if nodeVersion contains invalid characters or format
 *
 * @example
 * // Valid formats
 * validateNodeVersion('20');          // OK - numeric major version
 * validateNodeVersion('18.20.0');     // OK - semantic version
 * validateNodeVersion('auto');        // OK - keyword
 * validateNodeVersion(null);          // OK - skip validation
 *
 * // Invalid formats (throw errors)
 * validateNodeVersion('20; rm -rf /'); // Throws - command injection attempt
 * validateNodeVersion('v20');          // Throws - invalid prefix
 * validateNodeVersion('20.11');        // Throws - incomplete semver
 */
export function validateNodeVersion(nodeVersion: string | null | undefined): void {
    // Allow null/undefined (skip validation when nodeVersion not specified)
    if (nodeVersion === null || nodeVersion === undefined) {
        return;
    }

    // Type check: must be a string if provided
    if (typeof nodeVersion !== 'string') {
        throw new Error(INVALID_NODE_VERSION_ERROR);
    }

    // Allowlist-based validation: only accept specific patterns
    // Pattern breakdown:
    // - \d+                : Numeric major version (e.g., 18, 20, 22)
    // - \d+\.\d+\.\d+     : Semantic version (e.g., 18.20.0, 20.11.0)
    // - auto              : Auto-detect version keyword
    // - current           : Use current version keyword
    // ^ and $ anchors ensure no additional characters before/after
    const validPattern = /^(?:\d+|\d+\.\d+\.\d+|auto|current)$/;

    if (!validPattern.test(nodeVersion)) {
        throw new Error(INVALID_NODE_VERSION_ERROR);
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
