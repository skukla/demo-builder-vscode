/**
 * JWT payload decoding for DA.live tokens.
 *
 * A pure helper with no state: it reads the claims out of a token's second
 * segment and never checks the signature. `DaLiveAuthService.storeToken` uses
 * it for the expiry and email it stores, and the sign-in prompt
 * (`daLiveAuthPrompt`) uses it to check `client_id` and expiry before a pasted
 * token is accepted.
 */

/**
 * Parse a JWT token's payload section (base64-decode + JSON.parse).
 *
 * Returns the decoded payload as a plain object, or null if the token
 * cannot be parsed (too few parts, invalid base64, or invalid JSON).
 *
 * @param token - JWT token string
 * @returns Decoded payload or null on failure
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) {
            return null;
        }
        return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    } catch {
        return null;
    }
}
