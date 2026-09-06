/**
 * servedStorefrontConfig — read the scope a storefront is ACTUALLY serving.
 *
 * Best-effort by contract: every failure resolves to undefined so callers fall
 * back to the project manifest. An unreachable or malformed config.json must
 * never throw into a diagnostics run.
 */

import {
    describeScope,
    fetchServedStorefrontConfig,
    scopesMatch,
    type StoreScope,
} from '@/features/eds/services/storefront/servedStorefrontConfig';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockLogger = createMockLogger();

const CS = {
    'Magento-Website-Code': 'citisignal',
    'Magento-Store-Code': 'citisignal_store',
    'Magento-Store-View-Code': 'citisignal_us',
};

function respond(body: unknown, ok = true, status = 200) {
    (global.fetch as jest.Mock).mockResolvedValue({ ok, status, json: async () => body });
}

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});

describe('fetchServedStorefrontConfig', () => {
    it('reads the scope and endpoint from the aem.live config.json', async () => {
        respond({
            public: {
                default: {
                    'commerce-endpoint': 'https://mesh.example.com/graphql',
                    headers: { cs: CS },
                },
            },
        });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        expect(result).toEqual({
            commerceEndpoint: 'https://mesh.example.com/graphql',
            scope: {
                websiteCode: 'citisignal',
                storeCode: 'citisignal_store',
                storeViewCode: 'citisignal_us',
            },
        });
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
            'https://main--shop--acme.aem.live/config.json'
        );
    });

    it('returns undefined on a non-OK response rather than throwing', async () => {
        respond({}, false, 404);

        expect(
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger)
        ).toBeUndefined();
    });

    it('returns undefined when the body has no public.default block', async () => {
        respond({ nothing: true });

        expect(
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger)
        ).toBeUndefined();
    });

    it('survives a config with no headers block, reporting an empty scope', async () => {
        // A storefront can be published with no commerce headers at all; that is
        // an empty scope, not a parse failure.
        respond({ public: { default: { 'commerce-endpoint': 'https://e.example.com' } } });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        expect(result?.scope).toEqual({
            websiteCode: undefined,
            storeCode: undefined,
            storeViewCode: undefined,
        });
    });

    it('treats an empty-string header as absent', async () => {
        respond({
            public: { default: { headers: { cs: { 'Magento-Website-Code': '' } } } },
        });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        expect(result?.scope.websiteCode).toBeUndefined();
    });

    it('returns undefined when the request throws', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

        expect(
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger)
        ).toBeUndefined();
    });

    // An unreachable CDN must not hold a diagnostics run open. The timeout is
    // the only thing that guarantees that, and it travels in the request
    // options, where nothing about the RESULT can see whether it was passed.
    it('bounds the request with an abort signal', async () => {
        respond({ public: { default: {} } });

        await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    // A 404 body still parses. Reading it would report the CDN's error page as
    // the storefront's configuration — worse than no answer, because the caller
    // trusts an answer over the manifest.
    it('does not read the body of a non-OK response', async () => {
        respond(
            { public: { default: { 'commerce-endpoint': 'https://ghost.example.com' } } },
            false,
            404
        );

        expect(await fetchServedStorefrontConfig('acme', 'shop', mockLogger)).toBeUndefined();
    });

    // config.json comes off a CDN, so its shape is not guaranteed. A
    // public.default that is not an object must read as "no answer" rather than
    // as a storefront serving an empty scope — the second is a state a caller
    // would report as drift.
    it('returns undefined when public.default is not an object', async () => {
        respond({ public: { default: '' } });

        expect(await fetchServedStorefrontConfig('acme', 'shop', mockLogger)).toBeUndefined();
    });

    it.each<[string, unknown]>([
        ['a number', 42],
        ['an object', { code: 'citisignal' }],
    ])('treats %s header value as absent rather than passing it through', async (_l, value) => {
        respond({
            public: { default: { headers: { cs: { 'Magento-Website-Code': value } } } },
        });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        expect(result?.scope.websiteCode).toBeUndefined();
    });

    it('treats a non-string commerce-endpoint as absent', async () => {
        respond({ public: { default: { 'commerce-endpoint': 42, headers: { cs: CS } } } });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger);

        expect(result?.commerceEndpoint).toBeUndefined();
        expect(result?.scope.websiteCode).toBe('citisignal');
    });
});

describe('scopesMatch', () => {
    it('matches on all three codes', () => {
        expect(
            scopesMatch(
                { websiteCode: 'a', storeCode: 'b', storeViewCode: 'c' },
                {
                    websiteCode: 'a',
                    storeCode: 'b',
                    storeViewCode: 'c',
                }
            )
        ).toBe(true);
    });

    // One case per code. With only the website case, either of the other two
    // comparisons could be dropped and every test still passed — and a storefront
    // serving the wrong store VIEW is the drift this module was written to catch.
    it.each<[string, StoreScope]>([
        ['website', { websiteCode: 'z', storeCode: 'b', storeViewCode: 'c' }],
        ['store', { websiteCode: 'a', storeCode: 'z', storeViewCode: 'c' }],
        ['store view', { websiteCode: 'a', storeCode: 'b', storeViewCode: 'z' }],
    ])('does not match when the %s code differs', (_label, other) => {
        expect(scopesMatch({ websiteCode: 'a', storeCode: 'b', storeViewCode: 'c' }, other)).toBe(
            false
        );
    });

    it('treats two empty scopes as matching', () => {
        // Both unset is agreement, not a divergence to report.
        expect(scopesMatch({}, {})).toBe(true);
    });
});

describe('describeScope', () => {
    it('renders the three codes in order', () => {
        expect(describeScope({ websiteCode: 'w', storeCode: 's', storeViewCode: 'v' })).toBe(
            'w / s / v'
        );
    });

    it('marks absent codes rather than printing undefined', () => {
        expect(describeScope({ websiteCode: 'w' })).toBe('w / — / —');
    });
});
