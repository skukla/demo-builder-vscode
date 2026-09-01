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

jest.mock('@/core/validation/validators/AdobeResourceValidator');

const WS = { id: 'ws-new', name: 'Stage', title: 'Stage' };

function createContext() {
    const authManager: any = {
        testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        createWorkspace: jest.fn().mockResolvedValue(WS),
        getWorkspaces: jest.fn().mockResolvedValue([WS]),
    };
    return {
        authManager,
        logger: createMockLogger(),
        debugLogger: { trace: jest.fn(), debug: jest.fn() } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: { isAuthenticating: false },
    } as any;
}

describe('workspaceHandlers - Create', () => {
    let mockContext: ReturnType<typeof createContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createContext();
    });

    it('returns an error when authManager is missing', async () => {
        const ctx = { ...mockContext, authManager: undefined } as any;

        const result = await handleCreateAdobeWorkspace(ctx, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('returns a permission-typed error and does NOT create when permission is denied', async () => {
        mockContext.authManager.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
            error: 'Developer or System Admin role required.',
        });

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.AUTH_FORBIDDEN);
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    it('returns an error for an empty name and does NOT create', async () => {
        const result = await handleCreateAdobeWorkspace(mockContext, { name: '   ' });

        expect(result.success).toBe(false);
        expect(mockContext.authManager.createWorkspace).not.toHaveBeenCalled();
    });

    it('returns a failure message when createWorkspace returns undefined (quota/failure)', async () => {
        mockContext.authManager.createWorkspace.mockResolvedValue(undefined);

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('returns the refreshed list ON THE RESPONSE (the caller is unmounted, a push is lost)', async () => {
        mockContext.authManager.getWorkspaces.mockResolvedValue([WS]);

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage', description: 'A workspace' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(WS);
        expect(mockContext.authManager.createWorkspace).toHaveBeenCalledWith('Stage', 'A workspace');
        expect(result.workspaces).toEqual([WS]);
    });

    it('does NOT push the refresh: the picker unmounts during create, so a push is dropped', async () => {
        await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        // `AdobeWorkspaceField` swaps the picker out for the create panel, so nothing
        // is listening for `get-workspaces` at this moment — WebviewClient drops it.
        // `workspaceSelected` never had a listener at all.
        expect(mockContext.sendMessage).not.toHaveBeenCalledWith('get-workspaces', expect.anything());
        expect(mockContext.sendMessage).not.toHaveBeenCalledWith('workspaceSelected', expect.anything());
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
        expect(mockContext.authManager.getWorkspaces).toHaveBeenCalledWith({ projectId: 'proj-42' });
    });

    it('returns an error when createWorkspace throws', async () => {
        mockContext.authManager.createWorkspace.mockRejectedValue(new Error('boom'));

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
