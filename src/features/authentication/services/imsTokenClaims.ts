/**
 * IMS Token Claims
 *
 * Reads claims out of an IMS access token (a JWT). Used by the
 * project-ownership gate to compare the token's `user_id` against a Console
 * project's `who_created` (both use the `<IMS-user-GUID>@<authsrc>.e` format).
 * The decoding itself is the shared `decodeJwtPayload`.
 *
 * SECURITY: never logs token contents; decoding failures yield `undefined`
 * so callers fail closed.
 */

import { decodeJwtPayload } from '@/core/utils/jwtPayload';

/**
 * Decode the `user_id` claim from an IMS access token's JWT payload.
 *
 * @param token - The raw IMS access token (three base64url segments)
 * @returns The `user_id` claim, or `undefined` when the token is malformed
 *   or the claim is missing/empty — never throws
 */
export function decodeImsUserId(token: string): string | undefined {
    const userId = decodeJwtPayload(token)?.user_id;
    return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
}
