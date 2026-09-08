/**
 * TransientStateManager - VS Code Memento-based transient state management
 *
 * A typed wrapper over `context.globalState`: state that survives a VS Code
 * restart but not an extension uninstall. The data installer records the
 * in-flight import job through it, so closing the panel does not abandon
 * an import.
 *
 * Do NOT use this for:
 * - Project data (use StateManager with file-based storage)
 * - Data that must survive extension uninstallation
 */

import * as vscode from 'vscode';

/**
 * Manages transient state using VS Code's globalState (Memento API)
 */
export class TransientStateManager {
    private globalState: vscode.Memento;

    constructor(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;
    }

    /**
     * Get a value from transient state
     * @param key - The key to retrieve
     * @param defaultValue - Default value if key doesn't exist
     * @returns The stored value or default (null is a valid stored value)
     */
    async get<T>(key: string, defaultValue: T): Promise<T> {
        const value = this.globalState.get<T>(key);
        // Use !== undefined to allow null as a valid stored value
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Set a value in transient state
     * @param key - The key to store
     * @param value - The value to store
     */
    async set<T>(key: string, value: T): Promise<void> {
        await this.globalState.update(key, value);
    }
}
