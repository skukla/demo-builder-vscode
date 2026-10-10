import type { ExecOptions } from 'child_process';
import execa, { type ExecaError, type ExecaChildProcess } from 'execa';
import { CommandQueue } from './commandQueue';
import { CommandResultCache } from './commandResultCache';
import { CommandSequencer } from './commandSequencer';
import { demoBuilderNode } from './demoBuilderNode';
import { EnvironmentSetup } from './environmentSetup';
import { FileWatcher } from './fileWatcher';
import { fnmExecCommand, nodeFolderEnv } from './nodeFolder';
import { buildAioConsoleEnv, getActiveOrgContext, needsOrgTargeting } from './orgContextEnv';
import { PollingService } from './pollingService';
import { isPortAvailable } from './portChecker';
import { ResourceLocker } from './resourceLocker';
import { RetryStrategyManager } from './retryStrategyManager';
import type { CommandResult, ExecuteOptions, CommandConfig, PollOptions } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateNodeVersion } from '@/core/validation/validators/NodeVersionValidator';

/** The machinery a CommandExecutor runs on; assembled by createCommandExecutorDeps. */
export interface CommandExecutorDeps {
    environmentSetup: EnvironmentSetup;
    retryManager: RetryStrategyManager;
    resourceLocker: ResourceLocker;
    pollingService: PollingService;
    fileWatcher: FileWatcher;
    commandSequencer: CommandSequencer;
    resultCache: CommandResultCache;
}

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

    /**
     * ADR-015: the six collaborators below are handed in rather than built here.
     *
     * They were constructed in this constructor until 2026-08-28, and the cost
     * was visible at the top of every executor suite: six `jest.mock(...)` lines
     * in a block, because a test had no other way to reach past them. Handing
     * them in turns that block into one plain object.
     *
     * `commandQueue` is NOT among them and stays built here: it closes over
     * `this.execute` and `this.executeExclusive`, so it cannot exist before the
     * instance does.
     */
    constructor(deps: CommandExecutorDeps) {
        this.environmentSetup = deps.environmentSetup;
        this.retryManager = deps.retryManager;
        this.resourceLocker = deps.resourceLocker;
        this.pollingService = deps.pollingService;
        this.fileWatcher = deps.fileWatcher;
        this.commandSequencer = deps.commandSequencer;
        this.resultCache = deps.resultCache;
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
     */
    private applyAdobeCLIDefaults(
        command: string,
        options: ExecuteOptions,
        finalOptions: ExecOptions,
    ): void {
        if (!finalOptions.shell) {
            finalOptions.shell = DEFAULT_SHELL;
        }

        // Inject per-invocation org-context targeting (AIO_CONSOLE_* env) for the
        // active org context, if any. This drives `aio` to the target org without
        // mutating the shared global store. Merged onto finalOptions.env so it
        // survives applyEnhancedPath's spread. No active context → no targeting
        // (safe: today's behavior).
        const activeOrgContext = getActiveOrgContext();
        if (activeOrgContext) {
            const orgEnv = buildAioConsoleEnv(activeOrgContext);
            finalOptions.env = { ...finalOptions.env, ...orgEnv };
        } else if (needsOrgTargeting(command)) {
            // Not an error — the command runs, and some call sites legitimately
            // have no project yet. But it answers about the CLI's process-global
            // workspace rather than the project's, so the one thing worth doing is
            // saying so with the command named. The wrapping contract is per-caller
            // and gets forgotten (four unwrapped mesh readers found 2026-08-08);
            // this is the seam every one of them passes through.
            this.logger.warn(
                `[Command Executor] "${command}" ran without an org target — it will use the`
                    + " aio CLI's global workspace selection, not the project's."
                    + ' Wrap the call in withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe), …).',
            );
        }

        if (options.enhancePath === undefined) {
            options.enhancePath = true;
        }
        // Every `aio` call runs on Demo Builder's Node, from its Node folder (PR-1a).
        // It replaced 'auto', which meant "the first fnm folder that happens to
        // contain aio" (Node 18 on the owner's machine), and a session-wide
        // `fnm use` that changed nothing.
        if (options.useNodeVersion === undefined) {
            options.useNodeVersion = demoBuilderNode();
        }
        if (!options.retryStrategy) {
            options.retryStrategy = this.retryManager.getStrategy('adobe-cli');
        }
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
            state.finalCommand = fnmExecCommand(fnmPath, nodeVersion, state.finalCommand);
            // `fnm exec` needs a shell, not zsh in particular: keep the one the caller
            // named, else the platform's. Forcing zsh overrode both for every `aio`
            // command once they all ran on Demo Builder's Node (PR-1a).
            const chosen = state.finalOptions.shell;
            state.finalOptions.shell = typeof chosen === 'string' ? chosen : DEFAULT_SHELL;
        } else if (nodeVersion === 'current') {
            state.finalCommand = `eval "$(fnm env)" && ${state.finalCommand}`;
            state.finalOptions.shell = '/bin/zsh';
        }
        // Demo Builder's Node folder (PR-1a), on the child only. The full
        // environment is kept: an `env` without PATH runs nothing.
        state.finalOptions.env = { ...process.env, ...state.finalOptions.env, ...nodeFolderEnv() };
    }

    /**
     * Wrap the command with fnm when a Node version is named.
     */
    private resolveNodeVersion(
        options: ExecuteOptions,
        state: { finalCommand: string; finalOptions: ExecOptions },
    ): string | null {
        if (options.useNodeVersion === null || options.useNodeVersion === undefined) {
            return null;
        }
        // SECURITY FIX (CWE-77): validate before it reaches a shell command.
        validateNodeVersion(options.useNodeVersion);
        this.wrapCommandWithFnm(options.useNodeVersion, state);
        return options.useNodeVersion;
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
    private applyEnhancedPath(options: ExecuteOptions, finalOptions: ExecOptions): void {
        // `enhancePath` alone decides: an Adobe CLI command has already been given
        // its default (true) by applyAdobeCLIDefaults before it reaches here.
        if (!options.enhancePath) return;

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
        // `configureTelemetry` alone decides, and unset means no: an Adobe CLI
        // command is configured only when its caller asks.
        const needsTelemetry = !isVersionCheck && options.configureTelemetry;
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
            this.applyAdobeCLIDefaults(command, options, state.finalOptions);
        }

        // Step 1: Handle telemetry configuration for Adobe CLI (only await when needed)
        const telemetryPromise = this.checkTelemetryNeeded(command, options);
        if (telemetryPromise) {
            await telemetryPromise;
        }

        // Step 2: Run on the named Node from Demo Builder's Node folder
        const effectiveNodeVersion = this.resolveNodeVersion(options, state);

        // Step 2.5: Check cache for Adobe CLI commands
        if (isAdobeCLI) {
            const cachedResult = this.checkAdobeCLICache(command, effectiveNodeVersion);
            if (cachedResult) return cachedResult;
        }

        // Step 3: Handle enhanced PATH
        this.applyEnhancedPath(options, state.finalOptions);

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
        // NO explicit `stdin` option. Passing one — ANY value, including execa's own
        // default of 'pipe' — makes a large-output child die mid-write: measured
        // 2026-08-17 against `aio console project list --json`, whose real output is
        // 398KB. With `stdin: 'pipe'` it exited 2 after 32KB / 82KB / 57KB across
        // three runs; with the option omitted, 398,275 bytes and exit 0 every time.
        // The truncated size is random, so it is a race; whether it truncates is
        // deterministic on the option's presence.
        //
        // That is issue #63: an org with 32 projects produced valid JSON cut off at
        // a page boundary, which surfaced as "Invalid projects response format" with
        // no error on stderr to explain it.
        //
        // The option was added to auto-answer the aio telemetry prompt below. It is
        // not needed for that — execa's default stdio already provides a writable
        // `subprocess.stdin`, and a test pins that the prompt handler still reaches it.
        const subprocess: ExecaChildProcess = execa(command, {
            shell: shellOption,
            cwd: options.cwd as string | undefined,
            env: options.env as NodeJS.ProcessEnv | undefined,
            timeout: options.timeout,
            reject: false,
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

            // For other commands, use enhanced path. `shell` is NOT optional: without
            // one execa takes the whole string as an executable name, nothing runs,
            // and the empty stdout read as "absent" for every tool (found 2026-10-03).
            const result = await this.execute(`which ${command}`, {
                enhancePath: true,
                shell: DEFAULT_SHELL,
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
