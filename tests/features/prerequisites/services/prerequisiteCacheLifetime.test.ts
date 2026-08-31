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
 * FIXED 2026-08-29. `getPrerequisitesManager` memoises one manager for the
 * session — the same shape `edsServiceCache` uses, and for the same reason. This
 * suite was written to pin the BROKEN behaviour; it now pins the fixed one, which
 * is what a pinned test is for. Nothing in the manager is per-project, so one per
 * session is what the cache assumed all along.
 */

const mockGetLogger = jest.fn();

jest.mock('vscode', () => ({ window: {}, workspace: {} }), { virtual: true });
// The cache manager imports getLogger from the MODULE, not the barrel
// (`@/core/logging/debugLogger`), so both need stubbing.
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({}),
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/core/logging/errorLogger', () => ({ ErrorLogger: class {} }));
jest.mock('@/core/utils/progressUnifier', () => ({ ProgressUnifier: class {} }));

import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { resetComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { resetPrerequisitesManager } from '@/features/prerequisites/services/prerequisitesManagerInstance';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';

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
    resetPrerequisitesManager(); // a shared instance must not leak between tests
    resetComponentRegistryManager();
    mockGetLogger.mockReturnValue(createMockLogger());
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

    it('hands every message the SAME PrerequisitesManager', () => {
        const [first, second] = twoMessages();
        expect(first).toBe(second);
    });

    it('hands every message the same CACHE', () => {
        const [first, second] = twoMessages();
        expect(first.getCacheManager()).toBe(second.getCacheManager());
    });

    it('THE FIX: a result cached on one message is a HIT on the next', () => {
        // The whole point. Before this, every prerequisite check paid the full
        // 500-3000ms CLI round trip on every message, on all six surfaces.
        const [first, second] = twoMessages();

        first.getCacheManager().setCachedResult('node', { installed: true } as never);

        expect(second.getCacheManager().getCachedResult('node')).toBeDefined();
    });

    it('an invalidation on one message is VISIBLE on the next', () => {
        /**
         * The property the fix newly depends on, and which nothing checked.
         *
         * `installHandler` invalidates after an install, and `checkHandler`
         * clears everything on Recheck — both through `context.prereqManager`.
         * While that was a fresh instance per message those calls cleared a cache
         * about to be discarded: correct-looking no-ops whose effect could not be
         * observed. They are load-bearing now.
         *
         * If anyone later builds a manager outside `getPrerequisitesManager`,
         * invalidation silently stops working and the staleness window becomes
         * the full 5-minute TTL. This is the test that would notice.
         */
        const [first, second] = twoMessages();

        first.getCacheManager().setCachedResult('node', { installed: true } as never);
        first.getCacheManager().invalidate('node'); // as installHandler does

        expect(second.getCacheManager().getCachedResult('node')).toBeUndefined();
    });

    it('a Recheck clears what earlier messages cached', () => {
        // checkHandler's `isRecheck` path calls clearAll() — the user's escape
        // hatch when something changed OUTSIDE the extension.
        const [first, second] = twoMessages();

        first.getCacheManager().setCachedResult('node', { installed: true } as never);
        first.getCacheManager().clearAll();

        expect(second.getCacheManager().getCachedResult('node')).toBeUndefined();
    });

    it('resetPrerequisitesManager drops it — the reload path', () => {
        // A manager surviving an extension-host reload would carry a cache built
        // against the previous session's CLI state.
        const [first] = twoMessages();
        resetPrerequisitesManager();
        const [after] = twoMessages();

        expect(after).not.toBe(first);
    });
});

/**
 * The registry manager got the same treatment for the same reason, so it gets
 * the same proof. Its memo (`transformedRegistry`) was recomputed per message.
 */
describe('the component registry and the handler context it lives in', () => {
    it('hands every message the SAME ComponentRegistryManager', () => {
        const first = createPanelHandlerContext(panelParts()).componentRegistry;
        const second = createPanelHandlerContext(panelParts()).componentRegistry;

        expect(first).toBe(second);
        expect(first).toBeDefined();
    });

    it('resetComponentRegistryManager drops it', () => {
        const before = createPanelHandlerContext(panelParts()).componentRegistry;
        resetComponentRegistryManager();
        const after = createPanelHandlerContext(panelParts()).componentRegistry;

        expect(after).not.toBe(before);
    });
});
