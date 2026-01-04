import type { ExecOptions } from 'child_process';
import execa, { type ExecaError, type ExecaChildProcess } from 'execa';
import { CommandQueue } from './commandQueue';
import {
    isAdobeCLICommand,
    applyAdobeCliDefaults,
    buildFnmCommand,
    enhanceEnvironmentPath,
    lookupCachedResult,
    storeCachedResult,
} from './commandExecutorHelpers';
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
     * Internal execution logic
     * Orchestrates command execution using extracted helper functions
     */
    private async executeInternal(command: string, options: ExecuteOptions): Promise<CommandResult> {
        let finalCommand = command;
        let effectiveOptions = { ...options };
        const finalOptions: ExecOptions = { ...options } as ExecOptions;

        // Step 1: Auto-detect Adobe CLI commands and apply defaults
        const isAdobeCLI = isAdobeCLICommand(command);
        if (isAdobeCLI) {
            // Ensure Node version is set once per session (skip for version checks)
            const isVersionCheck = command.includes('--version') || command.includes('-v');
            if (!isVersionCheck) {
                await this.environmentSetup.ensureAdobeCLINodeVersion(this.execute.bind(this));
            }

            // Apply Adobe CLI defaults using helper
            effectiveOptions = applyAdobeCliDefaults(effectiveOptions, this.retryManager);
            if (!finalOptions.shell && typeof effectiveOptions.shell === 'string') {
                finalOptions.shell = effectiveOptions.shell;
            }
        }

        // Step 2: Handle telemetry configuration for Adobe CLI
        const isVersionCheck = command.includes('--version') || command.includes('-v');
        if (!isVersionCheck && (effectiveOptions.configureTelemetry || (isAdobeCLI && effectiveOptions.configureTelemetry !== false))) {
            await this.environmentSetup.ensureAdobeCLIConfigured(this.execute.bind(this));
        }

        // Step 3: Handle Node version management and resolve "auto" to actual version
        let effectiveNodeVersion: string | null = effectiveOptions.useNodeVersion ?? null;

        if (effectiveOptions.useNodeVersion !== null && effectiveOptions.useNodeVersion !== undefined) {
            // SECURITY FIX (CWE-77): Validate nodeVersion BEFORE resolving "auto"
            validateNodeVersion(effectiveOptions.useNodeVersion);

            const nodeVersion = effectiveOptions.useNodeVersion === 'auto'
                ? await this.environmentSetup.findAdobeCLINodeVersion()
                : effectiveOptions.useNodeVersion;

            effectiveNodeVersion = nodeVersion;

            // SECURITY FIX (CWE-77): Defense-in-depth validation for resolved version
            if (nodeVersion && nodeVersion !== 'current') {
                validateNodeVersion(nodeVersion);
            }

            // Build fnm-wrapped command using helper
            if (nodeVersion) {
                const fnmPath = this.environmentSetup.findFnmPath();
                const fnmResult = buildFnmCommand(finalCommand, nodeVersion, fnmPath);
                finalCommand = fnmResult.command;
                if (fnmResult.shell) {
                    finalOptions.shell = fnmResult.shell;
                }
            }
        }

        // Step 4: Check cache for Adobe CLI commands using helper
        if (isAdobeCLI) {
            const cachedResult = lookupCachedResult(command, effectiveNodeVersion, this.resultCache);
            if (cachedResult) {
                return cachedResult;
            }
        }

        // Step 5: Handle enhanced PATH using helper
        if (effectiveOptions.enhancePath || ((effectiveOptions.useNodeVersion === undefined) && isAdobeCLI)) {
            const extraPaths = this.environmentSetup.findNpmGlobalPaths();
            if (extraPaths.length > 0) {
                finalOptions.env = enhanceEnvironmentPath(finalOptions.env, extraPaths);
            }
        }

        // Step 6: Set and validate timeout
        finalOptions.timeout = this.validateTimeout(effectiveOptions.timeout);

        // Step 7: Handle streaming vs regular execution
        if (effectiveOptions.streaming && effectiveOptions.onOutput) {
            return this.executeStreamingInternal(finalCommand, finalOptions, effectiveOptions.onOutput, effectiveOptions.signal);
        }

        // Step 8: Execute with retry logic
        const retryStrategy = effectiveOptions.retryStrategy || this.retryManager.getDefaultStrategy();
        const result = await this.retryManager.executeWithRetry(
            () => this.executeStreamingInternal(finalCommand, finalOptions, () => {}, effectiveOptions.signal),
            retryStrategy,
            command.substring(0, 50),
        );

        // Step 9: Cache Adobe CLI results using helper
        if (isAdobeCLI && result.code === 0) {
            storeCachedResult(command, effectiveNodeVersion, result, this.resultCache);
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
            const execaError = error as ExecaError;
            const _duration = Date.now() - startTime;

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
