/**
 * One authenticated call to the AEM Configuration Service, and what its answer
 * means.
 *
 * Attaches the DA.live IMS bearer, sends the request, and turns the response
 * into a {@link ConfigServiceResult}: a 2xx is success, a 404 on a DELETE is
 * "already gone", and anything else becomes a user-facing message plus one log
 * line carrying Adobe's own `x-error` reason and `x-invocation-id`.
 *
 * Split out of `configurationService` on 2026-10-08 (EDS-8): how Adobe's refusals
 * are read and worded changes for different reasons than which site operations
 * exist. The access-role calls in `configServiceAccess` keep their own `call`,
 * which masks emails in bodies and classifies rather than words — a variant,
 * not the same job.
 *
 * @module features/eds/services/configService/configServiceRequest
 */

import type { TokenProvider } from '../daLive/daLiveApiClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Result of a Configuration Service operation
 */
export interface ConfigServiceResult {
    success: boolean;
    error?: string;
    /** HTTP status code from the API */
    statusCode?: number;
    /**
     * `false` when the update landed but the site's admin grants could NOT be
     * handed back afterwards.
     *
     * The config write genuinely succeeded, so this is not a failure — but the
     * grants are gone and nothing in the app can restore them, because the access
     * endpoint requires the very role that was lost. Silence is what makes that
     * permanent, so the loss rides out on the success result instead.
     * Absent means nothing needed restoring.
     */
    grantsRestored?: boolean;
    /** Masked addresses whose grants were lost, for the message that reports it. */
    lostGrants?: string[];
}

/**
 * Make an authenticated request to the Configuration Service API
 */
export async function requestConfigService(
    tokenProvider: TokenProvider,
    logger: Logger,
    method: string,
    url: string,
    body?: Record<string, unknown>,
): Promise<ConfigServiceResult> {
    try {
        const token = await getImsToken(tokenProvider);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
        };

        const fetchOptions: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        };

        if (body) {
            headers['content-type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (response.ok) {
            logger.debug(`[ConfigService] ${method} ${url} -> ${response.status} OK`);
            return { success: true, statusCode: response.status };
        }

        // 404 on DELETE means already gone — treat as success
        if (method === 'DELETE' && response.status === 404) {
            logger.debug(`[ConfigService] Site config already deleted (404)`);
            return { success: true, statusCode: 404 };
        }

        return await handleErrorResponse(logger, method, url, response);
    } catch (error) {
        const message = (error as Error).message;
        logger.error(`[ConfigService] Request failed: ${message}`);
        return { success: false, error: message };
    }
}

/** Handle a non-OK, non-404-DELETE response from the Configuration Service API. */
async function handleErrorResponse(
    logger: Logger,
    method: string,
    url: string,
    response: Response,
): Promise<ConfigServiceResult> {
    let errorBody = '';
    try {
        errorBody = await response.text();
    } catch {
        // Ignore parse errors
    }

    // Debug: log raw response body for auth failures to diagnose token type issues
    if (response.status === 401 || response.status === 403) {
        const safeBody = errorBody.replace(/[\r\n]/g, ' ').substring(0, 200);
        logger.debug(`[ConfigService] Auth failure raw response: ${safeBody}`);
    }

    // Adobe returns an EMPTY body on 401/403 and puts its stated reason in
    // `x-error`; `x-invocation-id` is the handle Adobe support needs to trace
    // the call. Both were discarded, which is why a field 403 was
    // undiagnosable from the logs. Absent headers are omitted rather than
    // padded, so the line carries only what Adobe actually said.
    const xError = response.headers?.get?.('x-error') ?? undefined;
    const invocationId = response.headers?.get?.('x-invocation-id') ?? undefined;
    const detail = [
        xError ? `x-error: ${xError}` : undefined,
        invocationId ? `x-invocation-id: ${invocationId}` : undefined,
    ]
        .filter(Boolean)
        .join(', ');

    const errorMessage = formatError(response.status, errorBody);
    // 409 (conflict) is handled by callers (delete + re-create) — log at info, not error
    const logLevel = response.status === 409 ? 'info' : 'error';
    logger[logLevel](
        `[ConfigService] ${method} ${url} -> ${response.status}: ${errorMessage}` +
            `${detail ? ` (${detail})` : ''}`,
    );
    return { success: false, error: errorMessage, statusCode: response.status };
}

/**
 * Get IMS token for Configuration Service authentication
 */
export async function getImsToken(tokenProvider: TokenProvider): Promise<string> {
    const token = await tokenProvider.getAccessToken();
    if (!token) {
        throw new Error('DA.live authentication required. Please sign in to DA.live first.');
    }
    return token;
}

/**
 * Format error message based on HTTP status
 */
function formatError(status: number, body: string): string {
    switch (status) {
        case 401:
            return 'Configuration Service auth failed. Your DA.live token may have expired — try re-authenticating with DA.live.';
        case 403:
            // Deliberately does NOT name AEM Code Sync. This 403 has been
            // observed on runs where code sync was verified and publishing
            // in the same session, so pointing at it sends people to
            // reinstall a working app instead of seeking the access they
            // actually lack.
            return 'Not authorized for Configuration Service (403). Your Adobe account lacks admin access to the site configuration for this GitHub namespace — ask an Adobe admin to grant it.';
        case 409:
            return 'Site configuration already exists. It may have been created by another process.';
        default:
            return `Configuration Service error (${status}): ${body || 'Unknown error'}`;
    }
}
