/**
 * handleGetStoreStructure — the headless store-structure read behind the
 * get_store_structure MCP tool.
 *
 * The behaviour worth pinning is the auth shape: the read is attempted FIRST and
 * only an `authRequired` outcome triggers Adobe sign-in. That is what keeps a
 * PaaS project (which needs no IMS token) from ever prompting an agent's call,
 * and it is why the backend type is not derived twice.
 */

const mockRead = jest.fn();
jest.mock('@/features/eds/services/storeStructureReader', () => ({
    readStoreStructure: (...args: unknown[]) => mockRead(...args),
}));

const mockEnsureAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAuth(...args),
}));

import { handleGetStoreStructure } from '@/features/eds/handlers/storeStructureHandler';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const PROJECT = {
    name: 'demo',
    adobe: { organization: 'org-1', projectId: 'p1', workspace: 'Stage' },
};

function ctx(project: unknown, token?: string, secrets?: unknown): HandlerContext {
    return {
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        logger: createMockLogger(),
        authManager: {
            getTokenManager: () => ({
                inspectToken: jest.fn().mockResolvedValue({ valid: !!token, token }),
            }),
        },
        ...(secrets ? { context: { secrets } } : {}),
    } as unknown as HandlerContext;
}

/**
 * A context with no auth manager — the headless caller that cannot sign anyone
 * in. Built by removing the manager from `ctx` rather than by hand, so this file
 * keeps exactly one HandlerContext fake.
 */
function ctxWithoutAuthManager(project: unknown): HandlerContext {
    const base = ctx(project);
    delete (base as { authManager?: unknown }).authManager;
    return base;
}

describe('handleGetStoreStructure', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockEnsureAuth.mockResolvedValue({ authenticated: true });
    });

    it('errors with PROJECT_NOT_FOUND when no project is loaded', async () => {
        const result = await handleGetStoreStructure(ctx(undefined));

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockRead).not.toHaveBeenCalled();
    });

    it('returns the report without prompting sign-in when the read succeeds', async () => {
        const data = { backendType: 'paas', websites: [], resolution: {} };
        mockRead.mockResolvedValue({ success: true, data });

        const result = await handleGetStoreStructure(ctx(PROJECT));

        expect(result).toEqual({ success: true, data });
        expect(mockRead).toHaveBeenCalledTimes(1);
        // A PaaS project must never drag an agent through Adobe sign-in.
        expect(mockEnsureAuth).not.toHaveBeenCalled();
    });

    it('threads SecretStorage into BOTH reads', async () => {
        // Asserting the ARGUMENT, not the outcome: `readStoreStructure` is mocked
        // here, and a mock answers the same whether or not it was handed `secrets`.
        // Without it the PaaS branch is config-only, so a project whose admin
        // password has migrated reports "no credentials saved" while the value sits
        // one lookup away — invisible to any outcome-based assertion.
        const secrets = { get: jest.fn(), store: jest.fn(), delete: jest.fn() };
        const data = { backendType: 'accs', websites: [], resolution: {} };
        mockRead
            .mockResolvedValueOnce({ success: false, error: 'sign-in', authRequired: true })
            .mockResolvedValueOnce({ success: true, data });

        await handleGetStoreStructure(ctx(PROJECT, 'ims-token', secrets));

        expect(mockRead).toHaveBeenNthCalledWith(1, PROJECT, { secrets });
        expect(mockRead).toHaveBeenNthCalledWith(2, PROJECT, {
            imsToken: 'ims-token',
            secrets,
        });
    });

    it('passes a non-auth failure straight through without signing in', async () => {
        mockRead.mockResolvedValue({ success: false, error: 'No Commerce URL configured.' });

        const result = await handleGetStoreStructure(ctx(PROJECT));

        expect(result).toEqual({ success: false, error: 'No Commerce URL configured.' });
        expect(mockEnsureAuth).not.toHaveBeenCalled();
    });

    it('asks for sign-in it cannot perform rather than throwing, with no auth manager', async () => {
        // A context assembled without an auth manager still has to answer. The
        // guard is what turns "cannot sign in here" into a code the caller can
        // act on instead of a TypeError one branch further down.
        mockRead.mockResolvedValue({ success: false, error: 'sign-in', authRequired: true });

        const result = await handleGetStoreStructure(ctxWithoutAuthManager(PROJECT));

        expect(result).toEqual({
            success: false,
            error: 'Adobe sign-in required to read store structure.',
            code: ErrorCode.AUTH_REQUIRED,
        });
        expect(mockEnsureAuth).not.toHaveBeenCalled();
    });

    it('targets the guard at a project that carries no Adobe block', async () => {
        // Asserting the ARGUMENT: `ensureAdobeIOAuth` is mocked, so it answers the
        // same whatever it is handed, and a project created before its Adobe
        // workspace exists has no `adobe` at all.
        mockRead
            .mockResolvedValueOnce({ success: false, error: 'sign-in', authRequired: true })
            .mockResolvedValueOnce({ success: true, data: { websites: [] } });

        await handleGetStoreStructure(ctx({ name: 'no-adobe-yet' }, 'ims-token'));

        expect(mockEnsureAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: {
                    organization: undefined,
                    projectId: undefined,
                    workspace: undefined,
                },
            })
        );
    });

    it('does not retry on a stale token when sign-in was declined', async () => {
        // Declining sign-in ends the call. A token left over from an earlier
        // session is exactly the case where skipping the check would look like it
        // worked: the read would be retried with a credential the user just
        // refused to refresh.
        mockRead.mockResolvedValue({ success: false, error: 'sign-in', authRequired: true });
        mockEnsureAuth.mockResolvedValue({ authenticated: false });

        const result = await handleGetStoreStructure(ctx(PROJECT, 'stale-token'));

        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(result.error).toMatch(/sign-in required/i);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('signs in and retries WITH the token when the first read wants auth', async () => {
        const data = { backendType: 'accs', websites: [], resolution: {} };
        mockRead
            .mockResolvedValueOnce({ success: false, error: 'sign-in', authRequired: true })
            .mockResolvedValueOnce({ success: true, data });

        const result = await handleGetStoreStructure(ctx(PROJECT, 'ims-token'));

        expect(result).toEqual({ success: true, data });
        expect(mockRead).toHaveBeenNthCalledWith(1, PROJECT, {});
        expect(mockRead).toHaveBeenNthCalledWith(2, PROJECT, { imsToken: 'ims-token' });
        // The project's own org/workspace ride along so the guard targets it.
        expect(mockEnsureAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({ organization: 'org-1' }),
            })
        );
    });

    it('returns AUTH_REQUIRED when sign-in is declined', async () => {
        mockRead.mockResolvedValue({ success: false, error: 'sign-in', authRequired: true });
        mockEnsureAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const result = await handleGetStoreStructure(ctx(PROJECT));

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('returns AUTH_REQUIRED when sign-in succeeds but yields no token', async () => {
        mockRead.mockResolvedValue({ success: false, error: 'sign-in', authRequired: true });

        const result = await handleGetStoreStructure(ctx(PROJECT, undefined));

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(result.error).toMatch(/no IMS token/i);
    });

    it('reports a post-sign-in read failure rather than masking it as an auth problem', async () => {
        mockRead
            .mockResolvedValueOnce({ success: false, error: 'sign-in', authRequired: true })
            .mockResolvedValueOnce({ success: false, error: 'Discovery service returned 500.' });

        const result = await handleGetStoreStructure(ctx(PROJECT, 'ims-token'));

        expect(result.success).toBe(false);
        expect(result.error).toBe('Discovery service returned 500.');
        expect(result.code).toBeUndefined();
    });
});
