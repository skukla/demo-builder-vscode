/**
 * registerPublishKey — mint a site publish key and hand it to the shared action.
 *
 * The contract that matters: NEVER throws (it runs inside storefront setup and
 * repair, beside `pinSiteAdmin`), always re-mints rather than reusing a cached
 * key, and authenticates the registration with the DA.live bearer.
 */

const mockResolveOverlayUrl = jest.fn<string | undefined, []>();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveByomOverlayUrl: () => mockResolveOverlayUrl(),
}));

/**
 * Helix arrives through the front door — `registerPublishKey`'s fourth parameter —
 * rather than by mocking the module. ADR-016 lists this suite among the thirteen that
 * module-mocked a STATELESS collaborator purely because they could not hand one in.
 *
 * What that buys, concretely: the fake is typed `PublishKeyHelix`, so it stops
 * compiling the day the seam changes. A `jest.mock` factory answers the same shape
 * forever and would not.
 */
const mockCreateAdminApiKey = jest.fn<Promise<string | null>, [string, string]>();
const mockForgetApiKey = jest.fn<Promise<void>, [string, string]>();

/**
 * The DEFAULT seam — what a production caller gets when it omits the fourth argument.
 *
 * Every test above hands a fake in, so nothing exercised `realHelix` itself: the
 * wiring that binds this call's logger and token provider into a `HelixService` was
 * unasserted, and emptying either arrow changed no test. This is the one place the
 * real module has to be mocked, because the seam under test IS the construction.
 */
const mockRealForgetApiKey = jest.fn<Promise<void>, [string, string]>();
const mockRealCreateAdminApiKey = jest.fn<Promise<string | null>, [string, string]>();
const mockHelixConstructor = jest.fn<void, [unknown, unknown, unknown]>();
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: class {
        static forgetApiKey(owner: string, repo: string): Promise<void> {
            return mockRealForgetApiKey(owner, repo);
        }
        constructor(logger: unknown, apiKey: unknown, tokenProvider: unknown) {
            mockHelixConstructor(logger, apiKey, tokenProvider);
        }
        createAdminApiKey(owner: string, repo: string): Promise<string | null> {
            return mockRealCreateAdminApiKey(owner, repo);
        }
    },
}));

import {
    registerPublishKey,
    type PublishKeyHelix,
} from '@/features/eds/services/pdp/publishKeyRegistrar';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const makeHelix = (): PublishKeyHelix => ({
    forgetApiKey: (owner, repo) => mockForgetApiKey(owner, repo),
    createAdminApiKey: (owner, repo) => mockCreateAdminApiKey(owner, repo),
});

const OVERLAY =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=a&site=b';
const SITE = { owner: 'skukla', repo: 'demo-site' };

/**
 * Typed `jest.Mocked<Logger>`, not `Logger`. It is assignable to `Logger` — so no cast
 * at the call boundary — while keeping `.mock` reachable for the assertions below.
 * Typing it as bare `Logger` compiled the calls and broke `logger.debug.mock`, which is
 * the typechecker doing the job the eleven `as never` casts used to suppress.
 */
