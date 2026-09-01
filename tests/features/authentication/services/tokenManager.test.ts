/**
 * TokenManager — the rules applied to the CLI's stored token.
 *
 * Every case here is a rule about a `{ token, expiry }` pair: the length floor,
 * the expiry comparison, and the corruption state. They are driven through the
 * injected reader, so the suite exercises those rules and nothing else.
 *
 * **This used to be a CLI test.** Reading the token meant spawning
 * `aio config get … --json`, so a test about a date comparison had to fake
 * subprocess stdout — including fnm version banners and the CLI's emoji warning
 * lines, which had their own cleaning code and their own tests. That read is now
 * in-process via `@adobe/aio-lib-core-config` (MEASURED 2.05s → 20ms; the
 * subprocess was the reason reset's second prompt took 2-3s to appear).
 *
 * The output-cleaning, JSON-parse and retry-on-timeout cases were DELETED rather
 * than ported. They covered a subprocess that no longer exists; keeping them
 * would have meant testing a code path against a mock of a thing we stopped
 * doing. What replaced them is one case for a reader that throws.
 */

import {
    TokenManager,
    type StoredTokenConfig,
} from '@/features/authentication/services/tokenManager';

/** A token long enough to clear the 100-character floor. */
const LONG_TOKEN = 'x'.repeat(150);
const HOUR_MS = 60 * 60 * 1000;

/**
 * A manager reading exactly what the test says the config store holds. The
 * fourth argument is the silent-refresh seam: `noRefresh` by default so an
 * expired fixture can NEVER reach the real aio-lib-ims (which would fire a
 * live IMS call from jest); refresh-path tests inject their own.
 */
const noRefresh = async (): Promise<undefined> => undefined;
function managerReading(
    stored: StoredTokenConfig | undefined,
    refresh: () => Promise<StoredTokenConfig | undefined> = noRefresh
): TokenManager {
    return new TokenManager(undefined, undefined, () => stored, refresh);
}

