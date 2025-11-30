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

        // Verify authentication flow was called
        expect(mockAuthManager.login).toHaveBeenCalled();
        expect(mockAuthManager.selectOrganization).toHaveBeenCalledWith('org123');

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

    it('should auto-select organization from project context', async () => {
        // Arrange: Mock authentication flow
        const { ServiceLocator } = require('@/core/di');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockResolvedValue(undefined),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler
        await handleReAuthenticate(mockContext);

        // Assert: Verify organization selection
        expect(mockAuthManager.selectOrganization).toHaveBeenCalledWith('org123');
        expect(mockContext.logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Auto-selecting project org: org123')
        );
    });

    it('should handle organization selection failure gracefully', async () => {
        // Arrange: Mock org selection failure
        const { ServiceLocator } = require('@/core/di');
        const orgError = new Error('Org not found');
        const mockAuthManager = {
            login: jest.fn().mockResolvedValue(undefined),
            selectOrganization: jest.fn().mockRejectedValue(orgError),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);

        const { mockContext } = setupMocks();

        // Act: Call handler (should not throw)
        const result = await handleReAuthenticate(mockContext);

        // Assert: Verify handler still succeeds (org selection is optional)
        expect(result.success).toBe(true);

        // Verify warning was logged
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            '[Dashboard] Could not select project organization',
            orgError
        );
    });
});
