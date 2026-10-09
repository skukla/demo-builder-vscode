/**
 * Config Generator Tests
 *
 * Tests for environment-aware config.json generation for EDS storefronts.
 * Verifies correct header generation for PaaS, ACCS, and ACO backends.
 */

import {
    generateConfigJson,
    generateHeaders,
    generateProjectConfigJson,
    type ConfigGeneratorParams,
    type EnvironmentType,
} from '@/features/eds/services/configGenerator';
import {
    extractConfigParamsFromConfigs,
    extractConfigParams,
    buildConfigGeneratorParams,
} from '@/features/eds/services/storefrontConfigParams';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

/**
 * The generator's own headers shape, taken from the function rather than
 * re-declared: an expected object written here is checked by tsc against what
 * `generateHeaders` actually returns.
 */
type ConfigHeaders = ReturnType<typeof generateHeaders>;

describe('configGenerator', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger() as unknown as Logger;
    });

    describe('generateHeaders', () => {
        const coordinates = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
        };
        const storeScope = {
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            customerGroup: 'b2c',
        };
        const credentials = {
            commerceApiKey: 'api-key-123',
            commerceEnvironmentId: 'env-id-456',
        };

        /**
         * The PaaS answer, named because two rows must produce the SAME object:
         * an explicit `environmentType: 'paas'` and an absent one.
         */
        const PAAS_HEADERS: ConfigHeaders = {
            all: { Store: 'en_us' },
            cs: {
                'Magento-Customer-Group': 'b2c',
                'Magento-Store-Code': 'us_store',
                'Magento-Store-View-Code': 'en_us',
                'Magento-Website-Code': 'us_website',
                'x-api-key': 'api-key-123',
                'Magento-Environment-Id': 'env-id-456',
            },
        };

        // The whole headers object per row, not a few keys: an environment's
        // header set is defined as much by what it does NOT carry (ACCS has no
        // x-api-key, ACO has no store scope at all) as by what it does.
        it.each<[string, ConfigGeneratorParams, ConfigHeaders]>([
            [
                'PaaS carries the store scope plus the API key and environment id',
                { ...coordinates, ...storeScope, ...credentials, environmentType: 'paas' },
                PAAS_HEADERS,
            ],
            [
                'ACCS carries the store scope and no credentials',
                { ...coordinates, ...storeScope, ...credentials, environmentType: 'accs' },
                {
                    all: { Store: 'en_us' },
                    cs: {
                        'Magento-Customer-Group': 'b2c',
                        'Magento-Store-Code': 'us_store',
                        'Magento-Store-View-Code': 'en_us',
                        'Magento-Website-Code': 'us_website',
                    },
                },
            ],
            [
                'ACO carries the Optimizer placeholders instead of the store scope',
                { ...coordinates, ...storeScope, ...credentials, environmentType: 'aco' },
                {
                    all: { Store: 'en_us' },
                    cs: {
                        'AC-View-ID': '{{AC_VIEW_ID}}',
                        'AC-Price-Book-ID': '{{AC_PRICE_BOOK_ID}}',
                    },
                },
            ],
            [
                'an absent store scope falls back to default/default/base and blank credentials',
                { ...coordinates, environmentType: 'paas' },
                {
                    all: { Store: 'default' },
                    cs: {
                        'Magento-Customer-Group': '',
                        'Magento-Store-Code': 'default',
                        'Magento-Store-View-Code': 'default',
                        'Magento-Website-Code': 'base',
                        'x-api-key': '',
                        'Magento-Environment-Id': '',
                    },
                },
            ],
            [
                'an absent environment type answers exactly as PaaS does',
                { ...coordinates, ...storeScope, ...credentials },
                PAAS_HEADERS,
            ],
        ])('%s', (_label, params, expected) => {
            expect(generateHeaders(params)).toStrictEqual(expected);
        });
    });

    describe('generateConfigJson', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
        };

        // generateHeaders' own answers are pinned above; what these rows add is
        // that the answer REACHES config.public.default.headers, whole and
        // unaltered by the placeholder pass. The template ships `headers: {}`,
        // so an injection that never happened is indistinguishable from one
        // that happened wrongly unless the assertion is the entire object.
        //
        // `commerce-core-endpoint` and `commerce-assets-enabled` are NOT here:
        // configGenerator-environmentAndFailure.test.ts owns both, with the two
        // extra cases (absent environment type, PaaS with no catalog endpoint)
        // this block never had.
        it.each<[EnvironmentType, ConfigGeneratorParams, ConfigHeaders]>([
            [
                'paas',
                {
                    ...baseParams,
                    environmentType: 'paas',
                    commerceApiKey: 'api-key-123',
                    commerceEnvironmentId: 'env-id-456',
                },
                {
                    all: { Store: 'en_us' },
                    cs: {
                        'Magento-Customer-Group': '',
                        'Magento-Store-Code': 'us_store',
                        'Magento-Store-View-Code': 'en_us',
                        'Magento-Website-Code': 'us_website',
                        'x-api-key': 'api-key-123',
                        'Magento-Environment-Id': 'env-id-456',
                    },
                },
            ],
            [
                'accs',
                { ...baseParams, environmentType: 'accs' },
                {
                    all: { Store: 'en_us' },
                    cs: {
                        'Magento-Customer-Group': '',
                        'Magento-Store-Code': 'us_store',
                        'Magento-Store-View-Code': 'en_us',
                        'Magento-Website-Code': 'us_website',
                    },
                },
            ],
            [
                'aco',
                { ...baseParams, environmentType: 'aco' },
                {
                    all: { Store: 'en_us' },
                    cs: {
                        'AC-View-ID': '{{AC_VIEW_ID}}',
                        'AC-Price-Book-ID': '{{AC_PRICE_BOOK_ID}}',
                    },
                },
            ],
        ])('injects the whole %s header block into config.public.default', (
            _env,
            params,
            expected,
        ) => {
            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            expect(JSON.parse(result.content!).public.default.headers).toStrictEqual(expected);
        });

        it('publishes an EMPTY commerce endpoint when the project has none yet', () => {
            // A storefront generated before any mesh deploy and with no direct
            // backend URL. The `|| ''` matters because the placeholder is
            // substituted into a JSON string either way: without it the config
            // ships the literal text "undefined" as an endpoint, which parses,
            // publishes, and fails only in the browser.
            const { commerceEndpoint: _dropped, ...withoutEndpoint } = baseParams;

            const result = generateConfigJson(
                { ...withoutEndpoint, environmentType: 'paas' },
                mockLogger,
            );

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-endpoint']).toBe('');
            expect(config.public.default['commerce-core-endpoint']).toBe('');
        });
    });

    describe('extracted params rendered into config.json', () => {
        it('should generate correct ACCS headers in config.json when store codes come from mesh config', () => {
            // End-to-end: eds-accs-mesh provides store codes → config.json has correct headers
            const componentConfigs = {
                'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
                'eds-accs-mesh': {
                    ACCS_STORE_VIEW_CODE: 'citisignal_us',
                    ACCS_STORE_CODE: 'citisignal_store',
                    ACCS_WEBSITE_CODE: 'citisignal',
                    ACCS_CUSTOMER_GROUP: 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c',
                },
            };

            const params = extractConfigParamsFromConfigs(componentConfigs, 'https://mesh.example.com/graphql', 'adobe-commerce-accs');

            const result = generateConfigJson(
                { githubOwner: 'testuser', repoName: 'test-repo', daLiveOrg: 'testorg', daLiveSite: 'test-site', ...params },
                mockLogger,
            );

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            const headers = config.public.default.headers;

            // ACCS headers should use store codes from mesh config, not defaults
            expect(headers.cs['Magento-Store-View-Code']).toBe('citisignal_us');
            expect(headers.cs['Magento-Store-Code']).toBe('citisignal_store');
            expect(headers.cs['Magento-Website-Code']).toBe('citisignal');
            expect(headers.cs['Magento-Customer-Group']).toBe('b6589fc6ab0dc82cf12099d1c2d40ab994e8410c');
        });
    });

    describe('sidekick plugins', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
        };

        it('includes the quick-edit Sidekick plugin (Experience Workspace WYSIWYG entry point)', () => {
            // The Config-Service half of the Quick Edit wiring. The GitHub
            // files half is the quickEditPublisher vendoring step
            // (text in quickEditSnippet); this
            // plugin lets the EW Layout view invoke Quick Edit. Inert under
            // Universal Editor, active under Experience Workspace.
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            const plugins = config.sidekick.plugins as Array<Record<string, unknown>>;

            // The whole plugin, so "event plugin, not a palette" is asserted by
            // the shape rather than by two absent-key checks: a `url` or
            // `isPalette` appearing would fail this, and a missing one cannot
            // pass unnoticed.
            expect(plugins.find((p) => p.id === 'quick-edit')).toStrictEqual({
                id: 'quick-edit',
                title: 'Quick Edit',
                environments: ['dev', 'preview'],
                event: 'quick-edit',
            });
        });

        it('preserves the existing cif and personalisation plugins (additive regression guard)', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            const config = JSON.parse(result.content!);
            const plugins = config.sidekick.plugins as Array<Record<string, unknown>>;

            // The exact list in the template's order. `toContain` three times
            // would pass a template that had also grown a fourth plugin.
            expect(plugins.map((p) => p.id)).toStrictEqual(['cif', 'personalisation', 'quick-edit']);
        });
    });

    // ==========================================================
    // Step 04 — generalized endpoint provider (MESH EDGE GUARD)
    // ==========================================================
    //
    // These tests pin the load-bearing MESH_ENDPOINT → config.json edge. The
    // storefront config must read the commerce/mesh endpoint from "any
    // appBuilderComponent that provides it" (getProvidedEnvVars), falling back
    // to the keyed mesh entry's endpoint — the migrated shape of every legacy
    // project (PL-1 phase 2: meshState folds into the keyed map at load).
    describe('extractConfigParams — generalized endpoint provider (step 04)', () => {
        const MESH_ENDPOINT = 'https://mesh.example.com/graphql';

        /**
         * Representative PaaS storefront project in the MIGRATED-legacy shape:
         * the keyed mesh entry carries the endpoint but no providesEnvVars —
         * exactly what the load-time migration produces from an old manifest.
         */
        function migratedMeshProject(): Project {
            return createMockProject({
                name: 'Legacy Mesh Project',
                path: '/tmp/proj-1',
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentConfigs: {
                    'eds-storefront': {
                        ADOBE_COMMERCE_STORE_VIEW_CODE: 'en_us',
                        ADOBE_COMMERCE_STORE_CODE: 'us_store',
                        ADOBE_COMMERCE_WEBSITE_CODE: 'us_website',
                        ADOBE_COMMERCE_CUSTOMER_GROUP: 'b2c_group',
                        ADOBE_CATALOG_API_KEY: 'api-key-123',
                        ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-id-456',
                        AEM_ASSETS_ENABLED: 'true',
                    },
                },
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'eds-storefront',
                        status: 'ready',
                        metadata: {
                            githubRepo: 'test-owner/test-repo',
                            daLiveOrg: 'test-org',
                            daLiveSite: 'test-site',
                        },
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: MESH_ENDPOINT,
                        lastDeployed: '2026-06-20T00:00:00.000Z',
                    },
                },
            });
        }

        /** Forward-state: the provider declares the endpoint via providesEnvVars. */
        function appBuilderComponentsOnlyProject(): Project {
            const base = migratedMeshProject();
            return createMockProject({
                ...base,
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: MESH_ENDPOINT,
                        providesEnvVars: { MESH_ENDPOINT },
                    },
                },
            });
        }

        let mockLogger: Logger;
        beforeEach(() => {
            mockLogger = createMockLogger() as unknown as Logger;
        });

        it('GOLDEN: migrated mesh project produces byte-identical config.json (snapshot guard)', () => {
            // The load-bearing edge. If this snapshot ever changes, the live
            // storefront republish changes — STOP and investigate, do NOT update
            // the snapshot to match. The snapshot was recorded from the legacy
            // meshState shape; the migrated keyed shape must reproduce it
            // byte-for-byte (that identity IS the migration's proof).
            const params = buildConfigGeneratorParams(migratedMeshProject());
            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            // The snapshot bytes were recorded from the RETIRED legacy meshState
            // shape and verified byte-identical against the keyed shape on
            // 2026-08-27 (PL-1 phase 2) before the fixture migrated.
            expect(result.content).toMatchSnapshot('legacy-mesh-config-json');
        });

        it('resolves MESH_ENDPOINT from the keyed mesh endpoint (no providesEnvVars)', () => {
            const params = extractConfigParams(migratedMeshProject());
            expect(params.commerceEndpoint).toBe(MESH_ENDPOINT);
        });

        it('resolves the SAME MESH_ENDPOINT when the endpoint lives only in appBuilderComponents', () => {
            const params = extractConfigParams(appBuilderComponentsOnlyProject());
            expect(params.commerceEndpoint).toBe(MESH_ENDPOINT);
        });

        it('produces byte-identical config.json from the providesEnvVars arm as from the endpoint arm', () => {
            const endpointArm = generateConfigJson(
                buildConfigGeneratorParams(migratedMeshProject()), mockLogger,
            ).content;
            const providerArm = generateConfigJson(
                buildConfigGeneratorParams(appBuilderComponentsOnlyProject()), mockLogger,
            ).content;

            expect(providerArm).toBe(endpointArm);
        });

        it('falls back to the direct backend endpoint when NO provider exists (no mesh)', () => {
            const noMesh = createMockProject({
                ...migratedMeshProject(),
                appBuilderComponents: undefined,
                componentConfigs: {
                    'eds-storefront': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://direct.example.com/graphql',
                    },
                },
            });

            const params = extractConfigParams(noMesh);
            expect(params.commerceEndpoint).toBe('https://direct.example.com/graphql');
        });

        it('generateProjectConfigJson renders what building the params and rendering them does', () => {
            // Reset and republish both call this; it must not drift from the
            // two-step form creation's golden tests pin.
            const project = migratedMeshProject();

            expect(generateProjectConfigJson(project, mockLogger)).toStrictEqual(
                generateConfigJson(buildConfigGeneratorParams(project), mockLogger),
            );
            expect(generateProjectConfigJson(project, mockLogger).content).toContain(MESH_ENDPOINT);
        });
    });
});
