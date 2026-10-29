/**
 * Publish, bulk publish and cache purge treat a 403 the way preview does.
 *
 * Helix answers `403 [admin] not authorized` both for a genuinely missing role
 * AND for a token it no longer accepts. Preview and code preview were changed on
 * 2026-08-16 to raise `DaLiveAuthError` (via `throwCredentialRefused`) so
 * `withDaLiveAuthRetry` can ask the SC to sign in again and carry on. Publish,
 * bulk publish and purge still threw a plain "Access denied. You do not have
 * permission to ..." Error, which no wrapper recognises — so the same expired
 * session that preview recovers from failed the run outright one step later.
 * Nothing recorded a reason for the difference; the owner decided 2026-10-09
 * that they should match (PL-69, pairs 1 to 3).
 *
 * DELETE /live stays exempt: its 403 is the documented "while source exists"
 * restriction, not a credential problem.
 */

export {};

const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
}));

import { withDaLiveAuthRetry } from '@/features/eds/services/daLive/daLiveAuthRetry';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const X_ERROR = '[admin] not authorized';

/** A response carrying the x-error header Helix actually sends on a 403. */
const res = (status: number, xError?: string): Response =>
    ({
        status,
        ok: status >= 200 && status < 300,
        statusText: '',
        headers: { get: (h: string) => (h === 'x-error' ? (xError ?? null) : null) },
        text: async () => '',
        json: async () => ({}),
    }) as unknown as Response;

/** The shared wording `throwCredentialRefused` builds, for one operation. */
const refusal = (what: string): string =>
    `Access denied while trying to ${what} (403: ${X_ERROR}). ` +
    'This may be an expired session rather than a missing role.';

describe('HelixService — publish, bulk publish and purge: a 403 is a refused credential', () => {
    let service: HelixService;

    beforeEach(() => {
        mockFetch.mockReset();
        mockEnsureDaLiveAuth.mockReset();
        const logger = createMockLogger() as unknown as Logger;
        const githubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
        } as unknown as GitHubTokenService;
        const daLiveTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('da-token') };
        service = new HelixService(logger, githubTokenService, daLiveTokenProvider);
    });

    const cases: Array<[string, string, () => Promise<unknown>]> = [
        ['publishPage', 'publish this content', () => service.publishPage('skukla', 'demo', '/index')],
        ['publishAllContent', 'publish this content', () => service.publishAllContent('skukla', 'demo')],
        ['purgeCacheAll', 'purge this site cache', () => service.purgeCacheAll('skukla', 'demo')],
    ];

    describe.each(cases)('%s', (_name, what, call) => {
        it('raises DaLiveAuthError, the type withDaLiveAuthRetry keys on', async () => {
            mockFetch.mockResolvedValue(res(403, X_ERROR));

            await expect(call()).rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it('uses the shared wording, carrying the x-error detail', async () => {
            mockFetch.mockResolvedValue(res(403, X_ERROR));

            await expect(call()).rejects.toThrow(refusal(what));
        });

        it('does not claim the user lacks permission', async () => {
            mockFetch.mockResolvedValue(res(403, X_ERROR));

            await expect(call()).rejects.not.toThrow(/do not have permission/i);
        });

        it('inside withDaLiveAuthRetry, prompts once and resumes', async () => {
            mockFetch.mockResolvedValueOnce(res(403, X_ERROR)).mockResolvedValue(res(200));
            mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

            await expect(
                withDaLiveAuthRetry(createMockHandlerContext(), call),
            ).resolves.not.toThrow();
            expect(mockEnsureDaLiveAuth).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        // CONTROL: a non-403 failure must not become a credential error, or every
        // Helix failure would trigger a sign-in prompt.
        it('CONTROL — a 500 is not a credential refusal', async () => {
            mockFetch.mockResolvedValue(res(500));

            await expect(call()).rejects.not.toBeInstanceOf(DaLiveAuthError);
        });
    });

    // CONTROL: the exemption the doc on throwCredentialRefused names. A DELETE
    // /live 403 is "delete not allowed while source exists" — a real constraint —
    // and is reported as a failed unpublish, never as a sign-in prompt.
    it('CONTROL — a DELETE /live 403 stays its own outcome, not a credential refusal', async () => {
        mockFetch.mockResolvedValue(res(403, 'delete not allowed while source exists'));

        await expect(service.unpublishPage('skukla', 'demo', '/index')).resolves.toBe(false);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/live/'),
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});
