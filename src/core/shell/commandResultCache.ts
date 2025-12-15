/**
 * CommandResultCache
 *
 * Session caching for command results, particularly Adobe CLI commands.
 * Keyed by command + node version for multi-version support.
 */

import type { CommandResult } from './types';

/**
 * Cache for command results to avoid redundant command executions
 */
export class CommandResultCache {
    private versionCache: Map<string, CommandResult> = new Map();
    private pluginsCache: Map<string, CommandResult> = new Map();

    /**
     * Build a cache key from command and node version
     */
    private buildCacheKey(command: string, nodeVersion: string | null): string {
        return `${command}##${nodeVersion || 'default'}`;
    }

    /**
     * Check if a version command result is cached
     * @param command - Command string (e.g., 'aio --version')
     * @param nodeVersion - Node version used for the command
     * @returns Cached result if available, undefined otherwise
     */
    getVersionResult(command: string, nodeVersion: string | null): CommandResult | undefined {
        const cacheKey = this.buildCacheKey(command, nodeVersion);
        return this.versionCache.get(cacheKey);
    }

    /**
     * Cache a version command result
     * @param command - Command string
     * @param nodeVersion - Node version used for the command
     * @param result - Result to cache
     */
    setVersionResult(command: string, nodeVersion: string | null, result: CommandResult): void {
        const cacheKey = this.buildCacheKey(command, nodeVersion);
        this.versionCache.set(cacheKey, result);
    }

    /**
     * Check if a plugins command result is cached
     * @param command - Command string (e.g., 'aio plugins')
     * @param nodeVersion - Node version used for the command
     * @returns Cached result if available, undefined otherwise
     */
    getPluginsResult(command: string, nodeVersion: string | null): CommandResult | undefined {
        const cacheKey = this.buildCacheKey(command, nodeVersion);
        return this.pluginsCache.get(cacheKey);
    }

    /**
     * Cache a plugins command result
     * @param command - Command string
     * @param nodeVersion - Node version used for the command
     * @param result - Result to cache
     */
    setPluginsResult(command: string, nodeVersion: string | null, result: CommandResult): void {
        const cacheKey = this.buildCacheKey(command, nodeVersion);
        this.pluginsCache.set(cacheKey, result);
    }

    /**
     * Clear all cached results
     */
    clear(): void {
        this.versionCache.clear();
        this.pluginsCache.clear();
    }
}
