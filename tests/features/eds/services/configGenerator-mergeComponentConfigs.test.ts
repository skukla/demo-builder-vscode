/**
 * Tests for mergeComponentConfigs utility.
 *
 * Verifies that component env vars are merged correctly with mesh values
 * taking priority over non-mesh values — EXCEPT the Commerce store scope,
 * which the backend component owns (mesh configs carry a stale duplicate).
 */

jest.mock('@/core/constants', () => ({
    isMeshComponentId: (id: string) => id.includes('mesh'),
}));

import { mergeComponentConfigs } from '@/features/eds/services/configGenerator';

describe('mergeComponentConfigs', () => {
    it('should return empty object for undefined componentConfigs', () => {
        expect(mergeComponentConfigs(undefined)).toEqual({});
    });

    it('should return empty object for empty componentConfigs', () => {
        expect(mergeComponentConfigs({})).toEqual({});
    });

    it('should merge all component env vars into flat object', () => {
        const result = mergeComponentConfigs({
            'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://backend.example.com' },
        });
        expect(result).toEqual({
            AEM_ASSETS_ENABLED: 'true',
            ACCS_GRAPHQL_ENDPOINT: 'https://backend.example.com',
        });
    });

    it('should let mesh values override non-mesh values', () => {
        const result = mergeComponentConfigs({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://direct.example.com' },
            'eds-accs-mesh': { ACCS_GRAPHQL_ENDPOINT: 'https://mesh.example.com' },
        });
        expect(result.ACCS_GRAPHQL_ENDPOINT).toBe('https://mesh.example.com');
    });

    it('should use non-mesh value when no mesh component exists', () => {
        const result = mergeComponentConfigs({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://direct.example.com' },
            'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
        });
        expect(result.ACCS_GRAPHQL_ENDPOINT).toBe('https://direct.example.com');
    });

    it('should set MESH_ENDPOINT when meshEndpoint provided', () => {
        const result = mergeComponentConfigs(
            { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } },
            'https://mesh-endpoint.example.com'
        );
        expect(result.MESH_ENDPOINT).toBe('https://mesh-endpoint.example.com');
    });

    it('should not set MESH_ENDPOINT when meshEndpoint not provided', () => {
        const result = mergeComponentConfigs({
            'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
        });
        expect(result.MESH_ENDPOINT).toBeUndefined();
    });

    it('should handle mesh values winning even with multiple non-mesh sources', () => {
        // Uses the ENDPOINT key. This case previously used ACCS_STORE_CODE, which
        // was incidental — the assertion is about precedence with several
        // non-mesh sources, and every other precedence case here uses the
        // endpoint. The store scope turned out to be a key the mesh must NOT own
        // (see the store-scope describe below): mesh configs carry a stale copy,
        // and letting it win published the wrong Commerce website.
        const result = mergeComponentConfigs({
            'eds-storefront': { ACCS_GRAPHQL_ENDPOINT: 'from-frontend' },
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'from-backend' },
            'eds-accs-mesh': { ACCS_GRAPHQL_ENDPOINT: 'from-mesh' },
        });
        expect(result.ACCS_GRAPHQL_ENDPOINT).toBe('from-mesh');
    });

    /**
     * The store scope is the backend's, not the mesh's.
     *
     * Mesh component configs carry a duplicate copy of website/store/store-view,
     * and only the backend's copy is updated when the user changes them. Live
     * 2026-08-10: a project moved to the `citisignal` website kept publishing
     * `base`, so the storefront queried a website with no products — every PDP
     * returned a valid 200 with an empty product block, and republish reported
     * success because it published exactly what the merge produced.
     */
    describe('store scope is owned by the backend', () => {
        const BACKEND = {
            ACCS_WEBSITE_CODE: 'citisignal',
            ACCS_STORE_CODE: 'citisignal_store',
            ACCS_STORE_VIEW_CODE: 'citisignal_us',
        };
        const STALE_MESH = {
            ACCS_WEBSITE_CODE: 'base',
            ACCS_STORE_CODE: 'main_website_store',
            ACCS_STORE_VIEW_CODE: 'default',
        };

        it('keeps the backend scope over a stale mesh copy', () => {
            const result = mergeComponentConfigs({
                'eds-accs-mesh': STALE_MESH,
                'adobe-commerce-accs': BACKEND,
            });

            expect(result.ACCS_WEBSITE_CODE).toBe('citisignal');
            expect(result.ACCS_STORE_CODE).toBe('citisignal_store');
            expect(result.ACCS_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('keeps the backend scope regardless of key order', () => {
            // The original bug was order-dependent via spread; the fix must not be.
            const result = mergeComponentConfigs({
                'adobe-commerce-accs': BACKEND,
                'eds-accs-mesh': STALE_MESH,
            });

            expect(result.ACCS_WEBSITE_CODE).toBe('citisignal');
        });

        it('falls back to the mesh copy when the backend defines no scope', () => {
            // Only override when the backend actually has the key.
            const result = mergeComponentConfigs({ 'eds-accs-mesh': STALE_MESH });

            expect(result.ACCS_WEBSITE_CODE).toBe('base');
        });
    });
});

/**
 * The BACKEND owns the store scope — not "whichever non-mesh component sorted
 * last".
 *
 * The first fix split components into mesh / non-mesh and let the non-mesh side
 * win the scope keys. That was right about the mesh and wrong about everything
 * else: `headless` is a FRONTEND and declares all three `ADOBE_COMMERCE_*` scope
 * keys (components.json), so on a headless project the scope was decided by
 * whichever of frontend/backend iterated last — the same order-dependence, just
 * moved. `extractConfigParamsFromConfigs` has known the backend id all along and
 * simply was not passing it down.
 */
describe('mergeComponentConfigs — the backend owns the scope, not the last non-mesh component', () => {
    const PAAS_BACKEND = {
        ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
    };
    const STALE_FRONTEND = {
        ADOBE_COMMERCE_WEBSITE_CODE: 'base',
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
    };

    it("takes the backend's scope over a stale FRONTEND copy", () => {
        const result = mergeComponentConfigs(
            { 'adobe-commerce-paas': PAAS_BACKEND, headless: STALE_FRONTEND },
            undefined,
            'adobe-commerce-paas',
        );

        expect(result.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
        expect(result.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
    });

    it('reaches the same answer with the components in the opposite order', () => {
        const result = mergeComponentConfigs(
            { headless: STALE_FRONTEND, 'adobe-commerce-paas': PAAS_BACKEND },
            undefined,
            'adobe-commerce-paas',
        );

        expect(result.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
    });

    it('keeps the old non-mesh behaviour when no backend id is supplied', () => {
        // The control. Callers that cannot name the backend must be unaffected,
        // which is what lets the existing suite above stand unedited.
        const result = mergeComponentConfigs({
            'eds-accs-mesh': { ACCS_WEBSITE_CODE: 'base' },
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'citisignal' },
        });

        expect(result.ACCS_WEBSITE_CODE).toBe('citisignal');
    });
});
