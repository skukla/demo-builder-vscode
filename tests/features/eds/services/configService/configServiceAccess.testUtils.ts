/**
 * Shared setup for the configServiceAccess suites.
 *
 * Both open the same way: a logger double, a token provider answering a fixed
 * IMS bearer, `global.fetch` replaced with a jest.fn, and the two real response
 * SHAPES live-verified 2026-08-14 against `skukla/bodea-source`. The response
 * builders below are the other half — every call in this module goes through one
 * `fetch`, so a suite that hand-rolls its own response object is one field away
 * from proving nothing.
 *
 * NOTE: `*.testUtils.ts` (not `*.test.ts`) so Jest does not run it as a suite.
 */

import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

export const logger: Logger = createMockLogger();

export const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('ims-token') };

/** The bearer `tokenProvider` hands out. Not a credential — a fixed test string. */
export const IMS_TOKEN = 'ims-token';

/**
 * Real response SHAPE from `GET config/{org}.json` (2026-08-14); the identifiers
 * are synthetic. The shape is what the parser must handle — real addresses and
 * IMS ids would only add PII to a public repo.
 */
export const ORG_CONFIG = {
    users: [{ id: 'Xx0FakeImsUserIdForTests', email: 'admin@example.test', roles: ['admin'] }],
    lastModified: '2026-08-14T12:31:56.272Z',
    created: '2026-08-14T12:24:13.748Z',
    version: 6,
};

/** Real response shape from `GET config/{org}/sites/{site}/access/admin.json`. */
export const SITE_ACCESS = { role: { admin: ['admin@example.test'] }, requireAuth: 'auto' };

/** Restore the defaults every suite in this family starts from. */
export function resetAccessMocks(): void {
    jest.clearAllMocks();
    tokenProvider.getAccessToken.mockResolvedValue(IMS_TOKEN);
    global.fetch = jest.fn();
}

/** Queue one response with a JSON body. */
export function mockFetchOnce(status: number, body: unknown = {}): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: { get: () => null },
    });
}

/** Queue one NON-OK response whose `text()` is arbitrary free text, as a real service returns. */
export function mockFailureBody(text: string, status = 403): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({}),
        text: async () => text,
        headers: { get: () => null },
    });
}

/** Queue one 2xx whose body is NOT JSON — `json()` rejects, as fetch's does. */
export function mockUnparseableOnce(status = 200): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
        text: async () => '<html>not json</html>',
        headers: { get: () => null },
    });
}

/** The args of the nth `fetch` call: `[url, init]`. */
export function fetchCall(index: number): [string, RequestInit] {
    return (global.fetch as jest.Mock).mock.calls[index] as [string, RequestInit];
}
