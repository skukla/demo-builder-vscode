/**
 * Tests for handleOpenDevConsole handler - Security Tests
 *
 * Tests verify that Adobe IDs are validated before constructing URLs
 * to prevent path traversal and injection attacks.
 */

import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleOpenDevConsole - Security Tests', () => {
    beforeEach(() => {
        // Reset mocks and set default implementations
        jest.clearAllMocks();

        const { validateOrgId, validateProjectId, validateWorkspaceId, validateURL } = require('@/core/validation');

        // Reset to default no-op implementations (valid by default)
        validateOrgId.mockImplementation(() => undefined);
        validateProjectId.mockImplementation(() => undefined);
        validateWorkspaceId.mockImplementation(() => undefined);
        validateURL.mockImplementation(() => undefined);
    });

    it('should validate Adobe IDs before constructing workspace URL', async () => {
        // Given: Project with all Adobe IDs
        const { mockContext } = setupMocks({
            adobe: {
                organization: 'valid-org-123',
                projectId: 'valid-project-456',
                workspace: 'valid-workspace-789',
                projectName: 'Test Project',
                authenticated: true,
            },
        } as any);

        const { validateOrgId, validateProjectId, validateWorkspaceId, validateURL } = require('@/core/validation');

        // When: Handler is called
        const result = await (await import('@/features/dashboard/handlers/dashboardHandlers')).handleOpenDevConsole(mockContext);

        // Then: All IDs were validated before URL construction
        expect(validateOrgId).toHaveBeenCalledWith('valid-org-123');
        expect(validateProjectId).toHaveBeenCalledWith('valid-project-456');
        expect(validateWorkspaceId).toHaveBeenCalledWith('valid-workspace-789');
        expect(validateURL).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('should reject malicious organization ID', async () => {
        // Given: Project with malicious org ID (path traversal attempt)
        const { mockContext } = setupMocks({
            adobe: {
                organization: '../../../etc/passwd',
                projectId: 'valid-project-456',
                workspace: 'valid-workspace-789',
                projectName: 'Test Project',
                authenticated: true,
            },
        } as any);

        const { validateOrgId } = require('@/core/validation');
        validateOrgId.mockImplementation(() => {
            throw new Error('Invalid organization ID: contains illegal characters');
        });

        // When: Handler is called
        const result = await (await import('@/features/dashboard/handlers/dashboardHandlers')).handleOpenDevConsole(mockContext);

        // Then: Request fails with validation error
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid Adobe resource ID');
        expect(mockContext.logger.error).toHaveBeenCalledWith(
            '[Dev Console] Adobe ID validation failed',
            expect.any(Error)
        );
    });

    it('should validate project ID before constructing project-only URL', async () => {
        // Given: Project with org and project but no workspace
        const { mockContext } = setupMocks({
            adobe: {
                organization: 'valid-org-123',
                projectId: 'valid-project-456',
                projectName: 'Test Project',
                authenticated: true,
            },
        } as any);

        const { validateOrgId, validateProjectId, validateURL } = require('@/core/validation');

        // When: Handler is called
        const result = await (await import('@/features/dashboard/handlers/dashboardHandlers')).handleOpenDevConsole(mockContext);

        // Then: Org and project IDs validated (no workspace)
        expect(validateOrgId).toHaveBeenCalledWith('valid-org-123');
        expect(validateProjectId).toHaveBeenCalledWith('valid-project-456');
        expect(validateURL).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('should use generic URL when no Adobe IDs present', async () => {
        // Given: Project without Adobe configuration
        const { mockContext } = setupMocks({
            adobe: undefined,
        } as any);

        const { validateURL } = require('@/core/validation');

        // When: Handler is called
        const result = await (await import('@/features/dashboard/handlers/dashboardHandlers')).handleOpenDevConsole(mockContext);

        // Then: Generic URL used (no ID validation needed)
        expect(validateURL).toHaveBeenCalledWith('https://developer.adobe.com/console');
        expect(result.success).toBe(true);
    });
});
