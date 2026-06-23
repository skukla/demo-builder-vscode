/**
 * Project Handlers - Create Tests
 *
 * Tests for in-app Adobe I/O App Builder project creation:
 * - handleCanCreateAdobeProject: permission probe (decides Flow A vs fallback Flow B)
 * - handleCreateAdobeProject: Flow A create (with defensive permission re-check)
 */

import {
    handleCanCreateAdobeProject,
    handleCreateAdobeProject,
} from '@/features/authentication/handlers/projectHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockContext } from './projectHandlers.testUtils';

jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str)),
}));
jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { NORMAL: 30000 } }));
jest.mock('@/core/utils/promiseUtils', () => ({ withTimeout: jest.fn((promise) => promise) }));

const PROJECT = { id: 'proj-new', name: 'My Demo', title: 'My Demo' };

describe('projectHandlers - Create', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        mockContext.authManager.testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions: true });
        mockContext.authManager.createProject = jest.fn().mockResolvedValue(PROJECT);
    });

    describe('handleCanCreateAdobeProject (permission probe)', () => {
        it('reports canCreate=true when the user has developer permissions', async () => {
            mockContext.authManager.testDeveloperPermissions.mockResolvedValue({ hasPermissions: true });

            const result = await handleCanCreateAdobeProject(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ canCreate: true, reason: undefined });
        });

        it('reports canCreate=false with the reason when permission is denied', async () => {
            mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: false,
                error: 'Developer or System Admin role required.',
            });

            const result = await handleCanCreateAdobeProject(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                canCreate: false,
                reason: 'Developer or System Admin role required.',
            });
        });

        it('degrades gracefully (canCreate=false) when authManager is missing', async () => {
            const ctx = { ...mockContext, authManager: undefined } as any;

            const result = await handleCanCreateAdobeProject(ctx);

            expect(result.success).toBe(true);
            expect((result.data as any).canCreate).toBe(false);
        });
    });

    describe('handleCreateAdobeProject (Flow A)', () => {
        it('returns an error when authManager is missing', async () => {
            const ctx = { ...mockContext, authManager: undefined } as any;

            const result = await handleCreateAdobeProject(ctx, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });

        it('returns a permission-typed error and does NOT create when permission is denied', async () => {
            mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: false,
                error: 'Developer or System Admin role required.',
            });

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.code).toBe(ErrorCode.AUTH_FORBIDDEN);
            expect(mockContext.authManager.createProject).not.toHaveBeenCalled();
        });

        it('returns an error for an empty name and does NOT create', async () => {
            const result = await handleCreateAdobeProject(mockContext, { name: '   ' });

            expect(result.success).toBe(false);
            expect(mockContext.authManager.createProject).not.toHaveBeenCalled();
        });

        it('returns a failure message when createProject returns undefined (quota/failure)', async () => {
            mockContext.authManager.createProject.mockResolvedValue(undefined);

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });

        it('creates, refreshes the list, acks the selection, and returns the project', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([PROJECT]);

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo', description: 'A demo' });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(PROJECT);
            expect(mockContext.authManager.createProject).toHaveBeenCalledWith('My Demo', 'A demo');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', [PROJECT]);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('projectSelected', { projectId: 'proj-new' });
        });

        it('returns an error when createProject throws', async () => {
            mockContext.authManager.createProject.mockRejectedValue(new Error('boom'));

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });
    });
});
