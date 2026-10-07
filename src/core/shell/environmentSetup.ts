import { execSync } from 'child_process';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { demoBuilderFnmDir } from './nodeStore';
import type { CommandResult, ExecuteOptions } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Manages environment setup for command execution
 * Handles Node version management, PATH enhancement, and Adobe CLI telemetry
 */
export class EnvironmentSetup {
    private logger = getLogger();

    // Cache for fnm path (Fix #4 + #8 from beta releases)
    private cachedFnmPath: string | null | undefined = undefined;

    // Telemetry configuration tracking (static to persist across instances)
    private static telemetryConfigured = false;
    private static checkingTelemetry = false;

    /**
     * Helper: Find paths for a node version manager (fnm or nvm)
     * Reduces duplication between fnm and nvm path finding logic
     */
    private findNodeManagerPaths(baseDir: string, pathTemplates: string[]): string[] {
        const foundPaths: string[] = [];

        if (!fsSync.existsSync(baseDir)) {
            return foundPaths;
        }

        try {
            const versions = fsSync.readdirSync(baseDir);
            for (const version of versions) {
                for (const template of pathTemplates) {
                    const fullPath = path.join(baseDir, version, template);
                    if (fsSync.existsSync(fullPath)) {
                        foundPaths.push(fullPath);
                    }
                }
            }
        } catch {
            // Ignore errors
        }

        return foundPaths;
    }

    /**
     * Find fnm executable path
     * Checks common installation locations before falling back to PATH
     *
     * Fix #4 (ac1a6a2) + Fix #8 (8c9d66b) from beta releases:
     * - Checks common fnm install locations (Homebrew, manual, self-install)
     * - Falls back to PATH check using 'which'
     * - Session-level caching to prevent duplicate lookups
     */
    findFnmPath(): string | null {
        // Return cached value if already looked up
        if (this.cachedFnmPath !== undefined) {
            return this.cachedFnmPath;
        }

        const homeDir = os.homedir();
        const commonPaths = [
            '/opt/homebrew/bin/fnm',                    // Homebrew on Apple Silicon
            '/usr/local/bin/fnm',                       // Homebrew on Intel Mac
            path.join(homeDir, '.local/bin/fnm'),       // Manual install
            path.join(homeDir, '.fnm/fnm'),             // fnm self-install
        ];

        // Check common install locations first
        for (const fnmPath of commonPaths) {
            if (fsSync.existsSync(fnmPath)) {
                this.cachedFnmPath = fnmPath;
                return fnmPath;
            }
        }

        // Fallback: check PATH using 'which' command
        try {
            const which = process.platform === 'win32' ? 'where' : 'which';
            const result = execSync(`${which} fnm`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
            });
            const fnmPath = result.trim().split('\n')[0];
            // Verify the path exists before caching (security: prevent PATH manipulation)
            if (fnmPath && fsSync.existsSync(fnmPath)) {
                this.cachedFnmPath = fnmPath;
                return fnmPath;
            }
        } catch {
            // Not in PATH
        }

        // Cache null result
        this.cachedFnmPath = null;
        return null;
    }

    /**
     * Find all possible npm global binary paths
     */
    findNpmGlobalPaths(): string[] {
        const paths: string[] = [];
        const homeDir = os.homedir();

        // Demo Builder's own Node store (PR-1a), never the user's fnm: its
        // versions' bins are what an unwrapped command can fall back on.
        const fnmBase = path.join(demoBuilderFnmDir(), 'node-versions');
        const fnmPaths = this.findNodeManagerPaths(fnmBase, [
            'installation/bin',
            'installation/lib/node_modules/.bin',
        ]);
        paths.push(...fnmPaths);

        // Check nvm paths
        const nvmBase = path.join(homeDir, '.nvm/versions/node');
        const nvmPaths = this.findNodeManagerPaths(nvmBase, ['bin']);
        paths.push(...nvmPaths);

        // Check common npm global locations
        const commonPaths = [
            path.join(homeDir, '.npm-global', 'bin'),
            path.join(homeDir, '.npm', 'bin'),
            '/usr/local/lib/node_modules/.bin',
            '/usr/local/bin',
            '/opt/homebrew/bin',
        ];

        for (const p of commonPaths) {
            if (fsSync.existsSync(p)) {
                paths.push(p);
            }
        }

        return paths;
    }

    /**
     * Ensure Adobe CLI telemetry is configured
     * Directly sets config without checking first to prevent prompts
     */
    async ensureAdobeCLIConfigured(executeCommand: (command: string, options?: ExecuteOptions) => Promise<CommandResult>): Promise<void> {
        // Skip if already handled
        if (EnvironmentSetup.telemetryConfigured || EnvironmentSetup.checkingTelemetry) {
            return;
        }

        // Set guard to prevent recursion
        EnvironmentSetup.checkingTelemetry = true;

        try {
            // Set config directly without checking first
            const result = await executeCommand(
                'aio config set aio-cli-telemetry.optOut true',
                {
                    configureTelemetry: false,  // Don't check telemetry for telemetry commands
                    encoding: 'utf8',
                    timeout: TIMEOUTS.QUICK,  // Same timeout as quick operations
                },
            );

            // Only log success if command actually succeeded
            if (result.code === 0) {
                EnvironmentSetup.telemetryConfigured = true;
                this.logger.debug('[Telemetry] Configured aio-cli to opt out of telemetry');
            } else {
                this.logger.debug(`[Telemetry] Failed to configure (exit code ${result.code})`);
                // Still mark as configured to avoid repeated attempts
                EnvironmentSetup.telemetryConfigured = true;
            }

        } catch (error) {
            this.logger.debug('[Telemetry] Failed to configure (non-critical):', error instanceof Error ? error.message : String(error));
            // Still mark as configured to avoid repeated attempts
            EnvironmentSetup.telemetryConfigured = true;
        } finally {
            EnvironmentSetup.checkingTelemetry = false;
        }
    }

    /**
     * Reset session state (for testing)
     */
    resetSession(): void {
        this.cachedFnmPath = undefined;
    }
}
