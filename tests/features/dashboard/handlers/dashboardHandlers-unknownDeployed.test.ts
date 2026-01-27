/**
 * Tests for handleRequestStatus - persisted mesh status reading
 *
 * Tests verify that handleRequestStatus reads meshStatusSummary from
 * persisted state and maps it to dashboard mesh status format.
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
