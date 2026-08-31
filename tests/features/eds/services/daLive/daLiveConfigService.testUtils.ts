/**
 * Shared harness for the `daLiveConfigService` suite family.
 *
 * THE MOCK PREAMBLE WAS ENTIRELY DEAD. Both suites mocked `@/core/logging` and
 * `@/core/utils/timeoutConfig`; measured 2026-08-31, all 32 tests pass without
 * either, in both suites. The service takes its logger by CONSTRUCTOR — the very
 * next line of each suite's setup hands one in — so `getLogger()` is never
 * reached, and nothing on these paths reads a timeout. Deleted rather than moved.
 *
 * That leaves what was genuinely duplicated and worth one home: the global
 * `fetch` stub, the token provider, the logger, the four test constants, and the
 * service construction.
 *
 * The subject is re-exported from here. There is no hoisting hazard left to guard
 * against today — but a suite that later needs a `jest.mock` would have to move
 * the subject import anyway, and having it already in the right place is the
 * difference between adding a factory and re-learning why it does not work.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockLogger } from '../../../../helpers/loggerFake';
import { DaLiveConfigService } from '@/features/eds/services/daLive/daLiveConfigService';
import type { TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';

/**
 * The global `fetch` stub. This service talks to `admin.da.live` over HTTP and
 * nothing else, so every test drives it through this.
 */
export const mockFetch = jest.fn();
global.fetch = mockFetch;

export { DaLiveConfigService };
export type {
    MultiSheetConfig,
    PermissionRow,
} from '@/features/eds/services/daLive/daLiveConfigService';

/** The identifiers both suites build their URLs and assertions from. */
export const testOrg = 'test-org';
export const testSite = 'test-site';
export const testEmail = 'user@example.com';
export const testToken = 'test-da-live-token';

/**
 * Fresh fixtures plus a service built from them.
 *
 * Call from each spec's OWN `beforeEach` — a `beforeEach` declared here would not
 * apply to a module that imports it.
 *
 * Both resets are HYGIENE, not proven need — measured 2026-08-31, all 32 tests pass
 * with either line deleted, because every test currently sets its own fetch response
 * before acting. They stay because the failure they prevent is the nastiest kind:
 * `clearAllMocks` clears recorded CALLS but not implementations, so a
 * `mockResolvedValue` survives into the next test, and the first test that forgets to
 * set one would silently inherit its predecessor's response and pass. Saying "these
 * are unproven" is honest; deleting them to prove a point is not.
 */
export function setupConfigService(): {
    service: DaLiveConfigService;
    mockTokenProvider: TokenProvider;
    mockLogger: ReturnType<typeof createMockLogger>;
} {
    jest.clearAllMocks();
    mockFetch.mockReset();

    const mockTokenProvider: TokenProvider = {
        getAccessToken: jest.fn().mockResolvedValue(testToken),
    };
    const mockLogger = createMockLogger();

    return {
        service: new DaLiveConfigService(mockTokenProvider, mockLogger),
        mockTokenProvider,
        mockLogger,
    };
}
