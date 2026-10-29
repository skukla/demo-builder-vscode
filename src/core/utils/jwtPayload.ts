/**
 * JWT payload decoding.
 *
 * One pure decoder for every token this extension reads claims from. It reads
 * the second segment and never checks the signature, so a result is a set of
 * claims to read, never proof of who issued them.
 *
 * Callers: the DA.live token checks (`daLiveTokenValidation`) and
 * `DaLiveAuthService.storeToken` (expiry, email, `client_id`), and the IMS
 * project-ownership gate through `decodeImsUserId` (`user_id`).
 *
 * SECURITY: never logs token contents; any failure yields `null` so callers
 * fail closed.
 */

/**
 * Is a parsed payload a claim set: a JSON object, not an array, string,
 * number, boolean or null?
 *
 * Written here rather than imported from `@/types/typeGuards` so this core
 * module reaches nothing outside core; `instanceof Object` is false for every
 * JSON primitive and for null, so it needs no separate null check.
 */
function isClaimSet(value: unknown): value is Record<string, unknown> {
    return value instanceof Object && !Array.isArray(value);
}

/**
 * Decode a JWT's payload segment into its claims.
 *
 * The segment is base64url JSON. Node's decoder also reads the standard base64
 * alphabet and ignores padding, so either encoding decodes. A token with only
 * two segments (no signature) still decodes.
 *
 * @param token - The raw token string
 * @returns The claims as a plain object, or `null` when the token has no
 *   payload segment, the segment is not JSON, or the JSON is not an object
 *   (a string, number, array or `null`) — never throws
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const segment = token.split('.')[1];
    if (segment === undefined) {
        return null;
    }
    try {
        const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        return isClaimSet(payload) ? payload : null;
    } catch {
        return null;
    }
}
