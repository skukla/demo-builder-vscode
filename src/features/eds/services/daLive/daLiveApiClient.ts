/**
 * DaLiveApiClient — shared low-level DA.live HTTP + auth primitives.
 *
 * The leaf layer every DA.live operations service builds on: IMS token access,
 * fetch-with-retry (429/5xx backoff + timeout), and HTTP→domain error mapping.
 * Extracted from `DaLiveContentOperations` as the foundation of its decomposition;
 * the specialized services take an instance of this client.
 *
 * Keep this module `vscode`-free (the MCP server constructs it in a separate
 * Node process).
 *
 * @module features/eds/services/daLive/daLiveApiClient
 */

import { DaLiveError, DaLiveAuthError, DaLiveNetworkError } from '../types';
import { MAX_RETRY_ATTEMPTS, RETRYABLE_STATUS_CODES, getRetryDelay } from './daLiveConstants';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Token provider interface for dependency injection. */
/** A RequestInit, or a factory yielding a fresh one per retry attempt. */
export type RetryRequestInit = RequestInit | (() => RequestInit);

export interface FetchRetryOptions {
    /**
     * What a 429 does: 'throw' (default) raises DaLiveNetworkError with
     * retryAfter; 'return' hands the response back for caller-side policy.
     */
    rateLimit?: 'throw' | 'return';
}

export interface TokenProvider {
    getAccessToken(): Promise<string | null>;
}

/** Shared low-level DA.live HTTP + auth client. */
export class DaLiveApiClient {
    constructor(
        private readonly tokenProvider: TokenProvider,
        private readonly logger: Logger,
    ) {}

    /**
     * Get the IMS token from the TokenProvider.
     * @throws DaLiveAuthError if not authenticated
     */
    async getImsToken(): Promise<string> {
        const token = await this.tokenProvider.getAccessToken();

        if (!token) {
            throw new DaLiveAuthError('Not authenticated. Please log in to Adobe.');
        }

        return token;
    }

    /** Fetch with 429/5xx retry (exponential backoff) and a per-attempt timeout. */
    async fetchWithRetry(
        url: string,
        options: RetryRequestInit,
        retryOpts: FetchRetryOptions = {},
    ): Promise<Response> {
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                // Factory support: one-shot bodies (FormData streams) cannot be
                // resent, so callers pass a factory and get a FRESH RequestInit
                // per attempt (2026-08-22 content-copy consolidation).
                const init = typeof options === 'function' ? options() : options;
                const response = await fetch(url, {
                    ...init,
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (response.status === 429) {
                    if (retryOpts.rateLimit === 'return') {
                        // Page-level tolerance: the caller skips one page rather
                        // than aborting a whole multi-page copy.
                        return response;
                    }
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                    throw new DaLiveNetworkError(
                        'Rate limited. Please wait before making more requests.',
                        retryAfter,
                    );
                }

                if (
                    RETRYABLE_STATUS_CODES.includes(response.status) &&
                    attempt < MAX_RETRY_ATTEMPTS
                ) {
                    this.logger.debug(
                        `[DA.live] Retrying after ${response.status}, attempt ${attempt}`,
                    );
                    await sleep(getRetryDelay(attempt));
                    continue;
                }

                return response;
            } catch (error) {
                if (error instanceof DaLiveAuthError || error instanceof DaLiveNetworkError)
                    throw error;

                const errorMessage = (error as Error).message || 'Unknown error';
                if (attempt < MAX_RETRY_ATTEMPTS && !errorMessage.includes('abort')) {
                    this.logger.debug(`[DA.live] Network error, retrying: ${errorMessage}`);
                    await sleep(getRetryDelay(attempt));
                    continue;
                }

                throw new DaLiveNetworkError(`Network error: ${errorMessage}`);
            }
        }
        throw new DaLiveNetworkError('Max retry attempts exceeded');
    }

    /** Map an HTTP response to a user-friendly DaLiveError (throws DaLiveAuthError on 401). */
    createErrorFromResponse(response: Response, operation: string): DaLiveError {
        const status = response.status;
        let message: string;

        switch (status) {
            case 401:
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            case 403:
                message = `Access denied when trying to ${operation}. Check your permissions.`;
                break;
            case 404:
                message = `Resource not found when trying to ${operation}.`;
                break;
            case 500:
            case 502:
            case 503:
            case 504:
                message = `Server error occurred while trying to ${operation}. Please try again later.`;
                break;
            default:
                message = `Unexpected error (${status}) while trying to ${operation}.`;
        }

        return new DaLiveError(message, `HTTP_${status}`, status);
    }
}
