/**
 * `pickSampleSku` — which store scope the sample comes from.
 *
 * The diagnostics probe asks the LIVE storefront whether a PDP renders, so the
 * sample product must come from the scope that storefront is querying: its
 * served `config.json`, not the project manifest. Split from
 * catalogPrewarmService.test.ts to keep both suites under the 500-line limit.
 */

import { pickSampleSku } from '@/features/eds/services/catalogPrewarmService';
import type { Project } from '@/types/base';
import {
    catalogPage,
    makeAccsProject,
    mockLogger,
} from './catalogPrewarmService.testUtils';

describe('pickSampleSku', () => {
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
                    'eds-storefront': { metadata: { githubRepo: 'acme/shop' } },
                },
            } as unknown as Partial<Project>);
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

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger as never);

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

            const sample = await pickSampleSku(makeEdsProject('stale'), mockLogger as never);

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

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger as never);

            expect(sample?.scopeDivergence?.unexpected).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('a publish did not take')
            );
        });

        it('falls back to the manifest when the served config cannot be read', async () => {
            // A CDN hiccup must not leave diagnostics with no answer at all.
            routeFetch(undefined);

            const sample = await pickSampleSku(makeEdsProject('published'), mockLogger as never);

            expect(sample?.scopeSource).toBe('manifest');
            expect(sample?.scopeDivergence).toBeUndefined();
            expect(sample?.sku).toBe('S1');
        });
    });
});
