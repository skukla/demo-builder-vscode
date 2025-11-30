/**
 * TransientStateManager - VS Code Memento-based transient state management
 *
 * Use this for:
 * - "Don't show again" notification flags
 * - Session preferences (last active log channel, etc.)
 * - Data that can sync across machines via VS Code Settings Sync
 * - TTL-based cache entries
 *
 * Do NOT use this for:
 * - Project data (use StateManager with file-based storage)
 * - Data that must survive extension uninstallation
 */

import * as vscode from 'vscode';

/**
 * Storage format for values with time-to-live (TTL)
 */
interface TTLValue<T> {
    value: T;
    expiresAt: number;
}

/**
 * Manages transient state using VS Code's globalState (Memento API)
 */
export class TransientStateManager {
    private globalState: vscode.Memento;

    constructor(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;

        // Keys that should sync across machines via VS Code Settings Sync
        context.globalState.setKeysForSync([
            'notification.dismissed',
            'preferences.logChannel',
            'whatsNew.dismissed',
        ]);
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

    /**
     * Check if a key exists in transient state
     * @param key - The key to check
     * @returns true if key exists (even with falsy value)
     */
    has(key: string): boolean {
        return this.globalState.get(key) !== undefined;
    }

    /**
     * Remove a key from transient state
     * @param key - The key to remove
     */
    async remove(key: string): Promise<void> {
        await this.globalState.update(key, undefined);
    }

    /**
     * Set a value with TTL (time-to-live)
     * Value automatically expires after specified milliseconds
     * @param key - The key to store
     * @param value - The value to store
     * @param ttlMs - Time-to-live in milliseconds
     */
    async setWithTTL<T>(key: string, value: T, ttlMs: number): Promise<void> {
        const expiresAt = Date.now() + ttlMs;
        const ttlValue: TTLValue<T> = { value, expiresAt };
        await this.globalState.update(key, ttlValue);
    }

    /**
     * Get a value with TTL, returns undefined if expired
     * Automatically cleans up expired entries
     * @param key - The key to retrieve
     * @returns The stored value or undefined if expired/not found
     */
    async getWithTTL<T>(key: string): Promise<T | undefined> {
        const stored = this.globalState.get<TTLValue<T>>(key);
        if (!stored) {
            return undefined;
        }

        if (Date.now() >= stored.expiresAt) {
            // Expired - clean up
            await this.remove(key);
            return undefined;
        }

        return stored.value;
    }

    // =====================================================
    // Convenience methods for common patterns
    // =====================================================

    /**
     * Check if a notification has been dismissed
     * @param notificationId - Unique identifier for the notification
     * @returns true if notification was dismissed
     */
    async isNotificationDismissed(notificationId: string): Promise<boolean> {
        return this.get(`notification.dismissed.${notificationId}`, false);
    }

    /**
     * Mark a notification as dismissed
     * @param notificationId - Unique identifier for the notification
     */
    async dismissNotification(notificationId: string): Promise<void> {
        await this.set(`notification.dismissed.${notificationId}`, true);
    }

    /**
     * Get user's preferred log channel
     * @returns 'logs' (default) or 'debug'
     */
    async getPreferredLogChannel(): Promise<'logs' | 'debug'> {
        return this.get('preferences.logChannel', 'logs');
    }

    /**
     * Set user's preferred log channel
     * @param channel - 'logs' or 'debug'
     */
    async setPreferredLogChannel(channel: 'logs' | 'debug'): Promise<void> {
        await this.set('preferences.logChannel', channel);
    }
}
