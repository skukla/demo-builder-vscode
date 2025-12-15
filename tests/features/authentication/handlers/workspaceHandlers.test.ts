/**
 * Workspace Handlers Tests
 *
 * Tests for Adobe workspace management:
 * - handleGetWorkspaces: Fetch workspaces for current project
 * - handleSelectWorkspace: Select a specific workspace
 */

import {
    handleGetWorkspaces,
    handleSelectWorkspace
} from '@/features/authentication/handlers/workspaceHandlers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import * as securityValidation from '@/core/validation/securityValidation';

// Mock dependencies
jest.mock('@/core/validation/securityValidation');
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        WORKSPACE_LIST: 30000
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('workspaceHandlers', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockAuthManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock authentication manager
        mockAuthManager = {
            getCurrentProject: jest.fn(),
            getWorkspaces: jest.fn(),
            selectWorkspace: jest.fn()
        };

        // Create mock context
        mockContext = {
            authManager: mockAuthManager,
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn()
            } as any,
            debugLogger: {
                trace: jest.fn(),
                debug: jest.fn()
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sharedState: {
                isAuthenticating: false
            }
        } as any;
    });

    describe('handleGetWorkspaces', () => {
        const mockWorkspaces = [
            { id: 'ws-1', name: 'Production', title: 'Production Workspace' },
            { id: 'ws-2', name: 'Stage', title: 'Staging Workspace' }
        ];

        it('should fetch workspaces successfully', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            const result = await handleGetWorkspaces(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockWorkspaces);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-workspaces', mockWorkspaces);
        });

        it('should show loading status before fetching', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project Title'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            await handleGetWorkspaces(mockContext);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('workspace-loading-status', {
                isLoading: true,
                message: 'Loading workspaces...',
                subMessage: 'Fetching from project: Test Project Title'
            });
        });

        it('should use project name if title is not available', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            await handleGetWorkspaces(mockContext);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('workspace-loading-status', {
                isLoading: true,
                message: 'Loading workspaces...',
                subMessage: 'Fetching from project: Test Project'
            });
        });

        it('should handle empty workspace list', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue([]);

            const result = await handleGetWorkspaces(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
        });

        it('should handle timeout error', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });

            mockAuthManager.getWorkspaces.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetWorkspaces(mockContext);

            expect(result.success).toBe(false);
            // Typed error system converts timeout to user-friendly message
            expect(result.error).toBeDefined();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-workspaces', {
                error: expect.any(String),
                code: 'TIMEOUT', // Typed error includes error code
            });
        });

        it('should handle generic error', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });

            const error = new Error('Network error');
            mockAuthManager.getWorkspaces.mockRejectedValue(error);

            const result = await handleGetWorkspaces(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to load workspaces. Please try again.');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Workspace] Failed to get workspaces:',
                expect.any(Object)
            );
        });

        it('should handle payload with orgId and projectId', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            const result = await handleGetWorkspaces(mockContext, {
                orgId: 'org-123',
                projectId: 'proj-123'
            });

            expect(result.success).toBe(true);
            expect(mockAuthManager.getWorkspaces).toHaveBeenCalled();
        });

        it('should handle error when no current project', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue(null);
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            const result = await handleGetWorkspaces(mockContext);

            // Should still succeed but might not show loading message
            expect(result.success).toBe(true);
        });
    });

    describe('handleSelectWorkspace', () => {
        beforeEach(() => {
            (securityValidation.validateWorkspaceId as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
            // Mock getCurrentProject for context guard
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
        });

        it('should select workspace successfully', async () => {
            const workspaceId = 'ws-123';
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            const result = await handleSelectWorkspace(mockContext, { workspaceId });

            expect(result.success).toBe(true);
            // selectWorkspace requires projectId for context guard
            expect(mockAuthManager.selectWorkspace).toHaveBeenCalledWith(workspaceId, 'proj-123');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('workspaceSelected', {
                workspaceId
            });
            // Note: Selection logging moved to adobeEntityService (logs with workspace name)
        });

        it('should validate workspace ID before selection', async () => {
            const workspaceId = 'ws-123';
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            await handleSelectWorkspace(mockContext, { workspaceId });

            expect(securityValidation.validateWorkspaceId).toHaveBeenCalledWith(workspaceId);
        });

        it('should reject invalid workspace ID', async () => {
            const workspaceId = '../../../etc/passwd';
            const validationError = new Error('Invalid workspace ID');
            (securityValidation.validateWorkspaceId as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            await expect(handleSelectWorkspace(mockContext, { workspaceId })).rejects.toThrow(
                'Invalid workspace ID'
            );

            expect(mockAuthManager.selectWorkspace).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Workspace] Invalid workspace ID',
                validationError
            );
        });

        it('should handle selection failure', async () => {
            const workspaceId = 'ws-123';
            mockAuthManager.selectWorkspace.mockResolvedValue(false);

            await expect(handleSelectWorkspace(mockContext, { workspaceId })).rejects.toThrow(
                `Failed to select workspace ${workspaceId}`
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                `[Workspace] Failed to select workspace ${workspaceId}`
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select workspace',
                details: expect.stringContaining('unsuccessful')
            });
        });

        it('should handle authManager error', async () => {
            const workspaceId = 'ws-123';
            const error = new Error('Network timeout');
            mockAuthManager.selectWorkspace.mockRejectedValue(error);

            await expect(handleSelectWorkspace(mockContext, { workspaceId })).rejects.toThrow(
                'Network timeout'
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Workspace] Failed to select workspace:',
                error
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select workspace',
                details: 'Network timeout'
            });
        });

        it('should handle special characters in workspace ID', async () => {
            const workspaceId = 'ws-123-prod';
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            const result = await handleSelectWorkspace(mockContext, { workspaceId });

            expect(result.success).toBe(true);
            expect(securityValidation.validateWorkspaceId).toHaveBeenCalledWith(workspaceId);
        });

        it('should handle very long workspace IDs', async () => {
            const workspaceId = 'ws-' + 'a'.repeat(100);
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            const result = await handleSelectWorkspace(mockContext, { workspaceId });

            expect(result.success).toBe(true);
            // selectWorkspace requires projectId for context guard
            expect(mockAuthManager.selectWorkspace).toHaveBeenCalledWith(workspaceId, 'proj-123');
        });

        it('should fail if no project is selected', async () => {
            const workspaceId = 'ws-123';
            mockAuthManager.getCurrentProject.mockResolvedValue(null);

            await expect(handleSelectWorkspace(mockContext, { workspaceId })).rejects.toThrow(
                'No project selected'
            );
            expect(mockAuthManager.selectWorkspace).not.toHaveBeenCalled();
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete workspace selection flow', async () => {
            const mockWorkspaces = [
                { id: 'ws-1', name: 'Production', title: 'Production' },
                { id: 'ws-2', name: 'Stage', title: 'Stage' }
            ];

            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(mockWorkspaces);

            // Get workspaces
            const getResult = await handleGetWorkspaces(mockContext);
            expect(getResult.success).toBe(true);
            expect(getResult.data).toEqual(mockWorkspaces);

            // Select workspace
            (securityValidation.validateWorkspaceId as jest.Mock).mockImplementation(() => {});
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            const selectResult = await handleSelectWorkspace(mockContext, { workspaceId: 'ws-1' });
            expect(selectResult.success).toBe(true);
        });

        it('should handle project change invalidating workspace cache', async () => {
            // First project
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-1',
                name: 'Project 1',
                title: 'Project 1'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue([
                { id: 'ws-1', name: 'WS1', title: 'WS1' }
            ]);

            await handleGetWorkspaces(mockContext);

            // Second project (different workspaces)
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-2',
                name: 'Project 2',
                title: 'Project 2'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue([
                { id: 'ws-2', name: 'WS2', title: 'WS2' }
            ]);

            const result = await handleGetWorkspaces(mockContext);

            expect(result.data).toEqual([
                { id: 'ws-2', name: 'WS2', title: 'WS2' }
            ]);
        });
    });

    describe('Error Message Formatting', () => {
        it('should format timeout errors correctly', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetWorkspaces(mockContext);

            // Typed error system converts timeout to user-friendly message
            expect(result.error).toBeDefined();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-workspaces', {
                error: expect.any(String),
                code: 'TIMEOUT', // Typed error includes error code
            });
        });

        it('should provide generic error message for non-timeout errors', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockRejectedValue(new Error('Some other error'));

            const result = await handleGetWorkspaces(mockContext);

            expect(result.error).toBe('Failed to load workspaces. Please try again.');
        });
    });

    describe('Edge Cases', () => {
        it('should handle null workspace list', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(null as any);

            const result = await handleGetWorkspaces(mockContext);

            // Should handle gracefully
            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should handle undefined workspace list', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue(undefined as any);

            const result = await handleGetWorkspaces(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toBeUndefined();
        });

        it('should handle workspace selection with empty string ID', async () => {
            const workspaceId = '';
            (securityValidation.validateWorkspaceId as jest.Mock).mockImplementation(() => {
                throw new Error('Workspace ID cannot be empty');
            });

            await expect(handleSelectWorkspace(mockContext, { workspaceId })).rejects.toThrow(
                'Invalid workspace ID'
            );
        });

        it('should handle concurrent workspace fetches', async () => {
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.getWorkspaces.mockResolvedValue([
                { id: 'ws-1', name: 'WS1', title: 'WS1' }
            ]);

            // Fetch workspaces concurrently
            const [result1, result2] = await Promise.all([
                handleGetWorkspaces(mockContext),
                handleGetWorkspaces(mockContext)
            ]);

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(mockAuthManager.getWorkspaces).toHaveBeenCalledTimes(2);
        });
    });

    describe('Cache Invalidation', () => {
        it('should note that cache invalidation is handled in authManager', async () => {
            const workspaceId = 'ws-123';
            (securityValidation.validateWorkspaceId as jest.Mock).mockImplementation(() => {});
            mockAuthManager.getCurrentProject.mockResolvedValue({
                id: 'proj-123',
                name: 'Test Project',
                title: 'Test Project'
            });
            mockAuthManager.selectWorkspace.mockResolvedValue(true);

            await handleSelectWorkspace(mockContext, { workspaceId });

            // Cache invalidation happens in authManager.selectWorkspace
            // This handler doesn't need to do it explicitly
            // selectWorkspace requires projectId for context guard
            expect(mockAuthManager.selectWorkspace).toHaveBeenCalledWith(workspaceId, 'proj-123');
        });
    });
});
