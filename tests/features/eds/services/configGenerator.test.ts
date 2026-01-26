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

        it('should set commerce-core-endpoint only for PaaS', () => {
            // For PaaS, both endpoints should be set
            const paasParams: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                catalogServiceEndpoint: 'https://catalog.example.com/graphql',
            };

            const paasResult = generateConfigJson(paasParams, mockLogger);
            const paasConfig = JSON.parse(paasResult.content!);
            expect(paasConfig.public.default['commerce-core-endpoint']).toBe('https://catalog.example.com/graphql');
            expect(paasConfig.public.default['commerce-endpoint']).toBe('https://commerce.example.com/graphql');

            // For ACCS, commerce-core-endpoint should be removed if same as commerce-endpoint
            const accsParams: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'accs',
            };

            const accsResult = generateConfigJson(accsParams, mockLogger);
            const accsConfig = JSON.parse(accsResult.content!);
            expect(accsConfig.public.default['commerce-endpoint']).toBe('https://commerce.example.com/graphql');
            // commerce-core-endpoint should be removed for non-PaaS when redundant
            expect(accsConfig.public.default['commerce-core-endpoint']).toBeUndefined();
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

        it('should remove commerce-assets-enabled when false', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                environmentType: 'paas',
                aemAssetsEnabled: false,
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-assets-enabled']).toBeUndefined();
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
            expect(result.commerceApiKey).toBe('api-key-123');
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
    });
});
