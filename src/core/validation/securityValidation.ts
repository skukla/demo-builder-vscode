/**
 * Security Validation Utilities
 *
 * Provides functions to sanitize sensitive data from error messages and logs
 * to prevent information disclosure vulnerabilities (OWASP A09:2021).
 */

/**
 * Patterns to detect and redact sensitive information
 */
const SENSITIVE_PATTERNS = [
    // File paths (Unix and Windows)
    { pattern: /\/(?:Users|home|root)\/[^\s]+/g, replacement: '<path>' },
    { pattern: /[A-Z]:\\[^\s]+/g, replacement: '<path>' },

    // GitHub tokens
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '<redacted>' },
    { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '<redacted>' },
    { pattern: /ghu_[a-zA-Z0-9]{36}/g, replacement: '<redacted>' },
    { pattern: /ghs_[a-zA-Z0-9]{36}/g, replacement: '<redacted>' },
    { pattern: /ghr_[a-zA-Z0-9]{36}/g, replacement: '<redacted>' },

    // Adobe tokens (JWT format)
    { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: '<token>' },

    // Generic API keys and secrets
    { pattern: /['"](api[_-]?key|token|secret|password)['"]\s*:\s*['"][^'"]+['"]/gi, replacement: '"$1": "<redacted>"' },

    // Bearer tokens
    { pattern: /Bearer\s+[a-zA-Z0-9_-]+/gi, replacement: 'Bearer <redacted>' },

    // Access tokens in URLs
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
    expectedParent?: string
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
                reason: 'Path is a symbolic link - refusing to delete for security'
            };
        }

        // If expected parent specified, validate path is within it
        if (expectedParent) {
            const normalizedTarget = path.normalize(targetPath);
            const normalizedParent = path.normalize(expectedParent);

            if (!normalizedTarget.startsWith(normalizedParent)) {
                return {
                    safe: false,
                    reason: 'Path is outside expected directory - refusing to delete for security'
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
            reason: `Unable to validate path safety: ${sanitizeErrorForLogging(error as Error)}`
        };
    }
}
