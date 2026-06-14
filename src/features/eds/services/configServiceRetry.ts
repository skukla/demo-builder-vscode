/**
 * Configuration Service propagation-retry helper.
 *
 * After the AEM Code Sync GitHub App is installed, the admin role it grants
 * propagates across Adobe identity systems with a delay (typically 30–90s).
 * Until it lands, Configuration Service writes return 403. This helper retries
 * a write while it returns 403, on a fixed backoff that covers that window.
 *
 * Shared by the create path (`storefrontSetupPhase3`, which wraps this in its
 * own conditional loop that also interleaves 409→update and 401→re-auth
 * handling) and the reset path (`edsResetService`, which uses the helper
 * directly). Both draw the backoff from the same constant.
 *
 * @module features/eds/services/configServiceRetry
 */

import type { ConfigServiceResult } from './configurationService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Backoff between Configuration Service write retries on a 403. Attempts land
 * at +30s, +45s, +60s — the last at ~135s after the first try, past the
 * documented 30–90s admin-role propagation window.
 */
export const CONFIG_SERVICE_PROPAGATION_DELAYS_MS: readonly number[] = [
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY,         // 30s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 1.5,   // 45s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 2,     // 60s
];

/**
 * Retry a Configuration Service write while it returns 403 (admin-role
 * propagation). Returns the first non-403 result — success, or any other
 * failure for the caller to handle. `onRetry` fires before each wait so callers
 * can surface progress (e.g. a wizard message or reset progress line).
 *
 * Only 403 is retried: success, 401, 404, 409, and 5xx are returned immediately
 * because more waiting will not change them.
 */
export async function retryConfigWriteOnPropagation(
    write: () => Promise<ConfigServiceResult>,
    onRetry?: (attempt: number, total: number) => void | Promise<void>,
): Promise<ConfigServiceResult> {
    let result = await write();
    const total = CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length;
    for (let i = 0; i < total && result.statusCode === 403; i++) {
        await onRetry?.(i + 1, total);
        await new Promise(resolve => setTimeout(resolve, CONFIG_SERVICE_PROPAGATION_DELAYS_MS[i]));
        result = await write();
    }
    return result;
}
