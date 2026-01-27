/**
 * Tests for handleRequestStatus handler (Pattern B - request-response)
 *
 * Tests verify that handleRequestStatus reads persisted meshStatusSummary
 * instead of re-checking, returning data directly via Pattern B.
 */

// IMPORTANT: Mocks must be declared before imports
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    verifyMeshDeployment: jest.fn().mockResolvedValue(undefined),
    syncMeshStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));
jest.mock('vscode', () => ({
    window: { activeColorTheme: { kind: 1 } },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: { executeCommand: jest.fn() },
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleRequestStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
    });

    it('should return persisted mesh status from meshStatusSummary (Pattern B)', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        // Project has meshStatusSummary='deployed' (set by card grid)
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result).toMatchObject({
            success: true,
            data: {
                name: 'test-project',
                path: '/path/to/project',
                status: 'running',
                port: 3000,
                adobeOrg: 'org123',
                adobeProject: 'Test Project',
                frontendConfigChanged: false,
                mesh: {
                    status: 'deployed',
                },
            },
        });

        // CRITICAL: Verify sendMessage was NOT called (anti-pattern)
        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return "config-changed" when meshStatusSummary is stale', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({ meshStatusSummary: 'stale' } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'config-changed',
            },
        });
    });

    it('should return mesh status as "not-deployed" when no mesh configured', async () => {
        const { mockContext } = setupMocks({
            componentInstances: {
                'headless': {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
            },
            meshState: undefined,
        } as any);

        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            name: 'test-project',
            status: 'running',
            mesh: undefined, // No mesh component
        });
    });

    it('should return error when no project available', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        const result = await handleRequestStatus(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No project available',
            code: 'PROJECT_NOT_FOUND',
        });

        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error when panel not available', async () => {
        const { mockContext } = setupMocks();
        mockContext.panel = undefined;

        const result = await handleRequestStatus(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No panel available',
            code: 'PROJECT_NOT_FOUND',
        });
    });

    it('should return frontendConfigChanged=true when frontend config differs', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(true);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'deployed',
            frontendEnvState: {
                envVars: {
                    NEXT_PUBLIC_MESH_ENDPOINT: 'old-value',
                },
            },
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            frontendConfigChanged: true,
        });
    });

    it('should return needs-auth when not authenticated', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks();

        // Override auth mock AFTER setupMocks (which sets isAuthenticated=true)
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'needs-auth',
            },
        });
    });
});
