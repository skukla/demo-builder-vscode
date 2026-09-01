/**
 * Tests for handleRequestStatus - persisted mesh status reading
 *
 * Tests verify that handleRequestStatus reads meshStatusSummary from
 * persisted state and maps it to dashboard mesh status format.
 */

// IMPORTANT: Mock must be declared before imports
jest.mock('@/core/di/serviceLocator', () => ({
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

describe('dashboardHandlers - handleRequestStatus - persisted mesh status', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show "not-deployed" when meshStatusSummary is not-deployed', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'not-deployed',
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'not-deployed',
            },
        });
    });

    it('should show "config-changed" when meshStatusSummary is stale', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'stale',
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'config-changed',
            },
        });
    });

    it('should show "deployed" when meshStatusSummary is deployed', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'deployed',
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'deployed',
            },
        });
    });

    it('should show "config-incomplete" when meshStatusSummary is config-incomplete', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'config-incomplete',
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'config-incomplete',
            },
        });
    });

    it('should show "needs-auth" when not authenticated, regardless of persisted status', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'deployed',
        } as any);

        // Override auth mock AFTER setupMocks (which sets isAuthenticated=true)
        const { ServiceLocator } = require('@/core/di/serviceLocator');
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

    // REGRESSION: this handler read ONLY meshStatusSummary, and the deploy
    // failure path never moved that field off its last success — so a mesh that
    // had just failed to deploy was announced as "deployed", rendering as
    // "Mesh Deployed" with a green dot. sendDemoStatusUpdate had always checked
    // the component entry first; the two handlers disagreed about the same mesh
    // depending on which message landed last.
    describe('a failed mesh component beats the persisted summary', () => {
        function withFailedMesh(summary: string) {
            const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
            detectFrontendChanges.mockReturnValue(false);
            const { mockContext, mockProject } = setupMocks({ meshStatusSummary: summary } as any);
            mockProject.componentInstances!['commerce-mesh'].status = 'error';
            return mockContext;
        }

        it('reports "error" even while the summary still says deployed', async () => {
            const result = await handleRequestStatus(withFailedMesh('deployed'));

            expect(result.success).toBe(true);
            expect(result.data).toMatchObject({ mesh: { status: 'error' } });
        });

        it('reports "error" without waiting on auth (matching sendDemoStatusUpdate)', async () => {
            const mockContext = withFailedMesh('deployed');
            const { ServiceLocator } = require('@/core/di/serviceLocator');
            ServiceLocator.getAuthenticationService.mockReturnValue({
                isAuthenticated: jest.fn().mockResolvedValue(false),
            });

            const result = await handleRequestStatus(mockContext);

            // A known local failure needs no network identity to report.
            expect(result.data).toMatchObject({ mesh: { status: 'error' } });
        });
    });

    it('should default to "deployed" when meshStatusSummary is unknown', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'unknown',
        } as any);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'deployed',
            },
        });
    });
});
