/**
 * Tool Manager Service
 *
 * Manages commerce-demo-ingestion tool lifecycle including:
 * - Tool installation (clone from GitHub)
 * - Configuration (.env generation with ACO credentials)
 * - Execution (npm scripts with Node 18+)
 * - Commerce and ACO ingestion/cleanup commands
 * - Dry run mode for safe deletion testing
 *
 * Note: Tool updates are handled by the extension's component update system.
 * The tool is registered as a hidden component in components.json and follows
 * the standard update flow (not update-on-use).
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import {
    ToolManagerError,
    type ACOConfig,
    type ToolExecutionResult,
    type ToolInstallOptions,
    type ToolExecutionOptions,
} from './types';

// ==========================================================
// Constants
// ==========================================================

/** Tool repository details */
const TOOL_CONFIG = {
    name: 'commerce-demo-ingestion',
    repoUrl: 'https://github.com/skukla/commerce-demo-ingestion',
    branch: 'main',
};

/** Data repository details */
const DATA_REPO_CONFIG = {
    name: 'vertical-data-citisignal',
    repoUrl: 'https://github.com/skukla/vertical-data-citisignal',
    branch: 'accs',
};

/** Node version for tool execution (LTS) */
const NODE_VERSION = '18';

/** npm install flags for faster installation */
const NPM_INSTALL_FLAGS = '--no-fund --prefer-offline';

// ==========================================================
// Tool Manager Service
// ==========================================================

/**
 * Tool Manager for commerce-demo-ingestion tool lifecycle
 *
 * Provides complete management of the commerce-demo-ingestion tool:
 * - Installation via git clone (shallow, branch-specific)
 * - ACO credentials configuration (.env generation)
 * - npm script execution with Node 18+ isolation
 * - Dry run support for safe cleanup operations
 *
 * @example
 * ```typescript
 * const manager = new ToolManager();
 *
 * // Install tool and data repo
 * await manager.ensureToolInstalled();
 * await manager.ensureDataRepoInstalled();
 *
 * // Configure with ACO credentials
 * await manager.configureToolEnvironment({
 *   apiUrl: 'https://aco.example.com/api',
 *   apiKey: 'your-api-key',
 *   tenantId: 'tenant-123',
 *   environmentId: 'env-456'
 * });
 *
 * // Execute ingestion
 * const result = await manager.executeAcoIngestion();
 * if (result.success) {
 *   console.log('Ingestion complete:', result.stdout);
 * }
 * ```
 */
export class ToolManager {
    private logger: Logger;
    private toolsBasePath: string;
    private toolPath: string;
    private dataRepoPath: string;

    /**
     * Create a ToolManager
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     */
    constructor(logger?: Logger) {
        this.logger = logger ?? getLogger();
        const homeDir = os.homedir();
        this.toolsBasePath = path.join(homeDir, '.demo-builder', 'tools');
        this.toolPath = path.join(this.toolsBasePath, TOOL_CONFIG.name);
        this.dataRepoPath = path.join(this.toolsBasePath, DATA_REPO_CONFIG.name);
    }

    // ==========================================================
    // Tool Installation
    // ==========================================================

    /**
     * Ensure the commerce-demo-ingestion tool is installed
     * Clones repository if not present
     *
     * Note: Updates are handled by the extension's component update system,
     * not by this method.
     *
     * @param options - Installation options
     */
    async ensureToolInstalled(options: ToolInstallOptions = {}): Promise<void> {
        const { forceReinstall = false } = options;

        // Create tools directory if needed
        await this.ensureToolsDirectory();

        // Check if tool already exists
        const toolExists = await this.directoryExists(this.toolPath);

        if (forceReinstall && toolExists) {
            this.logger.debug('[ToolManager] Force reinstall requested, removing existing tool');
            await fs.rm(this.toolPath, { recursive: true, force: true });
        }

        if (!toolExists || forceReinstall) {
            // Clone repository
            await this.cloneTool();
            // Run npm install
            await this.runNpmInstall();
        }
        // No updateOnUse - updates handled by component update system
    }

    /**
     * Ensure the vertical-data-citisignal repository is installed
     */
    async ensureDataRepoInstalled(): Promise<void> {
        // Create tools directory if needed
        await this.ensureToolsDirectory();

        // Check if data repo already exists
        const dataRepoExists = await this.directoryExists(this.dataRepoPath);

        if (!dataRepoExists) {
            await this.cloneDataRepo();
        }
    }

    // ==========================================================
    // Configuration
    // ==========================================================

