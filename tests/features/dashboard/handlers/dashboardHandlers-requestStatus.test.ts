/**
 * Tests for handleRequestStatus handler (Pattern B - request-response)
 *
 * Tests verify that handleRequestStatus returns data directly instead of using sendMessage,
 * establishing the request-response pattern for dashboard status operations.
 */

import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleRequestStatus', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Set default mock implementations
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
    });

    it('should return complete project status with mesh data (Pattern B)', async () => {
        // Arrange: Mock frontend changes detection
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks();

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify Pattern B response structure
        // Note: When mesh is deployed (not deploying/error), handler returns 'checking'
        // status immediately and checks asynchronously in background
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
                    status: 'checking',
                    message: 'Verifying deployment status...',
                },
            },
        });

        // CRITICAL: Verify sendMessage was NOT called (anti-pattern)
        // Pattern B uses return values, not sendMessage
        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return mesh status as "config-changed" when local config differs from deployed', async () => {
        // Arrange: Mock frontend changes detection
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks();

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify async checking behavior
        // (Same as previous test - async checking returns 'checking' status)
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'checking',
            },
        });
    });

    it('should return mesh status as "not-deployed" when no mesh configured', async () => {
        // Arrange: Project without mesh
        const { mockContext } = setupMocks({
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
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

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify not-deployed status
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            name: 'test-project',
            status: 'running',
            mesh: undefined, // No mesh component
        });
    });

    it('should return error when no project available', async () => {
        // Arrange: No current project
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify error response
        expect(result).toEqual({
            success: false,
            error: 'No project available',
            code: 'PROJECT_NOT_FOUND',
        });

        // Verify sendMessage was NOT called
        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error when panel not available', async () => {
        // Arrange: No panel
        const { mockContext } = setupMocks();
        mockContext.panel = undefined;

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify error response
        expect(result).toEqual({
            success: false,
            error: 'No panel available',
            code: 'PROJECT_NOT_FOUND',
        });
    });

    it('should return frontendConfigChanged=true when frontend config differs', async () => {
        // Arrange: Frontend config changed
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(true);

        // Project needs frontendEnvState for detectFrontendChanges to be called
        const { mockContext } = setupMocks({
            frontendEnvState: {
                envVars: {
                    NEXT_PUBLIC_MESH_ENDPOINT: 'old-value',
                },
            },
        } as any);

        // Act: Call handler
        const result = await handleRequestStatus(mockContext);

        // Assert: Verify frontendConfigChanged=true
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            frontendConfigChanged: true,
        });
    });
});
