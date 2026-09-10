/**
 * Shared harness for the `daLiveSourceOperations` suite family.
 *
 * TWO PIECES OF THE OLD PREAMBLE WERE DEAD and are not carried here. The
 * `@/core/utils/timeoutConfig` mock had no reader — this module imports the
 * types, the api client (type-only), the path constants and a logger, and none
 * of them reads a timeout. And `global.fetch` was never called: since the
 * 2026-08-22 transport consolidation EVERY request in this module, including
 * `deleteSiteRoot`, goes through `apiClient.fetchWithRetry`. The deleteSiteRoot
 * tests that stubbed `global.fetch` were passing on a client that returned
 * `undefined`, so `response.ok` threw and the catch swallowed it — they proved
 * nothing about either branch.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockLogger } from '../../../../helpers/loggerFake';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import type { Logger } from '@/types/logger';

export { DaLiveSourceOperations };
export { DaLiveNetworkError } from '@/features/eds/services/types';

/** The token every request in this module carries. */
export const TOKEN = 't';

export type MockApiClient = {
    getImsToken: jest.Mock;
    fetchWithRetry: jest.Mock;
    createErrorFromResponse: jest.Mock;
};

/** What a stubbed DA.live response answers with. */
export interface ResponseOptions {
    /** Parsed body for `json()`. */
    body?: unknown;
    /** Raw body for `text()`. */
    text?: string;
    headers?: Record<string, string>;
}

export function makeResponse(status: number, options: ResponseOptions = {}): Response {
    const { body, text = '', headers = {} } = options;
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        headers: { get: (key: string) => lower[key.toLowerCase()] ?? null } as unknown as Headers,
        json: jest.fn().mockResolvedValue(body),
        text: jest.fn().mockResolvedValue(text),
    } as unknown as Response;
}

/**
 * Fresh client fake, logger and subject.
 *
 * Call from each spec's OWN `beforeEach` — a `beforeEach` declared here would not
 * apply to a module that imports it.
 */
export function setupSourceOperations(): {
    service: DaLiveSourceOperations;
    apiClient: MockApiClient;
    logger: Logger;
} {
    const apiClient: MockApiClient = {
        getImsToken: jest.fn().mockResolvedValue(TOKEN),
        fetchWithRetry: jest.fn(),
        createErrorFromResponse: jest.fn(),
    };
    const logger = createMockLogger() as unknown as Logger;
    return {
        apiClient,
        logger,
        service: new DaLiveSourceOperations(apiClient as unknown as DaLiveApiClient, logger),
    };
}

/** The init object every GET in this module sends. */
export const GET_INIT = {
    method: 'GET',
    headers: { Authorization: `Bearer ${TOKEN}` },
};

/** The init object every DELETE in this module sends. */
export const DELETE_INIT = {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
};
