/**
 * Shared setup for the four HelixService suites that mock the module wall.
 *
 * WHAT IT COVERS, AND WHAT IT DELIBERATELY DOES NOT. Seven suites cover this
 * service. Four of them — auth-keys, persistent-keys, preview-publish and
 * rate-limiting — opened with the same ~50 lines: three module mocks, a type
 * alias, two mock-shape interfaces, and the fetch swap. Three of those four were
 * byte-identical; the fourth differed only by not mocking the logger.
 *
 * The other three (the base retry suite, credentialRefused and diagnostics)
 * construct the service directly with real collaborators handed in and mock no
 * modules at all. They are NOT covered here. That is the rule this repo learned
 * the hard way on the stopDemo family: extract only what the suites AGREE on. A
 * helper that has to branch for its callers has stopped being shared setup and
 * become a second thing to understand.
 *
 * THE IMPORT ORDER IS LOAD-BEARING. `jest.mock` hoists above the imports of the
 * module it appears in — this one — not across modules. The suites therefore
 * must not import the service themselves; they call {@link createHelixService},
 * which imports it after these mocks are registered. A suite that reaches for
 * `@/features/eds/services/helix/helixService` directly binds to the real
 * DA.live collaborator and fails as confusing assertion noise, never as a clear
 * error (webview-test-authoring §3).
 */

import { createMockLogger } from '../../../../helpers/loggerFake';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

/** The logger the service reaches for when none is handed in. */
export const mockLogger = createMockLogger();

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn(() => mockLogger),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        NORMAL: 30000,
        LONG: 180000,
        VERY_LONG: 300000,
    },
    CACHE_TTL: {
        SHORT: 60000,
        MEDIUM: 300000,
        LONG: 3600000,
    },
}));

/**
 * The DA.live directory listing, shared so a suite that drives it can set a
 * return value. Suites that never touch it simply leave it alone — an unused
 * mock here is not a dead one, because the module mock below is what keeps the
 * real DA.live client out of the service.
 */
export const mockListDirectory = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

export type HelixServiceType = import('@/features/eds/services/helix/helixService').HelixService;

export interface MockGitHubTokenService {
    getToken: jest.Mock;
    validateToken: jest.Mock;
}

export interface MockDaLiveTokenProvider {
    getAccessToken: jest.Mock<Promise<string | null>>;
}

/** A GitHub token service that answers with a valid token. */
export function makeGitHubTokenService(token = 'valid-github-token'): MockGitHubTokenService {
    return {
        getToken: jest.fn().mockResolvedValue({ token, tokenType: 'bearer', scopes: ['repo'] }),
        validateToken: jest.fn().mockResolvedValue({ valid: true }),
    };
}

/** A DA.live token provider that answers with a valid IMS token. */
export function makeDaLiveTokenProvider(token = 'valid-dalive-ims-token'): MockDaLiveTokenProvider {
    return { getAccessToken: jest.fn().mockResolvedValue(token) };
}

/**
 * The real `global.fetch`, captured once at module load so a suite can put it
 * back. Captured HERE rather than per suite because a suite that swaps fetch in
 * `beforeEach` and captures in the same place would save its own mock on the
 * second test.
 */
const originalFetch = global.fetch;

/** Swap in a fresh fetch mock. Pair with {@link restoreFetch} in `afterEach`. */
export function installFetchMock(): jest.Mock {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    return mockFetch;
}

/** Put the real fetch back. */
export function restoreFetch(): void {
    global.fetch = originalFetch;
}

/**
 * The service MODULE, loaded AFTER the mocks above are registered — which is the
 * whole reason no suite imports the service itself. One suite needs the class
 * rather than an instance: the persistent-key tests call its static
 * cache-clearing methods between cases.
 */
export async function loadHelixServiceModule(): Promise<
    typeof import('@/features/eds/services/helix/helixService')
> {
    return import('@/features/eds/services/helix/helixService');
}

/**
 * Build the service.
 *
 * `undefined` for the logger on purpose: that is what sends the service to
 * `getLogger()`, which the mock at the top of this file answers. Passing a
 * logger instead would leave that path untested in every suite at once.
 */
export async function createHelixService(
    options: {
        githubTokenService?: MockGitHubTokenService;
        daLiveTokenProvider?: MockDaLiveTokenProvider;
    } = {}
): Promise<HelixServiceType> {
    const module = await loadHelixServiceModule();
    return new module.HelixService(
        undefined,
        (options.githubTokenService ?? makeGitHubTokenService()) as unknown as GitHubTokenService,
        options.daLiveTokenProvider ?? makeDaLiveTokenProvider()
    );
}
