import { spawn, type ExecOptions } from 'child_process';
import { CommandSequencer } from './commandSequencer';
import { EnvironmentSetup } from './environmentSetup';
import { FileWatcher } from './fileWatcher';
import { PollingService } from './pollingService';
import { ResourceLocker } from './resourceLocker';
import { RetryStrategyManager } from './retryStrategyManager';
import type { CommandResult, ExecuteOptions, CommandRequest, CommandConfig, PollOptions } from './types';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Main command executor - orchestrates all command execution operations
 * Provides unified interface for running external commands with advanced features
 */
export class CommandExecutor {
    private logger = getLogger();
    private environmentSetup: EnvironmentSetup;
    private retryManager: RetryStrategyManager;
    private resourceLocker: ResourceLocker;
    private pollingService: PollingService;
    private fileWatcher: FileWatcher;
    private commandSequencer: CommandSequencer;

    // Command queue for sequential execution
    private commandQueue: CommandRequest[] = [];
    private isProcessingQueue = false;

    // Session caching for Adobe CLI
    private adobeVersionCache: CommandResult | null = null;
    private adobePluginsCache: CommandResult | null = null;

    constructor() {
        this.environmentSetup = new EnvironmentSetup();
        this.retryManager = new RetryStrategyManager();
        this.resourceLocker = new ResourceLocker();
        this.pollingService = new PollingService();
        this.fileWatcher = new FileWatcher();
        this.commandSequencer = new CommandSequencer();
    }

    /**
     * Validate and enforce minimum timeout value
     * SECURITY: Prevents denial-of-service via extremely low timeout values
     *
     * @param timeout - Timeout value to validate (undefined means use default)
     * @returns Validated timeout value
     * @throws Error if timeout is below minimum threshold
     */
    private validateTimeout(timeout?: number): number {
        const MIN_TIMEOUT = 1000; // 1 second minimum
        const effectiveTimeout = timeout !== undefined ? timeout : TIMEOUTS.COMMAND_DEFAULT;

        if (effectiveTimeout < MIN_TIMEOUT) {
            throw new Error(`Timeout must be at least ${MIN_TIMEOUT}ms (got ${effectiveTimeout}ms)`);
        }

        return effectiveTimeout;
    }

    /**
     * Unified command execution method
     * Centralizes all command execution logic with configurable options
     */
    async execute(command: string, options: ExecuteOptions = {}): Promise<CommandResult> {
        // Handle exclusive execution if requested
        if (options.exclusive) {
            return this.resourceLocker.executeExclusive(
                options.exclusive,
                () => this.executeInternal(command, options),
            );
        }

        return this.executeInternal(command, options);
    }

    /**
     * Internal execution logic
     */
    private async executeInternal(command: string, options: ExecuteOptions): Promise<CommandResult> {
        let finalCommand = command;
        const finalOptions: ExecOptions = { ...options };

        // Step 1: Handle telemetry configuration for Adobe CLI
        if (options.configureTelemetry || (command.startsWith('aio ') && options.configureTelemetry !== false)) {
            await this.environmentSetup.ensureAdobeCLIConfigured(this.execute.bind(this));
        }

        // Step 2: Handle Node version management
        // Fix #7 (01b94d6): Use fnm exec for bulletproof isolation instead of fnm use
        if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
            const nodeVersion = options.useNodeVersion === 'auto'
                ? await this.environmentSetup.findAdobeCLINodeVersion()
                : options.useNodeVersion;

            if (nodeVersion) {
                // Use fnm exec for guaranteed isolation
                const fnmPath = this.environmentSetup.findFnmPath();
                if (fnmPath && nodeVersion !== 'current') {
                    // fnm exec provides bulletproof isolation - no fallback to nvm/system Node
                    finalCommand = `${fnmPath} exec --using=${nodeVersion} ${finalCommand}`;
                    finalOptions.shell = finalOptions.shell || '/bin/zsh';
                } else if (nodeVersion === 'current') {
                    // Use fnm env for current version
                    finalCommand = `eval "$(fnm env)" && ${finalCommand}`;
                    finalOptions.shell = finalOptions.shell || '/bin/zsh';
                }
            }
        }

