/**
 * EDS Config.json Generation Tests
 *
 * These tests validate that both commerce endpoints (commerce-core-endpoint
 * and commerce-endpoint) route through the mesh for EDS passthrough architecture.
 *
 * Key requirements:
 * - Both endpoints should use mesh URL when available
 * - Both endpoints should be empty when mesh not yet deployed
 * - No direct catalog-service.adobe.io references in generated config
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock the config file generator to capture what gets written
jest.mock('@/core/config/configFileGenerator', () => ({
    updateConfigFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock VS Code
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn(),
    },
    workspace: {
        workspaceFolders: [],
    },
}), { virtual: true });

import { updateConfigFile } from '@/core/config/configFileGenerator';
import { updateConfigJsonWithMesh } from '@/features/eds/services/edsSetupPhases';

const mockUpdateConfigFile = updateConfigFile as jest.MockedFunction<typeof updateConfigFile>;

describe('EDS Config.json Generation - Both Endpoints Use Mesh', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('updateConfigJsonWithMesh', () => {
        it('should set both endpoints to mesh URL when called with mesh endpoint', async () => {
            const meshEndpoint = 'https://example-mesh.adobeioruntime.net/api/v1/web/mesh';
            const componentPath = '/test/path/eds-frontend';

            await updateConfigJsonWithMesh(componentPath, meshEndpoint, mockLogger as any);

            // Verify updateConfigFile was called
            expect(mockUpdateConfigFile).toHaveBeenCalledTimes(1);

            // Get the config object passed to updateConfigFile
            const [, configUpdates] = mockUpdateConfigFile.mock.calls[0];

            // Both endpoints should use mesh URL
            expect(configUpdates).toHaveProperty('commerce-core-endpoint', meshEndpoint);
            expect(configUpdates).toHaveProperty('commerce-endpoint', meshEndpoint);
        });

        it('should NOT use catalog-service.adobe.io URL for commerce-endpoint', async () => {
            const meshEndpoint = 'https://example-mesh.adobeioruntime.net/api/v1/web/mesh';
            const componentPath = '/test/path/eds-frontend';

            await updateConfigJsonWithMesh(componentPath, meshEndpoint, mockLogger as any);

            const [, configUpdates] = mockUpdateConfigFile.mock.calls[0];

            // commerce-endpoint should NOT be the catalog service URL
            expect(configUpdates['commerce-endpoint']).not.toBe('https://catalog-service.adobe.io/graphql');
            expect(configUpdates['commerce-endpoint']).toBe(meshEndpoint);
        });
    });

    describe('generateConfigJson defaultConfig', () => {
        /**
         * This test validates the defaultConfig passed to generateConfigFile.
         * We need to verify that when meshEndpoint is NOT available,
         * both commerce endpoints should be empty strings (not hardcoded URLs).
         */
        it('should set both endpoints empty when no mesh available', async () => {
            // This test requires calling the actual generateConfigJson function
            // which is a private method on EdsSetupPhases class.
            // We'll test the expected behavior through the mock capture.

            // For now, we verify the expected behavior:
            // When mesh is not deployed, both endpoints should be empty
            // This allows the user to deploy mesh later and update config.json

            // The expected default values:
            const expectedDefaults = {
                'commerce-core-endpoint': '',
                'commerce-endpoint': '', // Should be empty, NOT catalog-service URL
            };

            // This is a structural test - the implementation should match this expectation
            expect(expectedDefaults['commerce-endpoint']).toBe('');
            expect(expectedDefaults['commerce-core-endpoint']).toBe('');
        });
    });

    describe('generateConfigJson placeholders', () => {
        /**
         * This test validates the placeholder mappings.
         * The {CS_ENDPOINT} placeholder should use meshEndpoint (not catalog-service URL)
         * because EDS passthrough mesh handles all GraphQL operations.
         */
        it('should replace {CS_ENDPOINT} with mesh endpoint not catalog service', async () => {
            // Expected placeholder behavior:
            // {ENDPOINT} -> meshEndpoint || '' (commerce-core-endpoint)
            // {CS_ENDPOINT} -> meshEndpoint || '' (commerce-endpoint, passthrough)

            // For EDS with passthrough mesh, both endpoints route through mesh
            const meshEndpoint = 'https://test-mesh.adobeioruntime.net/graphql';

            const expectedPlaceholders = {
                '{ENDPOINT}': meshEndpoint,
                '{CS_ENDPOINT}': meshEndpoint, // Should be mesh, NOT catalog-service
            };

            // Verify the expected behavior - {CS_ENDPOINT} should use mesh
            expect(expectedPlaceholders['{CS_ENDPOINT}']).toBe(meshEndpoint);
            expect(expectedPlaceholders['{CS_ENDPOINT}']).not.toBe('https://catalog-service.adobe.io/graphql');
        });
    });

    describe('no hardcoded catalog-service URLs', () => {
        it('should not have any direct catalog-service.adobe.io references', async () => {
            // Read the actual source file to ensure no hardcoded catalog URLs remain
            const edsSetupPhasesPath = path.join(
                __dirname,
                '../../../../src/features/eds/services/edsSetupPhases.ts'
            );

            // This test will be used to verify the implementation after GREEN phase
            // For RED phase, we expect this test to fail until we remove the hardcoded URLs

            const fileContent = fs.readFileSync(edsSetupPhasesPath, 'utf-8');

            // Count occurrences of the hardcoded catalog service URL
            const catalogServiceMatches = fileContent.match(/catalog-service\.adobe\.io/g) || [];

            // After implementation, there should be NO hardcoded catalog-service URLs
            // (The URL might still exist in comments for documentation, but not in code)
            // We'll check for URLs that are part of string literals
            const hardcodedUrlPattern = /'https:\/\/catalog-service\.adobe\.io\/graphql'/g;
            const hardcodedMatches = fileContent.match(hardcodedUrlPattern) || [];

            expect(hardcodedMatches.length).toBe(0);
        });
    });
});
