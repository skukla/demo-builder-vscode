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

import { CommandExecutor } from '@/core/shell';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';
import type { StateManager as IStateManager } from '@/types/state';

/**
 * The `vscode.SecretStorage` surface, narrowed so core stays vscode-free in type.
 */
export interface SecretStorageLike {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
}

/**
 * Centralized service registry for dependency injection
 */
export class ServiceLocator {
    private static commandExecutor: CommandExecutor | null = null;
    private static authenticationService: AuthenticationService | null = null;
    private static sidebarProvider: SidebarProvider | null = null;
    private static stateManager: IStateManager | null = null;
    private static secretStorage: SecretStorageLike | null = null;

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
     * Register StateManager instance
     *
     * **Called by**: extension.ts during activation
     *
     * @param manager - StateManager singleton
     */
    static setStateManager(manager: IStateManager): void {
        if (this.stateManager) {
            throw new Error('StateManager already registered. Cannot register twice.');
        }
        this.stateManager = manager;
    }

    /**
     * Get StateManager instance
     *
     * **Called by**: Commands and handlers that need project state
     *
     * @returns StateManager singleton or null if not initialized
     */
    static getStateManager(): IStateManager | null {
        return this.stateManager;
    }

    /**
     * Register the extension's SecretStorage.
     *
     * **Called by**: extension.ts during activation
     *
     * Registered here rather than threaded through call chains because the
     * consumers are deep and diffuse — `.env` generation is reached from project
     * creation, Configure, project reset, mesh deploy and the App Builder runner.
     * Threading an optional parameter through all of them makes forgetting ONE
     * silent: the secret quietly fails to reach a generated `.env`, and the demo
     * breaks at runtime rather than at the call site.
     */
    static setSecretStorage(secrets: SecretStorageLike): void {
        this.secretStorage = secrets;
    }

    /**
     * Get SecretStorage.
     *
     * @returns the store, or null outside an activated extension host (tests,
     *          the vscode-free MCP entry) — callers treat null as "config only"
     */
    static getSecretStorage(): SecretStorageLike | null {
        return this.secretStorage;
    }

    /**
     * Reset all services
     *
     * **Used for**: Testing only
     * **DO NOT USE** in production code
     */
    static reset(): void {
        this.commandExecutor = null;
        this.authenticationService = null;
        this.sidebarProvider = null;
        this.stateManager = null;
        this.secretStorage = null;
    }

    /**
     * Check if CommandExecutor is initialized
     *
     * @returns true if CommandExecutor is available
     */
    static isInitialized(): boolean {
        return this.commandExecutor !== null;
    }

    /**
     * Register AuthenticationService instance
     *
     * **Called by**: extension.ts during activation
     *
     * @param service - AuthenticationService singleton
     */
    static setAuthenticationService(service: AuthenticationService): void {
        if (this.authenticationService) {
            throw new Error('AuthenticationService already registered. Cannot register twice.');
        }
        this.authenticationService = service;
    }

    /**
     * Get AuthenticationService instance
     *
     * **Called by**: Commands and handlers that need authentication
     *
     * @returns AuthenticationService singleton
     * @throws Error if AuthenticationService not initialized
     */
    static getAuthenticationService(): AuthenticationService {
        if (!this.authenticationService) {
            throw new Error(
                'AuthenticationService not initialized. Ensure extension.ts has activated.',
            );
        }
        return this.authenticationService;
    }

    /**
     * Register SidebarProvider instance
     *
     * **Called by**: extension.ts during activation
     *
     * @param provider - SidebarProvider singleton
     */
    static setSidebarProvider(provider: SidebarProvider): void {
        if (this.sidebarProvider) {
            throw new Error('SidebarProvider already registered. Cannot register twice.');
        }
        this.sidebarProvider = provider;
    }

    /**
     * Get SidebarProvider instance
     *
     * **Called by**: Commands that need to update sidebar context (e.g., wizard)
     *
     * @returns SidebarProvider singleton
     * @throws Error if SidebarProvider not initialized
     */
    static getSidebarProvider(): SidebarProvider {
        if (!this.sidebarProvider) {
            throw new Error(
                'SidebarProvider not initialized. Ensure extension.ts has activated.',
            );
        }
        return this.sidebarProvider;
    }

    /**
     * Check if SidebarProvider is initialized
     *
     * @returns true if SidebarProvider is available
     */
    static isSidebarInitialized(): boolean {
        return this.sidebarProvider !== null;
    }
}
