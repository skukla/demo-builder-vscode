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
import * as securityValidation from '@/core/validation';

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
            // The current org is selectable by default so ensureOrgContext returns ok.
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'org-123', code: 'ORG123@AdobeOrg', name: 'Test Organization' }
            ]);
        });

        it('should accept the project selection without mutating the aio global', async () => {
            const projectId = 'proj-123';

            const result = await handleSelectProject(mockContext, { projectId });

            expect(result.success).toBe(true);
            // Phase 4a: selection is webview state threaded per-op; the handler
            // validates org reachability via ensureOrgContext but MUST NOT mutate
            // the shared `aio` global via selectProject.
            expect(mockContext.authManager.selectProject).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('projectSelected', { projectId });
        });

        it('should validate project ID before accepting', async () => {
            const projectId = 'proj-123';

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

        it('routes through ensureOrgContext and sends ORG_MISMATCH when target org needs re-login', async () => {
            const projectId = 'proj-123';
            // Current org is selectable in getCurrentOrganization, but the selectable
            // list does NOT contain it -> needs_relogin escalation.
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'different-org', code: 'D', name: 'Different' },
            ]);
            mockContext.authManager.selectProject.mockResolvedValue(true);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow();

            // Must NOT proceed to select the project under a wrong-org context.
            expect(mockContext.authManager.selectProject).not.toHaveBeenCalled();
            const errorCall = mockContext.sendMessage.mock.calls.find(
                (c: unknown[]) => c[0] === 'error',
            );
            expect(errorCall).toBeDefined();
            const payload = errorCall![1] as { details?: string; code?: string };
            expect(payload.code).toBe('ORG_MISMATCH');
            expect(payload.details ?? '').not.toContain('aio console org select');
        });

        it('accepts the selection (no global mutation) when target org is selectable', async () => {
            const projectId = 'proj-123';
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'org-123', code: 'ORG123@AdobeOrg', name: 'Test Organization' },
            ]);

            const result = await handleSelectProject(mockContext, { projectId });

            expect(result.success).toBe(true);
            expect(mockContext.authManager.selectProject).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('projectSelected', { projectId });
        });

        it('should log debug messages on send error', async () => {
            const projectId = 'proj-123';
            const sendError = new Error('Failed to send message');
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
