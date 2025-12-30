// IMPORTANT: Mock must be declared before imports
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

import * as fs from 'fs/promises';
import { readMeshEnvVarsFromFile } from '@/features/mesh/services/stalenessDetector';

const mockFs = fs as jest.Mocked<typeof fs>;

/**
 * StalenessDetector - Env File Reader Tests
 *
 * Tests for reading mesh environment variables from .env file:
 * - Parse standard .env format
 * - Filter to only MESH_ENV_VARS keys
 * - Handle missing .env file gracefully
 * - Handle empty .env file
 * - Handle malformed lines
 * - Handle quoted values
 *
 * Total tests: 8
 */

describe('StalenessDetector - readMeshEnvVarsFromFile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Happy Path - .env file parsing', () => {
        it('should extract mesh env vars from .env file', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_CATALOG_API_KEY=test-key-123
OTHER_VARIABLE=should-be-ignored
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key-123',
            });
            expect(mockFs.readFile).toHaveBeenCalledWith('/test/mesh/.env', 'utf-8');
        });

        it('should extract all supported mesh env vars', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_CATALOG_API_KEY=api-key
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_STORE_CODE=main_website_store
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'api-key',
                ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-123',
                ADOBE_COMMERCE_WEBSITE_CODE: 'base',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
                ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
            });
        });

        it('should handle quoted values in .env file', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT="https://example.com/graphql"
ADOBE_CATALOG_API_KEY='my-secret-key'
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_API_KEY: 'my-secret-key',
            });
        });

        it('should filter out non-mesh env vars', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
NODE_ENV=production
DATABASE_URL=postgres://localhost/db
UNRELATED_VAR=should-be-ignored
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
            expect(result).not.toHaveProperty('NODE_ENV');
            expect(result).not.toHaveProperty('DATABASE_URL');
            expect(result).not.toHaveProperty('UNRELATED_VAR');
        });
    });

    describe('Edge Cases - File handling', () => {
        it('should return empty object when .env file does not exist', async () => {
            const error = new Error('ENOENT: no such file or directory');
            (error as NodeJS.ErrnoException).code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({});
        });

        it('should return empty object for empty .env file', async () => {
            mockFs.readFile.mockResolvedValue('');

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({});
        });

        it('should handle malformed lines gracefully', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
THIS_LINE_HAS_NO_EQUALS
=MISSING_KEY
# This is a comment

ADOBE_CATALOG_API_KEY=valid-key
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_API_KEY: 'valid-key',
            });
        });

        it('should handle values containing equals signs', async () => {
            const envContent = `
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql?key=value&other=123
`;
            mockFs.readFile.mockResolvedValue(envContent);

            const result = await readMeshEnvVarsFromFile('/test/mesh');

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql?key=value&other=123',
            });
        });
    });
});
