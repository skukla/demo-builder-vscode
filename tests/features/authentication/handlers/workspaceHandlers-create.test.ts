/**
 * Workspace Handlers - Create Tests
 *
 * Tests for in-app Adobe I/O workspace creation (Flow A):
 * - handleCreateAdobeWorkspace: create with defensive permission re-check.
 *   (The permission probe is the shared `can-create-adobe-project` handler,
 *   tested in projectHandlers-create.test.ts.)
 */

import { handleCreateAdobeWorkspace } from '@/features/authentication/handlers/workspaceHandlers';
import { ErrorCode } from '@/types/errorCodes';

jest.mock('@/core/validation');
jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { NORMAL: 30000 } }));
jest.mock('@/core/utils/promiseUtils', () => ({ withTimeout: jest.fn((promise) => promise) }));

const WS = { id: 'ws-new', name: 'Stage', title: 'Stage' };

function createContext() {
    const authManager: any = {
        testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        createWorkspace: jest.fn().mockResolvedValue(WS),
        getWorkspaces: jest.fn().mockResolvedValue([WS]),
    };
    return {
        authManager,
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
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

    it('creates, refreshes the list, acks the selection, and returns the workspace', async () => {
        mockContext.authManager.getWorkspaces.mockResolvedValue([WS]);

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage', description: 'A workspace' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(WS);
        expect(mockContext.authManager.createWorkspace).toHaveBeenCalledWith('Stage', 'A workspace');
        expect(mockContext.sendMessage).toHaveBeenCalledWith('get-workspaces', [WS]);
        expect(mockContext.sendMessage).toHaveBeenCalledWith('workspaceSelected', { workspaceId: 'ws-new' });
    });

    it('returns an error when createWorkspace throws', async () => {
        mockContext.authManager.createWorkspace.mockRejectedValue(new Error('boom'));

        const result = await handleCreateAdobeWorkspace(mockContext, { name: 'Stage' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
