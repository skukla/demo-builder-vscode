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
} from '@/features/eds/services/storefront/servedStorefrontConfig';

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() };

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

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never);

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
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never)
        ).toBeUndefined();
    });

    it('returns undefined when the body has no public.default block', async () => {
        respond({ nothing: true });

        expect(
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never)
        ).toBeUndefined();
    });

    it('survives a config with no headers block, reporting an empty scope', async () => {
        // A storefront can be published with no commerce headers at all; that is
        // an empty scope, not a parse failure.
        respond({ public: { default: { 'commerce-endpoint': 'https://e.example.com' } } });

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never);

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

        const result = await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never);

        expect(result?.scope.websiteCode).toBeUndefined();
    });

    it('returns undefined when the request throws', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

        expect(
            await fetchServedStorefrontConfig('acme', 'shop', mockLogger as never)
        ).toBeUndefined();
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

    it('does not match when any one code differs', () => {
        expect(scopesMatch({ websiteCode: 'a' }, { websiteCode: 'b' })).toBe(false);
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
