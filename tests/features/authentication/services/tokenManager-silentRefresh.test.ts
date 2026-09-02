/**
 * The REAL silent refresh — the one every other TokenManager test injects around.
 *
 * THE INCIDENT (2026-09-02). Loading a project ran a background auth check and a
 * browser sign-in page appeared, unrequested. The refresh called
 * `aio-lib-ims.getToken('cli')` behind a precheck on the LOCAL refresh-token
 * expiry, and a comment called that precheck load-bearing. It is not: a local
 * expiry is a claim, and when IMS rejects a refresh token the machine still
 * believes in, `getToken`'s chain falls through to `_generateToken`, which runs
 * the login plugins and opens a browser. No option turns that off.
 *
 * So the refresh now calls the exchange directly — `Ims#getAccessToken` with the
 * refresh token — which REJECTS instead of escalating to a human.
 *
 * THE LOAD-BEARING ASSERTION IS THE NEGATIVE ONE: `getToken` is never called, on
 * any path, including the failing ones. Everything else here is the behaviour
 * that had to keep working while that became true. `getToken` is no longer in the
 * module's typings either, so a re-introduction fails to compile as well — but a
 * typing is not a test, and this file is what fails if the typings are widened
 * back.
 */

const getAccessToken = jest.fn();
const contextGet = jest.fn();
const contextSet = jest.fn();
/** Present ONLY so the tests can prove nothing calls it. */
const getToken = jest.fn();

jest.mock('@adobe/aio-lib-ims', () => ({
    Ims: class {
        constructor(public env?: string) {}
        getAccessToken = (...args: unknown[]) => getAccessToken(...args);
    },
    context: {
        get: (...args: unknown[]) => contextGet(...args),
        set: (...args: unknown[]) => contextSet(...args),
    },
    getToken: (...args: unknown[]) => getToken(...args),
}));

import { refreshStoredToken } from '@/features/authentication/services/tokenManager';

const HOUR = 3600_000;
const LIVE_ACCESS = { token: 'a'.repeat(150), expiry: Date.now() + HOUR };

/** A `cli` context whose refresh token is live well past the ten-minute floor. */
function contextWithRefreshToken(expiry = Date.now() + 14 * 24 * HOUR) {
    return {
        name: 'cli',
        local: false,
        data: {
            access_token: { token: 'old', expiry: Date.now() - HOUR },
            refresh_token: { token: 'r'.repeat(150), expiry },
            env: 'prod',
            client_id: 'cli-client',
            client_secret: 'shh',
            scope: 'openid',
        },
    };
}

beforeEach(() => {
    getAccessToken.mockReset();
    contextGet.mockReset();
    contextSet.mockReset().mockResolvedValue(undefined);
    getToken.mockReset();
});

describe('refreshStoredToken', () => {
    it('trades the refresh token for a new access token and returns it', async () => {
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS });

        await expect(refreshStoredToken()).resolves.toEqual(LIVE_ACCESS);
    });

    it('sends IMS the refresh token and the context own client credentials', async () => {
        const ctx = contextWithRefreshToken();
        contextGet.mockResolvedValue(ctx);
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS });

        await refreshStoredToken();

        // Asserting the ARGUMENT, not the outcome: a mock answers the same
        // whatever it is handed, so only the call itself shows the exchange was
        // built correctly.
        expect(getAccessToken).toHaveBeenCalledWith(
            ctx.data.refresh_token.token,
            'cli-client',
            'shh',
            'openid',
        );
    });

    it('persists the minted access token where the CLI reads it', async () => {
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS });

        await refreshStoredToken();

        expect(contextSet).toHaveBeenCalledWith('cli.access_token', LIVE_ACCESS, false);
    });

    it('persists a ROTATED refresh token too, when IMS returned one', async () => {
        const rotated = { token: 'n'.repeat(150), expiry: Date.now() + 14 * 24 * HOUR };
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS, refresh_token: rotated });

        await refreshStoredToken();

        expect(contextSet).toHaveBeenCalledWith('cli.refresh_token', rotated, false);
    });

    it('still returns the token when persisting fails (the refresh already succeeded)', async () => {
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS });
        contextSet.mockRejectedValue(new Error('config is read-only'));

        await expect(refreshStoredToken()).resolves.toEqual(LIVE_ACCESS);
    });

    it('declines when there is no stored context at all', async () => {
        contextGet.mockResolvedValue(undefined);

        await expect(refreshStoredToken()).resolves.toBeUndefined();
        expect(getAccessToken).not.toHaveBeenCalled();
    });

    it('declines when the refresh token expires inside the ten-minute floor', async () => {
        // The library treats a token with under ten minutes left as unusable. A
        // refresh built on one is the case that used to reach the interactive
        // fallback.
        contextGet.mockResolvedValue(contextWithRefreshToken(Date.now() + 5 * 60_000));

        await expect(refreshStoredToken()).resolves.toBeUndefined();
        expect(getAccessToken).not.toHaveBeenCalled();
    });

    it('declines, rather than throwing, when IMS rejects the refresh token', async () => {
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({});

        await expect(refreshStoredToken()).resolves.toBeUndefined();
    });

    it('NEVER calls getToken — the call that can open a browser', async () => {
        // Every path, including the ones that decline. This is the regression.
        contextGet.mockResolvedValue(contextWithRefreshToken());
        getAccessToken.mockResolvedValue({ access_token: LIVE_ACCESS });
        await refreshStoredToken();

        contextGet.mockResolvedValue(contextWithRefreshToken(Date.now() + 60_000));
        await refreshStoredToken();

        contextGet.mockResolvedValue(undefined);
        await refreshStoredToken();

        expect(getToken).not.toHaveBeenCalled();
    });
});
