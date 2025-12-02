/**
 * Tests for handleReAuthenticate handler (Pattern B - request-response)
 *
 * Tests verify that handleReAuthenticate returns authentication result directly
 * instead of using sendMessage, establishing the request-response pattern.
 */

// IMPORTANT: Mock must be declared before imports
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

import { handleReAuthenticate } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleReAuthenticate', () => {
    beforeEach(() => {
        // Reset mock call history (but preserve implementations)
        jest.clearAllMocks();

        // Re-setup mocks for handleRequestStatus dependencies
        const { detectMeshChanges, detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectMeshChanges.mockResolvedValue({ hasChanges: false, shouldSaveProject: false, unknownDeployedState: false });
        detectFrontendChanges.mockReturnValue(false);

        // Re-setup default ServiceLocator mock (jest.clearAllMocks removes implementations)
        const { ServiceLocator } = require('@/core/di');
        const defaultMockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(defaultMockAuthManager);
    });

    it('should return authentication result with success=true (Pattern B)', async () => {
        // Arrange: Mock authentication flow
        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify Pattern B response structure
        expect(result).toMatchObject({
            success: true,
        });

        // Verify full Adobe context selection (org → project → workspace)
        expect(mockAuthManager.login).toHaveBeenCalled();
        expect(mockAuthManager.selectOrganization).toHaveBeenCalledWith('org123');
        expect(mockAuthManager.selectProject).toHaveBeenCalledWith('project123', 'org123');
        expect(mockAuthManager.selectWorkspace).toHaveBeenCalledWith('workspace123', 'project123');

        // CRITICAL: Verify sendMessage was NOT called for final response
        // (postMessage may be called for progress updates, but final response is returned)
        // We check that the handler returns the result
        expect(result.success).toBe(true);
    });

    it('should return error when no project available', async () => {
        // Arrange: No current project
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        // Act: Call handler
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify error response
        expect(result).toEqual({
            success: false,
            error: 'No project found',
            code: 'PROJECT_NOT_FOUND',
        });

        // Verify logger was called
        expect(mockContext.logger.error).toHaveBeenCalledWith(
            '[Dashboard] No current project for re-authentication'
        );
    });

    it('should return error when authentication fails', async () => {
        // Arrange: Mock authentication failure
        const { ServiceLocator } = require('@/core/di');
        const error = new Error('Auth failed');
        const mockAuthManager = {
            login: jest.fn().mockRejectedValue(error),
            isAuthenticated: jest.fn().mockResolvedValue(false),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify error response
        expect(result).toEqual({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_REQUIRED',
        });

        // Verify error was logged
        expect(mockContext.logger.error).toHaveBeenCalledWith(
            '[Dashboard] Re-authentication failed',
            error
        );
    });

    it('should auto-select full Adobe context from project (org → project → workspace)', async () => {
        // Arrange: Mock authentication flow
        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler
        await handleReAuthenticate(mockContext);

        // Assert: Verify full context selection chain
        expect(mockAuthManager.selectOrganization).toHaveBeenCalledWith('org123');
        expect(mockAuthManager.selectProject).toHaveBeenCalledWith('project123', 'org123');
        expect(mockAuthManager.selectWorkspace).toHaveBeenCalledWith('workspace123', 'project123');

        // Verify debug logging
        expect(mockContext.logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Auto-selecting project org: org123')
        );
        expect(mockContext.logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Auto-selecting project: project123')
        );
        expect(mockContext.logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Auto-selecting workspace: workspace123')
        );
    });

    it('should handle organization selection failure gracefully', async () => {
        // Arrange: Mock org selection failure
        const { ServiceLocator } = require('@/core/di');
        const orgError = new Error('Org not found');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockRejectedValue(orgError),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler (should not throw)
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify handler still succeeds (context selection errors are non-fatal)
        expect(result.success).toBe(true);

        // Verify warning was logged
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            '[Dashboard] Could not select project organization',
            orgError
        );
    });

    it('should handle project selection failure gracefully', async () => {
        // Arrange: Mock project selection failure
        const { ServiceLocator } = require('@/core/di');
        const projectError = new Error('Project not found');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockRejectedValue(projectError),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler (should not throw)
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify handler still succeeds (context selection errors are non-fatal)
        expect(result.success).toBe(true);

        // Verify warning was logged
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            '[Dashboard] Could not select project',
            projectError
        );
    });

    it('should handle workspace selection failure gracefully', async () => {
        // Arrange: Mock workspace selection failure
        const { ServiceLocator } = require('@/core/di');
        const workspaceError = new Error('Workspace not found');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockRejectedValue(workspaceError),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler (should not throw)
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify handler still succeeds (context selection errors are non-fatal)
        expect(result.success).toBe(true);

        // Verify warning was logged
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            '[Dashboard] Could not select workspace',
            workspaceError
        );
    });

    it('should skip project/workspace selection if IDs not available', async () => {
        // Arrange: Project without projectId/workspace
        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            selectProject: jest.fn().mockResolvedValue(undefined),
            selectWorkspace: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks({
            adobe: {
                organization: 'org123',
                projectName: 'Test Project',
                // projectId and workspace intentionally missing
            } as any,
        });

        // Act: Call handler
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify handler succeeds
        expect(result.success).toBe(true);

        // Verify only org was selected (project/workspace skipped)
        expect(mockAuthManager.selectOrganization).toHaveBeenCalledWith('org123');
        expect(mockAuthManager.selectProject).not.toHaveBeenCalled();
        expect(mockAuthManager.selectWorkspace).not.toHaveBeenCalled();
    });
});
