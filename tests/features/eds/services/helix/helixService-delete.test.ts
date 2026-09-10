/**
 * What a DELETE against the Helix Admin API is allowed to conclude.
 *
 * `deleteResource` is one body shared by `unpublishPage` (live) and
 * `deletePreview` (preview), and its status ladder decides three different
 * things: whether the caller gets `false`, whether it throws, and how long it
 * waits before retrying. Each rung was unconstrained.
 *
 * The two that matter most to an SC:
 *
 *   - A refused credential (401/403) returns `false`; it must NOT throw, because
 *     `unpublishPages` counts failures across dozens of paths and one refusal is
 *     not a reason to abandon the rest.
 *   - Anything else that is not ok DOES throw, and the message names the
 *     operation — "unpublish" or "delete preview" — because that is the only
 *     place the partition appears in anything a user reads.
 *
 * `sleep` is mocked so the 429 backoff is asserted as a DURATION handed to the
 * one sleep, rather than waited through (see `src/core/utils/sleep.ts`).
 */

import { sleep } from '@/core/utils/sleep';
import {
    createHelixService,
    installFetchMock,
    restoreFetch,
    type HelixServiceType,
} from './helixService.testUtils';

jest.mock('@/core/utils/sleep');

/** A refusal, carrying the header and body `captureErrorDetail` reads. */
const refused = (status: number): Partial<Response> => ({
    ok: false,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Forbidden',
    headers: { get: (h: string) => (h === 'x-error' ? '[admin] not authorized' : null) } as unknown as Headers,
    text: async () => '',
});

const plain = (status: number, statusText = ''): Partial<Response> => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => null } as unknown as Headers,
    text: async () => '',
});

/** 429 with an optional `retry-after`. */
const rateLimited = (retryAfter: string | null): Partial<Response> => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: {
        get: (h: string) => (h.toLowerCase() === 'retry-after' ? retryAfter : null),
    } as unknown as Headers,
});

describe('HelixService — the DELETE status ladder', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        service = await createHelixService();
    });

    afterEach(restoreFetch);

    it.each([401, 403])('answers false — not an exception — on a %i', async (status) => {
        mockFetch.mockResolvedValue(refused(status));

        await expect(service.unpublishPage('org', 'site', '/about')).resolves.toBe(false);
    });

    it('treats 404 as done: there was nothing left to remove', async () => {
        mockFetch.mockResolvedValue(plain(404, 'Not Found'));

        await expect(service.deletePreview('org', 'site', '/about')).resolves.toBe(true);
    });

    it('treats any other 2xx as done', async () => {
        // 200 rather than 204: the ladder must fall through to the ok check, not
        // depend on the exact success code Helix happens to send.
        mockFetch.mockResolvedValue(plain(200, 'OK'));

        await expect(service.unpublishPage('org', 'site', '/about')).resolves.toBe(true);
    });

    it('throws on a server error, naming the LIVE operation', async () => {
        mockFetch.mockResolvedValue(plain(500, 'Server Error'));

        await expect(service.unpublishPage('org', 'site', '/about')).rejects.toThrow(
            'Failed to unpublish: 500 Server Error',
        );
    });

    it('throws on a server error, naming the PREVIEW operation', async () => {
        mockFetch.mockResolvedValue(plain(500, 'Server Error'));

        await expect(service.deletePreview('org', 'site', '/about')).rejects.toThrow(
            'Failed to delete preview: 500 Server Error',
        );
    });
});

describe('HelixService — the 429 backoff', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        service = await createHelixService();
    });

    afterEach(restoreFetch);

    it('waits the seconds Helix asked for, in milliseconds', async () => {
        mockFetch.mockResolvedValueOnce(rateLimited('2')).mockResolvedValueOnce(plain(204));

        await expect(service.unpublishPage('org', 'site', '/about')).resolves.toBe(true);

        expect(sleep).toHaveBeenCalledWith(2000);
    });

    it('falls back to one second when Helix sends no retry-after', async () => {
        mockFetch.mockResolvedValueOnce(rateLimited(null)).mockResolvedValueOnce(plain(204));

        await service.unpublishPage('org', 'site', '/about');

        expect(sleep).toHaveBeenCalledWith(1000);
    });

    it('caps the wait at thirty seconds however long Helix asks for', async () => {
        mockFetch.mockResolvedValueOnce(rateLimited('600')).mockResolvedValueOnce(plain(204));

        await service.unpublishPage('org', 'site', '/about');

        expect(sleep).toHaveBeenCalledWith(30000);
    });
});

/**
 * `unpublishPages` reports on TWO partitions, and "did anything go" is true when
 * either one did. The reset path reads `liveFailed` instead, because the live
 * entry is what the CDN serves — a run where every live DELETE was refused
 * reported success for months.
 */
describe('HelixService.unpublishPages — success across two partitions', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        service = await createHelixService();
    });

    afterEach(restoreFetch);

    it('counts a live-only success as success, and names the preview failure', async () => {
        // Order is live first, then preview (see `unpublishPages`).
        mockFetch.mockResolvedValueOnce(plain(204)).mockResolvedValueOnce(refused(403));

        const result = await service.unpublishPages('org', 'site', 'main', ['/about']);

        expect(result).toEqual({
            success: true,
            count: 1,
            total: 1,
            liveFailed: 0,
            previewFailed: 1,
        });
    });

    it('counts a preview-only success as success, and names the live failure', async () => {
        mockFetch.mockResolvedValueOnce(refused(403)).mockResolvedValueOnce(plain(204));

        const result = await service.unpublishPages('org', 'site', 'main', ['/about']);

        expect(result).toEqual({
            success: true,
            count: 1,
            total: 1,
            liveFailed: 1,
            previewFailed: 0,
        });
    });

    it('CONTROL — both partitions refused is not a success', async () => {
        mockFetch.mockResolvedValue(refused(403));

        const result = await service.unpublishPages('org', 'site', 'main', ['/about']);

        expect(result).toEqual({
            success: false,
            count: 0,
            total: 1,
            liveFailed: 1,
            previewFailed: 1,
        });
    });
});
