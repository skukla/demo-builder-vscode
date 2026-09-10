/**
 * Shared harness for the `edsDaLiveAuthHandlers` suite family.
 *
 * THE AUTH SERVICE IS CACHED AT MODULE SCOPE. `getDaLiveAuthService` keeps
 * `cachedDaLiveAuthService` and only calls `new DaLiveAuthService(...)` the first
 * time, so a factory that built fresh jest.fn()s per construction would hand every
 * test after the first the FIRST test's fakes. The method fakes are therefore
 * module-level and stable, and each spec re-arms them in its own `beforeEach`.
 *
 * The `jest.mock` calls live here and the subject is re-exported from here,
 * because `babel-plugin-jest-hoist` lifts a mock above the imports of the module it
 * appears in and no further — a spec that imported the handlers directly would bind
 * to the real services.
 *
 * HelixService is NOT mocked. Its only use on this path is the STATIC
 * `initKeyStore`, which returns early unless the fake Memento hands back legacy
 * keys — so the real one runs harmlessly. Measured 2026-08-31.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import type { HandlerContext } from '@/types/handlers';

// =============================================================================
// Mock Setup
// =============================================================================

/** The DA.live auth service's methods, shared by every suite in the family. */
export const mockStoreToken = jest.fn();
export const mockIsAuthenticated = jest.fn();
export const mockGetStoredToken = jest.fn();
export const mockGetOrgName = jest.fn();
export const mockIsSetupComplete = jest.fn();
export const mockLogout = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLive/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            storeToken: mockStoreToken,
            isAuthenticated: mockIsAuthenticated,
            getStoredToken: mockGetStoredToken,
            getOrgName: mockGetOrgName,
            isSetupComplete: mockIsSetupComplete,
            logout: mockLogout,
        })),
    };
});

jest.mock('@/features/eds/services/github/githubTokenService');
jest.mock('@/features/eds/services/github/githubRepoOperations');
jest.mock('@/features/eds/services/github/githubFileOperations');
jest.mock('@/features/eds/services/github/githubOAuthService');
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLive/daLiveContentOperations');

// =============================================================================
// Module under test
// =============================================================================

export {
    handleCheckDaLiveAuth,
    handleClearDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveTokenWithOrg,
} from '@/features/eds/handlers/daLive/edsDaLiveAuthHandlers';

export { getBookmarkletUrl } from '@/features/eds/utils/daLiveTokenBookmarklet';

// =============================================================================
// Fixtures
// =============================================================================

/** Build a JWT from a payload — see daLiveAuthPrompt-signIn.test.ts for why. */
export function makeToken(payload: Record<string, string>): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64');
    return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

/** A token the strict validator accepts: names darkalley and carries a lifetime. */
export const goodToken = makeToken({
    client_id: 'darkalley',
    created_at: '9999999999999',
    expires_in: '3600000',
    email: 'user@example.com',
});

export function createDaLiveAuthContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: {
            globalState: { get: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() },
        } as unknown as HandlerContext['context'],
    });
}

/**
 * Put every auth-service fake back to a signed-in, set-up default.
 *
 * Call from each spec's OWN `beforeEach`; a spec then overrides only the answer
 * its case is about, so a test never depends on the one before it.
 */
export function resetAuthServiceFakes(): void {
    mockStoreToken.mockReset().mockResolvedValue(undefined);
    mockIsAuthenticated.mockReset().mockResolvedValue(true);
    mockGetStoredToken.mockReset().mockResolvedValue({ email: 'user@example.com' });
    mockGetOrgName.mockReset().mockReturnValue(undefined);
    mockIsSetupComplete.mockReset().mockReturnValue(true);
    mockLogout.mockReset().mockResolvedValue(undefined);
}
