/**
 * DA.live Service Constants
 *
 * Shared constants for DA.live service operations.
 * Extracted to allow reuse between DaLiveService modules.
 */

/** DA.live Admin API base URL */
export const DA_LIVE_BASE_URL = 'https://admin.da.live';

/** CitiSignal source configuration */
export const CITISIGNAL_SOURCE = {
    org: 'demo-system-stores',
    site: 'accs-citisignal',
    indexUrl: 'https://main--accs-citisignal--demo-system-stores.aem.live/full-index.json',
};

/** Maximum retry attempts for transient errors */
export const MAX_RETRY_ATTEMPTS = 3;

/** Retry delay base (exponential backoff) */
export const RETRY_DELAY_BASE = 1000;

/** HTTP status codes that should trigger retry */
export const RETRYABLE_STATUS_CODES = [502, 503, 504];

/** Calculate exponential backoff delay */
export const getRetryDelay = (attempt: number): number => RETRY_DELAY_BASE * Math.pow(2, attempt - 1);

/** Normalize path by removing leading slash */
export const normalizePath = (path: string): string => path.startsWith('/') ? path.slice(1) : path;
