/**
 * The REAL reader — the one every other TokenManager test injects around.
 *
 * `tokenManager.test.ts` drives the length floor, the expiry comparison and the
 * corruption state through an injected `TokenConfigReader`. That is the right
 * seam for those rules, and it is also why the default reader had no test at all:
 * the fake answers correctly no matter how the real one reads the file.
 *
 * It read the file exactly once per extension session. `@adobe/aio-lib-core-config`
 * caches the parsed config in memory and reloads only when it holds nothing
 * (`Config.js`: `this.values || this.reload()`), so every `get` after the first
 * returns the snapshot taken at the first. MEASURED against the library, with the
 * `reload()` call as the positive control:
 *
 *     read 1 : {"token":"FIRST","expiry":111}
 *     read 2 : {"token":"FIRST","expiry":111}   <- after another process rewrote the file
 *     reload : {"token":"SECOND","expiry":222}
 *
 * `aio login` IS another process. So signing in wrote a fresh token that this
 * extension could not see: the check right after a successful login re-read the
 * expired snapshot, reported `expiresIn=-15 min`, and sent the user back to sign
 * in — three times in a row in the 2026-08-17 log, each login "successful", each
 * followed by "Token expired or invalid".
 *
 * These tests assert the CALL, not the value. A mocked config module answers the
 * same whether or not it was reloaded first, so asserting the returned token
 * would pass against the bug.
 */

const mockGet = jest.fn();
const mockReload = jest.fn();

jest.mock('@adobe/aio-lib-core-config', () => ({
    get: (...args: unknown[]) => mockGet(...args),
    reload: () => mockReload(),
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

import { readStoredTokenConfig } from '@/features/authentication/services/tokenManager';

beforeEach(() => {
    mockGet.mockReset();
    mockReload.mockReset();
    mockGet.mockReturnValue({ token: 'x'.repeat(150), expiry: Date.now() + 3600_000 });
});

describe('readStoredTokenConfig', () => {
    it('re-reads the file before answering, so a login by another process is visible', () => {
        readStoredTokenConfig();

        expect(mockReload).toHaveBeenCalled();
        expect(mockGet.mock.invocationCallOrder[0]).toBeGreaterThan(
            mockReload.mock.invocationCallOrder[0],
        );
    });

    it('re-reads on EVERY call — the stale answer came from the second one', () => {
        readStoredTokenConfig();
        readStoredTokenConfig();
        readStoredTokenConfig();

        expect(mockReload).toHaveBeenCalledTimes(3);
    });

    it('reads the key the CLI stores its token under', () => {
        readStoredTokenConfig();

        expect(mockGet).toHaveBeenCalledWith('ims.contexts.cli.access_token');
    });

    it('still answers when the file cannot be reloaded', () => {
        // A reload that throws must not take down a read that could still be
        // served from what the library already holds — a stale token is a worse
        // answer than a fresh one, but a thrown error here reads to the caller as
        // "not signed in" and is a worse answer than both.
        mockReload.mockImplementation(() => {
            throw new Error('EACCES: permission denied');
        });

        expect(() => readStoredTokenConfig()).not.toThrow();
        expect(mockGet).toHaveBeenCalled();
    });
});
