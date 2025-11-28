/**
 * Predicate functions for authentication services (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

/**
 * Validate token response from Adobe CLI (SOP §10 compliance)
 *
 * Valid token:
 * - Exists and is non-empty
 * - Length > 50 (real tokens are much longer)
 * - Does not contain error messages
 */
export function isValidTokenResponse(token: string | undefined): boolean {
    if (!token) return false;
    if (token.length <= 50) return false;
    if (token.includes('Error')) return false;
    if (token.includes('error')) return false;
    return true;
}