function makeLogger(): jest.Mocked<Logger> {
    return createMockLogger();
}
function makeTokenProvider(token: string | null = 'da-live-bearer') {
    return { getAccessToken: jest.fn().mockResolvedValue(token) };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveOverlayUrl.mockReturnValue(OVERLAY);
    mockCreateAdminApiKey.mockResolvedValue('hlx_minted_key');
    mockForgetApiKey.mockResolvedValue(undefined);
    mockRealForgetApiKey.mockResolvedValue(undefined);
    mockRealCreateAdminApiKey.mockResolvedValue('hlx_real_seam_key');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

describe('registerPublishKey', () => {
    it('mints a key and POSTs it to the register action with the DA.live bearer', async () => {
        const logger = makeLogger();
        const result = await registerPublishKey(makeTokenProvider(), SITE, logger, makeHelix());

        expect(result).toEqual({ registered: true });
        const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/register-publish-key'
        );
        expect(opts.method).toBe('POST');
        expect(opts.headers.Authorization).toBe('Bearer da-live-bearer');
        expect(JSON.parse(opts.body)).toEqual({
            org: 'skukla',
            site: 'demo-site',
            key: 'hlx_minted_key',
        });
    });

    // The only reason to call this is that a config write just destroyed the
    // key server-side, so a cache hit would register a dead key.
    it('drops the locally cached key BEFORE minting', async () => {
        await registerPublishKey(makeTokenProvider(), SITE, makeLogger(), makeHelix());

        expect(mockForgetApiKey).toHaveBeenCalledWith('skukla', 'demo-site');
        const forgetOrder = mockForgetApiKey.mock.invocationCallOrder[0];
        const mintOrder = mockCreateAdminApiKey.mock.invocationCallOrder[0];
        expect(forgetOrder).toBeLessThan(mintOrder);
    });

    it('derives the register URL from the overlay URL, dropping its query', async () => {
        await registerPublishKey(makeTokenProvider(), SITE, makeLogger(), makeHelix());
        const [url] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).not.toContain('?');
        expect(url).toContain('/register-publish-key');
    });

    describe('skips without throwing', () => {
        it('when BYOM is disabled', async () => {
            mockResolveOverlayUrl.mockReturnValue(undefined);
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result.registered).toBe(false);
            expect(result.reason).toMatch(/BYOM disabled/);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        // A setting pointing anywhere else must not be POSTed a credential.
        it('when the overlay URL is not a render-pdp URL', async () => {
            mockResolveOverlayUrl.mockReturnValue('https://evil.example.com/collect');
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result.registered).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('when the key cannot be minted', async () => {
            mockCreateAdminApiKey.mockResolvedValue(null);
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result.registered).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        // Handing the seam in matters: with the default seam this test passed for the
        // wrong reason — it never reached the token check at all, so deleting that
        // check changed nothing.
        it('when there is no DA.live session', async () => {
            const result = await registerPublishKey(
                makeTokenProvider(null),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result.registered).toBe(false);
            expect(result.reason).toMatch(/no DA\.live session/);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('when the action rejects the registration', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result).toEqual({ registered: false, reason: 'registration returned 403' });
        });

        it('when the network throws', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger(),
                makeHelix()
            );
            expect(result.registered).toBe(false);
            expect(result.reason).toBe('ECONNRESET');
        });
    });

    // It runs inside storefront setup; a throw here would abort a working setup.
    it('never rejects, whatever fails', async () => {
        mockForgetApiKey.mockRejectedValue(new Error('secret store unavailable'));
        await expect(
            registerPublishKey(makeTokenProvider(), SITE, makeLogger(), makeHelix())
        ).resolves.toEqual(expect.objectContaining({ registered: false }));
    });

    /**
     * WHICH CHANNEL a non-registration lands on is a decision, not presentation.
     *
     * BYOM off is the normal state of every non-BYOM storefront; warning there
     * trains the reader to ignore the channel, and then the one warning that
     * matters — a mint or registration that failed, whose only symptom months
     * later is "some PDPs 404" — is lost in it. So: the uninteresting case is
     * debug and stays off `warn`, and a real failure is `warn`. These assert the
     * channel, never the wording.
     */
    describe('reports at the level the consequence deserves', () => {
        it('keeps the expected BYOM-off case off the warn channel', async () => {
            mockResolveOverlayUrl.mockReturnValue(undefined);
            const logger = makeLogger();

            await registerPublishKey(makeTokenProvider(), SITE, logger, makeHelix());

            expect(logger.debug).toHaveBeenCalled();
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('warns when a mint fails, because nothing else connects it to a 404', async () => {
            mockCreateAdminApiKey.mockResolvedValue(null);
            const logger = makeLogger();

            await registerPublishKey(makeTokenProvider(), SITE, logger, makeHelix());

            expect(logger.warn).toHaveBeenCalled();
        });

        it('warns when the action rejects the registration', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
            const logger = makeLogger();

            await registerPublishKey(makeTokenProvider(), SITE, logger, makeHelix());

            expect(logger.warn).toHaveBeenCalled();
        });
    });

    /**
     * The default fourth argument. Production never passes a seam, so if `realHelix`
     * were wired to the wrong site, the wrong token source or nothing at all, every
     * test above would still pass — they all hand their own fake in.
     */
    describe('the default Helix seam', () => {
        it('forgets and re-mints against the real service for THIS site', async () => {
            const result = await registerPublishKey(makeTokenProvider(), SITE, makeLogger());

            expect(result).toEqual({ registered: true });
            expect(mockRealForgetApiKey).toHaveBeenCalledWith('skukla', 'demo-site');
            expect(mockRealCreateAdminApiKey).toHaveBeenCalledWith('skukla', 'demo-site');
            const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
            expect(JSON.parse(opts.body).key).toBe('hlx_real_seam_key');
        });

        // The DA.live bearer authenticates the mint as well as the POST, so the
        // token provider has to reach HelixService — not just the fetch below it.
        it('binds this call’s logger and token provider into the service', async () => {
            const logger = makeLogger();
            const tokenProvider = makeTokenProvider();

            await registerPublishKey(tokenProvider, SITE, logger);

            expect(mockHelixConstructor).toHaveBeenCalledWith(logger, undefined, tokenProvider);
        });
    });

    it('does not log the key', async () => {
        const logger = makeLogger();
        await registerPublishKey(makeTokenProvider(), SITE, logger, makeHelix());
        const logged = [...logger.info.mock.calls, ...logger.debug.mock.calls].flat().join(' ');
        expect(logged).not.toContain('hlx_minted_key');
        expect(logged).not.toContain('da-live-bearer');
    });
});
