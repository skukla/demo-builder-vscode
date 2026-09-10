/**
 * Shared setup for the DaLiveContentCopy suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * The class is constructed DIRECTLY with its four collaborators rather than
 * through the DaLiveContentOperations facade, so a suite can assert the
 * arguments each collaborator receives (which URL is written, which token, which
 * patch ids) instead of the answer a mock was told to give.
 */

// Real wall-clock retry delays: mock the shared sleep so only the SEQUENCE of
// attempts is under test, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        VERY_LONG: 60000,
    },
}));

jest.mock('@/features/eds/services/patches/contentPatchRegistry', () => ({
    applyContentPatches: jest.fn(),
}));

import { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import { applyContentPatches } from '@/features/eds/services/patches/contentPatchRegistry';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** The class under test plus the doubles it was constructed with. */
export interface CopyHarness {
    copy: DaLiveContentCopy;
    apiClient: {
        getImsToken: jest.Mock;
        fetchWithRetry: jest.Mock;
    };
    sourceOps: { listDirectory: jest.Mock };
    discoveryOps: {
        getContentPathsFromDaLive: jest.Mock;
        getContentPathsFromIndex: jest.Mock;
    };
    logger: Logger;
}

/** The token every harness hands back from `getImsToken`. */
export const TEST_TOKEN = 'ims-token';

/**
 * Build the class under test over jest.fn collaborators.
 *
 * `fetchWithRetry` defaults to a 200 so a spec only has to say what differs.
 */
export function createCopyHarness(): CopyHarness {
    const apiClient = {
        getImsToken: jest.fn().mockResolvedValue(TEST_TOKEN),
        fetchWithRetry: jest.fn().mockResolvedValue(mockResponse(200)),
    };
    const sourceOps = { listDirectory: jest.fn().mockResolvedValue([]) };
    const discoveryOps = {
        getContentPathsFromDaLive: jest.fn().mockResolvedValue([]),
        getContentPathsFromIndex: jest.fn().mockResolvedValue([]),
    };
    const logger = createMockLogger() as unknown as Logger;
    const copy = new DaLiveContentCopy(
        apiClient as unknown as DaLiveApiClient,
        sourceOps as unknown as DaLiveSourceOperations,
        discoveryOps as unknown as DaLiveContentDiscovery,
        logger
    );
    return { copy, apiClient, sourceOps, discoveryOps, logger };
}

/**
 * A `Response` stand-in for the fetch mock.
 *
 * @param status - the HTTP status; `ok` is derived from it
 * @param body - what `text()` returns for a string and `json()` resolves
 * @param contentType - the only header this module reads
 */
export function mockResponse(status: number, body?: unknown, contentType = 'text/html'): Response {
    const headers = new Map([['content-type', contentType]]);
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        headers: {
            get: (key: string) => headers.get(key.toLowerCase()) ?? null,
        } as unknown as Headers,
        json: jest.fn().mockResolvedValue(body),
        blob: jest.fn().mockResolvedValue(new Blob(['binary'])),
        text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
    } as unknown as Response;
}

/** A response whose `text()` rejects — the unreadable-error-body path. */
export function mockUnreadableResponse(status: number): Response {
    return {
        ...mockResponse(status),
        text: jest.fn().mockRejectedValue(new Error('stream already read')),
    } as unknown as Response;
}

/** One route in {@link routeFetch}: a URL predicate and the response to give. */
export interface FetchRoute {
    when: (url: string, init?: RequestInit) => boolean;
    respond: Response | ((url: string, init?: RequestInit) => Response | Promise<Response>);
}

/**
 * Drive `global.fetch` from an ordered route table; the first match wins and an
 * unmatched URL is a 404 (never a silent undefined).
 *
 * @returns the calls made, in order, so a spec can assert WHICH url was read
 */
export function routeFetch(routes: FetchRoute[]): Array<{ url: string; init?: RequestInit }> {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        for (const route of routes) {
            if (route.when(url, init)) {
                return typeof route.respond === 'function'
                    ? route.respond(url, init)
                    : route.respond;
            }
        }
        return mockResponse(404);
    });
    return calls;
}

/** The body of the nth `fetchWithRetry` call, built from its per-attempt factory. */
export function requestInitOf(fetchWithRetry: jest.Mock, callIndex = 0): RequestInit {
    const factory = fetchWithRetry.mock.calls[callIndex][1] as () => RequestInit;
    return factory();
}

/** The HTML a `fetchWithRetry` call uploaded, read back off its FormData blob. */
export async function uploadedTextOf(fetchWithRetry: jest.Mock, callIndex = 0): Promise<string> {
    const init = requestInitOf(fetchWithRetry, callIndex);
    const blob = (init.body as FormData).get('data') as Blob;
    return blob.text();
}

export { mockFetch, applyContentPatches };
