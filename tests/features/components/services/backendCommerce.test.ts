/**
 * backendCommerce — the registry's per-backend Commerce contract.
 *
 * Pins read the REAL bundled components.json: these values are what the App
 * Management installer derives its association from, and a drift here is the
 * silent-rename failure the accessor exists to prevent.
 */

import {
    getBackendCommerceContract,
    type BackendCommerceContract,
} from '@/features/components/services/backendCommerce';

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

/**
 * The shipped registry declares two backends and both carry a full contract, so the
 * accessor's defensive chain — a row with no `configuration`, a registry with no
 * `backends` — cannot be reached through it. Synthetic registries reach it, using the
 * `jest.isolateModules` + `doMock` form the sibling `meshCatalogDerivation` suite uses
 * for the same static-JSON import.
 */
describe('getBackendCommerceContract — against synthetic registries', () => {
    /** Read the contract out of `registry` instead of the shipped components.json. */
    function contractFrom(
        registry: unknown,
        backendId: string | undefined,
    ): BackendCommerceContract | undefined {
        let contract: BackendCommerceContract | undefined;
        jest.isolateModules(() => {
            jest.doMock('@/features/components/config/components.json', () => registry);
            contract = (
                require('@/features/components/services/backendCommerce') as {
                    getBackendCommerceContract: typeof getBackendCommerceContract;
                }
            ).getBackendCommerceContract(backendId);
        });
        return contract;
    }

    afterEach(() => {
        jest.dontMock('@/features/components/config/components.json');
    });

    it('a declared backend that carries no configuration answers undefined, not a throw', () => {
        expect(contractFrom({ backends: { 'bare-backend': {} } }, 'bare-backend')).toBeUndefined();
    });

    it('a registry with no backends section answers undefined, not a throw', () => {
        expect(contractFrom({}, 'adobe-commerce-paas')).toBeUndefined();
    });

    it('the synthetic path reads the registry it was handed (the control)', () => {
        const commerce = { flavor: 'saas' as const, baseUrlKey: 'SYNTHETIC_URL' };
        expect(contractFrom({ backends: { synthetic: { configuration: { commerce } } } }, 'synthetic')).toEqual(
            commerce,
        );
    });
});
