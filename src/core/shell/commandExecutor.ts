import type { ExecOptions } from 'child_process';
import execa, { type ExecaError, type ExecaChildProcess } from 'execa';
import { CommandQueue } from './commandQueue';
import { CommandResultCache } from './commandResultCache';
import { CommandSequencer } from './commandSequencer';
import { EnvironmentSetup } from './environmentSetup';
import { FileWatcher } from './fileWatcher';
import { PollingService } from './pollingService';
import { isPortAvailable } from './portChecker';
import { ResourceLocker } from './resourceLocker';
import { RetryStrategyManager } from './retryStrategyManager';
import type { CommandResult, ExecuteOptions, CommandConfig, PollOptions } from './types';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateNodeVersion } from '@/core/validation';
import { DEFAULT_SHELL } from '@/types/shell';

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
    private resultCache: CommandResultCache;
    private commandQueue: CommandQueue;

    constructor() {
        this.environmentSetup = new EnvironmentSetup();
        this.retryManager = new RetryStrategyManager();
        this.resourceLocker = new ResourceLocker();
        this.pollingService = new PollingService();
        this.fileWatcher = new FileWatcher();
        this.commandSequencer = new CommandSequencer();
        this.resultCache = new CommandResultCache();
        this.commandQueue = new CommandQueue({
            executeCommand: (command, options) => this.execute(command, options),
            executeExclusive: (resource, operation) => this.executeExclusive(resource, operation),
        });
    }

    /**
     * Validate and enforce minimum timeout value
     * SECURITY: Prevents denial-of-service via extremely low timeout values
     */
    private validateTimeout(timeout?: number): number {
        const effectiveTimeout = timeout !== undefined ? timeout : TIMEOUTS.NORMAL;

        if (effectiveTimeout < TIMEOUTS.MIN_COMMAND_TIMEOUT) {
            throw new Error(`Timeout must be at least ${TIMEOUTS.MIN_COMMAND_TIMEOUT}ms (got ${effectiveTimeout}ms)`);
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
     * Apply Adobe CLI default options when auto-detected.
     * Returns a promise only when async Node version setup is needed, null otherwise.
     */
    private applyAdobeCLIDefaults(
        command: string,
        options: ExecuteOptions,
        finalOptions: ExecOptions,
    ): Promise<void> | null {
        const isVersionCheck = command.includes('--version') || command.includes('-v');
        let asyncWork: Promise<void> | null = null;

        if (!isVersionCheck) {
            asyncWork = this.environmentSetup.ensureAdobeCLINodeVersion(this.execute.bind(this));
        }

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
        if (!options.retryStrategy) {
            options.retryStrategy = this.retryManager.getStrategy('adobe-cli');
        }

        return asyncWork;
    }

    /**
     * Wrap command with fnm for Node version isolation
     */
    private wrapCommandWithFnm(
        nodeVersion: string,
        state: { finalCommand: string; finalOptions: ExecOptions },
    ): void {
        const fnmPath = this.environmentSetup.findFnmPath();
        if (fnmPath && nodeVersion !== 'current') {
            state.finalCommand = `${fnmPath} exec --using=${nodeVersion} ${state.finalCommand}`;
            state.finalOptions.shell = '/bin/zsh';
        } else if (nodeVersion === 'current') {
            state.finalCommand = `eval "$(fnm env)" && ${state.finalCommand}`;
            state.finalOptions.shell = '/bin/zsh';
        }
    }

    /**
     * Resolve Node version and wrap command with fnm if needed.
     * Returns synchronously when no async resolution is required.
     */
    private resolveNodeVersion(
        options: ExecuteOptions,
        state: { finalCommand: string; finalOptions: ExecOptions },
    ): string | null | Promise<string | null> {
        if (options.useNodeVersion === null || options.useNodeVersion === undefined) {
            return options.useNodeVersion ?? null;
        }

        // SECURITY FIX (CWE-77): Validate nodeVersion BEFORE resolving "auto"
        validateNodeVersion(options.useNodeVersion);

        if (options.useNodeVersion === 'auto') {
            return this.resolveAutoNodeVersion(options, state);
        }

        const nodeVersion = options.useNodeVersion;

        // SECURITY FIX (CWE-77): Defense-in-depth validation for resolved version
        if (nodeVersion !== 'current') {
            validateNodeVersion(nodeVersion);
        }

        this.wrapCommandWithFnm(nodeVersion, state);

        return nodeVersion;
    }

    /**
     * Resolve "auto" Node version asynchronously
     */
    private async resolveAutoNodeVersion(
        options: ExecuteOptions,
        state: { finalCommand: string; finalOptions: ExecOptions },
    ): Promise<string | null> {
        const nodeVersion = await this.environmentSetup.findAdobeCLINodeVersion();

        // SECURITY FIX (CWE-77): Defense-in-depth validation for resolved version
        if (nodeVersion && nodeVersion !== 'current') {
            validateNodeVersion(nodeVersion);
        }

        if (nodeVersion) {
            this.wrapCommandWithFnm(nodeVersion, state);
        }

        return nodeVersion;
    }

    /**
     * Check cache for Adobe CLI results (version and plugins)
     */
    private checkAdobeCLICache(
        command: string,
        effectiveNodeVersion: string | null,
    ): CommandResult | undefined {
        if (command === 'aio --version') {
            return this.resultCache.getVersionResult(command, effectiveNodeVersion) ?? undefined;
        }
        if (command === 'aio plugins') {
            return this.resultCache.getPluginsResult(command, effectiveNodeVersion) ?? undefined;
        }
        return undefined;
    }

    /**
     * Apply enhanced PATH environment variable
     */
    private applyEnhancedPath(
        options: ExecuteOptions,
        command: string,
        finalOptions: ExecOptions,
    ): void {
        const shouldEnhance = options.enhancePath ||
            (options.useNodeVersion === undefined && command.startsWith('aio '));
        if (!shouldEnhance) return;

        const extraPaths = this.environmentSetup.findNpmGlobalPaths();
        if (extraPaths.length > 0) {
            finalOptions.env = {
                ...process.env,
                ...finalOptions.env,
                PATH: `${extraPaths.join(':')}:${process.env.PATH || ''}`,
            };
        }
    }

    /**
     * Cache Adobe CLI results after successful execution
     */
    private cacheAdobeCLIResult(
        command: string,
        effectiveNodeVersion: string | null,
        result: CommandResult,
    ): void {
        if (result.code !== 0) return;
        if (command === 'aio --version') {
            this.resultCache.setVersionResult(command, effectiveNodeVersion, result);
        } else if (command === 'aio plugins') {
            this.resultCache.setPluginsResult(command, effectiveNodeVersion, result);
        }
    }

    /**
     * Check if telemetry configuration is needed.
     * Returns a promise only when async work is required, null otherwise.
     */
    private checkTelemetryNeeded(command: string, options: ExecuteOptions): Promise<void> | null {
        const isVersionCheck = command.includes('--version') || command.includes('-v');
        const needsTelemetry = !isVersionCheck &&
            (options.configureTelemetry || (command.startsWith('aio ') && options.configureTelemetry !== false));
        if (needsTelemetry) {
            return this.environmentSetup.ensureAdobeCLIConfigured(this.execute.bind(this));
        }
        return null;
    }

    /**
     * Internal execution logic
     */
    private async executeInternal(command: string, options: ExecuteOptions): Promise<CommandResult> {
        const state = {
            finalCommand: command,
            finalOptions: { ...options } as ExecOptions,
        };

        // Auto-detect Adobe CLI commands and automatically apply required defaults
        const isAdobeCLI = command.startsWith('aio ') || command.startsWith('aio-');
        if (isAdobeCLI) {
            const adobeDefaultsPromise = this.applyAdobeCLIDefaults(command, options, state.finalOptions);
            if (adobeDefaultsPromise) {
                await adobeDefaultsPromise;
            }
        }

        // Step 1: Handle telemetry configuration for Adobe CLI (only await when needed)
        const telemetryPromise = this.checkTelemetryNeeded(command, options);
        if (telemetryPromise) {
            await telemetryPromise;
        }

        // Step 2: Handle Node version management and resolve "auto" to actual version
        const nodeVersionResult = this.resolveNodeVersion(options, state);
        const effectiveNodeVersion = nodeVersionResult instanceof Promise
            ? await nodeVersionResult
            : nodeVersionResult;

        // Step 2.5: Check cache for Adobe CLI commands
        if (isAdobeCLI) {
            const cachedResult = this.checkAdobeCLICache(command, effectiveNodeVersion);
            if (cachedResult) return cachedResult;
        }

        // Step 3: Handle enhanced PATH
        this.applyEnhancedPath(options, command, state.finalOptions);

        // Step 4: Set and validate timeout
        state.finalOptions.timeout = this.validateTimeout(options.timeout);

        // Step 5: Handle streaming vs regular execution
        if (options.streaming && options.onOutput) {
            return this.executeStreamingInternal(state.finalCommand, state.finalOptions, options.onOutput, options.signal);
        }

        // Step 6: Execute with retry logic
        const retryStrategy = options.retryStrategy || this.retryManager.getDefaultStrategy();
        const result = await this.retryManager.executeWithRetry(
            () => this.executeStreamingInternal(state.finalCommand, state.finalOptions, () => {}, options.signal),
            retryStrategy,
            command.substring(0, 50),
        );

        // Cache Adobe CLI results
        if (isAdobeCLI) {
            this.cacheAdobeCLIResult(command, effectiveNodeVersion, result);
        }

        return result;
    }

    /**
     * Execute command with streaming output using execa
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

        const shellOption = options.shell || false;
        const subprocess: ExecaChildProcess = execa(command, {
            shell: shellOption,
            cwd: options.cwd as string | undefined,
            env: options.env as NodeJS.ProcessEnv | undefined,
            timeout: options.timeout,
            reject: false,
            stdin: 'pipe',
        });

        // Manual AbortController support
        if (signal) {
            const abortHandler = () => {
                subprocess.kill();
            };
            signal.addEventListener('abort', abortHandler);
            subprocess.finally(() => {
                signal.removeEventListener('abort', abortHandler);
            });
        }

        // Stream stdout and handle Adobe CLI telemetry prompt
        subprocess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            stdout += output;

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
            const result = await subprocess;
            const duration = Date.now() - startTime;

            // With reject: false, timeout doesn't throw - check explicitly
            if (result.timedOut) {
                this.logger.warn(`[Command Executor] Command timed out after ${options.timeout}ms`);
                throw new Error(`Command timed out after ${options.timeout}ms`);
            }

            if (result.exitCode && result.exitCode !== 0) {
                this.logger.debug(`[Command Executor] Process exited with code ${result.exitCode} after ${duration}ms`);
            }

            return {
                stdout,
                stderr,
                code: result.exitCode,
                duration,
            };
        } catch (error) {
            this.handleStreamingError(error, options.timeout);
        }
    }

    /**
     * Handle errors from streaming execution
     */
    private handleStreamingError(error: unknown, timeout?: number): never {
        const execaError = error as ExecaError;

        if (execaError.timedOut) {
            this.logger.warn(`[Command Executor] Command timed out after ${timeout}ms`);
            throw new Error(`Command timed out after ${timeout}ms`);
        }

        if (execaError.isCanceled) {
            this.logger.debug('[Command Executor] Command was canceled via AbortController');
            throw new Error('Command was canceled');
        }

        if (execaError.killed) {
            this.logger.debug('[Command Executor] Command was killed');
            throw new Error('Command was killed');
        }

        this.logger.error(`[Command Executor] Process error: ${execaError.message}`);
        throw error;
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
        return this.commandQueue.queueCommand(command, options, resourceLock);
    }

    /**
     * Check if a command exists in the system
     * SECURITY: Validates command name before using in shell command
     */
    async commandExists(command: string): Promise<boolean> {
        // SECURITY: Validate command name to prevent command injection
        if (!/^[a-zA-Z0-9_./-]+$/.test(command)) {
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
        return isPortAvailable(port);
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        // Clear command queue
        this.commandQueue.clear('Command executor disposed');

        // Clear resource locks
        this.resourceLocker.clearAllLocks();

        // Dispose file watchers
        this.fileWatcher.disposeAll();

        // Reset environment setup session
        this.environmentSetup.resetSession();

        // Clear result cache
        this.resultCache.clear();
    }
}
