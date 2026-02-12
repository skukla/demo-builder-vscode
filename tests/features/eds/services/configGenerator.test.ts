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
    type ConfigGeneratorParams,
    type EnvironmentType,
} from '@/features/eds/services/configGenerator';
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

        it('should set correct content source URL', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
            };

            const result = generateConfigJson(params, mockLogger);
            const config = JSON.parse(result.content!);

            expect(config.content.source.url).toBe('https://content.da.live/test-org/test-site');
        });

        it('should set correct CDN hosts', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
            };

            const result = generateConfigJson(params, mockLogger);
            const config = JSON.parse(result.content!);

            expect(config.cdn.live.host).toBe('main--test-repo--test-owner.aem.live');
            expect(config.cdn.preview.host).toBe('main--test-repo--test-owner.aem.page');
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
});
