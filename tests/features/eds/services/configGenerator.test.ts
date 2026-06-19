/**
 * Config Generator Tests
 *
 * Tests for environment-aware config.json generation for EDS storefronts.
 * Verifies correct header generation for PaaS, ACCS, and ACO backends.
 */

import {
    generateConfigJson,
    generateHeaders,
    mapBackendToEnvironmentType,
    extractConfigParamsFromConfigs,
    extractConfigParams,
    buildConfigGeneratorParams,
    type ConfigGeneratorParams,
} from '@/features/eds/services/configGenerator';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

describe('configGenerator', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
    });

    describe('mapBackendToEnvironmentType', () => {
        it('should map adobe-commerce-paas to paas', () => {
            expect(mapBackendToEnvironmentType('adobe-commerce-paas')).toBe('paas');
        });

        it('should map adobe-commerce-accs to accs', () => {
            expect(mapBackendToEnvironmentType('adobe-commerce-accs')).toBe('accs');
        });

        it('should map adobe-commerce-aco to aco', () => {
            expect(mapBackendToEnvironmentType('adobe-commerce-aco')).toBe('aco');
        });

        it('should default to paas for unknown backend', () => {
            expect(mapBackendToEnvironmentType('unknown-backend')).toBe('paas');
        });

        it('should default to paas for undefined', () => {
            expect(mapBackendToEnvironmentType(undefined)).toBe('paas');
        });
    });

    describe('generateHeaders', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            customerGroup: 'b2c',
        };

        it('should generate PaaS headers with API key and environment ID', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                commerceApiKey: 'api-key-123',
                commerceEnvironmentId: 'env-id-456',
            };

            const headers = generateHeaders(params);

            expect(headers.all).toEqual({ Store: 'en_us' });
            expect(headers.cs).toEqual({
                'Magento-Customer-Group': 'b2c',
                'Magento-Store-Code': 'us_store',
                'Magento-Store-View-Code': 'en_us',
                'Magento-Website-Code': 'us_website',
                'x-api-key': 'api-key-123',
                'Magento-Environment-Id': 'env-id-456',
            });
        });

        it('should generate ACCS headers without API key', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'accs',
            };

            const headers = generateHeaders(params);

            expect(headers.all).toEqual({ Store: 'en_us' });
            expect(headers.cs).toEqual({
                'Magento-Customer-Group': 'b2c',
                'Magento-Store-Code': 'us_store',
                'Magento-Store-View-Code': 'en_us',
                'Magento-Website-Code': 'us_website',
            });
            // Should NOT have x-api-key or Magento-Environment-Id
            expect(headers.cs).not.toHaveProperty('x-api-key');
            expect(headers.cs).not.toHaveProperty('Magento-Environment-Id');
        });

        it('should generate ACO headers with placeholders', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'aco',
            };

            const headers = generateHeaders(params);

            expect(headers.all).toEqual({ Store: 'en_us' });
            expect(headers.cs).toEqual({
                'AC-View-ID': '{{AC_VIEW_ID}}',
                'AC-Price-Book-ID': '{{AC_PRICE_BOOK_ID}}',
            });
        });

        it('should use default values when store codes not provided', () => {
            const params: ConfigGeneratorParams = {
                githubOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                environmentType: 'paas',
            };

            const headers = generateHeaders(params);

            expect(headers.all).toEqual({ Store: 'default' });
            expect(headers.cs?.['Magento-Store-Code']).toBe('default');
            expect(headers.cs?.['Magento-Store-View-Code']).toBe('default');
            expect(headers.cs?.['Magento-Website-Code']).toBe('base');
        });

        it('should default to paas when environmentType not specified', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                commerceApiKey: 'api-key-123',
                commerceEnvironmentId: 'env-id-456',
            };

            const headers = generateHeaders(params);

            // Should include PaaS-specific headers
            expect(headers.cs?.['x-api-key']).toBe('api-key-123');
            expect(headers.cs?.['Magento-Environment-Id']).toBe('env-id-456');
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

        it('should generate PaaS config with API key and environment ID headers', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                commerceApiKey: 'api-key-123',
                commerceEnvironmentId: 'env-id-456',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            expect(result.content).toBeDefined();

            const config = JSON.parse(result.content!);
            expect(config.public.default.headers.cs['x-api-key']).toBe('api-key-123');
            expect(config.public.default.headers.cs['Magento-Environment-Id']).toBe('env-id-456');
        });

        it('should generate ACCS config without API key headers', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'accs',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);

            // Should have store codes
            expect(config.public.default.headers.cs['Magento-Store-Code']).toBe('us_store');

            // Should NOT have API key headers
            expect(config.public.default.headers.cs['x-api-key']).toBeUndefined();
            expect(config.public.default.headers.cs['Magento-Environment-Id']).toBeUndefined();
        });

        it('should generate ACO config with AC-View-ID placeholders', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'aco',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);

            expect(config.public.default.headers.cs['AC-View-ID']).toBe('{{AC_VIEW_ID}}');
            expect(config.public.default.headers.cs['AC-Price-Book-ID']).toBe('{{AC_PRICE_BOOK_ID}}');
        });

        it('should set separate commerce-core-endpoint for PaaS catalog service', () => {
            // PaaS has a separate catalog service endpoint
            const paasParams: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                catalogServiceEndpoint: 'https://catalog.example.com/graphql',
            };

            const paasResult = generateConfigJson(paasParams, mockLogger);
            const paasConfig = JSON.parse(paasResult.content!);
            expect(paasConfig.public.default['commerce-core-endpoint']).toBe('https://catalog.example.com/graphql');
            expect(paasConfig.public.default['commerce-endpoint']).toBe('https://commerce.example.com/graphql');
        });

        it('should preserve commerce-core-endpoint for ACCS even when equal to commerce-endpoint', () => {
            // The storefront uses the *existence* of commerce-core-endpoint to determine
            // which requests get cs headers (Magento-Website-Code, etc.). ACCS backends
            // require these headers — removing the property breaks catalog queries.
            const accsParams: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'accs',
            };

            const accsResult = generateConfigJson(accsParams, mockLogger);
            const accsConfig = JSON.parse(accsResult.content!);
            expect(accsConfig.public.default['commerce-endpoint']).toBe('https://commerce.example.com/graphql');
            expect(accsConfig.public.default['commerce-core-endpoint']).toBe('https://commerce.example.com/graphql');
        });

        it('should preserve commerce-core-endpoint for ACO even when equal to commerce-endpoint', () => {
            // ACO also uses cs headers (AC-View-ID, AC-Price-Book-ID) — same reasoning
            const acoParams: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'aco',
            };

            const acoResult = generateConfigJson(acoParams, mockLogger);
            const acoConfig = JSON.parse(acoResult.content!);
            expect(acoConfig.public.default['commerce-endpoint']).toBe('https://commerce.example.com/graphql');
            expect(acoConfig.public.default['commerce-core-endpoint']).toBe('https://commerce.example.com/graphql');
        });

        it('should handle AEM Assets enabled flag', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                aemAssetsEnabled: true,
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-assets-enabled']).toBe(true);
        });

        it('should set commerce-assets-enabled to false when disabled', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                aemAssetsEnabled: false,
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-assets-enabled']).toBe(false);
        });

    });

    describe('placeholder value escaping', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            environmentType: 'paas',
        };

        it('produces valid JSON when a substituted value contains a double quote', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                commerceEndpoint: 'https://commerce.example.com/"graphql',
            };

            const result = generateConfigJson(params, mockLogger);

            // Decisive: a raw split/join would emit a stray quote and break JSON.parse
            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-endpoint']).toBe('https://commerce.example.com/"graphql');
        });

        it('produces valid JSON when a substituted value contains a backslash', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                catalogServiceEndpoint: 'https://catalog\\example.com/graphql',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-core-endpoint']).toBe('https://catalog\\example.com/graphql');
        });

        it('produces valid JSON when the org slug embedded in URLs contains a quote', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                githubOwner: 'evil"owner',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // {ORG} is embedded inside the analytics store-url string
            expect(config.public.default.analytics['store-url']).toContain('evil"owner');
        });
    });

    describe('addon config flags injection', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            environmentType: 'paas',
        };

        it('should not inject B2B flags when no addons selected', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject B2B flags when empty addons array', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: [],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject flags for addon without configFlags', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: ['adobe-commerce-aco'],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // ACO addon has no configFlags in its configuration
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('should gracefully handle unknown addon ID', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: ['nonexistent-addon'],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            // Should still generate valid config without errors
            const config = JSON.parse(result.content!);
            expect(config.public.default).toBeDefined();
        });
    });

    describe('package config flags injection', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            environmentType: 'paas',
        };

        it('should inject B2B config flags for the custom (unbranded hybrid) package', () => {
            // The commerce-account-nav block only builds links inside an
            // auth/permissions callback, which fires only when
            // commerce-b2b-enabled === true. The custom package (the unbranded
            // B2B+B2C hybrid) declares these flags in demo-packages.json (configFlags).
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'custom',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
            expect(config.public.default['commerce-companies-enabled']).toBe(true);
        });

        it('should inject B2B config flags for the citisignal hybrid package', () => {
            // CitiSignal is a B2B+B2C hybrid on the b2b boilerplate template, so it
            // needs the same flags: the flag enables the B2B machinery
            // (auth/permissions queries roles); B2C customers still get the standard
            // view, B2B customers get the company nav.
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'citisignal',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
            expect(config.public.default['commerce-companies-enabled']).toBe(true);
        });

        it('should not inject B2B flags for a package without configFlags', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'isle5',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject B2B flags when no package selected', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('should gracefully handle unknown package ID', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'nonexistent-package',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default).toBeDefined();
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('extractConfigParams threads selectedPackage from the project (reset path)', () => {
            const project = {
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
            } as unknown as Project;

            const params = extractConfigParams(project);

            expect(params.selectedPackage).toBe('custom');
        });
    });

    describe('buildConfigGeneratorParams', () => {
        function projectWithEdsMetadata(overrides: Record<string, unknown> = {}): Project {
            return {
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        path: '/test/eds',
                        metadata: {
                            githubRepo: 'acme-org/acme-repo',
                            daLiveOrg: 'acme-da-org',
                            daLiveSite: 'acme-da-site',
                        },
                    },
                },
                ...overrides,
            } as unknown as Project;
        }

        it('derives repo coordinates from EDS metadata and threads config params', () => {
            const params = buildConfigGeneratorParams(projectWithEdsMetadata());

            expect(params.githubOwner).toBe('acme-org');
            expect(params.repoName).toBe('acme-repo');
            expect(params.daLiveOrg).toBe('acme-da-org');
            expect(params.daLiveSite).toBe('acme-da-site');
            // Threaded from extractConfigParams (proves the spread happened)
            expect(params.selectedPackage).toBe('custom');
            expect(params.environmentType).toBe('paas');
        });

        it('produces a config that generateConfigJson accepts end-to-end', () => {
            const params = buildConfigGeneratorParams(projectWithEdsMetadata());
            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // B2B flags flow through from selectedPackage
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
        });

        it('falls back to empty coordinates when EDS metadata is missing', () => {
            const params = buildConfigGeneratorParams({
                componentConfigs: {},
                componentSelections: {},
            } as unknown as Project);

            expect(params.githubOwner).toBe('');
            expect(params.repoName).toBe('');
            expect(params.daLiveOrg).toBe('');
            expect(params.daLiveSite).toBe('');
        });
    });

    describe('extractConfigParamsFromConfigs', () => {
        it('should use backendComponentId for environment type', () => {
            const componentConfigs = {
                'eds-storefront': {
                    ADOBE_CATALOG_API_KEY: 'api-key-123',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs, undefined, 'adobe-commerce-accs');

            expect(result.environmentType).toBe('accs');
            // ACCS doesn't use API keys — commerceApiKey should be undefined
            expect(result.commerceApiKey).toBeUndefined();
        });

        it('should default to paas when backendComponentId not provided', () => {
            const componentConfigs = {
                'eds-storefront': {
                    ACCS_CATALOG_SERVICE_ENDPOINT: 'https://accs.example.com/graphql',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs);

            expect(result.environmentType).toBe('paas');
        });

        it('should prefer mesh endpoint over direct endpoint', () => {
            const componentConfigs = {
                'eds-storefront': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://direct.example.com/graphql',
                },
            };

            const result = extractConfigParamsFromConfigs(
                componentConfigs,
                'https://mesh.example.com/graphql', // mesh endpoint
            );

            expect(result.commerceEndpoint).toBe('https://mesh.example.com/graphql');
        });

        it('should extract all store codes from config', () => {
            const componentConfigs = {
                'eds-storefront': {
                    ADOBE_COMMERCE_STORE_CODE: 'us_store',
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'en_us',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'us_website',
                    ADOBE_COMMERCE_CUSTOMER_GROUP: 'b2c_group',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs, undefined, 'adobe-commerce-paas');

            expect(result.storeCode).toBe('us_store');
            expect(result.storeViewCode).toBe('en_us');
            expect(result.websiteCode).toBe('us_website');
            expect(result.customerGroup).toBe('b2c_group');
        });

        it('should extract AEM Assets enabled from config', () => {
            const componentConfigs = {
                'eds-storefront': {
                    AEM_ASSETS_ENABLED: 'true',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs, undefined, 'adobe-commerce-paas');

            expect(result.aemAssetsEnabled).toBe(true);
        });

        it('should extract ACCS store codes from eds-accs-mesh config', () => {
            // Regression: When the wizard populates componentConfigs, ACCS store codes
            // live under 'eds-accs-mesh' (not 'eds-storefront'). The extraction function
            // must fall back to the mesh config for these values.
            const componentConfigs = {
                'eds-storefront': {
                    AEM_ASSETS_ENABLED: 'true',
                },
                'eds-accs-mesh': {
                    ACCS_STORE_VIEW_CODE: 'citisignal_us',
                    ACCS_STORE_CODE: 'citisignal_store',
                    ACCS_WEBSITE_CODE: 'citisignal',
                    ACCS_CUSTOMER_GROUP: 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c',
                    ACCS_GRAPHQL_ENDPOINT: 'https://accs.example.com/graphql',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs, undefined, 'adobe-commerce-accs');

            expect(result.environmentType).toBe('accs');
            expect(result.storeViewCode).toBe('citisignal_us');
            expect(result.storeCode).toBe('citisignal_store');
            expect(result.websiteCode).toBe('citisignal');
            expect(result.customerGroup).toBe('b6589fc6ab0dc82cf12099d1c2d40ab994e8410c');
            expect(result.commerceEndpoint).toBe('https://accs.example.com/graphql');
        });

        it('should extract PaaS store codes from eds-commerce-mesh config', () => {
            // Same fallback pattern for PaaS: store codes in mesh config, not storefront
            const componentConfigs = {
                'eds-storefront': {
                    AEM_ASSETS_ENABLED: 'false',
                },
                'eds-commerce-mesh': {
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
                    ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'base',
                    ADOBE_COMMERCE_CUSTOMER_GROUP: 'hash123',
                },
            };

            const result = extractConfigParamsFromConfigs(componentConfigs, undefined, 'adobe-commerce-paas');

            expect(result.environmentType).toBe('paas');
            expect(result.storeViewCode).toBe('default');
            expect(result.storeCode).toBe('main_website_store');
            expect(result.websiteCode).toBe('base');
            expect(result.customerGroup).toBe('hash123');
        });

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
            // files half is the quickEditPublisher vendoring step; this
            // plugin lets the EW Layout view invoke Quick Edit. Inert under
            // Universal Editor, active under Experience Workspace.
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            const plugins = config.sidekick.plugins as Array<Record<string, unknown>>;
            const quickEdit = plugins.find((p) => p.id === 'quick-edit');

            expect(quickEdit).toBeDefined();
            expect(quickEdit!.title).toBe('Quick Edit');
            expect(quickEdit!.environments).toEqual(['dev', 'preview']);
            expect(quickEdit!.event).toBe('quick-edit');
            // Event plugin, not a palette — no url/isPalette.
            expect(quickEdit!.url).toBeUndefined();
            expect(quickEdit!.isPalette).toBeUndefined();
        });

        it('preserves the existing cif and personalisation plugins (additive regression guard)', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            const config = JSON.parse(result.content!);
            const plugins = config.sidekick.plugins as Array<Record<string, unknown>>;
            const ids = plugins.map((p) => p.id);

            expect(ids).toContain('cif');
            expect(ids).toContain('personalisation');
            expect(ids).toContain('quick-edit');
        });
    });
});
