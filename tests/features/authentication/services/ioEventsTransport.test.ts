/**
 * I/O Events transport tests: the typed, sanitized error and the access-denied
 * test callers use to decide whether to subscribe the credential and retry.
 *
 * Headers, timeouts, non-JSON bodies, already-gone DELETEs and the pagination host
 * check are driven through the endpoints in `ioEventsClient.test.ts`, which builds
 * the real transport under the client.
 */

import {
    IoEventsApiError,
    isEventsAccessDenied,
} from '@/features/authentication/services/ioEventsTransport';

describe('IoEventsApiError', () => {
    it('carries its status and a stable name', () => {
        const error = new IoEventsApiError('List providers failed (HTTP 403)', 403);

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('IoEventsApiError');
        expect(error.status).toBe(403);
        expect(error.message).toBe('List providers failed (HTTP 403)');
    });
});

describe('isEventsAccessDenied', () => {
    it('returns false for a plain Error', () => {
        expect(isEventsAccessDenied(new Error('403'))).toBe(false);
    });

    it('returns false for non-error values', () => {
        expect(isEventsAccessDenied(undefined)).toBe(false);
        expect(isEventsAccessDenied('403')).toBe(false);
        expect(isEventsAccessDenied({ status: 403 })).toBe(false);
    });
});

describe('isEventsAccessDenied — typed errors', () => {
    it.each([401, 403])('returns true for HTTP %i', (status) => {
        expect(isEventsAccessDenied(new IoEventsApiError('denied', status))).toBe(true);
    });

    it.each([400, 404, 500])('returns false for HTTP %i', (status) => {
        expect(isEventsAccessDenied(new IoEventsApiError('failed', status))).toBe(false);
    });
});
