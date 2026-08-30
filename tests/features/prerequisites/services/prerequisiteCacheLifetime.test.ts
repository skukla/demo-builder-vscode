/**
 * Does the prerequisite cache survive long enough to ever be read?
 *
 * `PrerequisitesCacheManager` exists to skip repeated CLI checks. Its own header
 * puts the numbers on it: a hit costs under 10ms, a miss costs 500–3000ms of
 * `aio`/`node`/`npm` invocations, for a claimed "95% reduction in repeated
 * prerequisite checks".
 *
 * It is an INSTANCE field of `PrerequisitesManager`
 * (`private cacheManager = new PrerequisitesCacheManager()`), and
 * `PrerequisitesManager` is built by `createPanelHandlerContext`. Every webview
 * surface calls that per INCOMING MESSAGE:
 *
 *     comm.onStreaming(messageType, async (data) => {
 *         const context = this.createHandlerContext();   // <- new manager
 *         return dispatchHandler(dashboardHandlers, context, messageType, data);
 *     });
 *
 * So this suite asks the question that decides whether the cache is a
 * performance feature or dead weight: given two contexts built the way two
 * consecutive messages build them, does anything written by the first survive
 * into the second?
 *
 * It asserts the CURRENT behaviour deliberately. If someone makes the cache
 * shared, these tests fail and should be rewritten to assert the opposite —
 * that is the point of pinning it rather than describing it.
 */

const mockGetLogger = jest.fn();

jest.mock('vscode', () => ({ window: {}, workspace: {} }), { virtual: true });
// The cache manager imports getLogger from the MODULE, not the barrel
// (`@/core/logging/debugLogger`), so both need stubbing.
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: (...a: unknown[]) => mockGetLogger(...a),
}));
jest.mock('@/core/logging', () => ({
    getLogger: (...a: unknown[]) => mockGetLogger(...a),
    getStepLogger: jest.fn().mockReturnValue({}),
    ErrorLogger: class {},
}));
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({}),
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/core/logging/errorLogger', () => ({ ErrorLogger: class {} }));
jest.mock('@/core/utils/progressUnifier', () => ({ ProgressUnifier: class {} }));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: class {},
}));

import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { HandlerContext } from '@/types/handlers';

/** The parts a webview surface hands the factory, identical between messages. */
function panelParts() {
    return {
        context: { extensionPath: '/ext' } as never,
        panel: undefined,
        stateManager: {} as HandlerContext['stateManager'],
        communicationManager: undefined,
        sendMessage: jest.fn(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetLogger.mockReturnValue({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    });
});

/** Two contexts, built exactly as two consecutive messages build them. */
function twoMessages(): [PrerequisitesManager, PrerequisitesManager] {
    const first = createPanelHandlerContext(panelParts()).prereqManager as PrerequisitesManager;
    const second = createPanelHandlerContext(panelParts()).prereqManager as PrerequisitesManager;
    return [first, second];
}

describe('the prerequisite cache and the handler context it lives in', () => {
    it('CONTROL: a single manager DOES cache — the mechanism itself works', () => {
        // Without this, the failure below would be indistinguishable from a cache
        // that is simply broken, and the finding would be about the wrong thing.
        const [manager] = twoMessages();
        const cache = manager.getCacheManager();

        cache.setCachedResult('node', { installed: true } as never);

        expect(cache.getCachedResult('node')).toBeDefined();
    });

    it('gives every message its own PrerequisitesManager', () => {
        const [first, second] = twoMessages();
        expect(first).not.toBe(second);
    });

    it('gives every message its own CACHE — so nothing written survives', () => {
        const [first, second] = twoMessages();
        expect(first.getCacheManager()).not.toBe(second.getCacheManager());
    });

    it('THE FINDING: a result cached on one message is a MISS on the next', () => {
        // This is the whole cost. Every prerequisite check pays the full
        // 500-3000ms CLI round trip, on every message, on every surface that
        // builds its context this way — which is all six of them.
        const [first, second] = twoMessages();

        first.getCacheManager().setCachedResult('node', { installed: true } as never);

        expect(first.getCacheManager().getCachedResult('node')).toBeDefined();
        expect(second.getCacheManager().getCachedResult('node')).toBeUndefined();
    });
});
