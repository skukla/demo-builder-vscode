/**
 * `ConfigurationService.readSiteOverlayUrl` — the read-back that tells a repair
 * whether the overlay is actually live.
 *
 * Split out of `configurationService.test.ts` because it had no tests at all: a
 * focused mutation run (PL-22, MUT-07) found every one of this method's 18
 * behavioural mutants uncovered, including all three optional-chain guards on
 * the response body. That matters more here than elsewhere — the method's whole
 * job is to distinguish "no overlay" from "could not tell", and a body shape it
 * did not expect must land on the second, never the first.
 *
 * Shares its setup with the rest of the family through
 * `./configurationService.testUtils`.
 */

import {
    ConfigurationService,
    MOCK_IMS_TOKEN,
    mockLogger,
    mockTokenProvider,
    spyOnFetch,
} from './configurationService.testUtils';

const CONFIG_URL = 'https://admin.hlx.page/config/test-user/sites/my-site.json';

describe('ConfigurationService.readSiteOverlayUrl', () => {
    let service: ConfigurationService;
    let fetchSpy: jest.SpyInstance;

    /** The site config the Admin API would return, as a real Response. */
    const respondWith = (payload: string, status = 200) =>
        fetchSpy.mockResolvedValueOnce(new Response(payload, { status }));

    const read = () => service.readSiteOverlayUrl('test-user', 'my-site');

    beforeEach(() => {
        jest.clearAllMocks();
        mockTokenProvider.getAccessToken.mockResolvedValue(MOCK_IMS_TOKEN);
        service = new ConfigurationService(mockTokenProvider, mockLogger);
        fetchSpy = spyOnFetch();
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('GETs the site config with the IMS bearer token and a timeout signal', async () => {
        respondWith(JSON.stringify({ content: { overlay: { url: 'https://byom.example.com' } } }));

        await read();

        expect(fetchSpy).toHaveBeenCalledWith(CONFIG_URL, {
            method: 'GET',
            headers: { Authorization: `Bearer ${MOCK_IMS_TOKEN}` },
            signal: expect.any(AbortSignal),
        });
    });

    it('returns the registered overlay URL', async () => {
        respondWith(JSON.stringify({ content: { overlay: { url: 'https://byom.example.com' } } }));

        expect(await read()).toEqual({ readable: true, overlayUrl: 'https://byom.example.com' });
    });

    // The three shapes below each remove one level the optional chain guards.
    // Every one of them means "the site carries no overlay" — a readable answer —
    // and NOT "the read failed", which is the distinction the whole method exists
    // to make. Without the guard the property access throws and the catch below
    // reports an unreadable site, so a healthy storefront reads as broken.
    it.each([
        ['a body that is not an object at all', 'null'],
        ['a config with no content block', '{}'],
        ['a content block with no overlay', JSON.stringify({ content: {} })],
    ])('reports no overlay, readably, for %s', async (_shape, payload) => {
        respondWith(payload);

        expect(await read()).toEqual({ readable: true });
    });

    it('reports the site unreadable when the API refuses, even if the body parses', async () => {
        // A 403 body that happens to be valid JSON carrying an overlay is the case
        // that separates "checked the status" from "parsed whatever came back".
        respondWith(JSON.stringify({ content: { overlay: { url: 'https://stale.example' } } }), 403);

        expect(await read()).toEqual({ readable: false });
    });

    it('reports the site unreadable when the request throws', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));

        expect(await read()).toEqual({ readable: false });
    });
});
