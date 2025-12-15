/**
 * Sensitive Data Redactor
 *
 * Sanitizes sensitive information from error messages and logs to prevent
 * information disclosure vulnerabilities (OWASP A09:2021).
 *
 * Security Compliance:
 * - OWASP A09:2021 - Security Logging and Monitoring Failures
 * - CWE-532 - Insertion of Sensitive Information into Log File
 * - CWE-209 - Generation of Error Message Containing Sensitive Information
 */

/**
 * Patterns to detect and redact sensitive information
 *
 * Pattern ordering is critical: More specific patterns must come before generic ones
 * to prevent over-redaction (e.g., environment variables before paths).
 */
const SENSITIVE_PATTERNS = [
    // === AUTHENTICATION TOKENS === (CWE-798: Use of Hard-coded Credentials)

    // GitHub tokens (all 5 types: ghp_=personal, gho_=OAuth, ghu_=user-to-server, ghs_=server-to-server, ghr_=refresh)
    { pattern: /ghp_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /gho_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghu_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghs_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },
    { pattern: /ghr_[a-zA-Z0-9]{32}/g, replacement: '<redacted>' },

    // JWT tokens (eyJ prefix = base64-encoded {"alg":...})
    { pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: '<redacted>' },
    { pattern: /eyJ[a-zA-Z0-9_-]{16,}/g, replacement: '<redacted>' },

    // Base64-encoded strings (30+ chars with optional padding)
    { pattern: /[A-Za-z0-9+/]{30,}={0,2}/g, replacement: '<redacted>' },

    // Generic API keys (24+ chars minimum to avoid false positives)
    { pattern: /\b[a-z0-9]{24,}\b/g, replacement: '<redacted>' },
    { pattern: /\b[a-f0-9]{24,}\b/gi, replacement: '<redacted>' },

    // Bearer tokens
    { pattern: /Bearer\s+[a-zA-Z0-9_-]+/gi, replacement: 'Bearer <redacted>' },

    // === ENVIRONMENT VARIABLES === (CWE-526)
    { pattern: /([\w_]+)=(['"]?)([^'"&\s]+)\2/g, replacement: '$1=<redacted>' },

    // === FILE PATHS === (CWE-200)
    { pattern: /(?<!:)\/(?:Users|home|root|var|etc|usr|opt|tmp)\/[^\s]*/g, replacement: '<path>/' },
    { pattern: /[A-Z]:\\[^\s]+/g, replacement: '<path>\\' },

    // === API KEYS IN STRUCTURED DATA === (CWE-522)
    { pattern: /['"](api[_-]?key|token|secret|password)['"]\s*:\s*['"][^'"]+['"]/gi, replacement: '"$1": "<redacted>"' },
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
 * Access to sensitive patterns for testing
 * @internal
 */
export const _SENSITIVE_PATTERNS_FOR_TESTING = SENSITIVE_PATTERNS;
