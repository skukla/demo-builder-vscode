/**
 * Shared setup for the daLiveContentOperations suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   daLiveContentOperations-blockDocPages.test.ts
 *   daLiveContentOperations-enumeration.test.ts
 *   daLiveContentOperations-library-cdnCopy.test.ts
 *   daLiveContentOperations-library-creation.test.ts
 *   daLiveContentOperations-transform.test.ts
 *   daLiveContentOperations-utils.test.ts
 */

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));
// Mock global fetch
const mockFetch = jest.fn();


import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

/** The service under test plus the two doubles it was constructed with. */
export interface ContentOperationsHarness {
    service: DaLiveContentOperations;
    /** The private discovery collaborator, reached the way the suites reach it. */
    discovery: DaLiveContentDiscovery;
    tokenProvider: TokenProvider;
    logger: Logger;
}

/**
 * The `beforeEach` the enumeration and transform suites shared verbatim.
 *
 * `mock-ims-token` is the literal seven suites in this directory use. Four
 * others use `test-token` and one uses `mock-token` — nothing asserts on any of
 * them, so the divergence is cosmetic, but it is why this helper covers the
 * suites it does rather than the whole directory.
 */
export function createContentOperationsHarness(): ContentOperationsHarness {
    const tokenProvider: TokenProvider = {
        getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
    };
    const logger = createMockLogger() as unknown as Logger;
    const service = new DaLiveContentOperations(tokenProvider, logger);
    const discovery = (service as unknown as { discoveryOps: DaLiveContentDiscovery }).discoveryOps;
    return { service, discovery, tokenProvider, logger };
}

/**
 * A `Response` stand-in for the fetch mock.
 *
 * FOUR VERSIONS of this exist in this directory and only two are identical —
 * the two this serves (measured 2026-09-02 by hashing the bodies with comments
 * stripped). `daLiveContentCopy-retry`, `daLiveContentDiscovery` and
 * `daLiveContentOperations-401` each have their own, differing in more than
 * formatting, so they are left alone rather than bent to fit.
 *
 * @param status - the HTTP status; `ok` is derived from it
 * @param body - what `json()` resolves and, for a string, what `text()` returns
 * @param contentType - the only header any caller reads
 */
export function mockFetchResponse(status: number, body?: unknown, contentType = 'text/html'): Response {
    const headers = new Map([['content-type', contentType]]);
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        headers: {
            get: (key: string) => headers.get(key.toLowerCase()) || null,
        } as unknown as Headers,
        json: jest.fn().mockResolvedValue(body),
        blob: jest.fn().mockResolvedValue(new Blob(['test content'])),
        text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
    } as unknown as Response;
}

export { mockFetch };
