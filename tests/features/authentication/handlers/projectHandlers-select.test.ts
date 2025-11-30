/**
 * Project Handlers - Selection Tests
 *
 * Tests for project selection operations:
 * - handleSelectProject: Select a specific project
 * - Project ID validation
 * - Selection state management
 */

import { handleSelectProject } from '@/features/authentication/handlers/projectHandlers';
import { createMockContext } from './projectHandlers.testUtils';
import * as securityValidation from '@/core/validation/securityValidation';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/securityValidation');
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

describe('projectHandlers - Selection', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();

        // Reset security validation to valid by default
        (securityValidation.validateProjectId as jest.Mock).mockImplementation(() => {
            // Valid by default
        });
    });

    describe('handleSelectProject', () => {
        beforeEach(() => {
            // Mock getCurrentOrganization for context guard
            mockContext.authManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                code: 'ORG123@AdobeOrg',
                name: 'Test Organization'
            });
        });

        it('should select project successfully', async () => {
            const projectId = 'proj-123';
            mockContext.authManager.selectProject.mockResolvedValue(true);

            const result = await handleSelectProject(mockContext, { projectId });

            expect(result.success).toBe(true);
            // selectProject requires orgId for context guard
            expect(mockContext.authManager.selectProject).toHaveBeenCalledWith(projectId, 'org-123');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('projectSelected', { projectId });
            expect(mockContext.logger.info).toHaveBeenCalledWith(`Selected project: ${projectId}`);
        });

        it('should validate project ID before selection', async () => {
            const projectId = 'proj-123';
            mockContext.authManager.selectProject.mockResolvedValue(true);

            await handleSelectProject(mockContext, { projectId });

            expect(securityValidation.validateProjectId).toHaveBeenCalledWith(projectId);
        });

        it('should fail if no organization is selected', async () => {
            const projectId = 'proj-123';
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(null);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'No organization selected'
            );
            expect(mockContext.authManager.selectProject).not.toHaveBeenCalled();
        });

        it('should reject invalid project ID', async () => {
            const projectId = '../../../etc/passwd';
            const validationError = new Error('Invalid project ID');
            (securityValidation.validateProjectId as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'Invalid project ID'
            );

            expect(mockContext.authManager.selectProject).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project] Invalid project ID',
                validationError
            );
        });

        it('should handle selection failure', async () => {
            const projectId = 'proj-123';
            mockContext.authManager.selectProject.mockResolvedValue(false);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                `Failed to select project ${projectId}`
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                `Failed to select project ${projectId}`
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select project',
                details: expect.stringContaining('unsuccessful')
            });
        });

        it('should handle authManager error', async () => {
            const projectId = 'proj-123';
            const error = new Error('Network timeout');
            mockContext.authManager.selectProject.mockRejectedValue(error);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'Network timeout'
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to select project:',
                error
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select project',
                details: 'Network timeout'
            });
        });

        it('should log debug messages on send error', async () => {
            const projectId = 'proj-123';
            const sendError = new Error('Failed to send message');
            mockContext.authManager.selectProject.mockResolvedValue(true);
            mockContext.sendMessage.mockRejectedValueOnce(sendError);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'Failed to send project selection response'
            );

            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                '[Project] Failed to send projectSelected message:',
                sendError
            );
        });
    });
});