    /**
     * Configure tool environment by generating .env file with ACO credentials
     *
     * @param config - ACO configuration
     */
    async configureToolEnvironment(config: ACOConfig): Promise<void> {
        // Validate credentials
        this.validateAcoConfig(config);

        const envPath = path.join(this.toolPath, '.env');

        // Read existing .env if present
        let existingEnv: Record<string, string> = {};
        try {
            const content = await fs.readFile(envPath, 'utf-8');
            existingEnv = this.parseEnvFile(content);
        } catch {
            // File doesn't exist, start fresh
        }

        // Merge with new config (new values override existing)
        const envVars: Record<string, string> = {
            ...existingEnv,
            DATA_REPO_PATH: '../vertical-data-citisignal',
            ACO_API_URL: this.sanitizeEnvValue(config.apiUrl),
            ACO_API_KEY: this.sanitizeEnvValue(config.apiKey),
            ACO_TENANT_ID: this.sanitizeEnvValue(config.tenantId),
            ACO_ENVIRONMENT_ID: this.sanitizeEnvValue(config.environmentId),
        };

        // Generate .env content
        const envContent = this.generateEnvContent(envVars);

        await fs.writeFile(envPath, envContent, 'utf-8');
        this.logger.debug('[ToolManager] .env file configured');
    }

    // ==========================================================
    // Execution - Convenience Methods
    // ==========================================================

    /**
     * Execute ACO (Adobe Commerce Optimizer) data ingestion
     * Imports product catalog, categories, and attributes to ACO
     *
     * @param options - Execution options (timeout, output streaming)
     * @returns Execution result with success status, output, and duration
     */
    async executeAcoIngestion(options: ToolExecutionOptions = {}): Promise<ToolExecutionResult> {
        return this.executeToolScript('import:aco', options);
    }

    /**
     * Execute ACO data cleanup
     * Removes all imported data from ACO environment
     *
     * @param options - Execution options (supports dryRun for safe preview)
     * @returns Execution result with success status and cleanup details
     */
    async executeAcoCleanup(options: ToolExecutionOptions = {}): Promise<ToolExecutionResult> {
        return this.executeToolScript('delete:aco', options);
    }

    /**
     * Execute Commerce (Adobe Commerce) data ingestion
     * Imports product catalog directly to Commerce instance
     *
     * @param options - Execution options (timeout, output streaming)
     * @returns Execution result with success status, output, and duration
     */
    async executeCommerceIngestion(options: ToolExecutionOptions = {}): Promise<ToolExecutionResult> {
        return this.executeToolScript('import:commerce', options);
    }

    /**
     * Execute Commerce data cleanup
     * Removes all imported products from Commerce instance
     *
     * @param options - Execution options (supports dryRun for safe preview)
     * @returns Execution result with success status and cleanup details
     */
    async executeCommerceCleanup(options: ToolExecutionOptions = {}): Promise<ToolExecutionResult> {
        return this.executeToolScript('delete:commerce', options);
    }

    /**
     * Execute a tool npm script
     *
     * @param scriptName - npm script name (e.g., 'import:aco')
     * @param options - Execution options
     */
    async executeToolScript(
        scriptName: string,
        options: ToolExecutionOptions = {},
    ): Promise<ToolExecutionResult> {
        const { onOutput, timeout = TIMEOUTS.EXTENDED, dryRun = false } = options;

        // Build command
        let command = `npm run ${scriptName}`;
        if (dryRun) {
            command = `DRY_RUN=true ${command} --dry-run`;
        }

        const executor = ServiceLocator.getCommandExecutor();

        try {
            const result = await executor.execute(command, {
                cwd: this.toolPath,
                timeout,
                useNodeVersion: NODE_VERSION,
                streaming: !!onOutput,
                onOutput,
            });

            return {
                success: result.code === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                error: result.code !== 0 ? this.extractErrorMessage(result.stderr) : undefined,
                duration: result.duration,
            };
        } catch (error) {
            const err = error as Error;
            return {
                success: false,
                stdout: '',
                stderr: err.message,
                error: err.message,
                duration: 0,
            };
        }
    }

    // ==========================================================
    // Private: Installation Helpers
    // ==========================================================

    /**
     * Ensure tools base directory exists
     */
    private async ensureToolsDirectory(): Promise<void> {
        await fs.mkdir(this.toolsBasePath, { recursive: true });
    }

