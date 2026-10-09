/**
 * `pickSampleSku` — the diagnostics sample: what it returns, the guards before it
 * asks, and which store scope the sample comes from.
 *
 * The diagnostics probe asks the LIVE storefront whether a PDP renders, so the
 * sample product must come from the scope that storefront is querying: its
 * served `config.json`, not the project manifest.
 */

import { pickSampleSku } from '@/features/eds/services/catalogSampleSku';
import type { Project } from '@/types/base';
import {
    ACCS_ENDPOINT,
    catalogPage,
    makeAccsProject,
    mockLogger,
} from './catalogPrewarmService.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

describe('pickSampleSku — what it returns', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('returns the first product with its canonical PDP path', async () => {
        // The path must be byte-identical to what the storefront's getProductLink
        // produces, which is why it is built with pdpPathFor rather than by hand.
        (global.fetch as jest.Mock).mockResolvedValue(
            catalogPage([{ sku: 'VA19-SI-NA', urlKey: 'Cronus Yoga Pant' }])
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample).toEqual({
            sku: 'VA19-SI-NA',
            urlKey: 'Cronus Yoga Pant',
            path: '/products/cronus-yoga-pant/va19-si-na',
            // No EDS repo on this fixture, so there is no served config to read.
            scopeSource: 'manifest',
            scopeDivergence: undefined,
        });
    });

    it('cleans a SKU that needs it, matching the URL the storefront will emit', async () => {
        // Spaces, slashes and underscores are the SKUs Helix rewrites on publish.
        (global.fetch as jest.Mock).mockResolvedValue(
            catalogPage([{ sku: 'AB 12/CD_e', urlKey: 'Widget' }])
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample?.path).toBe('/products/widget/ab-12-cd-e');
    });

    it('issues no POST to prepublish-pdp — this probe must not publish', async () => {
        // The control on read-only-ness. The GraphQL enumeration IS a POST, so
        // assert on the destination rather than the verb.
        (global.fetch as jest.Mock).mockResolvedValue(catalogPage([{ sku: 'S1', urlKey: 'u1' }]));

        await pickSampleSku(makeAccsProject(), mockLogger);

        for (const [url] of (global.fetch as jest.Mock).mock.calls) {
            expect(String(url)).not.toContain('prepublish-pdp');
        }
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns undefined for a non-ACCS backend', async () => {
        const paas = makeAccsProject({
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        expect(await pickSampleSku(paas, mockLogger)).toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns undefined when the catalog is empty', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(catalogPage([]));

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });

    it('returns undefined when Catalog Service is down', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });

    it('returns undefined on GraphQL errors rather than throwing', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ errors: [{ message: 'boom' }] }),
        });

        expect(await pickSampleSku(makeAccsProject(), mockLogger)).toBeUndefined();
    });
});

