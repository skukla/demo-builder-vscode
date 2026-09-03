/**
 * The STRICT DA.live token check.
 *
 * `validateDaLiveTokenStrict` is what stands between a string on someone's clipboard
 * and a credential written into secret storage. It is the only check on two separate
 * paths — the clipboard read in the sign-in flow, and the token-store handler an agent
 * or the webview calls — and no test called it directly. Half its decisions had no
 * coverage at all.
 *
 * It layers three refusals on top of the ordinary check, and each exists because the
 * ordinary check is deliberately lenient:
 *
 *   - not a DA.live token at all (some other service's JWT)
 *   - a DA.live token that states no lifetime, which cannot be stored safely because
 *     nothing would ever know to refresh it
 *   - anything the ordinary check already rejects, passed straight through so the user
 *     sees the specific reason rather than a generic one
 */


import {
    validateDaLiveToken,
    validateDaLiveTokenStrict,
    makeDaLiveToken,
} from './daLiveAuthPrompt.testUtils';

/** A DA.live token whose lifetime runs to the year 2286. */
const liveToken = makeDaLiveToken({
    client_id: 'darkalley',
    created_at: '9999999999999',
    expires_in: '3600000',
    email: 'user@example.com',
});

/**
 * Narrowing helpers.
 *
 * The strict check returns a union — refused carries an `error`, accepted carries an
 * `expiresAt` — so a test cannot read either field without saying which case it expects.
 * That is the type's whole purpose (it is what removed the invented 24-hour fallback at
 * both call sites), and these keep the tests reading as sentences rather than as casts.
 */
function refusalFor(token: string): string {
    const result = validateDaLiveTokenStrict(token);
    if (result.valid) throw new Error('Expected the token to be refused, but it was accepted.');
    if (!result.error) throw new Error('Refused without saying why — every refusal states a reason.');
    return result.error;
}

function acceptanceOf(token: string): { expiresAt: number; email?: string } {
    const result = validateDaLiveTokenStrict(token);
    if (!result.valid) throw new Error(`Expected the token to be accepted: ${result.error}`);
    return result;
}

describe('validateDaLiveTokenStrict', () => {
    it('accepts a DA.live token that states when it expires', () => {
        const accepted = acceptanceOf(liveToken);

        expect(accepted.email).toBe('user@example.com');
        expect(accepted.expiresAt).toBeGreaterThan(Date.now());
    });

    it('refuses a token issued by something other than DA.live', () => {
        const otherService = makeDaLiveToken({
            client_id: 'some-other-app',
            created_at: '9999999999999',
            expires_in: '3600000',
        });

        expect(refusalFor(otherService)).toMatch(/bookmarklet on da\.live/i);
    });

    it('refuses a DA.live token that never says when it expires', () => {
        // The ordinary check ACCEPTS this — it only rejects a lifetime it can read and
        // that has passed. Storing it would leave a credential nothing knows to refresh.
        const noLifetime = makeDaLiveToken({ client_id: 'darkalley', email: 'user@example.com' });

        expect(validateDaLiveToken(noLifetime)).toMatchObject({ valid: true });
        expect(refusalFor(noLifetime)).toMatch(/no expiry/i);
    });

    it('refuses a token carrying only half a lifetime', () => {
        // Both halves are needed to compute an expiry. With one, there is nothing to
        // store — the same refusal as stating none at all, and worth pinning separately
        // because the two fields are read by one condition.
        const halfLifetime = makeDaLiveToken({ client_id: 'darkalley', created_at: '9999999999999' });

        expect(refusalFor(halfLifetime)).toMatch(/no expiry/i);
    });

    it('passes the ordinary check refusal through rather than replacing it', () => {
        // A user who pasted the wrong thing needs to be told THAT, not that their
        // DA.live token has no expiry.
        const notAJwt = 'this-is-not-a-token';

        // The ordinary check's own wording, carried through rather than replaced.
        expect(refusalFor(notAJwt)).toBe(validateDaLiveToken(notAJwt).error);
        expect(refusalFor(notAJwt)).toMatch(/token format/i);
    });

    it('refuses an expired DA.live token', () => {
        const expired = makeDaLiveToken({
            client_id: 'darkalley',
            created_at: '1000000000000',
            expires_in: '1000',
        });

        expect(refusalFor(expired)).toMatch(/expired/i);
    });
});
