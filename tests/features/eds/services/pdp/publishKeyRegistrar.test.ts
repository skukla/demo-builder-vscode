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

const mockCreateAdminApiKey = jest.fn<Promise<string | null>, [string, string]>();
const mockForgetApiKey = jest.fn<Promise<void>, [string, string]>();
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: Object.assign(
        jest.fn().mockImplementation(() => ({ createAdminApiKey: mockCreateAdminApiKey })),
        { forgetApiKey: (o: string, s: string) => mockForgetApiKey(o, s) }
    ),
}));

import { registerPublishKey } from '@/features/eds/services/pdp/publishKeyRegistrar';

const OVERLAY =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=a&site=b';
const SITE = { owner: 'skukla', repo: 'demo-site' };

function makeLogger() {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
    };
}
function makeTokenProvider(token: string | null = 'da-live-bearer') {
    return { getAccessToken: jest.fn().mockResolvedValue(token) };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveOverlayUrl.mockReturnValue(OVERLAY);
    mockCreateAdminApiKey.mockResolvedValue('hlx_minted_key');
    mockForgetApiKey.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

describe('registerPublishKey', () => {
    it('mints a key and POSTs it to the register action with the DA.live bearer', async () => {
        const logger = makeLogger();
        const result = await registerPublishKey(makeTokenProvider(), SITE, logger as never);

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
        await registerPublishKey(makeTokenProvider(), SITE, makeLogger() as never);

        expect(mockForgetApiKey).toHaveBeenCalledWith('skukla', 'demo-site');
        const forgetOrder = mockForgetApiKey.mock.invocationCallOrder[0];
        const mintOrder = mockCreateAdminApiKey.mock.invocationCallOrder[0];
        expect(forgetOrder).toBeLessThan(mintOrder);
    });

    it('derives the register URL from the overlay URL, dropping its query', async () => {
        await registerPublishKey(makeTokenProvider(), SITE, makeLogger() as never);
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
                makeLogger() as never
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
                makeLogger() as never
            );
            expect(result.registered).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('when the key cannot be minted', async () => {
            mockCreateAdminApiKey.mockResolvedValue(null);
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger() as never
            );
            expect(result.registered).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('when there is no DA.live session', async () => {
            const result = await registerPublishKey(
                makeTokenProvider(null),
                SITE,
                makeLogger() as never
            );
            expect(result.registered).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('when the action rejects the registration', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger() as never
            );
            expect(result).toEqual({ registered: false, reason: 'registration returned 403' });
        });

        it('when the network throws', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
            const result = await registerPublishKey(
                makeTokenProvider(),
                SITE,
                makeLogger() as never
            );
            expect(result.registered).toBe(false);
            expect(result.reason).toBe('ECONNRESET');
        });
    });

    // It runs inside storefront setup; a throw here would abort a working setup.
    it('never rejects, whatever fails', async () => {
        mockForgetApiKey.mockRejectedValue(new Error('secret store unavailable'));
        await expect(
            registerPublishKey(makeTokenProvider(), SITE, makeLogger() as never)
        ).resolves.toEqual(expect.objectContaining({ registered: false }));
    });

    it('does not log the key', async () => {
        const logger = makeLogger();
        await registerPublishKey(makeTokenProvider(), SITE, logger as never);
        const logged = [...logger.info.mock.calls, ...logger.debug.mock.calls].flat().join(' ');
        expect(logged).not.toContain('hlx_minted_key');
        expect(logged).not.toContain('da-live-bearer');
    });
});
