/**
 * IMS Token Claims
 *
 * Pure helper for reading claims out of an IMS access token (a JWT). Used by
 * the project-ownership gate to compare the token's `user_id` against a
 * Console project's `who_created` (both use the `<IMS-user-GUID>@<authsrc>.e`
 * format).
 *
 * SECURITY: never logs token contents; decoding failures yield `undefined`
 * so callers fail closed.
 */

/**
 * Decode the `user_id` claim from an IMS access token's JWT payload.
 *
 * @param token - The raw IMS access token (three base64url segments)
 * @returns The `user_id` claim, or `undefined` when the token is malformed
 *   or the claim is missing/empty — never throws
 */
export function decodeImsUserId(token: string): string | undefined {
    try {
        const payloadSegment = token.split('.')[1];
        if (!payloadSegment) {
            return undefined;
        }
        const payloadJson = Buffer.from(payloadSegment, 'base64url').toString('utf8');
        const payload: unknown = JSON.parse(payloadJson);
        if (typeof payload !== 'object' || payload === null) {
            return undefined;
        }
        const userId = (payload as { user_id?: unknown }).user_id;
        return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
    } catch {
        return undefined;
    }
}
