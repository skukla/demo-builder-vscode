/**
 * Tests for envVarHelpers
 *
 * Tests the deriveGraphqlEndpoint function that auto-derives GraphQL endpoint from Commerce URL,
 * and deriveAccsAdminUrl that auto-derives the SaaS Admin Panel URL from the ACCS GraphQL endpoint.
 */

import {
    deriveGraphqlEndpoint,
    deriveAccsAdminUrl,
} from '@/features/components/services/envVarHelpers';

describe('envVarHelpers', () => {
    describe('deriveGraphqlEndpoint', () => {
        it('should derive GraphQL endpoint from Commerce URL', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com')).toBe(
                'https://my-store.adobedemo.com/graphql'
            );
        });

        it('should remove trailing slash before appending /graphql', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com/')).toBe(
                'https://my-store.adobedemo.com/graphql'
            );
        });

        it('should remove multiple trailing slashes', () => {
            expect(deriveGraphqlEndpoint('https://my-store.adobedemo.com///')).toBe(
                'https://my-store.adobedemo.com/graphql'
            );
        });

        it('should return empty string for empty input', () => {
            expect(deriveGraphqlEndpoint('')).toBe('');
        });

        it('should handle URLs with paths', () => {
            expect(deriveGraphqlEndpoint('https://example.com/commerce')).toBe(
                'https://example.com/commerce/graphql'
            );
        });

        it('should handle URLs with ports', () => {
            expect(deriveGraphqlEndpoint('https://localhost:8080')).toBe(
                'https://localhost:8080/graphql'
            );
        });

        it('should handle HTTP URLs', () => {
            expect(deriveGraphqlEndpoint('http://local-store.test')).toBe(
                'http://local-store.test/graphql'
            );
        });
    });

    describe('deriveAccsAdminUrl', () => {
        it('should derive the admin URL from a sandbox ACCS GraphQL endpoint', () => {
            expect(
                deriveAccsAdminUrl(
                    'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql'
                )
            ).toBe('https://na1-sandbox.admin.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/admin/admin/dashboard/');
        });

        it('should derive the admin URL from a production-style region host', () => {
            expect(deriveAccsAdminUrl('https://na1.api.commerce.adobe.com/AbCdEf123/graphql')).toBe(
                'https://na1.admin.commerce.adobe.com/AbCdEf123/admin/admin/dashboard/'
            );
        });

        it('should derive from a tenant REST endpoint without the /graphql suffix', () => {
            expect(
                deriveAccsAdminUrl(
                    'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi'
                )
            ).toBe('https://na1-sandbox.admin.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/admin/admin/dashboard/');
        });

        it('should tolerate a trailing slash', () => {
            expect(
                deriveAccsAdminUrl(
                    'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql/'
                )
            ).toBe('https://na1-sandbox.admin.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/admin/admin/dashboard/');
        });

        it('should return undefined for a non-ACCS host', () => {
            expect(deriveAccsAdminUrl('https://my-store.adobedemo.com/graphql')).toBeUndefined();
        });

        it('should return undefined for a lookalike host that only ends with the domain', () => {
            expect(
                deriveAccsAdminUrl('https://evil.example.com/api.commerce.adobe.com/tenant/graphql')
            ).toBeUndefined();
        });

        it('should return undefined for an http endpoint', () => {
            expect(
                deriveAccsAdminUrl('http://na1-sandbox.api.commerce.adobe.com/tenant/graphql')
            ).toBeUndefined();
        });

        it('should return undefined when the tenant segment is missing', () => {
            expect(
                deriveAccsAdminUrl('https://na1-sandbox.api.commerce.adobe.com/')
            ).toBeUndefined();
        });

        it('should return undefined for empty input', () => {
            expect(deriveAccsAdminUrl('')).toBeUndefined();
            expect(deriveAccsAdminUrl(undefined)).toBeUndefined();
        });
    });
});
