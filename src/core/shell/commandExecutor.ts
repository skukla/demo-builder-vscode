import type { ExecOptions } from 'child_process';
import execa, { type ExecaError, type ExecaChildProcess } from 'execa';
import { CommandSequencer } from './commandSequencer';
import { EnvironmentSetup } from './environmentSetup';
import { FileWatcher } from './fileWatcher';
import { PollingService } from './pollingService';
import { ResourceLocker } from './resourceLocker';
import { RetryStrategyManager } from './retryStrategyManager';
import type { CommandResult, ExecuteOptions, CommandRequest, CommandConfig, PollOptions } from './types';
import { DEFAULT_SHELL } from '@/types/shell';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateNodeVersion } from '@/core/validation/securityValidation';

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

    // Session caching for Adobe CLI (keyed by node version for multi-version support)
    private adobeVersionCache: Map<string, CommandResult> = new Map();
    private adobePluginsCache: Map<string, CommandResult> = new Map();

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
        // Type assertion needed because ExecuteOptions.shell supports boolean, but ExecOptions.shell only supports string
        // Node.js spawn actually supports both, so this is safe
        const finalOptions: ExecOptions = { ...options } as ExecOptions;

        // Auto-detect Adobe CLI commands and automatically apply required defaults
        // Eliminates ENOENT errors by ensuring shell: true is always set for 'aio' commands
        // Developers can now safely use execute() for Adobe CLI without specifying options
        const isAdobeCLI = command.startsWith('aio ') || command.startsWith('aio-');
        if (isAdobeCLI) {
            // Ensure Node version is set once per session
            const isVersionCheck = command.includes('--version') || command.includes('-v');
            if (!isVersionCheck) {
                await this.environmentSetup.ensureAdobeCLINodeVersion(this.execute.bind(this));
            }

            // Auto-apply Adobe CLI defaults (unless explicitly overridden by caller)
            // This makes execute() work correctly for Adobe CLI without manual options
            if (!finalOptions.shell) {
                finalOptions.shell = DEFAULT_SHELL;
            }
            if (options.configureTelemetry === undefined) {
                options.configureTelemetry = false;
            }
            if (options.enhancePath === undefined) {
                options.enhancePath = true;
            }
            if (options.useNodeVersion === undefined) {
                options.useNodeVersion = null;
            }
            // Set retry strategy if not provided
            if (!options.retryStrategy) {
                options.retryStrategy = this.retryManager.getStrategy('adobe-cli');
            }
        }

        // Step 1: Handle telemetry configuration for Adobe CLI
        // Skip telemetry configuration for version checks (AIO CLI might not be installed yet)
        const isVersionCheck = command.includes('--version') || command.includes('-v');
        if (!isVersionCheck && (options.configureTelemetry || (command.startsWith('aio ') && options.configureTelemetry !== false))) {
            await this.environmentSetup.ensureAdobeCLIConfigured(this.execute.bind(this));
        }

        // Step 2: Handle Node version management and resolve "auto" to actual version
        // Fix #7 (01b94d6): Use fnm exec for bulletproof isolation instead of fnm use
        let effectiveNodeVersion: string | null = options.useNodeVersion ?? null;

        if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
            // SECURITY FIX (CWE-77): Validate nodeVersion BEFORE resolving "auto"
            // Critical: nodeVersion is directly interpolated into shell command at line 113
            // Attack example: nodeVersion = "20; rm -rf /" → `fnm exec --using=20; rm -rf / npm install`
            // Allowlist validation blocks ALL shell metacharacters (;, &, |, <, >, etc.)
            validateNodeVersion(options.useNodeVersion);

            const nodeVersion = options.useNodeVersion === 'auto'
                ? await this.environmentSetup.findAdobeCLINodeVersion()
                : options.useNodeVersion;

            effectiveNodeVersion = nodeVersion;

            // SECURITY FIX (CWE-77): Defense-in-depth validation for resolved version
            // Protects against compromised findAdobeCLINodeVersion() or .aio config tampering
            // "current" keyword is safe: uses `fnm env` (not interpolated into --using=)
            if (nodeVersion && nodeVersion !== 'current') {
                validateNodeVersion(nodeVersion);
            }

            if (nodeVersion) {
                // Use fnm exec for guaranteed isolation
                const fnmPath = this.environmentSetup.findFnmPath();
                if (fnmPath && nodeVersion !== 'current') {
                    // SECURITY: nodeVersion is validated above - safe for shell interpolation
                    // fnm exec provides bulletproof isolation - no fallback to nvm/system Node
                    finalCommand = `${fnmPath} exec --using=${nodeVersion} ${finalCommand}`;
                    // CRITICAL: fnm exec REQUIRES /bin/zsh shell, override any caller-provided shell
                    // Bug fix: Don't use ||, always force zsh for fnm commands
                    finalOptions.shell = '/bin/zsh';
                } else if (nodeVersion === 'current') {
                    // Use fnm env for current version (not interpolated - safe without validation)
                    finalCommand = `eval "$(fnm env)" && ${finalCommand}`;
                    // CRITICAL: fnm env also requires /bin/zsh shell
                    finalOptions.shell = '/bin/zsh';
                }
            }
        }

        // Step 2.5: Check cache for Adobe CLI commands (after Node version resolution)
        // Cache is keyed by command + node version for correct multi-version support
        if (isAdobeCLI) {
            const cacheKey = `${command}##${effectiveNodeVersion || 'default'}`;

            if (command === 'aio --version') {
                const cachedResult = this.adobeVersionCache.get(cacheKey);
                if (cachedResult) {
                    return cachedResult;
                }
            } else if (command === 'aio plugins') {
                const cachedResult = this.adobePluginsCache.get(cacheKey);
                if (cachedResult) {
                    return cachedResult;
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
            return this.executeStreamingInternal(finalCommand, finalOptions, options.onOutput, options.signal);
        }

        // Step 6: Execute with retry logic
        const retryStrategy = options.retryStrategy || this.retryManager.getDefaultStrategy();
        const result = await this.retryManager.executeWithRetry(
            () => this.executeStreamingInternal(finalCommand, finalOptions, () => {}, options.signal),
            retryStrategy,
            command.substring(0, 50),
        );

        // Cache Adobe CLI results for version and plugins commands (keyed by node version)
        if (isAdobeCLI && result.code === 0) {
            const cacheKey = `${command}##${effectiveNodeVersion || 'default'}`;

            if (command === 'aio --version') {
                this.adobeVersionCache.set(cacheKey, result);
            } else if (command === 'aio plugins') {
                this.adobePluginsCache.set(cacheKey, result);
            }
        }

        return result;
    }

    /**
     * Execute command with streaming output using execa
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
        signal?: AbortSignal,
    ): Promise<CommandResult> {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';

        // Build execa options
        // Note: execa handles timeout internally with automatic cleanup (SIGTERM → SIGKILL after 5s)
        const shellOption = options.shell || false;
        const subprocess: ExecaChildProcess = execa(command, {
            shell: shellOption,
            cwd: options.cwd as string | undefined,
            env: options.env as NodeJS.ProcessEnv | undefined,
            timeout: options.timeout,
            reject: false,    // Don't throw on non-zero exit - we handle it
            stdin: 'pipe',    // Enable stdin for Adobe CLI telemetry prompt handling
        });

        // Manual AbortController support (execa v5 doesn't have native signal option)
        if (signal) {
            const abortHandler = () => {
                subprocess.kill();  // execa handles SIGTERM → SIGKILL automatically
            };
            signal.addEventListener('abort', abortHandler);
            // Clean up listener when process completes
            subprocess.finally(() => {
                signal.removeEventListener('abort', abortHandler);
            });
        }

        // Stream stdout and handle Adobe CLI telemetry prompt
        subprocess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            stdout += output;

            // Auto-handle Adobe CLI telemetry prompt
            if (output.includes('Would you like to allow @adobe/aio-cli to collect anonymous usage data?')) {
                this.logger.debug('[Command Executor] Auto-answered aio-cli telemetry prompt');
                subprocess.stdin?.write('n\n');
                subprocess.stdin?.end();
            }

            onOutput(output);
        });

        // Stream stderr
        subprocess.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            onOutput(output);
        });

        try {
            // Wait for process to complete
            const result = await subprocess;
            const duration = Date.now() - startTime;

            // Log non-zero exit codes
            if (result.exitCode && result.exitCode !== 0) {
                this.logger.warn(`[Command Executor] Process exited with code ${result.exitCode} after ${duration}ms`);
            }

            return {
                stdout,
                stderr,
                code: result.exitCode,
                duration,
            };
        } catch (error) {
            const execaError = error as ExecaError;
            const duration = Date.now() - startTime;

            // Handle execa-specific error types
            if (execaError.timedOut) {
                this.logger.warn(`[Command Executor] Command timed out after ${options.timeout}ms`);
                throw new Error(`Command timed out after ${options.timeout}ms`);
            }

            if (execaError.isCanceled) {
                this.logger.debug('[Command Executor] Command was canceled via AbortController');
                throw new Error('Command was canceled');
            }

            if (execaError.killed) {
                this.logger.debug('[Command Executor] Command was killed');
                throw new Error('Command was killed');
            }

            // For other errors, log and re-throw
            this.logger.error(`[Command Executor] Process error: ${execaError.message}`);
            throw error;
        }
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
     * SOP §1: Using TIMEOUTS constant instead of magic number
     */
    async waitForFileSystem(
        path: string,
        expectedCondition?: () => Promise<boolean>,
        timeout = TIMEOUTS.FILE_WATCH_TIMEOUT,
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
    }
}
