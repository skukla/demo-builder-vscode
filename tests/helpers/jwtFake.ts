/**
 * Build a JWT-SHAPED string without writing one into the source.
 *
 * WHY THIS EXISTS. A token-shaped literal is flagged by secret scanners on its SHAPE,
 * never its contents: anything starting `eyJ` is base64 for `{"`, so a scanner cannot
 * tell a meaningless fixture from a live credential. GitGuardian raised two alerts on
 * 2026-09-05 against a fixture that decodes to `{"some":"thing"}` — nothing to rotate,
 * and still noise the owner had to chase. This repository is PUBLIC, so the bar is that
 * a credential shape never enters, not that it turns out to be harmless once read.
 *
 * These build the same shapes at run time. Nothing in the file matches a scanner's
 * pattern, and a test that needs a well-formed token still gets one.
 *
 * `tests/sop/no-credential-shaped-fixtures.test.ts` bans new literals and points here.
 */

/** base64url of a JSON value — the encoding every JWT segment uses. */
function segment(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * A structurally valid three-segment token: header, payload, signature.
 *
 * @param payload - claims to encode; defaults to something obviously inert
 * @param signature - the third segment, left as a plain word by design
 */
export function fakeJwt(
    payload: Record<string, unknown> = { note: 'not-a-secret' },
    signature = 'not-a-signature'
): string {
    return `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment(payload)}.${signature}`;
}

/**
 * Just the first segment — for tests asserting on a token PREFIX rather than a whole
 * token, which is how most shape checks are written.
 */
export function fakeJwtHeaderSegment(): string {
    return segment({ alg: 'HS256', typ: 'JWT' });
}

/**
 * A token whose payload segment is deliberately not valid base64url, for the tests that
 * assert a parser REJECTS malformed input.
 */
export function malformedJwt(): string {
    return `${segment({ alg: 'HS256', typ: 'JWT' })}.!!not-base64!!.not-a-signature`;
}
