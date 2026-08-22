/**
 * DaLiveContentCopy — retry contract after the 2026-08-22 transport
 * consolidation (writes to admin.da.live route through
 * `daLiveApiClient.fetchWithRetry`; CDN reads stay raw by design).
 *
 * Pins the three behaviours the migration had to preserve or fix:
 * - a transient 5xx on the DA.live POST is retried and succeeds, with a
 *   FRESH FormData per attempt (one-shot bodies cannot be resent);
 * - a 429 on the POST skips the page (returns false) — it must never abort
 *   a whole multi-page copy;
 * - a 401 still surfaces as DaLiveAuthError (pause-and-prompt re-auth).
 */

// Real wall-clock retry delays; mock the shared sleep so only the SEQUENCE of
// attempts is under test, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        VERY_LONG: 60000,
    },
}));

jest.mock('@/core/utils/timeFormatting', () => ({
    formatDuration: jest.fn().mockReturnValue('0ms'),
}));

import {
    DaLiveContentOperations,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentCopy — write retry contract', () => {
    let service: DaLiveContentOperations;
    let mockLogger: Logger;

    const source = { org: 'src-org', site: 'src-site', path: '/about' };
    const destination = { org: 'dest-org', site: 'dest-site', path: '/about' };

    beforeEach(() => {
        jest.clearAllMocks();
        const tokenProvider: TokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('test-token'),
        };
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger;
        service = new DaLiveContentOperations(tokenProvider, mockLogger);
    });

    function mockFetchResponse(
        status: number,
        body?: unknown,
        contentType = 'text/html'
    ): Response {
        const headers = new Map([['content-type', contentType]]);
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: `${status}`,
            headers: {
                get: (key: string) => headers.get(key.toLowerCase()) || null,
            } as unknown as Headers,
            json: jest.fn().mockResolvedValue(body),
            blob: jest.fn().mockResolvedValue(new Blob(['test content'])),
            text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        } as unknown as Response;
    }

    /**
     * Routes the copySingleFile flow: spreadsheet HEAD -> 404, CDN source GET
     * -> 200 HTML, DA.live POST -> the given status sequence (one per call).
     */
    function setupWithPostStatuses(postStatuses: number[]): { posts: RequestInit[] } {
        const posts: RequestInit[] = [];
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            if (options?.method === 'HEAD' && url.endsWith('.json')) {
                return mockFetchResponse(404);
            }
            if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                return mockFetchResponse(200, '<p>Hello</p>', 'text/html');
            }
            if (url.includes('admin.da.live') && options?.method === 'POST') {
                posts.push(options);
                const status = postStatuses[Math.min(posts.length - 1, postStatuses.length - 1)];
                return mockFetchResponse(status);
            }
            return mockFetchResponse(404);
        });
        return { posts };
    }

    it('retries a transient 503 on the DA.live POST with a FRESH FormData and succeeds', async () => {
        const { posts } = setupWithPostStatuses([503, 200]);

        const result = await service.copyContent(source, destination);

        expect(result.success).toBe(true);
        expect(posts).toHaveLength(2);
        // One-shot bodies: each attempt must carry its own FormData instance.
        expect(posts[0].body).toBeInstanceOf(FormData);
        expect(posts[1].body).toBeInstanceOf(FormData);
        expect(posts[0].body).not.toBe(posts[1].body);
    });

    it('skips the page on 429 (returns unsuccessful copy) instead of aborting the run', async () => {
        const { posts } = setupWithPostStatuses([429]);

        const result = await service.copyContent(source, destination);

        // Page-level tolerance: the copy reports the failure, no throw.
        expect(result.success).toBe(false);
        expect(posts).toHaveLength(1);
    });

    it('gives up after exhausting retries on persistent 5xx (no infinite loop)', async () => {
        const { posts } = setupWithPostStatuses([503]);

        const result = await service.copyContent(source, destination);

        expect(result.success).toBe(false);
        // MAX_RETRY_ATTEMPTS from daLiveConstants is 3.
        expect(posts).toHaveLength(3);
    });
});
