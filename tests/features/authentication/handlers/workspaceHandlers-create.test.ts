/**
 * Workspace Handlers - Create Tests
 *
 * Tests for in-app Adobe I/O workspace creation:
 * - handleCreateAdobeWorkspace: create with a permission check that returns an
 *   AUTH_FORBIDDEN-coded error the UI telegraphs inline (no pre-flight probe).
 */

import { handleCreateAdobeWorkspace } from '@/features/authentication/handlers/workspaceHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
jest.mock('@/core/validation/validators/AdobeResourceValidator');

const WS = { id: 'ws-new', name: 'Stage', title: 'Stage' };

function createContext() {
    /**
     * `authManager` was declared `any` and the whole context cast `as any` — two
     * erasures in one twelve-line factory, which is why nine calls in this suite
     * were checked against nothing.
     *
     * It is re-attached below so its MOCK type survives: read back through
     * `HandlerContext` the members are plain functions, and these tests call
     * `.mockResolvedValue` on them.
     */
    const authManager = createMockAuthenticationService({
        testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        createWorkspace: jest.fn().mockResolvedValue(WS),
        getWorkspaces: jest.fn().mockResolvedValue([WS]),
    });
    const base = createMockHandlerContext({
        authManager,
        logger: createMockLogger(),
        // The DEBUG logger is `Logger`-shaped — the same builder is the right fake.
        debugLogger: createMockLogger(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
    });
    return { ...base, authManager };
}

describe('workspaceHandlers - Create', () => {
    let mockContext: ReturnType<typeof createContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createContext();
    });

    it('returns an error when authManager is missing', async () => {
        const ctx = { ...mockContext, authManager: undefined };

        const result = await handleCreateAdobeWorkspace(ctx, { name: 'Stage' });

        // The guard's OWN verdict — not the TypeError the try/catch would otherwise
        // wrap as "Failed to create workspace: Cannot read properties of undefined".
        expect(result).toEqual({ success: false, error: 'Authentication not available' });
        expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
    });

    it('treats a missing payload as an empty name rather than throwing', async () => {
        const result = await handleCreateAdobeWorkspace(
            mockContext,
            undefined as unknown as Parameters<typeof handleCreateAdobeWorkspace>[1],
        );

        expect(result).toEqual({ success: false, error: 'Workspace name is required.' });
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    it('returns a permission-typed error and does NOT create when permission is denied', async () => {
        mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
            error: 'Developer or System Admin role required.',
        });

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        // Console's own reason travels verbatim; the generic sentence is a fallback only.
        expect(result).toEqual({
            success: false,
            code: ErrorCode.AUTH_FORBIDDEN,
            error: 'Developer or System Admin role required.',
        });
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    it('falls back to the generic permission sentence when the probe gives no reason', async () => {
        mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
        });

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result).toEqual({
            success: false,
            code: ErrorCode.AUTH_FORBIDDEN,
            error:
                'You do not have permission to create workspaces in this organization. ' +
                'Select an existing workspace instead.',
        });
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    it('returns an error for an empty name and does NOT create', async () => {
        const result = await handleCreateAdobeWorkspace(mockContext, { name: '   ' });

        expect(result.success).toBe(false);
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    /**
     * REPLACES a test that fed `undefined` and called it "quota/failure" — the exact
     * twin of the one removed from `projectHandlers-create` earlier today, down to
     * the wording.
     *
     * `createWorkspace` returns `AdobeWorkspace | ConsoleOpFailure` and cannot return
     * undefined. That test passed because the handler has no undefined guard, so a
     * property read threw and the outer catch turned it into a generic failure —
     * making it a duplicate of "returns an error when createWorkspace throws" below,
     * while appearing to cover something else.
     *
     * The failure path production ACTUALLY implements had no test here either.
     * Production's own comment says the quota guess was replaced by Console's
     * reason; this asserts that reason reaches the user.
     */
    it("surfaces Console's own reason when createWorkspace reports a failure", async () => {
        mockContext.authManager.createWorkspace.mockResolvedValue({
            error: 'Workspace limit reached for this project',
        });

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Workspace limit reached for this project');
    });

    it('returns the refreshed list ON THE RESPONSE (the caller is unmounted, a push is lost)', async () => {
        mockContext.authManager.getWorkspaces.mockResolvedValue([WS]);

        const result = await handleCreateAdobeWorkspace(mockContext, {
            name: 'Stage',
            description: 'A workspace',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(WS);
        expect(mockContext.authManager.createWorkspace).toHaveBeenCalledWith(
            'Stage',
            'A workspace'
        );
        expect(result.workspaces).toEqual([WS]);
    });

    it('does NOT push the refresh: the picker unmounts during create, so a push is dropped', async () => {
        await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        // `AdobeWorkspaceField` swaps the picker out for the create panel, so nothing
        // is listening for `get-workspaces` at this moment — WebviewClient drops it.
        // `workspaceSelected` never had a listener at all.
        expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
            'get-workspaces',
            expect.anything()
        );
        expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
            'workspaceSelected',
            expect.anything()
        );
    });

    it('still succeeds when the refresh fetch fails, omitting workspaces so the caller reloads', async () => {
        mockContext.authManager.getWorkspaces.mockRejectedValue(new Error('adobe down'));

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(WS);
        expect(result.workspaces).toBeUndefined();
    });

    it('threads the payload projectId into the post-create refresh (SDK path, not the stale CLI)', async () => {
        await handleCreateAdobeWorkspace(mockContext, { name: 'Stage', projectId: 'proj-42' });

        // The refresh must target the wizard's project; the fetcher resolves the org via
        // its token-org fallback. Unthreaded, the fetch would drop to the stale-org CLI.
        expect(mockContext.authManager.getWorkspaces).toHaveBeenCalledWith({
            projectId: 'proj-42',
        });
    });

    it('returns an error when createWorkspace throws', async () => {
        mockContext.authManager.createWorkspace.mockRejectedValue(new Error('boom'));

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
