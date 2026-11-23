/**
 * Whether a DA.live source path exists, answered so that a write never lands on a page that is
 * there. DA.live's source POST always writes (`createSource`), so this probe is the only thing
 * that keeps a page someone wrote: only a definite 404 means absent, and any other answer or a
 * failed request counts as present. A 401 is an expired sign-in and is thrown, so the caller can
 * ask the person to sign in again instead of reading it as "no page".
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack in its own process).
 *
 * @module features/eds/services/daLive/daLiveSourceProbe
 */

import { DaLiveAuthError } from '../types';
import type { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL } from './daLiveConstants';
import type { Logger } from '@/types/logger';

/** What the probe needs: the client that sends the HEAD and a logger for an unknown answer. */
export interface SourceProbeDeps {
    apiClient: Pick<DaLiveApiClient, 'fetchWithRetry'>;
    logger: Logger;
}

/**
 * True unless DA.live answers 404 for `/source/<sourcePath>` (`org/site/path`).
 *
 * @throws DaLiveAuthError on a 401, or when the request itself throws one
 */
export async function sourcePresent(
    deps: SourceProbeDeps,
    token: string,
    sourcePath: string,
): Promise<boolean> {
    try {
        const response = await deps.apiClient.fetchWithRetry(
            `${DA_LIVE_BASE_URL}/source/${sourcePath}`,
            { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.status === 401) {
            throw new DaLiveAuthError('Authentication expired. Please log in again.');
        }
        if (response.ok || response.status === 404) return response.ok;
        deps.logger.warn(`[DA.live] ${sourcePath} not checked (${response.status}); kept`);
        return true;
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        deps.logger.warn(`[DA.live] ${sourcePath} not checked: ${(error as Error).message}; kept`);
        return true;
    }
}
