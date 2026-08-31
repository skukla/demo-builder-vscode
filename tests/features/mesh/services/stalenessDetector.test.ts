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
import { createMeshDepsFake } from '../../../helpers/meshDepsFake';

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    ...jest.requireActual('@/features/mesh/services/stalenessDetector'),
    calculateMeshSourceHash: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        NORMAL: 30000,
        LONG: 180000,
        VERY_LONG: 300000,
        EXTENDED: 600000,
        UI: {
            ANIMATION: 150,
            UPDATE_DELAY: 100,
            TRANSITION: 300,
            NOTIFICATION: 2000,
            MIN_LOADING: 1500,
            FOCUS_FALLBACK: 1000,
        },
        POLL: {
            INITIAL: 100,
            MAX: 30000,
        },
        AUTH: {
            BROWSER_LAUNCH: 120000,
        },
        WEBVIEW_INIT_DELAY: 100,
    },
}));
jest.mock('@/types/typeGuards', () => ({
    parseJSON: jest.fn(),
    hasEntries: jest.fn((obj) => obj && Object.keys(obj).length > 0),
    getMeshComponentInstance: jest.fn((project) => {
        if (!project?.componentInstances) return undefined;
        return Object.values(project.componentInstances).find(
            (c: any) => c.subType === 'mesh'
        );
    }),
    getMeshComponentId: jest.fn((project) => {
        if (!project?.componentInstances) return undefined;
        const mesh = Object.entries(project.componentInstances).find(
            ([_, c]: [string, any]) => c.subType === 'mesh'
        );
        return mesh ? mesh[0] : undefined;
    }),
}));


/** Shared fake (PL-16) — this was one of eleven hand-rolled copies. */
const meshDeps = createMeshDepsFake();

/** The same object, typed for the per-test swap in `beforeEach`. */
const mutableMeshDeps = meshDeps as unknown as {
    commandManager: unknown;
    authManager: unknown;
};


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
                    subType: 'mesh',
                    status: 'deployed',
                    path: '/test/mesh',
                },
            },
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                        envVars: {}, // Empty - no baseline
                        sourceHash: null,
                        lastDeployed: '',
                            },
            },
        } as unknown as Project;

        // Mock calculateMeshSourceHash to return null (no source hash captured yet)
        (calculateMeshSourceHash as jest.Mock).mockResolvedValue(null);

        // Mock command executor
        mockCommandExecutor = {
            execute: jest.fn(),
        };

        // CONVERTED 2026-08-28 (ADR-015): the collaborators are handed in, so
        // this suite mocks the service registry NOT AT ALL — the same fakes go
        // straight into `meshDeps` below.
        mutableMeshDeps.commandManager = mockCommandExecutor;
        mutableMeshDeps.authManager = {
            getTokenStatus: jest
                .fn()
                .mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
        };
    });

    // Test 1: Timeout during fetch
    it('should return hasChanges: false when fetch times out', async () => {
        // Given: Auth check succeeds (default mock) but mesh fetch times out
        mockCommandExecutor.execute.mockRejectedValueOnce(new Error('Command timeout'));

        // When: detectMeshChanges is called
        const result = await detectMeshChanges(mockProject, {}, meshDeps);

        // Then: Returns unknownDeployedState but NOT hasChanges
        expect(result.hasChanges).toBe(false); // Don't force redeployment
        expect(result.unknownDeployedState).toBe(true); // Flag as unknown
        expect(result.envVarsChanged).toBe(false);
        expect(result.sourceFilesChanged).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
    });

    // Test 2: Token expired (auth service returns not authenticated)
    it('should return hasChanges: false when token expired', async () => {
        // Given: Auth check returns not authenticated (token expired)
        mutableMeshDeps.authManager = {
            getTokenStatus: jest
                .fn()
                .mockResolvedValue({ isAuthenticated: false, expiresInMinutes: -5 }),
        };

        // When: detectMeshChanges is called
        const result = await detectMeshChanges(mockProject, {}, meshDeps);

        // Then: Returns unknownDeployedState but NOT hasChanges
        expect(result.hasChanges).toBe(false); // Don't force redeployment
        expect(result.unknownDeployedState).toBe(true); // Flag as unknown
        expect(result.envVarsChanged).toBe(false);
    });

    // Test 3: Successful fetch with no changes
    it('should return hasChanges: false when configs match', async () => {
        // Given: Auth check succeeds (default mock) and mesh fetch returns deployed config
        mockCommandExecutor.execute.mockResolvedValueOnce({
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
        },
            meshDeps,
        );

        // Then: Returns no changes and shouldSaveProject (baseline populated)
        expect(result.hasChanges).toBe(false);
        expect(result.shouldSaveProject).toBe(true); // Baseline was populated
        expect(result.envVarsChanged).toBe(false);
        expect(result.sourceFilesChanged).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
        // Note: unknownDeployedState is undefined (not false) in success path
    });
});
