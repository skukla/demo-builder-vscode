/**
 * Access Token Validator
 *
 * Validates Adobe access tokens (JWT format) to prevent command injection
 * when tokens are used in shell commands.
 */

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
