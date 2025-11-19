/**
 * Unit Tests: stalenessDetector - unknownDeployedState Handling
 *
 * Tests verify that staleness detector correctly handles fetch failures
 * and distinguishes between "can't verify" vs "not deployed" states.
 *
 * Bug Fix: Step 1 changed behavior to return hasChanges: false when fetch fails,
 * preventing false "deploy needed" states when deployed mesh config is inaccessible.
 */

import { detectMeshChanges, calculateMeshSourceHash } from '@/features/mesh/services/stalenessDetector';
import { Project } from '@/types';

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    ...jest.requireActual('@/features/mesh/services/stalenessDetector'),
    calculateMeshSourceHash: jest.fn(),
}));

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/di');
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        API_CALL: 5000,
    },
}));
jest.mock('@/types/typeGuards', () => ({
    parseJSON: jest.fn(),
}));

describe('detectMeshChanges - Timeout Handling', () => {
    let mockProject: Project;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock project with empty meshState.envVars (no baseline)
        mockProject = {
            name: 'test-project',
            path: '/test/project',
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    status: 'deployed',
                    path: '/test/mesh',
                },
            },
            meshState: {
                envVars: {}, // Empty - no baseline
                sourceHash: null,
                lastDeployed: '',
            },
        } as unknown as Project;

        // Mock calculateMeshSourceHash to return null (no source hash captured yet)
        (calculateMeshSourceHash as jest.Mock).mockResolvedValue(null);

        // Mock command executor
        mockCommandExecutor = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor = jest.fn().mockReturnValue(mockCommandExecutor);
    });

    // Test 1: Timeout during fetch
    it('should return hasChanges: false when fetch times out', async () => {
        // Given: Auth check succeeds but mesh fetch times out
        mockCommandExecutor.execute
            .mockResolvedValueOnce({ code: 0, stdout: '{}' }) // Auth check success
            .mockRejectedValueOnce(new Error('Command timeout')); // Mesh fetch timeout

        // When: detectMeshChanges is called
        const result = await detectMeshChanges(mockProject, {});

        // Then: Returns unknownDeployedState but NOT hasChanges
        expect(result.hasChanges).toBe(false); // Don't force redeployment
        expect(result.unknownDeployedState).toBe(true); // Flag as unknown
        expect(result.envVarsChanged).toBe(false);
        expect(result.sourceFilesChanged).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
    });

    // Test 2: Network error during fetch
    it('should return hasChanges: false on network error', async () => {
        // Given: Auth check fails with network error
        const networkError = new Error('Network error');
        mockCommandExecutor.execute.mockRejectedValue(networkError);

        // When: detectMeshChanges is called
        const result = await detectMeshChanges(mockProject, {});

        // Then: Returns unknownDeployedState but NOT hasChanges
        expect(result.hasChanges).toBe(false); // Don't force redeployment
        expect(result.unknownDeployedState).toBe(true); // Flag as unknown
        expect(result.envVarsChanged).toBe(false);
    });

    // Test 3: Successful fetch with no changes
    it('should return hasChanges: false when configs match', async () => {
        // Given: Auth check succeeds and mesh fetch returns deployed config
        mockCommandExecutor.execute
            .mockResolvedValueOnce({ code: 0, stdout: '{}' }) // Auth check success
            .mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshConfig: {
                        sources: [
                            {
                                name: 'magento',
                                handler: {
                                    graphql: {
                                        endpoint: 'https://example.com/graphql'
                                    }
                                }
                            }
                        ]
                    }
                })
            });

        const { parseJSON } = require('@/types/typeGuards');
        parseJSON.mockImplementation((json: string) => JSON.parse(json));

        // When: detectMeshChanges is called with matching local config
        const result = await detectMeshChanges(mockProject, {
            'commerce-mesh': {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql'
            }
        });

        // Then: Returns no changes and shouldSaveProject (baseline populated)
        expect(result.hasChanges).toBe(false);
        expect(result.shouldSaveProject).toBe(true); // Baseline was populated
        expect(result.envVarsChanged).toBe(false);
        expect(result.sourceFilesChanged).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
        // Note: unknownDeployedState is undefined (not false) in success path
    });
});
