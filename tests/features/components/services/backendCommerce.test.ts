/**
 * backendCommerce — the registry's per-backend Commerce contract.
 *
 * Pins read the REAL bundled components.json: these values are what the App
 * Management installer derives its association from, and a drift here is the
 * silent-rename failure the accessor exists to prevent.
 */

import { getBackendCommerceContract } from '@/features/components/services/backendCommerce';

describe('getBackendCommerceContract', () => {
    it('PaaS declares the instance-URL key and the paas flavor', () => {
        expect(getBackendCommerceContract('adobe-commerce-paas')).toEqual({
            flavor: 'paas',
            baseUrlKey: 'ADOBE_COMMERCE_URL',
        });
    });

    it('ACCS declares the GraphQL-endpoint key with its suffix and the saas flavor', () => {
        expect(getBackendCommerceContract('adobe-commerce-accs')).toEqual({
            flavor: 'saas',
            baseUrlKey: 'ACCS_GRAPHQL_ENDPOINT',
            baseUrlStripSuffix: '/graphql',
        });
    });

    it('an unknown or absent backend id has no contract', () => {
        expect(getBackendCommerceContract('not-a-backend')).toBeUndefined();
        expect(getBackendCommerceContract(undefined)).toBeUndefined();
    });
});
