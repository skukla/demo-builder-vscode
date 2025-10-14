/**
 * Service Locator Pattern
 *
 * Provides centralized access to singleton services to prevent circular dependencies.
 *
 * **Problem Solved**:
 * - Eliminates circular dependency: extension.ts ↔ commandManager.ts ↔ commands
 * - Previously, 13 files imported `getExternalCommandManager()` from extension.ts
 * - This created 22 circular dependency chains
 *
 * **Solution**:
 * - ServiceLocator holds singleton instances
 * - Extension initializes services during activation
 * - All modules import from ServiceLocator, not extension.ts
 * - No circular imports
 *
 * @module services/serviceLocator
 */

import { CommandExecutor } from '../utils/commands';

/**
 * Centralized service registry for dependency injection
 */
export class ServiceLocator {
    private static commandExecutor: CommandExecutor | null = null;

    /**
     * Register CommandExecutor instance
     *
     * **Called by**: extension.ts during activation
     *
     * @param executor - CommandExecutor singleton
     */
    static setCommandExecutor(executor: CommandExecutor): void {
        if (this.commandExecutor) {
            throw new Error('CommandExecutor already registered. Cannot register twice.');
        }
        this.commandExecutor = executor;
    }

    /**
     * Get CommandExecutor instance
     *
     * **Called by**: All commands and utilities that need to execute shell commands
     *
     * @returns CommandExecutor singleton
     * @throws Error if CommandExecutor not initialized
     */
    static getCommandExecutor(): CommandExecutor {
        if (!this.commandExecutor) {
            throw new Error(
                'CommandExecutor not initialized. Ensure extension.ts has activated.',
            );
        }
        return this.commandExecutor;
    }

    /**
     * Reset all services
     *
     * **Used for**: Testing only
     * **DO NOT USE** in production code
     */
    static reset(): void {
        this.commandExecutor = null;
    }

    /**
     * Check if CommandExecutor is initialized
     *
     * @returns true if CommandExecutor is available
     */
    static isInitialized(): boolean {
        return this.commandExecutor !== null;
    }
}