        // Step 3: Handle enhanced PATH
        if (options.enhancePath || ((options.useNodeVersion === undefined) && command.startsWith('aio '))) {
            const extraPaths = this.environmentSetup.findNpmGlobalPaths();
            if (extraPaths.length > 0) {
                finalOptions.env = {
                    ...process.env,
                    ...finalOptions.env,
                    PATH: `${extraPaths.join(':')}:${process.env.PATH || ''}`,
                };
            }
        }

        // Step 4: Set and validate timeout
        finalOptions.timeout = this.validateTimeout(options.timeout);

        // Step 5: Handle streaming vs regular execution
        if (options.streaming && options.onOutput) {
            return this.executeStreamingInternal(finalCommand, finalOptions, options.onOutput);
        }

        // Step 6: Execute with retry logic
        const retryStrategy = options.retryStrategy || this.retryManager.getDefaultStrategy();
        return this.retryManager.executeWithRetry(
            () => this.executeStreamingInternal(finalCommand, finalOptions, () => {}),
            retryStrategy,
            command.substring(0, 50),
        );
    }

    /**
     * Execute command with streaming output
     *
     * SECURITY NOTE: shell option
     *
     * When shell is true, the command is executed through the system shell, which enables
     * shell features like pipes, redirects, and variable expansion, but also increases
     * the risk of command injection attacks.
     *
     * SAFE USAGE:
     * - Command string is hardcoded (no user input)
     * - All variables are validated with appropriate validators from securityValidation.ts
     * - Input comes from trusted sources only (e.g., Adobe CLI responses, internal state)
     * - Variables are from known-safe sources (e.g., port numbers from component state)
     *
     * UNSAFE USAGE:
     * - Command includes unvalidated user input
     * - Variables from external APIs without validation
     * - File paths or IDs from untrusted sources
     * - Any string that could contain shell metacharacters: $ ( ) ; & | < > ` ' " \
     *
     * DEFAULT: shell is FALSE by default (changed in Phase 04.1s)
     *
     * VALIDATION CHECKLIST (before using shell: true):
     * □ All Adobe resource IDs validated with validateAdobeResourceId()
     * □ All project names validated with validateProjectNameSecurity()
     * □ All file paths validated with validateProjectPath()
     * □ All access tokens validated with validateAccessToken()
     * □ All URLs validated with validateURL()
     * □ No direct user input in command string
     *
     * EXAMPLES:
     *
     * ✅ SAFE:
     * executeCommand('aio console:project:select 12345', { shell: false })
     * // Safe: No shell needed, IDs should be validated before calling
     *
     * ✅ SAFE (with validation):
     * validateProjectId(projectId); // Throws if invalid
     * executeCommand(`cd ${projectPath} && npm install`, { shell: true })
     * // Safe: projectId validated before use, projectPath from validateProjectPath()
     *
     * ❌ UNSAFE:
     * executeCommand(`aio console:project:select ${userInput}`, { shell: true })
     * // Dangerous: userInput not validated, shell enabled
     *
     * ❌ UNSAFE:
     * executeCommand(`cd ${req.body.path} && ls`, { shell: true })
     * // Dangerous: path from external source, not validated
     */
    private async executeStreamingInternal(
        command: string,
        options: ExecOptions,
        onOutput: (data: string) => void,
    ): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';

            // SECURITY FIX: Remove shell: true default
            // Only use shell if explicitly requested OR if fnm environment setup set it
            const child = spawn(command, [], {
                shell: options.shell || false,  // Changed from true to false
                cwd: options.cwd,
                env: options.env!,
            });

            child.stdout?.on('data', (data) => {
                const output = data.toString();
                stdout += output;

                // Auto-handle Adobe CLI telemetry prompt
                if (output.includes('Would you like to allow @adobe/aio-cli to collect anonymous usage data?')) {
                    this.logger.info('[Command Executor] Auto-answered aio-cli telemetry prompt');
                    child.stdin?.write('n\n');
                    child.stdin?.end();
                }

                onOutput(output);
            });

            child.stderr?.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                onOutput(output);
            });

            child.on('error', (error) => {
                this.logger.error(`[Command Executor] Process error: ${error.message}`);
                reject(error);
            });

            child.on('close', (code) => {
                // Only log non-zero exit codes
                if (code && code !== 0) {
                    this.logger.warn(`[Command Executor] Process exited with code ${code} after ${Date.now() - startTime}ms`);
                }
                const duration = Date.now() - startTime;
                resolve({
                    stdout,
                    stderr,
                    code: code || 0,
                    duration,
                });
            });

            // Handle timeout
            if (options.timeout) {
                let forceKillTimeoutId: NodeJS.Timeout | undefined;
                const timeoutId = setTimeout(() => {
                    this.logger.warn(`[Command Executor] Command timed out after ${options.timeout}ms (PID: ${child.pid})`);

                    if (!child.killed) {
                        child.kill('SIGTERM');

                        // Force kill after 2 seconds
                        forceKillTimeoutId = setTimeout(() => {
                            if (!child.killed && child.exitCode === null) {
                                this.logger.warn(`[Command Executor] Force killing process ${child.pid} (SIGKILL)`);
                                child.kill('SIGKILL');
                            }
                        }, 2000).unref(); // Don't keep process alive for force kill timeout
                    }

                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout).unref(); // Don't keep process alive for command timeout

                // Clear both timeouts when process completes
                child.on('close', () => {
                    clearTimeout(timeoutId);
                    if (forceKillTimeoutId) {
                        clearTimeout(forceKillTimeoutId);
                    }
                });
            }
        });
    }

    /**
     * Get current fnm version
     */
    private async getCurrentFnmVersion(): Promise<string | null> {
        try {
            const result = await this.execute('fnm current', { timeout: 2000 });
            return result.stdout?.trim() || null;
        } catch {
            return null;
        }
    }

    /**
     * Execute Adobe CLI command with the correct Node version
     */
    async executeAdobeCLI(command: string, options?: ExecuteOptions): Promise<CommandResult> {
        // Check cache for specific commands
        if (command === 'aio --version' && this.adobeVersionCache) {
            this.logger.debug('[Command Executor] Using cached aio --version result');
            return this.adobeVersionCache;
        }
        if (command === 'aio plugins' && this.adobePluginsCache) {
            this.logger.debug('[Command Executor] Using cached aio plugins result');
            return this.adobePluginsCache;
        }

        // Ensure Node version is set once per session
        await this.environmentSetup.ensureAdobeCLINodeVersion(this.execute.bind(this));

        // Execute command
        const result = await this.execute(command, {
            ...options,
            configureTelemetry: false,
            useNodeVersion: null,
            enhancePath: true,
            retryStrategy: this.retryManager.getStrategy('adobe-cli'),
        });

        // Cache results for version and plugins commands
        if (command === 'aio --version' && result.code === 0) {
            this.adobeVersionCache = result;
            this.logger.debug('[Command Executor] Cached aio --version result');
        } else if (command === 'aio plugins' && result.code === 0) {
            this.adobePluginsCache = result;
            this.logger.debug('[Command Executor] Cached aio plugins result');
        }

        return result;
    }

    /**
     * Execute command with exclusive access to a resource
     */
    async executeExclusive<T>(resource: string, operation: () => Promise<T>): Promise<T> {
        return this.resourceLocker.executeExclusive(resource, operation);
    }

    /**
     * Poll until a condition is met
     */
    async pollUntilCondition(
        checkFn: () => Promise<boolean>,
        options: PollOptions = {},
    ): Promise<void> {
        return this.pollingService.pollUntilCondition(checkFn, options);
    }

    /**
     * Wait for a file system change
     */
    async waitForFileSystem(
        path: string,
        expectedCondition?: () => Promise<boolean>,
        timeout = 10000,
    ): Promise<void> {
        return this.fileWatcher.waitForFileSystem(path, expectedCondition, timeout);
    }

    /**
     * Execute multiple commands in sequence
     */
    async executeSequence(
        commands: CommandConfig[],
        stopOnError = true,
    ): Promise<CommandResult[]> {
        return this.commandSequencer.executeSequence(
            commands,
            async (command, config) => {
                return this.execute(command, {
                    ...config.options,
                    exclusive: config.resource,
                    configureTelemetry: command.startsWith('aio '),
                    enhancePath: command.startsWith('aio '),
                    useNodeVersion: command.startsWith('aio ') ? 'auto' : undefined,
                });
            },
            stopOnError,
        );
    }

    /**
     * Execute multiple commands in parallel
     */
    async executeParallel(commands: CommandConfig[]): Promise<CommandResult[]> {
        return this.commandSequencer.executeParallel(
            commands,
            async (command, config) => {
                return this.execute(command, {
                    ...config.options,
                    configureTelemetry: command.startsWith('aio '),
                    enhancePath: command.startsWith('aio '),
                    useNodeVersion: command.startsWith('aio ') ? 'auto' : undefined,
                });
            },
        );
    }

    /**
     * Queue a command for execution
     */
    async queueCommand(
        command: string,
        options?: ExecOptions,
        resourceLock?: string,
    ): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                command,
                options,
                resolve,
                reject,
                resourceLock,
            });

            this.processQueue();
        });
    }

    /**
     * Process the command queue
     * Continues processing until queue is empty, handling commands added during processing
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.commandQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        // Keep processing until queue is empty
        while (this.commandQueue.length > 0) {
            // Process all currently queued commands
            const commands = [...this.commandQueue];
            this.commandQueue = [];

            for (const request of commands) {
                try {
                    let result: CommandResult;

                    if (request.resourceLock) {
                        result = await this.executeExclusive(request.resourceLock, () =>
                            this.execute(request.command, request.options),
                        );
                    } else {
                        result = await this.execute(request.command, request.options);
                    }

                    request.resolve(result);
                } catch (error) {
                    request.reject(error as Error);
                }
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Check if a command exists in the system
     *
     * SECURITY: Validates command name before using in shell command
     */
    async commandExists(command: string): Promise<boolean> {
        // SECURITY: Validate command name to prevent command injection
        // Only allow alphanumeric characters, hyphens, underscores, dots, and forward slashes (for paths)
        if (!/^[a-zA-Z0-9_./\-]+$/.test(command)) {
            this.logger.warn(`[Command Executor] Invalid command name rejected: ${command}`);
            return false;
        }

        try {
            // Try with fnm environment first for Node.js commands
            if (command === 'node' || command === 'npm' || command === 'npx') {
                const result = await this.execute(`which ${command}`, {
                    useNodeVersion: 'current',
                });
                return result.stdout.trim().length > 0;
            }

            // For other commands, use enhanced path
            const result = await this.execute(`which ${command}`, {
                enhancePath: true,
            });
            return result.stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if a port is available
     */
    async isPortAvailable(port: number): Promise<boolean> {
        const net = await import('net');
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', () => {
                resolve(false);
            });

            server.once('listening', () => {
                server.close();
                resolve(true);
            });

            server.listen(port);
        });
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        // Clear command queue
        this.commandQueue.forEach(req => {
            req.reject(new Error('Command executor disposed'));
        });
        this.commandQueue = [];

        // Clear resource locks
        this.resourceLocker.clearAllLocks();

        // Dispose file watchers
        this.fileWatcher.disposeAll();

        // Reset environment setup session
        this.environmentSetup.resetSession();

        this.logger.debug('[Command Executor] Disposed all resources');
    }
}
