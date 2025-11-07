import { getLogger, Logger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { parseJSON, toError, isTimeoutError } from '@/types/typeGuards';

/**
 * Validates organization access and manages invalid organization contexts
 * Ensures users only work with organizations they have App Builder access to
 */
export class OrganizationValidator {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private cacheManager: AuthCacheManager,
        private logger: Logger,
    ) {}

    /**
     * Validate if the current organization context is accessible
     * Returns true if org is valid, false otherwise
     */
    async validateOrganizationAccess(): Promise<boolean> {
        try {
            this.debugLogger.debug('[Org Validator] Validating organization access...');

            // Try to list projects - this will fail with 403 if org is invalid
            const result = await this.commandManager.executeAdobeCLI(
                'aio console project list --json',
                { encoding: 'utf8', timeout: TIMEOUTS.PROJECT_LIST },
            );

            // If we get here without error, check the result
            if (result.code === 0) {
                this.debugLogger.debug('[Org Validator] Organization access validated (success)');
                return true;
            }

            // Check if it's just "no projects" vs access denied
            if (result.stderr && result.stderr.includes('no Project')) {
                this.debugLogger.debug('[Org Validator] Organization access validated (no projects)');
                return true; // Valid org, just no projects
            }

            // 403 Forbidden or other access errors indicate invalid org
            this.debugLogger.debug('[Org Validator] Organization access validation failed:', result.stderr);
            return false;
        } catch (error) {
            // Better timeout detection
            const errorString = toError(error).message;
            const errorObj = error as NodeJS.ErrnoException;

            const isTimeout =
                errorString.toLowerCase().includes('timeout') ||
                errorString.toLowerCase().includes('timed out') ||
                errorString.includes('ETIMEDOUT') ||
                errorObj?.code === 'ETIMEDOUT';

            if (isTimeout) {
                this.debugLogger.warn('[Org Validator] Validation timed out - assuming valid (network delay)');
                return true; // Fail-open: assume org is valid on timeout
            }

            this.debugLogger.debug('[Org Validator] Validation error:', error);
            return false;
        }
    }

    /**
     * Check if we have an org context and validate it, clearing if invalid
     */
    async validateAndClearInvalidOrgContext(forceValidation = false): Promise<void> {
        try {
            // Check if we have an organization context
            const result = await this.commandManager.executeAdobeCLI(
                'aio console where --json',
                { encoding: 'utf8', timeout: TIMEOUTS.API_CALL },
            );

            if (result.code === 0 && result.stdout) {
                const context = parseJSON<{ org?: string }>(result.stdout);
                if (!context) {
                    this.debugLogger.debug('[Org Validator] Failed to parse console.where response');
                    return;
                }

                // Cache the console.where result
                this.cacheManager.setCachedConsoleWhere(context);
                this.debugLogger.debug('[Org Validator] Cached console.where result during validation');

                if (context.org) {
                    // Check if we've validated this org recently
                    const cachedValidation = this.cacheManager.getValidationCache();
                    if (!forceValidation && cachedValidation && cachedValidation.org === context.org) {
                        this.debugLogger.debug(`[Org Validator] Using cached validation for ${context.org}: ${cachedValidation.isValid ? 'valid' : 'invalid'}`);

                        if (!cachedValidation.isValid) {
                            // Previously determined invalid, clear it
                            await this.clearConsoleContext();
                            this.cacheManager.clearAll();
                        }
                        return;
                    }

                    // Log user-friendly message only if actually validating
                    this.logger.info(`Verifying access to ${context.org}...`);
                    this.debugLogger.debug(`[Org Validator] Found organization context: ${context.org}, validating access...`);

                    // Validate with retry
                    let isValid = await this.validateOrganizationAccess();
                    this.debugLogger.debug(`[Org Validator] First validation result for ${context.org}: ${isValid}`);

                    // If validation failed, retry once
                    if (!isValid) {
                        this.logger.info('Retrying organization access validation...');
                        this.debugLogger.debug('[Org Validator] First validation failed, retrying once...');
                        isValid = await this.validateOrganizationAccess();
                        this.debugLogger.debug(`[Org Validator] Second validation result for ${context.org}: ${isValid}`);
                    }

                    // Cache the validation result
                    this.cacheManager.setValidationCache(context.org, isValid);

                    if (!isValid) {
                        // Failed twice - now we clear
                        this.logger.info('Previous organization no longer accessible. Clearing selection...');
                        this.debugLogger.warn('[Org Validator] Organization context is invalid - clearing');

                        await this.clearConsoleContext();
                        this.cacheManager.clearAll();

                        // Set flag to indicate org was cleared due to validation failure
                        this.cacheManager.setOrgClearedDueToValidation(true);
                        this.debugLogger.debug(`[Org Validator] Set orgClearedDueToValidation flag for ${context.org}`);

                        this.logger.info('Organization cleared. You will need to select a new organization.');
                    } else {
                        this.logger.info(`Successfully verified access to ${context.org}`);
                        this.debugLogger.debug('[Org Validator] Organization context is valid');
                    }
                } else {
                    this.debugLogger.debug('[Org Validator] No organization context found');
                }
            }
        } catch (error) {
            this.debugLogger.debug('[Org Validator] Failed to validate organization context:', error);
        }
    }

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
            const result = await this.commandManager.executeAdobeCLI(
                'aio app list --json',
                { encoding: 'utf8', timeout: TIMEOUTS.API_CALL },
            );

            if (result.code === 0) {
                this.debugLogger.debug('[Org Validator] Developer permissions confirmed - App Builder access successful');
                return { hasPermissions: true };
            }

            // Check for specific permission-related error messages
            const errorMsg = result.stderr?.toLowerCase() || '';
            if (
                errorMsg.includes('permission') ||
                errorMsg.includes('unauthorized') ||
                errorMsg.includes('forbidden') ||
                errorMsg.includes('access denied') ||
                errorMsg.includes('insufficient privileges')
            ) {
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

            // Check if it's a permission-related error in the exception
            if (
                errorString.toLowerCase().includes('permission') ||
                errorString.toLowerCase().includes('unauthorized') ||
                errorString.toLowerCase().includes('forbidden') ||
                errorString.toLowerCase().includes('insufficient privileges')
            ) {
                const userMessage =
                    'Your account lacks Developer or System Admin role for this organization. ' +
                    'Please select a different organization or contact your administrator to request App Builder access.';
                return { hasPermissions: false, error: userMessage };
            }

            // If we can't test due to other errors, assume permissions are OK to avoid false negatives
            return { hasPermissions: true };
        }
    }

    /**
     * Clear Adobe CLI console context (org/project/workspace selections)
     */
    private async clearConsoleContext(): Promise<void> {
        try {
            // Run all three operations in parallel
            await Promise.all([
                this.commandManager.executeAdobeCLI('aio config delete console.org', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.project', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.workspace', { encoding: 'utf8' }),
            ]);

            // Clear console.where cache since context was cleared
            this.cacheManager.clearConsoleWhereCache();

            this.debugLogger.debug('[Org Validator] Cleared Adobe CLI console context');
        } catch (error) {
            this.debugLogger.debug('[Org Validator] Failed to clear console context:', error);
        }
    }
}
