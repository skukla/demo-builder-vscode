/**
 * The wall and the client fake the three `daLiveConfigOperations` suites share.
 *
 * WHAT IS SHARED, and why it is not dead. Two things, both load-bearing:
 *
 *   `hasWriteAccess` — the 401 ownership probe. Not mocking it lets the read
 *   path make a real HEAD request; every suite drives at least one 401 case.
 *
 *   The `DaLiveApiClient` fake — a faithful one, which is the whole point. It
 *   delegates to the global `fetch` the suites spy on AND resolves the
 *   per-attempt request factory the real client supports, so the body
 *   assertions in all three suites pin the actual wire calls rather than the
 *   fake's idea of them. Three copies of those 15 lines existed before this
 *   file (2026-09-05).
 *
 * IMPORTING THIS FILE REGISTERS THE MOCK, so it must come before the suite's
 * import of the subject — which is why the subject is re-exported from here
 * rather than imported by each spec: `jest.mock` hoists above the imports of
 * the module it appears in, not across modules.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockLogger } from '../../../../helpers/loggerFake';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';

/** The IMS token the client hands out. Reject it to test a signed-out caller. */
export const mockGetImsToken = jest.fn();

/** The org write-access probe the 401 read path consults. */
export const mockHasWriteAccess = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    hasWriteAccess: (...args: unknown[]) => mockHasWriteAccess(...args),
}));

// Below the factory on purpose — it hoists above this import, so the subject
// binds to the mocked org operations. `import/first` is not a rule here.
import { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';

export { DaLiveConfigOperations };

/**
 * The three client calls these operations make.
 *
 * `fetchWithRetry` delegates to the global fetch and resolves a request factory
 * when one is passed, because the POST body is one-shot and the real client
 * rebuilds it per attempt.
 */
export function makeApiClient(): DaLiveApiClient {
    return {
        getImsToken: mockGetImsToken,
        fetchWithRetry: jest.fn((url: string, options: unknown) =>
            global.fetch(
                url,
                typeof options === 'function'
                    ? (options as () => RequestInit)()
                    : (options as RequestInit)
            )
        ),
        createErrorFromResponse: jest.fn(),
    } as unknown as DaLiveApiClient;
}

/** A fresh subject over a fresh client and a quiet logger. */
export function makeConfigOps(): DaLiveConfigOperations {
    return new DaLiveConfigOperations(makeApiClient(), createMockLogger());
}

/**
 * Re-establish the defaults after `clearAllMocks`, which clears calls but NOT
 * implementations — a rejection set by one test would otherwise reach the next.
 */
export function resetConfigOpsMocks(): void {
    mockHasWriteAccess.mockReset();
    mockGetImsToken.mockReset();
    mockGetImsToken.mockResolvedValue('tok-123');
}
