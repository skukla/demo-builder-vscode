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
        NORMAL: 30000 // Standard API calls (replaces PROJECT_LIST, WORKSPACE_LIST)
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
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'org-123', code: 'C', name: 'Test Org' },
            ]);
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext, { orgId: 'org-123' });

            expect(result.success).toBe(true);
            expect(mockContext.authManager.getProjects).toHaveBeenCalled();
        });

        it('threads the payload orgId through to getProjects', async () => {
            // The named bug: handler used to IGNORE _payload.orgId. It must now
            // pass it to getProjects so the fetch targets that org.
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'org-123', code: 'C', name: 'Test Org' },
            ]);
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            await handleGetProjects(mockContext, { orgId: 'org-123' });

            expect(mockContext.authManager.getProjects).toHaveBeenCalledWith({ orgId: 'org-123' });
        });

        it('sends a structured ORG_MISMATCH message (no terminal string) when org needs re-login', async () => {
            // Target org absent from the selectable list -> needs_relogin.
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'other-org', code: 'O', name: 'Other' },
            ]);
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);

            const result = await handleGetProjects(mockContext, { orgId: 'org-missing' });

            expect(result.success).toBe(false);
            expect(result.code).toBe('ORG_MISMATCH');
            // getProjects must NOT be called when targeting can't be established.
            expect(mockContext.authManager.getProjects).not.toHaveBeenCalled();
            // The structured message must carry the code + targetOrg, never the terminal instruction.
            const errorCall = mockContext.sendMessage.mock.calls.find(
                (c: unknown[]) => c[0] === 'get-projects' && (c[1] as { error?: string })?.error,
            );
            expect(errorCall).toBeDefined();
            const payload = errorCall![1] as { error: string; code: string; targetOrg?: { id: string } };
            expect(payload.code).toBe('ORG_MISMATCH');
            expect(payload.targetOrg).toEqual({ id: 'org-missing' });
            expect(payload.error).not.toContain('aio console org select');
            expect(payload.error.toLowerCase()).not.toContain('terminal');
        });

        it('fetches normally when no orgId is in the payload (back-compat)', async () => {
            mockContext.authManager.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.authManager.getProjects).toHaveBeenCalledWith();
            expect(mockContext.authManager.getOrganizations).not.toHaveBeenCalled();
        });
    });
});
