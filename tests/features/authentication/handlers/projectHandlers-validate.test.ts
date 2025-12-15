/**
 * Project Handlers - Validation Tests
 *
 * Tests for organization validation and error message formatting:
 * - handleEnsureOrgSelected: Verify organization is selected
 * - Error message formatting for various scenarios
 */

import { handleEnsureOrgSelected, handleGetProjects } from '@/features/authentication/handlers/projectHandlers';
import { createMockContext, mockOrganization } from './projectHandlers.testUtils';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str))
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        PROJECT_LIST: 30000,
        WORKSPACE_LIST: 30000
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('projectHandlers - Validation', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleEnsureOrgSelected', () => {
        it('should return success when organization is selected', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('orgSelectionStatus', {
                hasOrg: true
            });
        });

        it('should return false hasOrg when no organization selected', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(null);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('orgSelectionStatus', {
                hasOrg: false
            });
        });

        it('should handle errors gracefully', async () => {
            const error = new Error('Failed to get org');
            mockContext.authManager.getCurrentOrganization.mockRejectedValue(error);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to ensure org selected:',
                error
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to check organization selection',
                details: 'Failed to get org'
            });
        });

        it('should handle undefined org gracefully', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(undefined);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(false);
        });
    });

    describe('Error Message Formatting', () => {
        it('should format timeout errors correctly', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetProjects(mockContext);

            // Typed error system converts timeout to user-friendly message
            expect(result.error).toBeDefined();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', {
                error: expect.any(String),
                code: 'TIMEOUT', // Typed error includes error code
            });
        });

        it('should provide generic error message for non-timeout errors', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(new Error('Some other error'));

            const result = await handleGetProjects(mockContext);

            expect(result.error).toBe('Failed to load projects. Please try again.');
        });
    });
});
