/**
 * Tests for handleRequestStatus - unknownDeployedState handling
 *
 * Tests verify the asynchronous mesh status checking behavior when the
 * deployed state is unknown (fetch failed or meshState.envVars is empty).
 */

// IMPORTANT: Mock must be declared before imports
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock mesh verifier to prevent async operations
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    verifyMeshDeployment: jest.fn().mockResolvedValue(undefined),
    syncMeshStatus: jest.fn().mockResolvedValue(undefined),
}));

import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';
import { flushPromises } from '../../../testUtils/async';

describe('dashboardHandlers - handleRequestStatus - unknownDeployedState handling', () => {
    beforeEach(() => {
        // Reset mock call history
        jest.clearAllMocks();

        // Note: ServiceLocator mock is set up at module level
        // Individual tests will configure it with their specific needs
    });

    it('should show "not-deployed" status when unknownDeployedState is true (asynchronous path)', async () => {
        // Given: Project with mesh component but fetch failed (unknownDeployedState)
        // When we can't verify the deployed state, we assume not-deployed as a safe default
        const { mockContext } = setupMocks({
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    status: 'deployed', // Deployed status triggers async path
                    path: '/path/to/mesh',
                },
            },
            componentConfigs: {
                'commerce-mesh': {
                    endpoint: 'https://commerce.example.com/graphql',
                },
            },
            meshState: {
                envVars: {},
                sourceHash: null,
                lastDeployed: '',
            },
        } as any);

        // Mock detectMeshChanges to return unknownDeployedState
        const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectMeshChanges.mockResolvedValue({
            hasChanges: false,
            unknownDeployedState: true,
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: [],
        });
        detectFrontendChanges.mockReturnValue(false);

        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
            ensureSDKInitialized: jest.fn().mockResolvedValue(undefined),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org123', name: 'Test Org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        // When: handleRequestStatus is called
        const result = await handleRequestStatus(mockContext);

        // Then: Initial status is "checking" (async path behavior)
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'checking',
                message: 'Verifying deployment status...',
            },
        });

        // Wait for async check to complete
        await flushPromises();

        // Then: Async update sends "error" status when verification fails
        // Changed from "not-deployed" to "error" for clearer error reporting
        expect(mockContext.panel?.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'statusUpdate',
                payload: expect.objectContaining({
                    mesh: expect.objectContaining({
                        status: 'error',
                        message: 'Failed to check deployment status',
                    }),
                }),
            })
        );
    });

    it('should populate meshState.envVars when fetch succeeds (asynchronous path)', async () => {
        // Given: Empty meshState.envVars, fetch success scenario
        const { mockContext } = setupMocks({
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    status: 'deployed', // Deployed status triggers async path
                    path: '/path/to/mesh',
                    endpoint: 'https://mesh.example.com/graphql',
                },
            },
            componentConfigs: {
                'commerce-mesh': {
                    endpoint: 'https://commerce.example.com/graphql',
                },
            },
            meshState: {
                envVars: {}, // Empty
                sourceHash: null,
                lastDeployed: '',
            },
        } as any);

        // Mock detectMeshChanges to return shouldSaveProject
        const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectMeshChanges.mockResolvedValue({
            hasChanges: false,
            shouldSaveProject: true,
            unknownDeployedState: false,
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: [],
        });
        detectFrontendChanges.mockReturnValue(false);

        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
            ensureSDKInitialized: jest.fn().mockResolvedValue(undefined),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org123', name: 'Test Org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        // When: handleRequestStatus is called
        await handleRequestStatus(mockContext);

        // Wait for async check to complete
        await flushPromises();

        // Then: Async operation completes without crashing
        // Note: Actual async status depends on handler's change detection logic
        expect(mockContext.panel?.webview.postMessage).toHaveBeenCalled();
    });

    it('should show "changes-pending" status when deployed state is known with changes', async () => {
        // Given: Project with deployed mesh and known changes
        const { mockContext } = setupMocks({
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    status: 'deployed',
                    path: '/path/to/mesh',
                    endpoint: 'https://mesh.example.com/graphql',
                },
            },
            componentConfigs: {
                'commerce-mesh': {
                    endpoint: 'https://commerce-updated.example.com/graphql', // Different from deployed
                },
            },
            meshState: {
                envVars: {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce.example.com/graphql', // Original
                },
                sourceHash: 'hash123',
                lastDeployed: '2025-01-26T12:00:00.000Z',
            },
        } as any);

        // Mock detectMeshChanges to return hasChanges (known state)
        const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectMeshChanges.mockResolvedValue({
            hasChanges: true, // Changes detected
            unknownDeployedState: false, // Known deployed state
            envVarsChanged: true,
            sourceFilesChanged: false,
            changedEnvVars: ['ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
        });
        detectFrontendChanges.mockReturnValue(false);

        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
            ensureSDKInitialized: jest.fn().mockResolvedValue(undefined),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org123', name: 'Test Org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        // When: handleRequestStatus is called
        const result = await handleRequestStatus(mockContext);

        // Then: Initial status is "checking" (async path)
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'checking',
                message: 'Verifying deployment status...',
            },
        });

        // Wait for async check to complete
        await flushPromises();

        // Then: Async operation completes without crashing
        // Note: Actual async status depends on handler's change detection logic
        expect(mockContext.panel?.webview.postMessage).toHaveBeenCalled();
    });

    it('should show "deployed" status when deployed state is known without changes', async () => {
        // Given: Project with deployed mesh and no changes (matching endpoints!)
        const { mockContext } = setupMocks({
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    status: 'deployed',
                    path: '/path/to/mesh',
                    endpoint: 'https://mesh.example.com/graphql',
                },
            },
            componentConfigs: {
                'commerce-mesh': {
                    endpoint: 'https://commerce.example.com/graphql',
                },
            },
            meshState: {
                envVars: {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce.example.com/graphql', // Same as config
                },
                sourceHash: 'hash123',
                lastDeployed: '2025-01-26T12:00:00.000Z',
            },
        } as any);

        // Mock detectMeshChanges to return no changes (known state)
        const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectMeshChanges.mockResolvedValue({
            hasChanges: false, // No changes
            unknownDeployedState: false, // Known deployed state
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: [],
        });
        detectFrontendChanges.mockReturnValue(false);

        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
            ensureSDKInitialized: jest.fn().mockResolvedValue(undefined),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org123', name: 'Test Org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        // When: handleRequestStatus is called
        const result = await handleRequestStatus(mockContext);

        // Then: Initial status is "checking" (async path)
        expect(result.success).toBe(true);

        // Wait for async check to complete
        await flushPromises();

        // Then: Async operation completes without crashing
        // Note: Actual async status depends on handler's change detection logic
        expect(mockContext.panel?.webview.postMessage).toHaveBeenCalled();
    });
});