describe('pickSampleSku — the guards before it asks', () => {
    /** An ACCS project with a storefront repo, so a served-config read is reachable. */
    function withStorefront(componentConfigs: Record<string, Record<string, string>>) {
        return makeAccsProject({
            componentConfigs,
            selectedStack: 'eds-accs',
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    status: 'ready',
                    metadata: { githubRepo: 'acme/shop' },
                },
            },
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('asks nothing for a non-ACCS backend, even one with an endpoint', async () => {
        // Enumeration is ACCS-only. A PaaS project can still carry a GraphQL
        // endpoint, so the backend check has to be what stops the request.
        const paas = createMockProject({
            ...withStorefront({
                'adobe-commerce-paas': { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: ACCS_ENDPOINT },
            }),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        await expect(pickSampleSku(paas, mockLogger)).resolves.toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('asks nothing when no Commerce endpoint is configured', async () => {
        const noEndpoint = withStorefront({
            'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'default' },
        });

        await expect(pickSampleSku(noEndpoint, mockLogger)).resolves.toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('pickSampleSku — which scope it samples', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });


    /**
     * The probe asks the LIVE storefront whether a PDP renders, so the sample has
     * to come from the scope that storefront is querying — which lives in its
     * served config.json, not the project manifest. Sampling from the manifest is
     * what turns a scope mismatch into a "broken storefront" verdict on a
     * storefront serving its own scope correctly.
     */
    describe('scope source', () => {
        /** An EDS project with a repo, so the served config.json is reachable. */
        function makeEdsProject(status?: Project['edsStorefrontStatusSummary']): Project {
            return makeAccsProject({
                selectedStack: 'eds-accs',
                edsStorefrontStatusSummary: status,
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready',
                        metadata: { githubRepo: 'acme/shop' },
                    },
                },
            });
        }

        /** Route by URL: the CDN config vs the Catalog Service GraphQL POST. */
        function routeFetch(servedScope: Record<string, string> | undefined) {
            (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
                if (String(url).endsWith('/config.json')) {
                    if (!servedScope) return { ok: false, status: 404 };
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            public: {
                                default: {
                                    'commerce-endpoint': 'https://mesh.example.com/graphql',
                                    headers: { cs: servedScope },
                                },
                            },
                        }),
                    };
                }
                return catalogPage([{ sku: 'S1', urlKey: 'u1' }]);
            });
        }

        it('samples from the SERVED scope and reports no divergence when it matches', async () => {
            routeFetch({
                'Magento-Website-Code': 'base',
                'Magento-Store-Code': 'main_website_store',
                'Magento-Store-View-Code': 'default',
            });

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger);

            expect(sample?.scopeSource).toBe('served');
            expect(sample?.scopeDivergence).toBeUndefined();
        });

        it('treats a mismatch as EXPECTED while a republish is pending', async () => {
            // Configure save marks the project stale; the served config legitimately
            // lags until Republish. Flagging this as wrong would cry wolf on the
            // normal path — including when the user deliberately chose "Later".
            routeFetch({
                'Magento-Website-Code': 'citisignal',
                'Magento-Store-Code': 'citisignal_store',
                'Magento-Store-View-Code': 'citisignal_us',
            });

            const sample = await pickSampleSku(makeEdsProject('stale'), mockLogger);

            expect(sample?.scopeSource).toBe('served');
            expect(sample?.scopeDivergence?.unexpected).toBe(false);
            expect(sample?.scopeDivergence?.served.websiteCode).toBe('citisignal');
            expect(sample?.scopeDivergence?.manifest.websiteCode).toBe('base');
        });

        it('flags a mismatch as UNEXPECTED when the project reads published', async () => {
            // The one case edsStorefrontStatusSummary structurally cannot detect:
            // it compares bookkeeping to intent and never reads the CDN, so a
            // publish that did not take still reads 'published'.
            routeFetch({
                'Magento-Website-Code': 'citisignal',
                'Magento-Store-Code': 'citisignal_store',
                'Magento-Store-View-Code': 'citisignal_us',
            });

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger);

            expect(sample?.scopeDivergence?.unexpected).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('a publish did not take')
            );
        });

        it('does not go looking for a served config it has no repo for', async () => {
            // The served config lives at a GitHub owner/repo pair. A recorded
            // value that is not one cannot address it, so the read must not be
            // attempted at all rather than sent with an undefined half.
            const noRepo = makeAccsProject({
                selectedStack: 'eds-accs',
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready',
                        metadata: { githubRepo: 'owner-only' },
                    },
                },
            });
            (global.fetch as jest.Mock).mockResolvedValue(catalogPage([{ sku: 'S1', urlKey: 'u1' }]));

            const sample = await pickSampleSku(noRepo, mockLogger);

            expect(sample?.scopeSource).toBe('manifest');
            const asked = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
            expect(asked.some((u) => u.endsWith('/config.json'))).toBe(false);
        });

        it('falls back to the manifest when the served config cannot be read', async () => {
            // A CDN hiccup must not leave diagnostics with no answer at all.
            routeFetch(undefined);

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger);

            expect(sample?.scopeSource).toBe('manifest');
            expect(sample?.scopeDivergence).toBeUndefined();
            expect(sample?.sku).toBe('S1');
        });
    });
});
