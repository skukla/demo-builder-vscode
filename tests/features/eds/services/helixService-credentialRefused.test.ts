/**
 * A Helix 403 is a CREDENTIAL refusal, not a verdict about the user.
 *
 * Helix answers `403 [admin] not authorized` both when an identity genuinely
 * lacks a role AND when an authorized identity presents a token the server will
 * no longer accept. These threw a plain Error saying "you do not have permission
 * to preview this content" — a claim about the USER that the response does not
 * support.
 *
 * Measured 2026-08-16 on `bodea-template-test`: one reset produced 52 of these
 * plus a fatal preview 403, told the user at three surfaces that they held no
 * admin role, and then succeeded forty minutes later with the same identity on
 * the same project after nothing but a DA.live re-auth.
 *
 * Throwing `DaLiveAuthError` is what lets `withDaLiveAuthRetry` prompt and resume.
 * The type IS the behaviour here — a plain Error with better wording would still
 * be invisible to that wrapper, which catches on `instanceof`.
 */

export {};

import { HelixService } from '@/features/eds/services/helixService';
import type { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** A response carrying the x-error header Helix actually sends on a 403. */
const res = (status: number, xError?: string): Response =>
    ({
        status,
        ok: status >= 200 && status < 300,
        statusText: '',
        headers: { get: (h: string) => (h === 'x-error' ? (xError ?? null) : null) },
        text: async () => '',
    }) as unknown as Response;

describe('HelixService — a 403 is a refused credential', () => {
    let service: HelixService;

    beforeEach(() => {
        mockFetch.mockReset();
        const logger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
        const githubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
        } as unknown as GitHubTokenService;
        // previewPage refuses to run without a DA.live token provider — without
        // this the suite never reaches the 403 and asserts on the wrong error.
        const daLiveTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('da-token') };
        service = new HelixService(logger, githubTokenService, daLiveTokenProvider);
    });

    it('throws DaLiveAuthError when previewing content is refused', async () => {
        mockFetch.mockResolvedValue(res(403, '[admin] not authorized'));

        await expect(service.previewPage('skukla', 'demo', '/index')).rejects.toBeInstanceOf(
            DaLiveAuthError,
        );
    });

    // The type is what withDaLiveAuthRetry keys on, so it is asserted directly
    // rather than through the message.
    it('carries the x-error detail so a log reader can tell WHY', async () => {
        mockFetch.mockResolvedValue(res(403, '[admin] not authorized'));

        await expect(service.previewPage('skukla', 'demo', '/index')).rejects.toThrow(
            /not authorized/,
        );
    });

    it('does not claim the user lacks permission', async () => {
        mockFetch.mockResolvedValue(res(403, '[admin] not authorized'));

        await expect(service.previewPage('skukla', 'demo', '/index')).rejects.not.toThrow(
            /you do not have permission/i,
        );
    });

    /**
     * CONTROL. A non-403 failure must NOT become a credential error — otherwise
     * every Helix failure would trigger a re-auth prompt, and the tests above
     * would pass against code that classifies everything.
     */
    it('CONTROL — a 500 is not a credential refusal', async () => {
        mockFetch.mockResolvedValue(res(500));

        await expect(service.previewPage('skukla', 'demo', '/index')).rejects.not.toBeInstanceOf(
            DaLiveAuthError,
        );
    });

    // CONTROL: the happy path still resolves, so the throws above are a property
    // of the status and not of the harness.
    it('CONTROL — a 200 still succeeds', async () => {
        mockFetch.mockResolvedValue(res(200));

        await expect(service.previewPage('skukla', 'demo', '/index')).resolves.not.toThrow();
    });
});
