/**
 * The install target: the website and store view a datapack is written into, read from the
 * project's backend config. One rule, read by the build's install (`sampleDataInstall.ts`) and by
 * the wizard's Continue gate (`datapackGate.ts`), so the two cannot disagree about whether a
 * creation install will run (step-07 W1).
 */

import { resolveInstallTarget } from '@/features/data-installer/installTarget';

const ACCS = 'adobe-commerce-accs';
const PAAS = 'adobe-commerce-paas';

function project(over: Record<string, unknown> = {}) {
    return {
        name: 'demo-1',
        datapack: { name: 'bodea', version: 'main' },
        componentSelections: { backend: ACCS },
        componentConfigs: {
            [ACCS]: {
                ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_STORE_VIEW_CODE: 'default',
            },
        },
        ...over,
    };
}

describe('resolveInstallTarget', () => {
    it('reads the ACCS scope the Business Structure sub-step recorded', () => {
        expect(resolveInstallTarget(project())).toMatchObject({
            websiteCode: 'base',
            storeCode: 'default',
        });
    });

    /** The two backends spell the same two facts differently. */
    it('reads the PaaS keys for a PaaS project', () => {
        const paas = project({
            componentSelections: { backend: PAAS },
            componentConfigs: {
                [PAAS]: {
                    ADOBE_COMMERCE_URL: 'https://shop.example.com',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'main_website',
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'en',
                },
            },
        });

        expect(resolveInstallTarget(paas)).toMatchObject({
            websiteCode: 'main_website',
            storeCode: 'en',
        });
    });

    /**
     * Both codes or neither. The service validates them as a PAIR and defaults
     * to `base` when they are absent, so half a target is worse than none — it
     * would write into a scope nobody chose.
     */
    it('reports no target when only one of the pair was recorded', () => {
        const half = project({
            componentConfigs: {
                [ACCS]: { ACCS_WEBSITE_CODE: 'base' },
            },
        });

        expect(resolveInstallTarget(half)).toBeNull();
    });

    it('reports no target for a project with no Commerce backend', () => {
        expect(resolveInstallTarget(project({ componentSelections: {} }))).toBeNull();
    });

    /**
     * Three shapes a real manifest can be in before the wizard has written
     * anything. Each must answer "no target", not throw — this runs inside a
     * build phase that is not allowed to fail.
     */
    it('reports no target for a project with no selections recorded at all', () => {
        expect(resolveInstallTarget({})).toBeNull();
    });

    it('reports no target for a backend this module has no scope keys for', () => {
        // Only the two Commerce backends spell website/store codes. Anything
        // else has no pair to read, and reading one would throw.
        expect(
            resolveInstallTarget(project({ componentSelections: { backend: 'some-other-backend' } })),
        ).toBeNull();
    });

    it('reports no target for a Commerce backend with no config written yet', () => {
        expect(resolveInstallTarget(project({ componentConfigs: undefined }))).toBeNull();
    });
});
