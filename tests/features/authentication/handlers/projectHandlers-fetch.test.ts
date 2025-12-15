/**
 * Project Handlers - Fetch Tests
 *
 * Tests for project fetching operations:
 * - handleGetProjects: Fetch projects for current organization
 * - Loading states and progress indicators
 * - Error handling for fetch operations
 */

import { handleGetProjects } from '@/features/authentication/handlers/projectHandlers';
import { createMockContext, mockProjects, mockOrganization } from './projectHandlers.testUtils';

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

describe('projectHandlers - Fetch', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleGetProjects', () => {
        it('should fetch projects successfully', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockProjects);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', mockProjects);
        });

        it('should show loading status before fetching', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            await handleGetProjects(mockContext);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('project-loading-status', {
                isLoading: true,
                message: 'Loading your Adobe projects...',
                subMessage: 'Fetching from organization: Test Org'
            });
        });

        it('should handle empty project list', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue([]);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
        });

        it('should handle timeout error', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(false);
            // Typed error system converts timeout to user-friendly message
            expect(result.error).toBeDefined();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', {
                error: expect.any(String),
                code: 'TIMEOUT', // Typed error includes error code
            });
        });

        it('should handle generic error', async () => {
            const error = new Error('Network error');
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(error);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to load projects. Please try again.');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to get projects:',
                error
            );
        });

        it('should handle payload with orgId', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext, { orgId: 'org-123' });

            expect(result.success).toBe(true);
            expect(mockContext.authManager.getProjects).toHaveBeenCalled();
        });
    });
});
