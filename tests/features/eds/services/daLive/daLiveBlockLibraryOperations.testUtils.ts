/**
 * Shared harness for the `daLiveBlockLibraryOperations` suites.
 *
 * These suites construct the module DIRECTLY with doubles for its four
 * collaborators, rather than reaching it through `DaLiveContentOperations` and
 * a `global.fetch` stub the way the `daLiveContentOperations-*` suites do. Both
 * reach the same code; only this shape can assert the ARGUMENTS handed to
 * `createSource`, `deleteSource`, `updateSiteConfig` and `copySingleFile`,
 * which is where a malformed call would otherwise hide (ADR-016 unit tier).
 *
 * It also gives the module a suite under its own name, so the mirror
 * convention `scripts/focusModule.mjs` uses can find it — before this file the
 * module had no mirrored suite and could not be focused or ratcheted at all.
 *
 * Not a `*.test.ts` file, so Jest does not run it directly.
 */

import { DaLiveBlockLibraryOperations } from '@/features/eds/services/daLive/daLiveBlockLibraryOperations';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

/** The token every harness resolves from `getImsToken`. */
export const HARNESS_TOKEN = 'mock-ims-token';

/** The doubles, kept as `jest.Mock` so specs can assert on their calls. */
export interface BlockLibraryDoubles {
    getImsToken: jest.Mock;
    fetchWithRetry: jest.Mock;
    createErrorFromResponse: jest.Mock;
    sourceExists: jest.Mock;
    deleteSource: jest.Mock;
    createSource: jest.Mock;
    updateSiteConfig: jest.Mock;
    copySingleFile: jest.Mock;
}

export interface BlockLibraryHarness extends BlockLibraryDoubles {
    ops: DaLiveBlockLibraryOperations;
    logger: Logger;
}

/**
 * A `Response` stand-in for `fetchWithRetry`.
 *
 * `ok` is derived from the status rather than passed, because the module reads
 * both and a hand-set pair can disagree with itself.
 */
export function fakeResponse(status: number, body?: unknown, statusText?: string): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: statusText ?? (status === 200 ? 'OK' : 'Error'),
        json: jest.fn().mockResolvedValue(body),
        text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
    } as unknown as Response;
}

/** The `.da/library/blocks.json` sheet body shape DA.live returns on a read. */
export function fakeSheet(rows: Array<Record<string, string>>): {
    data: { data: Array<Record<string, string>> };
} {
    return { data: { data: rows } };
}

/** Build the module under test plus the doubles it was constructed with. */
export function createBlockLibraryHarness(): BlockLibraryHarness {
    const doubles: BlockLibraryDoubles = {
        getImsToken: jest.fn().mockResolvedValue(HARNESS_TOKEN),
        fetchWithRetry: jest.fn().mockResolvedValue(fakeResponse(200)),
        createErrorFromResponse: jest
            .fn()
            .mockImplementation(
                (response: Response, operation: string) =>
                    new Error(`${operation} failed: ${response.status}`)
            ),
        sourceExists: jest.fn().mockResolvedValue(false),
        deleteSource: jest.fn().mockResolvedValue({ success: true }),
        createSource: jest.fn().mockResolvedValue({ success: true, path: '/written' }),
        updateSiteConfig: jest.fn().mockResolvedValue({ success: true }),
        copySingleFile: jest.fn().mockResolvedValue(true),
    };

    const apiClient = {
        getImsToken: doubles.getImsToken,
        fetchWithRetry: doubles.fetchWithRetry,
        createErrorFromResponse: doubles.createErrorFromResponse,
    } as unknown as DaLiveApiClient;
    const sourceOps = {
        sourceExists: doubles.sourceExists,
        deleteSource: doubles.deleteSource,
        createSource: doubles.createSource,
    } as unknown as DaLiveSourceOperations;
    const configOps = {
        updateSiteConfig: doubles.updateSiteConfig,
    } as unknown as DaLiveConfigOperations;
    const copyOps = {
        copySingleFile: doubles.copySingleFile,
    } as unknown as DaLiveContentCopy;

    const logger = createMockLogger() as unknown as Logger;
    const ops = new DaLiveBlockLibraryOperations(apiClient, sourceOps, configOps, copyOps, logger);

    return { ops, logger, ...doubles };
}

/** The `[url, init]` pair of the nth `fetchWithRetry` call, typed. */
export function fetchCall(
    fetchWithRetry: jest.Mock,
    index: number
): [string, { method?: string; headers?: Record<string, string>; body?: unknown }] {
    return fetchWithRetry.mock.calls[index] as [
        string,
        { method?: string; headers?: Record<string, string>; body?: unknown },
    ];
}

/** Read the `data` part back out of a `createJsonSpreadsheet` FormData body. */
export async function readSpreadsheetBody(body: unknown): Promise<unknown> {
    const blob = (body as FormData).get('data') as Blob;
    return JSON.parse(await blob.text());
}
