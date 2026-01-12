/**
 * Tests for meshStatusHelpers
 *
 * Focuses on checkMeshConfigCompleteness which reads actual .env files
 * to detect missing configuration.
 */

import * as fs from 'fs/promises';
import { checkMeshConfigCompleteness, determineMeshStatus } from '@/features/dashboard/handlers/meshStatusHelpers';
import { parseEnvFile } from '@/core/utils/envParser';
import type { ComponentInstance, Project } from '@/types';

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('meshStatusHelpers', () => {
    const mockMeshPath = '/projects/demo/components/commerce-mesh';
    const mockMeshEndpoint = 'https://mesh.example.com/api/mesh-id/graphql';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkMeshConfigCompleteness', () => {
        it('returns incomplete when meshPath is undefined', async () => {
            const result = await checkMeshConfigCompleteness(undefined);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields.length).toBeGreaterThan(0);
        });

        it('returns incomplete when .env file does not exist', async () => {
            mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('returns incomplete when .env file is empty', async () => {
            mockFs.readFile.mockResolvedValue('');

            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('returns incomplete when required fields are missing', async () => {
            mockFs.readFile.mockResolvedValue(`
# Partial config
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
SOME_OTHER_VAR=value
`);

            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields).not.toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
            expect(result.missingFields).toContain('ADOBE_CATALOG_SERVICE_ENDPOINT');
        });

        it('returns incomplete when mesh endpoint from componentConfigs is not provided', async () => {
            mockFs.readFile.mockResolvedValue(`
# Complete .env INPUT config (but no endpoint in componentConfigs)
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            // No mesh endpoint passed - simulates componentConfigs missing MESH_ENDPOINT
            const result = await checkMeshConfigCompleteness(mockMeshPath);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields).toContain('MESH_ENDPOINT');
        });

        it('returns complete when all required fields and mesh endpoint from componentConfigs are present', async () => {
            mockFs.readFile.mockResolvedValue(`
# Complete mesh INPUT config
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            // Pass mesh endpoint (from componentConfigs['frontend']['MESH_ENDPOINT'])
            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(true);
            expect(result.missingFields).toHaveLength(0);
        });

        it('handles quoted values correctly', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT="https://example.com/graphql"
ADOBE_CATALOG_SERVICE_ENDPOINT='https://catalog.example.com'
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(true);
        });

        it('treats empty string values as missing', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            const result = await checkMeshConfigCompleteness(mockMeshPath, mockMeshEndpoint);

            expect(result.isComplete).toBe(false);
            expect(result.missingFields).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });
    });

    describe('determineMeshStatus', () => {
        const mockMeshComponent: ComponentInstance = {
            id: 'commerce-mesh',
            name: 'Commerce Mesh',
            type: 'dependency',
            subType: 'mesh',
            path: mockMeshPath,
            status: 'deployed',
            endpoint: mockMeshEndpoint,
            lastUpdated: new Date(),
        };

        // Project with mesh endpoint in componentInstances (single source of truth)
        const mockProjectWithMeshEndpoint: Project = {
            name: 'Test Project',
            path: '/projects/demo',
            createdAt: new Date(),
            status: 'ready',
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Commerce Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    path: mockMeshPath,
                    status: 'deployed',
                    endpoint: mockMeshEndpoint,
                },
            },
        };

        // Project WITHOUT mesh endpoint in componentInstances (incomplete config)
        const mockProjectWithoutMeshEndpoint: Project = {
            name: 'Test Project',
            path: '/projects/demo',
            createdAt: new Date(),
            status: 'ready',
            // No commerce-mesh in componentInstances means no endpoint
        };

        it('returns config-incomplete when .env file is missing', async () => {
            mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

            const result = await determineMeshStatus(
                { hasChanges: false },
                mockMeshComponent,
                mockProjectWithMeshEndpoint,
            );

            expect(result).toBe('config-incomplete');
        });

        it('returns config-incomplete when no commerce-mesh in componentInstances', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            // Project has componentConfigs but no MESH_ENDPOINT
            const result = await determineMeshStatus(
                { hasChanges: false },
                mockMeshComponent,
                mockProjectWithoutMeshEndpoint,
            );

            expect(result).toBe('config-incomplete');
        });

        it('returns config-incomplete when meshComponent has endpoint but project has no commerce-mesh in componentInstances', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            // Component passed to determineMeshStatus has endpoint, but project has no commerce-mesh in componentInstances
            // getMeshEndpoint() reads from project.componentInstances, not from component arg
            const componentWithEndpoint = { ...mockMeshComponent, endpoint: mockMeshEndpoint };

            const result = await determineMeshStatus(
                { hasChanges: false },
                componentWithEndpoint,
                mockProjectWithoutMeshEndpoint, // No commerce-mesh in componentInstances
            );

            expect(result).toBe('config-incomplete');
        });

        it('returns deployed when config is complete and no changes', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            const result = await determineMeshStatus(
                { hasChanges: false },
                mockMeshComponent,
                mockProjectWithMeshEndpoint, // Has endpoint in componentInstances
            );

            expect(result).toBe('deployed');
        });

        it('returns config-changed when config is complete but has changes', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            const result = await determineMeshStatus(
                { hasChanges: true },
                mockMeshComponent,
                mockProjectWithMeshEndpoint,
            );

            expect(result).toBe('config-changed');
        });

        it('returns error when component status is error and config complete', async () => {
            mockFs.readFile.mockResolvedValue(`
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog.example.com
ADOBE_COMMERCE_URL=https://commerce.example.com
ADOBE_COMMERCE_ENVIRONMENT_ID=env-123
ADOBE_COMMERCE_STORE_VIEW_CODE=default
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_store
ADOBE_CATALOG_API_KEY=api-key-123
`);

            const errorComponent = { ...mockMeshComponent, status: 'error' as const };

            const result = await determineMeshStatus(
                { hasChanges: false },
                errorComponent,
                mockProjectWithMeshEndpoint,
            );

            expect(result).toBe('error');
        });
    });

    describe('parseEnvFile (shared utility)', () => {
        it('parses simple key=value pairs', () => {
            const content = 'KEY=value\nANOTHER=test';
            const result = parseEnvFile(content);

            expect(result).toEqual({ KEY: 'value', ANOTHER: 'test' });
        });

        it('skips comments and empty lines', () => {
            const content = '# Comment\nKEY=value\n\n# Another comment\nKEY2=value2';
            const result = parseEnvFile(content);

            expect(result).toEqual({ KEY: 'value', KEY2: 'value2' });
        });

        it('removes double quotes from values', () => {
            const content = 'KEY="quoted value"';
            const result = parseEnvFile(content);

            expect(result).toEqual({ KEY: 'quoted value' });
        });

        it('removes single quotes from values', () => {
            const content = "KEY='quoted value'";
            const result = parseEnvFile(content);

            expect(result).toEqual({ KEY: 'quoted value' });
        });

        it('handles values with equals signs', () => {
            const content = 'URL=https://example.com?foo=bar';
            const result = parseEnvFile(content);

            expect(result).toEqual({ URL: 'https://example.com?foo=bar' });
        });

        it('returns empty object for empty content', () => {
            const result = parseEnvFile('');

            expect(result).toEqual({});
        });
    });
});
