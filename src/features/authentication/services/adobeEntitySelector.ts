/**
 * AdobeEntitySelector
 *
 * Clears the Adobe CLI console context as part of the EntityServices
 * decomposition (created via createEntityServices).
 *
 * Note: org/project/workspace *selection* was removed in the org-context
 * refactor — dependent operations now target context per-invocation via
 * `withOrgContext`/`ensureOrgContext` instead of mutating the shared `aio`
 * global. The only remaining store-touching responsibility here is clearing
 * the console context when no orgs are accessible.
 *
 * Dependencies:
 * - CommandExecutor for CLI operations
 * - AuthCacheManager for cache invalidation
 */

import type { AuthCacheManager } from './authCacheManager';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';

/**
 * Clears Adobe CLI console context (token-preserving).
 */
export class AdobeEntitySelector {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private cacheManager: AuthCacheManager,
    ) {}

    /**
     * Clear Adobe CLI console context (org/project/workspace selections)
     * Preserves authentication token (ims context)
     */
    async clearConsoleContext(): Promise<void> {
        try {
            // Use established pattern: Promise.all for parallel execution
            await Promise.all([
                this.commandManager.execute('aio config delete console.org', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
                this.commandManager.execute('aio config delete console.project', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
                this.commandManager.execute('aio config delete console.workspace', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
            ]);

            // Clear console.where cache since context was cleared
            this.cacheManager.clearConsoleWhereCache();

            this.debugLogger.debug('[Entity Selector] Cleared Adobe CLI console context (preserved token)');
        } catch (error) {
            // Fail gracefully - config may not exist
            this.debugLogger.debug('[Entity Selector] Failed to clear console context (non-critical):', error);
        }
    }
}
