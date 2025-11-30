import { getMeshEnvVars } from '@/features/mesh/services/stalenessDetector';

/**
 * StalenessDetector - Initialization Tests
 *
 * Tests mesh environment variable extraction and filtering:
 * - Extract mesh-related env vars from config
 * - Handle missing/null/undefined values
 * - Type conversion and filtering
 *
 * Total tests: 5
 */

describe('StalenessDetector - Initialization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getMeshEnvVars', () => {
        it('should extract mesh-related env vars from config', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key',
                UNRELATED_VAR: 'should-not-appear',
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key',
            });
        });

        it('should handle missing env vars', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });

        it('should filter out null and undefined values', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_API_KEY: null,
                ADOBE_CATALOG_SERVICE_ENDPOINT: undefined,
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });

        it('should convert values to strings', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 12345,
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: '12345',
            });
        });

        it('should return empty object for empty config', () => {
            const result = getMeshEnvVars({});

            expect(result).toEqual({});
        });
    });
});
