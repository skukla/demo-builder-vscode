/**
 * Organization Handlers Tests
 *
 * Covers the in-app org-picker backend:
 * - handleGetOrganizations: returns org list with selectable flags (no re-login)
 * - handleSelectOrg: routes through ensureOrgContext (ok / needs_relogin),
 *   NEVER forces re-login and NEVER runs `aio console org select`
 * - handleReDetectContext: clears the relevant caches + re-reads console where,
 *   without forcing re-login
 */

import {
    handleGetOrganizations,
    handleSelectOrg,
    handleReDetectContext,
} from '@/features/authentication/handlers/organizationHandlers';
import { ErrorCode } from '@/types/errorCodes';

// withOrgContext / ensureOrgContext use the env helper; keep it inert in tests.
jest.mock('@/features/authentication/services/orgContextEnv', () => {
    const actual = jest.requireActual('@/features/authentication/services/orgContextEnv');
    return {
        ...actual,
        withOrgContext: jest.fn(async (_target: unknown, fn: () => unknown) => fn()),
        getActiveOrgContext: jest.fn(() => undefined),
    };
});

interface MockCacheManager {
    clearSessionCaches: jest.Mock;
    clearConsoleWhereCache: jest.Mock;
    clearValidationCache: jest.Mock;
    clearPerformanceCaches: jest.Mock;
    clearAuthStatusCache: jest.Mock;
    clearTokenInspectionCache: jest.Mock;
}

const createMockCacheManager = (): MockCacheManager => ({
    clearSessionCaches: jest.fn(),
    clearConsoleWhereCache: jest.fn(),
    clearValidationCache: jest.fn(),
    clearPerformanceCaches: jest.fn(),
    clearAuthStatusCache: jest.fn(),
    clearTokenInspectionCache: jest.fn(),
});

const createMockContext = (cacheManager: MockCacheManager) => {
    const authManager = {
        getOrganizations: jest.fn().mockResolvedValue([]),
        getCurrentContext: jest.fn().mockResolvedValue({}),
        getCacheManager: jest.fn().mockReturnValue(cacheManager),
        // GUARD: must never be called by these handlers
        login: jest.fn(),
        selectOrganization: jest.fn(),
    };
    return {
        authManager,
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), trace: jest.fn() },
        debugLogger: { debug: jest.fn(), trace: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: { isAuthenticating: false },
    } as any;
};

