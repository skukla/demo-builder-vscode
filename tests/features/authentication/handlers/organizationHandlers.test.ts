/**
 * Org-context re-detection handler tests.
 *
 * - handleReDetectContext: clears the relevant caches + re-reads `console where`,
 *   without forcing re-login (and never via the cache-nuking clearAll).
 */

import { handleReDetectContext } from '@/features/authentication/handlers/organizationHandlers';

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
        getCurrentContext: jest.fn().mockResolvedValue({}),
        getCacheManager: jest.fn().mockReturnValue(cacheManager),
        // GUARD: must never be called by this handler
        login: jest.fn(),
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
