import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

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
    ) {}

    /**
     * Test if the current user has Developer or System Admin permissions
     * These permissions are required to create and manage App Builder projects
     *
     * @returns {Promise<{ hasPermissions: boolean; error?: string }>}
     */
    async testDeveloperPermissions(): Promise<{ hasPermissions: boolean; error?: string }> {
        try {
            this.debugLogger.debug('[Org Validator] Testing Developer permissions via App Builder access');

            // Try to list App Builder projects - this requires Developer or System Admin role
            const result = await this.commandManager.execute(
                'aio app list --json',
                { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
            );

            if (result.code === 0) {
                this.debugLogger.debug('[Org Validator] Developer permissions confirmed - App Builder access successful');
                return { hasPermissions: true };
            }

            // Check for specific permission-related error messages (SOP §10: using predicate)
            const errorMsg = result.stderr || '';
            if (isPermissionError(errorMsg)) {
                const userMessage =
                    'Your account lacks Developer or System Admin role for this organization. ' +
                    'Please select a different organization or contact your administrator to request App Builder access.';
                this.debugLogger.debug('[Org Validator] Developer permissions denied - App Builder access failed with permission error');
                return { hasPermissions: false, error: userMessage };
            }

            // Other errors (network, etc.) - assume permissions are OK but service unavailable
            this.debugLogger.debug('[Org Validator] App Builder access failed with non-permission error, assuming permissions OK');
            return { hasPermissions: true };
        } catch (error) {
            const errorString = toError(error).message;
            this.debugLogger.debug('[Org Validator] Developer permissions test failed:', error);

            // Check if it's a permission-related error in the exception (SOP §10: using predicate)
            if (isPermissionError(errorString)) {
                const userMessage =
                    'Your account lacks Developer or System Admin role for this organization. ' +
                    'Please select a different organization or contact your administrator to request App Builder access.';
                return { hasPermissions: false, error: userMessage };
            }

            // If we can't test due to other errors, assume permissions are OK to avoid false negatives
            return { hasPermissions: true };
        }
    }
}