describe('organizationHandlers', () => {
    let cacheManager: MockCacheManager;
    let context: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = createMockCacheManager();
        context = createMockContext(cacheManager);
    });

    describe('handleGetOrganizations', () => {
        it('returns the org list with selectable=true for an enterprise org', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o1', code: 'C1', name: 'Enterprise', type: 'entp' },
            ]);

            const result = await handleGetOrganizations(context);

            expect(result.success).toBe(true);
            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'get-organizations');
            expect(sent).toBeDefined();
            const items = sent![1] as Array<{ id: string; selectable: boolean }>;
            expect(items).toHaveLength(1);
            expect(items[0]).toMatchObject({ id: 'o1', code: 'C1', name: 'Enterprise', selectable: true });
        });

        it('marks a developer org WITHOUT runtime as not selectable with a reason', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o2', code: 'C2', name: 'DevNoRuntime', type: 'developer', runtime: false },
            ]);

            await handleGetOrganizations(context);

            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'get-organizations');
            const items = sent![1] as Array<{ id: string; selectable: boolean; reason?: string }>;
            expect(items[0].selectable).toBe(false);
            expect(items[0].reason).toBeTruthy();
        });

        it('marks a developer org WITH runtime as selectable', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o3', code: 'C3', name: 'DevRuntime', type: 'developer', runtime: true },
            ]);

            await handleGetOrganizations(context);

            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'get-organizations');
            const items = sent![1] as Array<{ id: string; selectable: boolean }>;
            expect(items[0].selectable).toBe(true);
        });

        it('returns the raw (unfiltered) list — non-selectable orgs are present, not dropped', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o1', code: 'C1', name: 'Enterprise', type: 'entp' },
                { id: 'o2', code: 'C2', name: 'DevNoRuntime', type: 'developer', runtime: false },
            ]);

            const result = await handleGetOrganizations(context);

            expect((result.data as unknown[]).length).toBe(2);
        });

        it('does NOT force a re-login when listing organizations', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o1', code: 'C1', name: 'E', type: 'entp' },
            ]);

            await handleGetOrganizations(context);

            expect(context.authManager.login).not.toHaveBeenCalled();
        });

        it('sends a structured error when the org list fetch fails', async () => {
            context.authManager.getOrganizations.mockRejectedValue(new Error('boom'));

            const result = await handleGetOrganizations(context);

            expect(result.success).toBe(false);
            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'get-organizations');
            expect((sent![1] as { error?: string }).error).toBeTruthy();
        });
    });

    describe('handleSelectOrg', () => {
        it('sends success when ensureOrgContext resolves ok (no re-login, no console select)', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o1', code: 'C1', name: 'E', type: 'entp' },
            ]);

            const result = await handleSelectOrg(context, { orgId: 'o1' });

            expect(result.success).toBe(true);
            expect(context.authManager.login).not.toHaveBeenCalled();
            expect(context.authManager.selectOrganization).not.toHaveBeenCalled();
            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'select-org');
            expect(sent).toBeDefined();
            expect((sent![1] as { status?: string }).status).toBe('ok');
        });

        it('sends a structured account-switch signal when target needs re-login (still no force-login here)', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'other', code: 'O', name: 'Other', type: 'entp' },
            ]);

            const result = await handleSelectOrg(context, { orgId: 'missing' });

            expect(result.success).toBe(false);
            expect(result.code).toBe(ErrorCode.ORG_MISMATCH);
            // The handler must NEVER force re-login itself; the UI decides.
            expect(context.authManager.login).not.toHaveBeenCalled();
            expect(context.authManager.selectOrganization).not.toHaveBeenCalled();
            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 'select-org');
            const payload = sent![1] as { status?: string; code?: string; targetOrg?: { id: string } };
            expect(payload.status).toBe('needs_relogin');
            expect(payload.code).toBe(ErrorCode.ORG_MISMATCH);
            expect(payload.targetOrg).toEqual({ id: 'missing' });
        });

        it('never runs `aio console org select` regardless of outcome', async () => {
            context.authManager.getOrganizations.mockResolvedValue([
                { id: 'o1', code: 'C1', name: 'E', type: 'entp' },
            ]);

            await handleSelectOrg(context, { orgId: 'o1' });

            expect(context.authManager.selectOrganization).not.toHaveBeenCalled();
        });
    });

    describe('handleReDetectContext', () => {
        it('clears session + console-where + validation caches without forcing re-login', async () => {
            const result = await handleReDetectContext(context);

            expect(result.success).toBe(true);
            expect(cacheManager.clearSessionCaches).toHaveBeenCalled();
            expect(cacheManager.clearConsoleWhereCache).toHaveBeenCalled();
            expect(cacheManager.clearValidationCache).toHaveBeenCalled();
            expect(context.authManager.login).not.toHaveBeenCalled();
        });

        it('re-reads the current context after clearing caches', async () => {
            context.authManager.getCurrentContext.mockResolvedValue({
                org: { id: 'o1', name: 'E', code: 'C1' },
            });

            await handleReDetectContext(context);

            expect(context.authManager.getCurrentContext).toHaveBeenCalled();
            const sent = context.sendMessage.mock.calls.find((c: unknown[]) => c[0] === 're-detect-context');
            expect(sent).toBeDefined();
        });

        it('does NOT use the cache-nuking clearAll (auth status / token must survive)', async () => {
            // clearAll would also wipe auth-status + token caches, forcing re-auth.
            const clearAll = jest.fn();
            (cacheManager as unknown as { clearAll: jest.Mock }).clearAll = clearAll;

            await handleReDetectContext(context);

            expect(clearAll).not.toHaveBeenCalled();
        });
    });
});
