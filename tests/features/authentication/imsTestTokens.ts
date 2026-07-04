/**
 * Shared IMS token fixtures for ownership/identity tests.
 *
 * Builds structurally valid (unsigned) JWTs whose payload carries the
 * `user_id` claim in the real IMS format (`<GUID>@<authsrc>.e`), matching a
 * Console project's `who_created`.
 */

/** base64url-encode a JSON value as a JWT segment. */
export function encodeSegment(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Build a structurally valid (unsigned) JWT around the given payload. */
export function makeJwt(payload: unknown): string {
    return `${encodeSegment({ alg: 'RS256' })}.${encodeSegment(payload)}.fake-signature`;
}

/** The "current user" IMS user id used across ownership tests. */
export const TEST_USER_ID = '5DA1B2C3D4E5F607080910A1@abcdef1234567890.e';

/** A different user's IMS user id (non-owned projects). */
export const TEST_OTHER_USER_ID = 'FFFF0000AAAA1111BBBB2222@abcdef1234567890.e';