    /**
     * Check if a directory exists
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Clone the commerce-demo-ingestion tool repository
     */
    private async cloneTool(): Promise<void> {
        this.logger.debug(`[ToolManager] Cloning ${TOOL_CONFIG.name}`);

        const executor = ServiceLocator.getCommandExecutor();
        const command = `git clone --depth 1 --branch ${TOOL_CONFIG.branch} ${TOOL_CONFIG.repoUrl} ${this.toolPath}`;

        try {
            const result = await executor.execute(command, {
                timeout: TIMEOUTS.LONG,
            });

            if (result.code !== 0) {
                throw new ToolManagerError(
                    `Failed to clone tool: ${result.stderr}`,
                    'clone',
                );
            }

            this.logger.debug('[ToolManager] Tool cloned successfully');
        } catch (error) {
            const err = error as Error;
            const lowerMessage = err.message.toLowerCase();
            // Handle timeout errors (matches "timeout", "timed out", etc.)
            if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
                throw new ToolManagerError(
                    `Clone timeout: ${err.message}`,
                    'clone',
                    err,
                );
            }
            // Re-throw ToolManagerError as-is
            if (err instanceof ToolManagerError) {
                throw err;
            }
            // Wrap other errors
            throw new ToolManagerError(
                `Failed to clone tool: ${err.message}`,
                'clone',
                err,
            );
        }
    }

    /**
     * Clone the vertical-data-citisignal repository
     */
    private async cloneDataRepo(): Promise<void> {
        this.logger.debug(`[ToolManager] Cloning ${DATA_REPO_CONFIG.name}`);

        const executor = ServiceLocator.getCommandExecutor();
        const command = `git clone --depth 1 --branch ${DATA_REPO_CONFIG.branch} ${DATA_REPO_CONFIG.repoUrl} ${this.dataRepoPath}`;

        const result = await executor.execute(command, {
            timeout: TIMEOUTS.LONG,
        });

        if (result.code !== 0) {
            throw new ToolManagerError(
                `Failed to clone data repository: ${result.stderr}`,
                'clone',
            );
        }

        this.logger.debug('[ToolManager] Data repository cloned successfully');
    }

    /**
     * Run npm install in the tool directory
     */
    private async runNpmInstall(): Promise<void> {
        this.logger.debug('[ToolManager] Running npm install');

        const executor = ServiceLocator.getCommandExecutor();
        const result = await executor.execute(`npm install ${NPM_INSTALL_FLAGS}`, {
            cwd: this.toolPath,
            timeout: TIMEOUTS.LONG,
            useNodeVersion: NODE_VERSION,
        });

        if (result.code !== 0) {
            throw new ToolManagerError(
                `npm install failed: ${result.stderr}`,
                'install',
            );
        }

        this.logger.debug('[ToolManager] npm install complete');
    }

    // ==========================================================
    // Private: Configuration Helpers
    // ==========================================================

    /**
     * Validate ACO configuration
     */
    private validateAcoConfig(config: ACOConfig): void {
        if (!config.apiUrl || config.apiUrl.trim() === '') {
            throw new ToolManagerError('Missing required ACO API URL', 'configure');
        }
        if (!config.apiKey || config.apiKey.trim() === '') {
            throw new ToolManagerError('Missing required ACO API Key', 'configure');
        }
        if (!config.tenantId || config.tenantId.trim() === '') {
            throw new ToolManagerError('Missing required ACO Tenant ID', 'configure');
        }
        if (!config.environmentId || config.environmentId.trim() === '') {
            throw new ToolManagerError('Missing required ACO Environment ID', 'configure');
        }
    }

    /**
     * Sanitize a value for .env file (remove newlines, escape special chars)
     */
    private sanitizeEnvValue(value: string): string {
        return value
            .replace(/[\r\n]/g, '') // Remove newlines
            .replace(/\\/g, '\\\\') // Escape backslashes
            .trim();
    }

    /**
     * Parse .env file content into key-value pairs
     */
    private parseEnvFile(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.slice(0, eqIndex);
                const value = trimmed.slice(eqIndex + 1);
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Generate .env file content from key-value pairs
     */
    private generateEnvContent(vars: Record<string, string>): string {
        const lines = [
            '# Commerce Demo Ingestion Tool Configuration',
            '# Generated by Adobe Demo Builder',
            '',
        ];

        for (const [key, value] of Object.entries(vars)) {
            lines.push(`${key}=${value}`);
        }

        return lines.join('\n') + '\n';
    }

    /**
     * Extract meaningful error message from stderr
     */
    private extractErrorMessage(stderr: string): string {
        // Look for common error patterns
        const errorMatch = stderr.match(/Error:\s*(.+)/i);
        if (errorMatch) {
            return errorMatch[0];
        }
        return stderr.trim().split('\n')[0] || 'Unknown error';
    }
}
