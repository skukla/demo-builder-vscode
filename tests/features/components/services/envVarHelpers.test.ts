/**
 * Tests for envVarHelpers
 *
 * Tests the deriveGraphqlEndpoint function that auto-derives GraphQL endpoint from Commerce URL,
 * and deriveAccsAdminUrl that auto-derives the SaaS Admin Panel URL from the ACCS GraphQL endpoint.
 */

import {
    deriveGraphqlEndpoint,
    deriveAccsAdminUrl,
    deriveAccsTenantId,
    lookupComponentConfigValue,
    readAccsOAuthPair,
    readPaasAdminPair,
} from '@/features/components/services/envVarHelpers';

describe('envVarHelpers', () => {
    /**
     * The ONE place that reads a Commerce credential out of componentConfigs.
     *
     * Three callers did this two-line both-or-nothing read themselves — the data
     * installer, the EDS store-structure reader, and the wizard's auto-detect hook.
     * Three copies of "how do I get this credential" is what makes moving it
     * expensive, and moving it is planned
     * (`.rptc/complete/component-secret-routing/`). Collapsed here so that when the
     * value moves, one function changes.
     *
     * Deliberately PURE — no vscode, no async. `useAutoStoreDetect` runs in the
     * WEBVIEW, which cannot reach SecretStorage or the extension host, so anything
     * it must share has to be callable from both sides.
     */
    describe('reading a credential pair', () => {
        const PAAS = {
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
            },
        };

        it('reads the PaaS admin pair', () => {
            expect(readPaasAdminPair(PAAS)).toEqual({
                username: 'admin',
                password: 'fake-test-pw-not-a-secret',
            });
        });

        // Half a credential is a failure, not a partial success: it would start a
        // request that cannot authenticate, and report the wrong cause.
        it('returns nothing for half a PaaS pair', () => {
            expect(
                readPaasAdminPair({ x: { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' } }),
            ).toBeUndefined();
            expect(
                readPaasAdminPair({ x: { ADOBE_COMMERCE_ADMIN_PASSWORD: 'p' } }),
            ).toBeUndefined();
        });

        // The value can be saved against any component, not just the backend one —
        // the behaviour lookupComponentConfigValue already has, pinned here because
        // three callers now depend on it.
        it('finds the pair in ANY component', () => {
            expect(
                readPaasAdminPair({
                    'some-other-component': {
                        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                        ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    },
                }),
            ).toEqual({ username: 'admin', password: 'fake-test-pw-not-a-secret' });
        });

        it('reads the ACCS OAuth pair', () => {
            expect(
                readAccsOAuthPair({
                    'adobe-commerce-accs': {
                        ACCS_OAUTH_CLIENT_ID: 'id',
                        ACCS_OAUTH_CLIENT_SECRET: 'fake-test-secret-not-a-secret',
                    },
                }),
            ).toEqual({ clientId: 'id', clientSecret: 'fake-test-secret-not-a-secret' });
        });

        it('returns nothing for half an ACCS pair', () => {
            expect(readAccsOAuthPair({ x: { ACCS_OAUTH_CLIENT_ID: 'id' } })).toBeUndefined();
        });

        it('returns nothing for no configs at all', () => {
            expect(readPaasAdminPair(undefined)).toBeUndefined();
            expect(readAccsOAuthPair(undefined)).toBeUndefined();
        });
    });

    /**
     * The scan underneath every pair read. Its two guards decide which component
     * answers, and both of them only show up once more than one component is in
     * the map — which is the normal case for a project.
     */
    describe('lookupComponentConfigValue', () => {
        // A component that carries the key but leaves it blank has not answered.
        // Taking its empty string would stop the scan and hand a caller '' as
        // though it were a credential, and the pair reads above would then treat
        // the pair as half-present rather than absent.
        it('keeps scanning past a component whose value is empty or absent', () => {
            expect(
                lookupComponentConfigValue(
                    {
                        'mesh': {},
                        'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_USERNAME: '' },
                        'eds-storefront': { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' },
                    },
                    'ADOBE_COMMERCE_ADMIN_USERNAME',
                ),
            ).toBe('admin');
        });

        it('returns undefined when every component leaves the key empty', () => {
            expect(
                lookupComponentConfigValue(
                    { a: { K: '' }, b: { K: undefined } },
                    'K',
                ),
            ).toBeUndefined();
        });

        // A componentInstances map can carry an id with no config object at all.
        // Reading through it is the difference between "no value" and a
        // TypeError thrown out of a pure helper the WEBVIEW also calls.
        it('steps over a component with no config object rather than throwing', () => {
            const configs = {
                'no-config-yet': undefined,
                'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' },
            } as unknown as Parameters<typeof lookupComponentConfigValue>[0];

            expect(
                lookupComponentConfigValue(configs, 'ADOBE_COMMERCE_ADMIN_USERNAME'),
            ).toBe('admin');
        });
    });

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

    /**
     * The tenant id on its own, for callers that need the IDENTITY rather than a URL.
     *
     * The Data Installer's `commerce_instance` is this value: the spike measured its
     * live values as 21–22 character base62 nanoids with `site_type: "accs"`, and
     * found no REST base URL in 35 installation records, so the service expands the
     * id to a base URL server-side from its own configuration.
     *
     * Extracted from the same `ACCS_ENDPOINT_PATTERN` that builds the admin URL
     * rather than re-parsing the endpoint a second way — two regexes over one string
     * format is how they drift apart.
     */
    describe('deriveAccsTenantId', () => {
        it('extracts the tenant id from a sandbox ACCS GraphQL endpoint', () => {
            expect(
                deriveAccsTenantId(
                    'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql'
                )
            ).toBe('UoGYsHrcxMyeoVd2zUktZi');
        });

        it('extracts from a production-style region host', () => {
            expect(deriveAccsTenantId('https://na1.api.commerce.adobe.com/AbCdEf123/graphql')).toBe(
                'AbCdEf123'
            );
        });

        it('extracts from a tenant REST endpoint with no /graphql suffix', () => {
            expect(
                deriveAccsTenantId('https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi')
            ).toBe('UoGYsHrcxMyeoVd2zUktZi');
        });

        it('tolerates a trailing slash', () => {
            expect(
                deriveAccsTenantId(
                    'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql/'
                )
            ).toBe('UoGYsHrcxMyeoVd2zUktZi');
        });

        it('returns undefined for a non-ACCS host', () => {
            expect(deriveAccsTenantId('https://my-store.adobedemo.com/graphql')).toBeUndefined();
        });

        // The same guard deriveAccsAdminUrl has: a lookalike domain must not yield
        // an id that would then be sent somewhere as a write target.
        it('returns undefined for a lookalike host that merely contains the domain', () => {
            expect(
                deriveAccsTenantId('https://evil.example.com/api.commerce.adobe.com/tenant/graphql')
            ).toBeUndefined();
        });

        // A first segment of "graphql" means there is no tenant id in the URL at
        // all; returning 'graphql' would prefill a write target with a path word.
        it('returns undefined when the endpoint carries no tenant segment', () => {
            expect(
                deriveAccsTenantId('https://na1-sandbox.api.commerce.adobe.com/graphql')
            ).toBeUndefined();
        });

        // The host match is ANCHORED. An ACCS endpoint that merely APPEARS inside
        // another URL — pasted out of a redirect or a docs link — is not this
        // tenant's endpoint, and the id lifted out of it would be sent somewhere
        // as a write target.
        it('returns undefined when the ACCS endpoint is embedded in another URL', () => {
            expect(
                deriveAccsTenantId(
                    'https://sso.example.com/login?next=https://na1.api.commerce.adobe.com/AbCdEf123/graphql'
                )
            ).toBeUndefined();
            expect(
                deriveAccsAdminUrl(
                    'https://sso.example.com/login?next=https://na1.api.commerce.adobe.com/AbCdEf123/graphql'
                )
            ).toBeUndefined();
        });

        it('returns undefined for nothing', () => {
            expect(deriveAccsTenantId(undefined)).toBeUndefined();
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
