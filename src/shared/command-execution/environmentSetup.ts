import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getLogger } from '@/shared/logging';
import { TIMEOUTS } from '@/utils/timeoutConfig';
import type { CommandResult, ExecuteOptions } from './types';

/**
 * Manages environment setup for command execution
 * Handles Node version management, PATH enhancement, and Adobe CLI telemetry
 */
export class EnvironmentSetup {
    private logger = getLogger();

    // Cache for Adobe CLI Node version
    private cachedAdobeCLINodeVersion: string | null | undefined = undefined;

    // Cache for fnm path (Fix #4 + #8 from beta releases)
    private cachedFnmPath: string | null | undefined = undefined;

    // Session-level Node version setup
    private isAdobeCLINodeVersionSet = false;
    private sessionNodeVersion: string | null = null;
    private nodeVersionSetupLock: Promise<void> | null = null;

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
                this.logger.debug(`[fnm] Found at: ${fnmPath}`);
                this.cachedFnmPath = fnmPath;
                return fnmPath;
            }
        }

        // Fallback: check PATH using 'which' command
        try {
            const which = process.platform === 'win32' ? 'where' : 'which';
            const { execSync } = require('child_process');
            const result = execSync(`${which} fnm`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
            });
            const fnmPath = result.trim().split('\n')[0];
            if (fnmPath) {
                this.logger.debug(`[fnm] Found in PATH: ${fnmPath}`);
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

        // Check fnm paths
        // Fix #7 (01b94d6): Support FNM_DIR environment variable for dynamic path discovery
        const fnmBase = process.env.FNM_DIR
            ? path.join(process.env.FNM_DIR, 'node-versions')
            : path.join(homeDir, '.local/share/fnm/node-versions');
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
     * Find which Node version has Adobe CLI installed
     */
    async findAdobeCLINodeVersion(): Promise<string | null> {
        // Return cached value if already looked up
        if (this.cachedAdobeCLINodeVersion !== undefined) {
            return this.cachedAdobeCLINodeVersion;
        }

        const homeDir = os.homedir();
        // Fix #7 (01b94d6): Support FNM_DIR environment variable
        const fnmBase = process.env.FNM_DIR
            ? path.join(process.env.FNM_DIR, 'node-versions')
            : path.join(homeDir, '.local/share/fnm/node-versions');

        if (fsSync.existsSync(fnmBase)) {
            try {
                const versions = fsSync.readdirSync(fnmBase);
                for (const version of versions) {
                    const aioPath = path.join(fnmBase, version, 'installation/bin/aio');
                    if (fsSync.existsSync(aioPath)) {
                        // Extract major version number
                        const match = /v?(\d+)/.exec(version);
                        if (match) {
                            this.logger.debug(`[Env Setup] Found Adobe CLI in Node ${version}, using version family: ${match[1]}`);
                            this.cachedAdobeCLINodeVersion = match[1];
                            return match[1];
                        }
                        this.cachedAdobeCLINodeVersion = version;
                        return version;
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        // Check nvm
        const nvmBase = path.join(homeDir, '.nvm/versions/node');
        if (fsSync.existsSync(nvmBase)) {
            try {
                const versions = fsSync.readdirSync(nvmBase);
                for (const version of versions) {
                    const aioPath = path.join(nvmBase, version, 'bin/aio');
                    if (fsSync.existsSync(aioPath)) {
                        const match = /v?(\d+)/.exec(version);
                        if (match) {
                            this.logger.debug(`[Env Setup] Found Adobe CLI in Node ${version}, using version family: ${match[1]}`);
                            this.cachedAdobeCLINodeVersion = match[1];
                            return match[1];
                        }
                        this.cachedAdobeCLINodeVersion = version;
                        return version;
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        // Cache null result
        this.cachedAdobeCLINodeVersion = null;
        return null;
    }

    /**
     * Ensure Adobe CLI Node version is set once per session
     */
    async ensureAdobeCLINodeVersion(executeCommand: (command: string, options?: ExecuteOptions) => Promise<CommandResult>): Promise<void> {
        // Skip if already set for this session
        if (this.isAdobeCLINodeVersionSet) {
            return;
        }

        // If setup is already in progress, wait for it
        if (this.nodeVersionSetupLock) {
            await this.nodeVersionSetupLock;
            return;
        }

        // Create lock and start setup
        this.nodeVersionSetupLock = this.doNodeVersionSetup(executeCommand);

        try {
            await this.nodeVersionSetupLock;
        } finally {
            this.nodeVersionSetupLock = null;
        }
    }

    /**
     * Perform Node version setup
     */
    private async doNodeVersionSetup(executeCommand: (command: string, options?: ExecuteOptions) => Promise<CommandResult>): Promise<void> {
        try {
            // Find required Node version
            const requiredVersion = await this.findAdobeCLINodeVersion();
            if (!requiredVersion) {
                this.isAdobeCLINodeVersionSet = true;
                return;
            }

            // Check if we need to switch versions
            const isFnmAvailable = await this.checkFnmAvailable(executeCommand);
            if (isFnmAvailable) {
                const currentVersion = await this.getCurrentFnmVersion(executeCommand);
                if (!currentVersion?.includes(requiredVersion)) {
                    this.logger.info(`[Env Setup] Switching to Node v${requiredVersion}`);
                    await executeCommand(`fnm use ${requiredVersion} --silent-if-unchanged`, {
                        timeout: TIMEOUTS.COMMAND_DEFAULT,
                    });
                }
            }

            // Mark as set for the session
            this.sessionNodeVersion = requiredVersion;
            this.isAdobeCLINodeVersionSet = true;

        } catch (error) {
            this.logger.warn(`[Env Setup] Failed to set Node version: ${error instanceof Error ? error.message : String(error)}`);
            // Continue anyway - Adobe CLI might work with current version
            this.isAdobeCLINodeVersionSet = true;
        }
    }

    /**
     * Check if fnm is available
     */
    private async checkFnmAvailable(executeCommand: (command: string, options?: ExecuteOptions) => Promise<CommandResult>): Promise<boolean> {
        try {
            await executeCommand('fnm --version', { timeout: 2000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get current fnm version
     */
    private async getCurrentFnmVersion(executeCommand: (command: string, options?: ExecuteOptions) => Promise<CommandResult>): Promise<string | null> {
        try {
            const result = await executeCommand('fnm current', { timeout: 2000 });
            return result.stdout?.trim() || null;
        } catch {
            return null;
        }
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
            await executeCommand(
                'aio config set aio-cli-telemetry.optOut true',
                {
                    configureTelemetry: false,  // Don't check telemetry for telemetry commands
                    encoding: 'utf8',
                    timeout: 5000,
                },
            ).catch(error => {
                this.logger.debug('[Telemetry] Failed to configure (non-critical):', error.message);
            });

            EnvironmentSetup.telemetryConfigured = true;
            this.logger.info('[Telemetry] Configured aio-cli to opt out of telemetry');

        } catch {
            // Still mark as configured to avoid repeated attempts
            EnvironmentSetup.telemetryConfigured = true;
        } finally {
            EnvironmentSetup.checkingTelemetry = false;
        }
    }

    /**
     * Build command with environment setup
     */
    buildCommandWithEnvironment(
        command: string,
        options: {
            useNodeVersion?: string | 'auto' | null;
            currentFnmVersion?: string | null;
        },
    ): string {
        let finalCommand = command;

        // Handle Node version management
        if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
            const nodeVersion = options.useNodeVersion;

            if (nodeVersion === 'current') {
                // Use fnm env for current version
                finalCommand = `eval "$(fnm env)" && ${finalCommand}`;
            } else if (nodeVersion && nodeVersion !== 'auto') {
                // Check if we're already on target version
                if (options.currentFnmVersion?.includes(nodeVersion)) {
                    // No fnm needed
                } else {
                    // Use specific version
                    finalCommand = `fnm use ${nodeVersion} --silent-if-unchanged && ${finalCommand}`;
                }
            }
        }

        return finalCommand;
    }

    /**
     * Get session Node version
     */
    getSessionNodeVersion(): string | null {
        return this.sessionNodeVersion;
    }

    /**
     * Check if session Node version is set
     */
    isSessionNodeVersionSet(): boolean {
        return this.isAdobeCLINodeVersionSet;
    }

    /**
     * Reset session state (for testing)
     */
    resetSession(): void {
        this.isAdobeCLINodeVersionSet = false;
        this.sessionNodeVersion = null;
        this.nodeVersionSetupLock = null;
    }
}