describe('TokenManager — inspectToken', () => {
    it('returns valid, with the token and a positive expiry', async () => {
        const manager = managerReading({ token: LONG_TOKEN, expiry: Date.now() + HOUR_MS });

        const result = await manager.inspectToken();

        expect(result.valid).toBe(true);
        expect(result.token).toBe(LONG_TOKEN);
        expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('returns invalid when the config store holds nothing', async () => {
        const result = await managerReading(undefined).inspectToken();

        expect(result.valid).toBe(false);
        expect(result.expiresIn).toBe(0);
        expect(result.token).toBeUndefined();
    });

    it('returns invalid for a token shorter than 100 characters', async () => {
        const result = await managerReading({
            token: 'short-token',
            expiry: Date.now() + HOUR_MS,
        }).inspectToken();

        expect(result.valid).toBe(false);
        expect(result.expiresIn).toBe(0);
    });

    // The token is still returned: callers distinguish "expired" from "absent".
    it('returns invalid, with a negative expiresIn, for an expired token', async () => {
        const result = await managerReading({
            token: LONG_TOKEN,
            expiry: Date.now() - HOUR_MS,
        }).inspectToken();

        expect(result.valid).toBe(false);
        expect(result.token).toBe(LONG_TOKEN);
        expect(result.expiresIn).toBeLessThan(0);
    });

    /**
     * CORRUPTION (beta.42): a real token with expiry=0 is a corrupted store, not
     * an expired session, and the two need different remedies.
     */
    it('detects corruption when a long token carries expiry 0', async () => {
        const result = await managerReading({ token: LONG_TOKEN, expiry: 0 }).inspectToken();

        expect(result.valid).toBe(false);
        expect(result.expiresIn).toBe(0);
        expect(result.token).toBe(LONG_TOKEN);
    });

    it('returns invalid when the entry has an expiry but no token', async () => {
        const result = await managerReading({ expiry: Date.now() + HOUR_MS }).inspectToken();

        expect(result.valid).toBe(false);
    });

    it('returns invalid when the entry has a token but no expiry', async () => {
        const result = await managerReading({ token: LONG_TOKEN }).inspectToken();

        expect(result.valid).toBe(false);
    });

    it('reports expiresIn in minutes', async () => {
        const result = await managerReading({
            token: LONG_TOKEN,
            expiry: Date.now() + 120 * 60 * 1000,
        }).inspectToken();

        expect(result.valid).toBe(true);
        expect(result.expiresIn).toBeGreaterThanOrEqual(119);
        expect(result.expiresIn).toBeLessThanOrEqual(121);
    });

    // ── Silent IMS refresh (2026-08-27) ─────────────────────────────────────
    // An expired stored token is not "signed out": the aio CLI silently
    // refreshes via the context's refresh token (measured live: 30-min-expired
    // access token, 14-day refresh token, session restored in ~2s). The
    // extension must ask the library before asking a human.

    it('an EXPIRED stored token triggers the silent refresh and serves its result', async () => {
        const fresh = { token: 'y'.repeat(150), expiry: Date.now() + 24 * HOUR_MS };
        const refresh = jest.fn().mockResolvedValue(fresh);

        const result = await managerReading(
            { token: LONG_TOKEN, expiry: Date.now() - 30 * 60 * 1000 },
            refresh
        ).inspectToken();

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(result.valid).toBe(true);
        expect(result.token).toBe(fresh.token);
    });

    it('a VALID stored token never consults the refresh', async () => {
        const refresh = jest.fn();

        const result = await managerReading(
            { token: LONG_TOKEN, expiry: Date.now() + HOUR_MS },
            refresh
        ).inspectToken();

        expect(result.valid).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
    });

    it('a refresh that yields nothing leaves the ORIGINAL expired verdict', async () => {
        const result = await managerReading(
            { token: LONG_TOKEN, expiry: Date.now() - 30 * 60 * 1000 },
            async () => undefined
        ).inspectToken();

        expect(result.valid).toBe(false);
        expect(result.expiresIn).toBeLessThan(0);
    });

    it('a refresh that THROWS is contained — the expired verdict answers', async () => {
        const result = await managerReading(
            { token: LONG_TOKEN, expiry: Date.now() - 30 * 60 * 1000 },
            async () => {
                throw new Error('network down');
            }
        ).inspectToken();

        expect(result.valid).toBe(false);
    });

    it('a refresh that returns a STILL-BAD token leaves the original verdict', async () => {
        const result = await managerReading(
            { token: LONG_TOKEN, expiry: Date.now() - 30 * 60 * 1000 },
            async () => ({ token: 'short', expiry: Date.now() + HOUR_MS })
        ).inspectToken();

        expect(result.valid).toBe(false);
    });

    /**
     * Replaces the old "command execution errors" case. An unreadable config store
     * is "not signed in" — the same answer the failed subprocess gave — and must
     * never propagate, since `isAuthenticated` sits in front of eight UI paths.
     */
    it('reports not-signed-in when the config read throws, rather than propagating', async () => {
        const manager = new TokenManager(undefined, undefined, () => {
            throw new Error('config store unreadable');
        });

        await expect(manager.inspectToken()).resolves.toEqual({ valid: false, expiresIn: 0 });
    });
});

describe('TokenManager — isTokenValid', () => {
    it('is true for a live token', async () => {
        const manager = managerReading({ token: LONG_TOKEN, expiry: Date.now() + HOUR_MS });

        await expect(manager.isTokenValid()).resolves.toBe(true);
    });

    it('is false when there is no token', async () => {
        await expect(managerReading(undefined).isTokenValid()).resolves.toBe(false);
    });

    it('is false for an expired token', async () => {
        const manager = managerReading({ token: LONG_TOKEN, expiry: Date.now() - HOUR_MS });

        await expect(manager.isTokenValid()).resolves.toBe(false);
    });
});

describe('TokenManager — boundaries', () => {
    // The check is `< 100`, so exactly 100 passes. Pinned at both sides so a
    // change from `<` to `<=` cannot slip through.
    it('accepts a token of exactly 100 characters', async () => {
        const result = await managerReading({
            token: 'x'.repeat(100),
            expiry: Date.now() + HOUR_MS,
        }).inspectToken();

        expect(result.valid).toBe(true);
    });

    it('accepts a token of 101 characters', async () => {
        const result = await managerReading({
            token: 'x'.repeat(101),
            expiry: Date.now() + HOUR_MS,
        }).inspectToken();

        expect(result.valid).toBe(true);
    });

    // Must be strictly in the future.
    it('rejects an expiry exactly at the current time', async () => {
        const result = await managerReading({
            token: LONG_TOKEN,
            expiry: Date.now(),
        }).inspectToken();

        expect(result.valid).toBe(false);
    });

    it('handles an expiry a year out', async () => {
        const result = await managerReading({
            token: LONG_TOKEN,
            expiry: Date.now() + 365 * 24 * HOUR_MS,
        }).inspectToken();

        expect(result.valid).toBe(true);
        expect(result.expiresIn).toBeGreaterThan(525000);
    });

    it('returns invalid for an empty entry', async () => {
        await expect(managerReading({}).inspectToken()).resolves.toMatchObject({ valid: false });
    });

    // The store is HJSON written by another tool; nulls are possible and are not
    // the same as absent keys.
    it('returns invalid for null token and expiry', async () => {
        const nulls = { token: null, expiry: null } as unknown as StoredTokenConfig;

        await expect(managerReading(nulls).inspectToken()).resolves.toMatchObject({ valid: false });
    });
});
