/**
 * HelixService Tests - Rate Limiting
 *
 * Tests for Helix Admin API rate limit handling:
 * - 429 retry with Retry-After header support
 * - Batched preview DELETE execution (respects 10 req/s limit)
 * - Max retry exhaustion
 *
 * Regression: unbounded Promise.all for preview DELETEs exceeds
 * the 10 req/s per-project Admin API rate limit when sites have
 * more than 10 pages.
 *
 * The mock wall, the type alias and the fetch swap live in
 * `helixService.testUtils` — shared with the other three suites that mock this
 * service's module boundary. It owns the service import so the mocks are
 * registered before the service is loaded; do not import the service here.
 */

import {
    createHelixService,
    installFetchMock,
    mockLogger,
    restoreFetch,
    type HelixServiceType,
} from './helixService.testUtils';

describe('HelixService - Rate Limiting', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;

    /** Create a mock 429 Too Many Requests response */
    function make429(retryAfter: string = '0'): Partial<Response> {
        return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
                get: (key: string) => key.toLowerCase() === 'retry-after' ? retryAfter : null,
            } as unknown as Headers,
        };
    }

    /** Create a mock 204 No Content success response */
    function make204(): Partial<Response> {
        return { ok: true, status: 204 };
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        service = await createHelixService();
    });

    afterEach(restoreFetch);

    describe('429 retry handling', () => {
        it('should retry on 429 and succeed on subsequent attempt', async () => {
            // Live DELETE: 429 on first attempt, then 204 on retry
            mockFetch
                .mockResolvedValueOnce(make429('0'))
                .mockResolvedValueOnce(make204())
                // Preview DELETE: success
                .mockResolvedValueOnce(make204());

            const result = await service.unpublishPages('org', 'site', 'main', ['/about']);

            expect(result).toMatchObject({ success: true, count: 1 });
            // 3 calls: initial 429 + retry 204 + preview 204
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('should log warning with retry-after value on 429', async () => {
            mockFetch
                .mockResolvedValueOnce(make429('0'))
                .mockResolvedValueOnce(make204())
                .mockResolvedValueOnce(make204());

            await service.unpublishPages('org', 'site', 'main', ['/about']);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringMatching(/Rate limited.*retrying.*attempt 1\/3/),
            );
        });

        it('should give up after 3 retries on persistent 429', async () => {
            // All attempts return 429 (original + 3 retries = 4 fetch calls)
            mockFetch.mockResolvedValue(make429('0'));

            await expect(
                service.unpublishPages('org', 'site', 'main', ['/about']),
            ).rejects.toThrow(/rate limited/i);

            // 4 calls: original + 3 retries
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it('should handle 429 on preview DELETE and retry', async () => {
            // Live DELETE: success
            mockFetch.mockResolvedValueOnce(make204());
            // Preview DELETE: 429 then success
            mockFetch
                .mockResolvedValueOnce(make429('0'))
                .mockResolvedValueOnce(make204());

            const result = await service.unpublishPages('org', 'site', 'main', ['/about']);

            expect(result).toMatchObject({ success: true, count: 1 });
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('batched preview DELETE execution', () => {
        it('should process more than 5 paths correctly (batched)', async () => {
            const paths = ['/p1', '/p2', '/p3', '/p4', '/p5', '/p6', '/p7'];

            // All fetches succeed
            mockFetch.mockResolvedValue(make204());

            const result = await service.unpublishPages('org', 'site', 'main', paths);

            expect(result.success).toBe(true);
            expect(result.count).toBe(7);
            // 7 live (sequential) + 7 preview (batched) = 14
            expect(mockFetch).toHaveBeenCalledTimes(14);
        });

        it('should process exactly 5 paths in a single batch', async () => {
            const paths = ['/a', '/b', '/c', '/d', '/e'];

            mockFetch.mockResolvedValue(make204());

            const result = await service.unpublishPages('org', 'site', 'main', paths);

            expect(result.success).toBe(true);
            expect(result.count).toBe(5);
            // 5 live + 5 preview = 10
            expect(mockFetch).toHaveBeenCalledTimes(10);
        });

        it('should count preview successes across batches', async () => {
            const paths = ['/p1', '/p2', '/p3', '/p4', '/p5', '/p6'];

            // Live DELETEs: all 6 succeed
            for (let i = 0; i < 6; i++) {
                mockFetch.mockResolvedValueOnce(make204());
            }
            // Preview batch 1 (5 items): 4 succeed, 1 returns 403
            mockFetch.mockResolvedValueOnce(make204());
            mockFetch.mockResolvedValueOnce(make204());
            mockFetch.mockResolvedValueOnce(make204());
            mockFetch.mockResolvedValueOnce(make204());
            mockFetch.mockResolvedValueOnce({
                ok: false, status: 403, statusText: 'Forbidden',
            });
            // Preview batch 2 (1 item): succeeds
            mockFetch.mockResolvedValueOnce(make204());

            const result = await service.unpublishPages('org', 'site', 'main', paths);

            expect(result.success).toBe(true);
            // liveCount=6, previewCount=5 — max(6,5)=6
            expect(result.count).toBe(6);
            expect(mockFetch).toHaveBeenCalledTimes(12);
        });
    });
});
