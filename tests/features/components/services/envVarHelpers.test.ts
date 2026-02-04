/**
 * Tests for envVarHelpers
 *
 * Tests the deriveGraphqlEndpoint function that auto-derives GraphQL endpoint from Commerce URL.
 */

import { deriveGraphqlEndpoint } from '@/features/components/services/envVarHelpers';

describe('envVarHelpers', () => {
    describe('deriveGraphqlEndpoint', () => {
        it('should derive GraphQL endpoint from Commerce URL', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com'))
                .toBe('https://my-store.adobedemo.com/graphql');
        });

        it('should remove trailing slash before appending /graphql', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com/'))
                .toBe('https://my-store.adobedemo.com/graphql');
        });

        it('should remove multiple trailing slashes', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com///'))
                .toBe('https://my-store.adobedemo.com/graphql');
        });

        it('should return empty string for empty input', () => {
            expect(deriveGraphqlEndpoint('')).toBe('');
        });

        it('should handle URLs with paths', () => {
            expect(deriveGraphqlEndpoint('https://example.com/commerce'))
                .toBe('https://example.com/commerce/graphql');
        });

        it('should handle URLs with ports', () => {
            expect(deriveGraphqlEndpoint('https://localhost:8080'))
                .toBe('https://localhost:8080/graphql');
        });

        it('should handle HTTP URLs', () => {
            expect(deriveGraphqlEndpoint('http://local-store.test'))
                .toBe('http://local-store.test/graphql');
        });
    });
});
