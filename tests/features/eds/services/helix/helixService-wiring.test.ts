/**
 * How HelixService WIRES itself — which DA.live credential its content client is
 * built with, and what its thin static delegations actually forward.
 *
 * These are the seams nothing else in the family looks at, because every other
 * suite drives an HTTP path and the wiring is upstream of the first `fetch`.
 * Two of them are load-bearing and were unconstrained:
 *
 *   1. The constructor's `if (daLiveTokenProvider)` fork. The else branch builds a
 *      PLACEHOLDER whose `getAccessToken` throws — that refusal is the whole point
 *      of the branch, and a placeholder that resolved `undefined` instead would
 *      send content operations out with `Bearer undefined` and fail as
 *      `about:error` images rather than as an error anyone can read.
 *   2. `clearDefaultDaLiveTokenProvider`. It exists so a test can undo
 *      `setDefaultDaLiveTokenProvider`; a body that did nothing would leave the
 *      fallback registered for every service built afterwards.
 *
 * The mock wall and the service import live in `helixService.testUtils` — this
 * suite must not import the service directly (see that file's header).
 */

import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import * as keyStore from '@/features/eds/services/helix/helixKeyStore';
import {
    createHelixService,
    installFetchMock,
    loadHelixServiceModule,
    makeDaLiveTokenProvider,
    makeGitHubTokenService,
    mockDaLiveContentOperations,
    mockListDirectory,
    restoreFetch,
} from './helixService.testUtils';

jest.mock('@/features/eds/services/helix/helixKeyStore', () => ({
    ...jest.requireActual('@/features/eds/services/helix/helixKeyStore'),
    forgetApiKey: jest.fn(),
}));

/** The DA.live credential handed to the content client on the last construction. */
const lastContentAuth = (): { getAccessToken?: () => Promise<string | null> } | undefined =>
    mockDaLiveContentOperations.mock.calls.at(-1)?.[0];

describe('HelixService — how the DA.live content client is built', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();
    });

    afterEach(restoreFetch);

    it('hands the caller’s own provider to the content client', async () => {
        const provider = makeDaLiveTokenProvider('da-token');

        await createHelixService({ daLiveTokenProvider: provider });

        expect(mockDaLiveContentOperations).toHaveBeenCalledTimes(1);
        expect(lastContentAuth()).toBe(provider);
    });

    it('without a provider, builds a placeholder that REFUSES rather than resolving nothing', async () => {
        const module = await loadHelixServiceModule();

        new module.HelixService(
            undefined,
            makeGitHubTokenService() as unknown as GitHubTokenService,
        );

        expect(mockDaLiveContentOperations).toHaveBeenCalledTimes(1);
        const auth = lastContentAuth();
        // Not `undefined`: the branch must build something, or every content
        // operation dies on a property access instead of a stated reason.
        expect(auth).toBeDefined();
        await expect(auth?.getAccessToken?.()).rejects.toThrow(
            /DA\.live token provider not configured/,
        );
    });
});

describe('HelixService — the activation-registered fallback provider', () => {
    let mockFetch: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        mockFetch.mockResolvedValue({ ok: true, status: 200 });
        (await loadHelixServiceModule()).HelixService.clearDefaultDaLiveTokenProvider();
    });

    afterEach(async () => {
        (await loadHelixServiceModule()).HelixService.clearDefaultDaLiveTokenProvider();
        restoreFetch();
    });

    /** The headers the last admin call actually went out with. */
    const lastHeaders = () =>
        (mockFetch.mock.calls.at(-1)?.[1] as { headers: Record<string, string> }).headers;

    it('CONTROL — a service built without a provider still picks up the registered fallback', async () => {
        const module = await loadHelixServiceModule();
        module.HelixService.setDefaultDaLiveTokenProvider(makeDaLiveTokenProvider('fallback-token'));

        const service = new module.HelixService(
            undefined,
            makeGitHubTokenService() as unknown as GitHubTokenService,
        );
        await service.previewCode('org', 'site', '/config.json');

        expect(lastHeaders()).toEqual({
            Authorization: 'Bearer fallback-token',
            'x-auth-token': 'valid-github-token',
        });
    });

    it('clearing the fallback drops it — the next service authenticates without it', async () => {
        const module = await loadHelixServiceModule();
        module.HelixService.setDefaultDaLiveTokenProvider(makeDaLiveTokenProvider('fallback-token'));

        module.HelixService.clearDefaultDaLiveTokenProvider();

        const service = new module.HelixService(
            undefined,
            makeGitHubTokenService() as unknown as GitHubTokenService,
        );
        await service.previewCode('org', 'site', '/config.json');

        expect(lastHeaders()).toEqual({ 'x-auth-token': 'valid-github-token' });
    });
});

describe('HelixService — thin delegations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();
    });

    it('forgetApiKey drops the local copy for that org/site, with no server round trip', async () => {
        const module = await loadHelixServiceModule();

        await module.HelixService.forgetApiKey('skukla', 'demo');

        expect(keyStore.forgetApiKey).toHaveBeenCalledWith('skukla', 'demo');
    });

    it('listAllPages returns the web paths the DA.live listing holds', async () => {
        mockListDirectory.mockResolvedValueOnce([
            { name: 'index', ext: 'html', path: '/o/s/index.html' },
            { name: 'about', ext: 'html', path: '/o/s/about.html' },
        ]);
        const service = await createHelixService();

        const pages = await service.listAllPages('o', 's');

        expect(mockListDirectory).toHaveBeenCalledWith('o', 's', '/');
        expect(pages).toContain('/about');
        expect(pages).toHaveLength(2);
    });
});
