/**
 * Tests for mergeComponentConfigs utility.
 *
 * Verifies that component env vars are merged correctly with
 * mesh values taking priority over non-mesh values.
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
            'https://mesh-endpoint.example.com',
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
        const result = mergeComponentConfigs({
            'eds-storefront': { ACCS_STORE_CODE: 'from-frontend' },
            'adobe-commerce-accs': { ACCS_STORE_CODE: 'from-backend' },
            'eds-accs-mesh': { ACCS_STORE_CODE: 'from-mesh' },
        });
        expect(result.ACCS_STORE_CODE).toBe('from-mesh');
    });
});
