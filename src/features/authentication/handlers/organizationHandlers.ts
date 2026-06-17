/**
 * Org-context re-detection handler.
 *
 * - re-detect-context: clear the org-context caches and re-read `console where`
 *   without forcing re-login (the terminal-then-reload dance, in-app).
 *
 * (The in-app org-picker handlers were removed: Adobe resolves the org at
 * sign-in, and IMS tokens are org-bound, so a picker can't switch orgs — see
 * `.rptc/plans/adobe-org-context-self-heal/overview.md`.)
 */

import type { AdobeContext } from '@/features/authentication/services/types';
import { HandlerContext } from '@/types/handlers';
import { DataResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * re-detect-context - clear org-context caches + re-read `console where`.
 *
 * Composes the targeted cache clears (session + console-where + validation) so
 * an external auth change (terminal force-login / org-select) becomes visible
 * in-app WITHOUT forcing re-login and WITHOUT nuking the auth-status / token
 * caches (which `clearAll` would).
 */
export async function handleReDetectContext(
    context: HandlerContext,
): Promise<DataResult<AdobeContext>> {
    try {
        const cacheManager = context.authManager?.getCacheManager();
        cacheManager?.clearSessionCaches();
        cacheManager?.clearConsoleWhereCache();
        cacheManager?.clearValidationCache();

        const adobeContext = (await context.authManager?.getCurrentContext()) ?? {};
        await context.sendMessage('re-detect-context', adobeContext);
        return { success: true, data: adobeContext };
    } catch (error) {
        const message = 'Failed to re-detect Adobe context. Please try again.';
        context.logger.error('Failed to re-detect context:', toError(error));
        await context.sendMessage('re-detect-context', { error: message });
        return { success: false, error: message };
    }
}
