import { parseJSON } from '../../types/typeGuards';
import type { CommandExecutor } from '../commands';
import { getLogger } from '../../shared/logging';
import { Logger } from '../../shared/logging';
import { TIMEOUTS } from '../timeoutConfig';
import type { AuthCacheManager } from './authCacheManager';

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
            const errorString = error instanceof Error ? error.message : String(error);
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
