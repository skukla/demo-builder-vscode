/**
 * Project Handlers - Create Tests
 *
 * Tests for in-app Adobe I/O App Builder project creation:
 * - handleCreateAdobeProject: create with a permission check that returns an
 *   AUTH_FORBIDDEN-coded error the UI telegraphs inline (no pre-flight probe).
 */

import { handleCreateAdobeProject } from '@/features/authentication/handlers/projectHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { makeJwt, TEST_USER_ID } from '../imsTestTokens';
import { createMockContext } from './projectHandlers.testUtils';

jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/validators/AdobeResourceValidator');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => (error instanceof Error ? error : new Error(String(error)))),
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
        mockContext.authManager.testDeveloperPermissions = jest
            .fn()
            .mockResolvedValue({ hasPermissions: true });
        mockContext.authManager.createProject = jest.fn().mockResolvedValue(PROJECT);
    });

    describe('handleCreateAdobeProject', () => {
        it('returns an error when authManager is missing', async () => {
            const ctx = { ...mockContext, authManager: undefined };

            const result = await handleCreateAdobeProject(ctx, { name: 'My Demo' });

            expect(result).toEqual({ success: false, error: 'Authentication not available' });
        });

        it("a denial carries the service's own reason when it gives one", async () => {
            mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: false,
                error: 'Developer or System Admin role required.',
            });

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.error).toBe('Developer or System Admin role required.');
        });

        it('a denial without a reason falls back to the select-an-existing-project copy', async () => {
            mockContext.authManager.testDeveloperPermissions.mockResolvedValue({ hasPermissions: false });

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.error).toMatch(/do not have permission to create projects/);
            expect(result.error).toMatch(/Select an existing project instead/);
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

        /**
         * REPLACES a test that fed `undefined` and called it "quota/failure".
         *
         * `createProject` returns `AdobeProject | ConsoleOpFailure` and cannot
         * return undefined, so that test asserted on an input the type forbids —
         * and it passed for a reason nobody intended: the handler has no undefined
         * guard, so `project.name` threw a TypeError that the outer catch turned
         * into a generic failure. It therefore duplicated "returns an error when
         * createProject throws" while appearing to cover something else.
         *
         * Meanwhile the failure path production ACTUALLY implements had no test at
         * all. Production's own comment says the quota guess was removed in favour
         * of Console's own reason; this asserts that reason reaches the user.
         */
        it('surfaces Console\'s own reason when createProject reports a failure', async () => {
            mockContext.authManager.createProject.mockResolvedValue({
                error: 'Quota exceeded for this organization',
            });

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Quota exceeded for this organization');
        });

        it('returns the refreshed list ON THE RESPONSE (the caller is unmounted, a push is lost)', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([PROJECT]);

            const result = await handleCreateAdobeProject(mockContext, {
                name: 'My Demo',
                description: 'A demo',
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(PROJECT);
            expect(mockContext.authManager.createProject).toHaveBeenCalledWith('My Demo', 'A demo');
            // The refreshed list goes through the same deletable stamping as
            // get-projects (no token manager on the harness → false).
            expect(result.projects).toEqual([{ ...PROJECT, deletable: false }]);
        });

        it('does NOT push the refresh: the picker unmounts during create, so a push is dropped', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([PROJECT]);

            await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            // `AdobeProjectField` swaps the picker out for the create panel (and the
            // Add Integration flow for a phase spinner), so nothing is listening for
            // `get-projects` at this moment — WebviewClient drops it. `projectSelected`
            // never had a listener at all.
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'get-projects',
                expect.anything()
            );
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'projectSelected',
                expect.anything()
            );
        });

        it('stamps the returned list with ownership (deletable=true for own projects)', async () => {
            const userId = TEST_USER_ID;
            const token = makeJwt({ user_id: userId });
            mockContext.authManager.getTokenManager = jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, expiresIn: 60, token }),
            });
            mockContext.authManager.getProjects.mockResolvedValue([
                { ...PROJECT, who_created: userId },
            ]);

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.projects).toEqual([{ ...PROJECT, who_created: userId, deletable: true }]);
        });

        it('still succeeds when the refresh fetch fails, omitting projects so the caller reloads', async () => {
            mockContext.authManager.getProjects.mockRejectedValue(new Error('adobe down'));

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(PROJECT);
            expect(result.projects).toBeUndefined();
        });

        it('returns an error when createProject throws', async () => {
            mockContext.authManager.createProject.mockRejectedValue(new Error('boom'));

            const result = await handleCreateAdobeProject(mockContext, { name: 'My Demo' });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });
    });
});
