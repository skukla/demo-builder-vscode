import { getLogger } from '@/core/logging/debugLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** User-facing message when the account lacks the Developer / System Admin role. */
const PERMISSION_DENIED_MESSAGE =
    'Your account lacks Developer or System Admin role for this organization. ' +
    'Please select a different organization or contact your administrator to request App Builder access.';

/**
 * Check if message indicates a permission-related error (SOP §10 compliance)
 */
function isPermissionError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('permission')) return true;
    if (lowerMessage.includes('unauthorized')) return true;
    if (lowerMessage.includes('forbidden')) return true;
    if (lowerMessage.includes('access denied')) return true;
    if (lowerMessage.includes('insufficient privileges')) return true;
    return false;
}

/**
 * Validates organization-level capabilities (App Builder developer permissions).
 *
 * Phase 4a removed the ambient `validateAndClearInvalidOrgContext` /
 * `validateOrganizationAccess` flow: org context is no longer a mutated global
 * to police. Reachability is resolved per-op via `ensureOrgContext` +
 * `withOrgContext` targeting. Only the developer-permission probe remains.
 */
export class OrganizationValidator {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private logger: Logger,
        private cacheManager: AuthCacheManager,
    ) {}

    /**
     * Test if the current user has Developer or System Admin permissions
     * These permissions are required to create and manage App Builder projects
     *
     * @returns {Promise<{ hasPermissions: boolean; error?: string }>}
     */
    async testDeveloperPermissions(): Promise<{ hasPermissions: boolean; error?: string }> {
        // Org-stable result — reuse the cached probe to avoid a redundant
        // multi-second `aio app list` CLI call (cache cleared on auth/org change).
        const cached = this.cacheManager.getCachedDeveloperPermissions();
        if (cached) {
            this.debugLogger.debug('[Org Validator] Using cached developer-permission result');
            return cached;
        }

        try {
            this.debugLogger.debug('[Org Validator] Testing Developer permissions via App Builder access');

            // Try to list App Builder projects - this requires Developer or System Admin role
            const result = await this.commandManager.execute(
                'aio app list --json',
                { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
            );

            if (result.code === 0) {
                this.debugLogger.debug('[Org Validator] Developer permissions confirmed - App Builder access successful');
                return this.cacheDeveloperPermissions({ hasPermissions: true });
            }

            // Check for specific permission-related error messages (SOP §10: using predicate)
            const errorMsg = result.stderr || '';
            if (isPermissionError(errorMsg)) {
                this.debugLogger.debug('[Org Validator] Developer permissions denied - App Builder access failed with permission error');
                return this.cacheDeveloperPermissions({ hasPermissions: false, error: PERMISSION_DENIED_MESSAGE });
            }

            // Other errors (network, etc.) - assume permissions are OK but service
            // unavailable. Transient → do NOT cache, so it re-probes next time.
            this.debugLogger.debug('[Org Validator] App Builder access failed with non-permission error, assuming permissions OK');
            return { hasPermissions: true };
        } catch (error) {
            const errorString = toError(error).message;
            this.debugLogger.debug('[Org Validator] Developer permissions test failed:', error);

            // Check if it's a permission-related error in the exception (SOP §10: using predicate)
            if (isPermissionError(errorString)) {
                return this.cacheDeveloperPermissions({ hasPermissions: false, error: PERMISSION_DENIED_MESSAGE });
            }

            // If we can't test due to other errors, assume permissions are OK to avoid
            // false negatives. Transient → do NOT cache.
            return { hasPermissions: true };
        }
    }

    /** Cache a DEFINITIVE permission outcome and return it (transient results aren't cached). */
    private cacheDeveloperPermissions(
        result: { hasPermissions: boolean; error?: string },
    ): { hasPermissions: boolean; error?: string } {
        this.cacheManager.setCachedDeveloperPermissions(result);
        return result;
    }
}
