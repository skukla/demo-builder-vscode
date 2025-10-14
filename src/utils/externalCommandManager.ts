import { ExecOptions, spawn, execSync } from 'child_process';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { getLogger } from './debugLogger';
import { TIMEOUTS } from './timeoutConfig';

/**
 * Command execution request
 */
interface CommandRequest {
    command: string;
    options?: ExecOptions;
    resolve: (value: CommandResult) => void;
    reject: (error: Error) => void;
    retryCount?: number;
    resourceLock?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    duration: number;
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Polling configuration
 */
export interface PollOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    timeout?: number;
    name?: string;
}

/**
 * Unified command execution options
 */
export interface ExecuteOptions extends ExecOptions {
    // Environment setup
    useNodeVersion?: string | 'auto' | null;  // Use specific Node version via fnm ('auto' for Adobe CLI detection, null to skip)
    enhancePath?: boolean;             // Add npm global paths to PATH
    configureTelemetry?: boolean;      // Ensure Adobe CLI telemetry configured
    
    // Execution mode
    streaming?: boolean;                // Stream output in real-time
    exclusive?: string;                 // Resource name for mutual exclusion
    
    // Retry & timeout
    retryStrategy?: RetryStrategy;     // Custom retry logic
    timeout?: number;                   // Command timeout in ms (default: 30000)
    
    // Output handling
    onOutput?: (data: string) => void; // Callback for streaming output
}

/**
 * Manages external command execution with advanced features
 * 
 * Features:
 * - Command queuing and mutual exclusion
 * - Smart polling with exponential backoff
 * - Retry strategies for failed commands
 * - File system change detection
 * - Resource locking to prevent conflicts
 * - Comprehensive logging and debugging
 */
export class ExternalCommandManager {
    private commandQueue: CommandRequest[] = [];
    private locks = new Map<string, Promise<void>>();
    private retryStrategies = new Map<string, RetryStrategy>();
    private isProcessing = false;
    private logger = getLogger();
    private fileWatchers = new Map<string, vscode.FileSystemWatcher>();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Set up default retry strategies
        this.setupDefaultStrategies();
    }

    /**
     * Unified command execution method
     * Centralizes all command execution logic with configurable options
     */
    async execute(command: string, options: ExecuteOptions = {}): Promise<CommandResult> {
        // Handle exclusive execution if requested
        if (options.exclusive) {
            return this.executeExclusive(options.exclusive, () => this.executeInternal(command, options));
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
        // Only check if explicitly requested or if it's an aio command (unless explicitly disabled)
        if (options.configureTelemetry || (command.startsWith('aio ') && options.configureTelemetry !== false)) {
            await this.ensureAdobeCLIConfigured();
        }
        
        // Step 2: Handle Node version management (skip if explicitly set to null)
        if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
            const nodeVersion = options.useNodeVersion === 'auto' 
                ? await this.findAdobeCLINodeVersion()
                : options.useNodeVersion;
                
            const fnmPath = this.findFnmPath();
            if (fnmPath) {
                // Special handling for 'current' - use fnm env instead of fnm exec
                if (options.useNodeVersion === 'current' || nodeVersion === 'current') {
                    // Use fnm env to set up the environment with the current active version
                    finalCommand = `eval "$(${fnmPath} env)" && ${finalCommand}`;
                } else if (nodeVersion) {
                    // Use 'fnm exec' for true isolation - guarantees fnm's Node version is used
                    // even if user has nvm/other Node managers with overlapping versions
                    // 'fnm exec --using=20 aio ...' creates isolated environment where:
                    // - fnm's Node 20 bin directory is first in PATH
                    // - No interference from nvm/system Node
                    // - Command is guaranteed to run under fnm's Node version
                    finalCommand = `${fnmPath} exec --using=${nodeVersion} ${finalCommand}`;
                }
                finalOptions.shell = finalOptions.shell || '/bin/zsh';
            }
        }
        
        // Step 3: Handle enhanced PATH
        if (options.enhancePath || ((options.useNodeVersion === undefined) && command.startsWith('aio '))) {
            const extraPaths = this.findNpmGlobalPaths();
            if (extraPaths.length > 0) {
                finalOptions.env = {
                    ...process.env,
                    ...finalOptions.env,
                    PATH: `${extraPaths.join(':')}:${process.env.PATH || ''}`
                };
            }
        }
        
        // Step 4: Set default timeout
        finalOptions.timeout = options.timeout || TIMEOUTS.COMMAND_DEFAULT;
        
        // Step 5: Handle streaming vs regular execution
        if (options.streaming && options.onOutput) {
            return this.executeStreamingInternal(finalCommand, finalOptions, options.onOutput);
        }
        
        // Step 6: Execute with retry logic
        const retryStrategy = options.retryStrategy || this.getDefaultStrategy();
        return this.executeWithRetry(finalCommand, finalOptions, retryStrategy);
    }

    /**
     * Execute command with retry logic
     */
    private async executeWithRetry(
        command: string,
        options: ExecOptions,
        retryStrategy: RetryStrategy
    ): Promise<CommandResult> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= retryStrategy.maxAttempts; attempt++) {
            const startTime = Date.now();
            try {
                // Only log retry attempts (not first attempt)
                if (attempt > 1) {
                    this.logger.debug(`[CommandManager] Retry attempt ${attempt}/${retryStrategy.maxAttempts}: ${command.substring(0, 50)}...`);
                }
                
                // Use executeStreamingInternal for full debugging visibility
                const result = await this.executeStreamingInternal(command, options, () => {});
                
                const duration = Date.now() - startTime;
                // Only log if retried or took > 5 seconds
                if (attempt > 1 || duration > 5000) {
                    this.logger.debug(`[CommandManager] Command succeeded after ${duration}ms (attempt ${attempt}/${retryStrategy.maxAttempts})`);
                }
                
                return result;
            } catch (error: any) {
                lastError = error;
                const duration = Date.now() - startTime;
                
                // Enhanced error logging
                this.logger.debug(`[CommandManager] Command failed (attempt ${attempt}/${retryStrategy.maxAttempts}) after ${duration}ms:`);
                this.logger.debug(`  Command: ${command}`);
                this.logger.debug(`  Error: ${error.message}`);
                
                // Don't retry on timeout errors - they already took the full timeout duration
                const isTimeout = error.message?.toLowerCase().includes('timed out');
                if (isTimeout) {
                    this.logger.warn('[CommandManager] Command timed out - not retrying');
                    throw error;
                }
                
                // Check if we should retry
                if (attempt < retryStrategy.maxAttempts) {
                    if (retryStrategy.shouldRetry && !retryStrategy.shouldRetry(error, attempt)) {
                        this.logger.debug('[CommandManager] shouldRetry returned false - not retrying');
                        throw error;
                    }
                    
                    // Calculate delay with exponential backoff
                    const delay = Math.min(
                        retryStrategy.initialDelay * Math.pow(retryStrategy.backoffFactor, attempt - 1),
                        retryStrategy.maxDelay
                    );
                    
                    this.logger.debug(`[CommandManager] Retrying in ${delay}ms...`);
                    await this.delay(delay);
                } else {
                    this.logger.warn(`[CommandManager] All ${retryStrategy.maxAttempts} attempts exhausted`);
                    throw error;
                }
            }
        }
        
        throw lastError || new Error('Command failed after retries');
    }

    /**
     * Execute command with streaming output
     */
    private async executeStreamingInternal(
        command: string,
        options: ExecOptions,
        onOutput: (data: string) => void
    ): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            
            const child = spawn(command, [], {
                shell: options.shell || true,
                cwd: options.cwd,
                env: options.env as NodeJS.ProcessEnv
            });
            
            child.stdout?.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                
                // Auto-handle Adobe CLI telemetry prompt
                if (output.includes('Would you like to allow @adobe/aio-cli to collect anonymous usage data?')) {
                    this.logger.info('[CommandManager] 🔧 Auto-answered aio-cli telemetry prompt');
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
                this.logger.error(`[CommandManager] Process error: ${error.message}`);
                reject(error);
            });
            
            child.on('close', (code) => {
                // Only log non-zero exit codes
                if (code && code !== 0) {
                    this.logger.warn(`[CommandManager] Process exited with code ${code} after ${Date.now() - startTime}ms`);
                }
                const duration = Date.now() - startTime;
                resolve({
                    stdout,
                    stderr,
                    code: code || 0,
                    duration
                });
            });
            
            // Handle timeout
            if (options.timeout) {
                const timeoutId = setTimeout(() => {
                    this.logger.warn(`[CommandManager] ⏱️ Command timed out after ${options.timeout}ms (PID: ${child.pid})`);
                    
                    if (!child.killed) {
                        child.kill('SIGTERM');
                        
                        // Force kill after 2 seconds if still alive
                        setTimeout(() => {
                            if (!child.killed && child.exitCode === null) {
                                this.logger.warn(`[CommandManager] Force killing process ${child.pid} (SIGKILL)`);
                                child.kill('SIGKILL');
                            }
                        }, 2000);
                    }
                    
                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout);
                
                // Clear timeout when process completes
                child.on('close', () => clearTimeout(timeoutId));
            }
        });
    }

    /**
     * Execute a command with exclusive access to a resource
     * This ensures only one command accessing a resource runs at a time
     */
    async executeExclusive<T>(resource: string, operation: () => Promise<T>): Promise<T> {
        this.logger.debug(`[CommandManager] Acquiring lock for resource: ${resource}`);
        
        // Get or create lock promise for this resource
        const currentLock = this.locks.get(resource) || Promise.resolve();
        
        // Create new lock that waits for current lock then executes operation
        let releaseLock: () => void;
        const newLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });
        
        // Chain our operation after current lock
        const resultPromise = currentLock
            .then(() => {
                this.logger.debug(`[CommandManager] Lock acquired for resource: ${resource}`);
                return operation();
            })
            .finally(() => {
                this.logger.debug(`[CommandManager] Releasing lock for resource: ${resource}`);
                releaseLock!();
            });
        
        // Update the lock for this resource
        this.locks.set(resource, newLock);
        
        return resultPromise;
    }

    /**
     * Poll until a condition is met with exponential backoff
     */
    async pollUntilCondition(
        checkFn: () => Promise<boolean>,
        options: PollOptions = {}
    ): Promise<void> {
        const {
            maxAttempts = 60,
            initialDelay = 500,
            maxDelay = 5000,
            backoffFactor = 1.5,
            timeout = 120000,
            name = 'condition'
        } = options;
        
        this.logger.debug(`[CommandManager] Starting poll for: ${name}`);
        
        const startTime = Date.now();
        let attempt = 0;
        let delay = initialDelay;
        
        while (attempt < maxAttempts) {
            attempt++;
            
            // Check timeout
            if (Date.now() - startTime > timeout) {
                throw new Error(`Polling timeout for: ${name}`);
            }
            
            try {
                const result = await checkFn();
                if (result) {
                    this.logger.debug(`[CommandManager] Poll succeeded for: ${name} (attempt ${attempt})`);
                    return;
                }
            } catch (error) {
                this.logger.debug(`[CommandManager] Poll check error for ${name}: ${error}`);
            }
            
            // Wait before next attempt
            this.logger.debug(`[CommandManager] Poll attempt ${attempt} for ${name} - waiting ${delay}ms`);
            await this.delay(delay);
            
            // Calculate next delay with exponential backoff
            delay = Math.min(delay * backoffFactor, maxDelay);
        }
        
        throw new Error(`Maximum polling attempts reached for: ${name}`);
    }

    /**
     * Wait for a file system change with smart detection
     */
    async waitForFileSystem(
        path: string,
        expectedCondition?: () => Promise<boolean>,
        timeout = 10000
    ): Promise<void> {
        this.logger.debug(`[CommandManager] Waiting for file system change: ${path}`);
        
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                if (watcher) {
                    watcher.dispose();
                }
                reject(new Error(`File system wait timeout: ${path}`));
            }, timeout);
            
            // If we have a condition, poll for it
            if (expectedCondition) {
                this.pollUntilCondition(expectedCondition, {
                    timeout,
                    name: `file system: ${path}`,
                    initialDelay: 100,
                    maxDelay: 1000
                }).then(() => {
                    clearTimeout(timeoutHandle);
                    resolve();
                }).catch(reject);
                return;
            }
            
            // Otherwise, wait for any change
            const watcher = vscode.workspace.createFileSystemWatcher(path);
            
            const handleChange = () => {
                clearTimeout(timeoutHandle);
                watcher.dispose();
                this.logger.debug(`[CommandManager] File system change detected: ${path}`);
                resolve();
            };
            
            watcher.onDidChange(handleChange);
            watcher.onDidCreate(handleChange);
            watcher.onDidDelete(handleChange);
            
            this.fileWatchers.set(path, watcher);
        });
    }

    /**
     * Execute multiple commands in sequence with proper error handling
     */
    async executeSequence(
        commands: Array<{ command: string; options?: ExecOptions; resource?: string }>,
        stopOnError = true
    ): Promise<CommandResult[]> {
        const results: CommandResult[] = [];
        
        for (const { command, options, resource } of commands) {
            try {
                // Use execute with exclusive option if resource is specified
                const result = await this.execute(command, {
                    ...options,
                    exclusive: resource,
                    configureTelemetry: command.startsWith('aio '),
                    enhancePath: command.startsWith('aio '),
                    useNodeVersion: command.startsWith('aio ') ? 'auto' : undefined
                });
                
                results.push(result);
            } catch (error) {
                if (stopOnError) {
                    throw error;
                }
                
                results.push({
                    stdout: '',
                    stderr: error instanceof Error ? error.message : 'Unknown error',
                    code: 1,
                    duration: 0
                });
            }
        }
        
        return results;
    }

    /**
     * Execute multiple commands in parallel
     */
    async executeParallel(
        commands: Array<{ command: string; options?: ExecOptions; name?: string }>
    ): Promise<CommandResult[]> {
        const startTime = Date.now();
        this.logger.debug(`[CommandManager] Executing ${commands.length} commands in parallel`);
        
        // Log all commands being executed
        commands.forEach((cmd, index) => {
            this.logger.debug(`[CommandManager]   [${index + 1}] ${cmd.name || cmd.command}`);
        });
        
        // Execute all commands simultaneously
        const promises = commands.map(async ({ command, options, name }) => {
            const cmdStartTime = Date.now();
            try {
                // Use appropriate options based on command type
                const result = await this.execute(command, {
                    ...options,
                    configureTelemetry: command.startsWith('aio '),
                    enhancePath: command.startsWith('aio '),
                    useNodeVersion: command.startsWith('aio ') ? 'auto' : undefined
                });
                const duration = Date.now() - cmdStartTime;
                
                // Log timing for each command
                this.logger.debug(`[CommandManager] Completed: ${name || command} (${duration}ms)`);
                
                // Warn if command is slow
                if (duration > 3000) {
                    this.logger.debug(`[CommandManager] WARNING: Slow command detected - ${name || command} took ${duration}ms`);
                }
                
                return result;
            } catch (error: any) {
                const duration = Date.now() - cmdStartTime;
                this.logger.debug(`[CommandManager] Failed: ${name || command} (${duration}ms) - ${error}`);
                
                // Return error result instead of throwing
                // This allows other commands to complete even if one fails
                return {
                    stdout: '',
                    stderr: error.message || `Command failed: ${command}`,
                    code: error.code || 1,
                    duration
                } as CommandResult;
            }
        });
        
        // Wait for all to complete (won't throw even if some fail)
        const results = await Promise.all(promises);
        
        const totalDuration = Date.now() - startTime;
        this.logger.debug(`[CommandManager] All parallel commands completed in ${totalDuration}ms`);
        
        return results;
    }

    /**
     * Queue a command for execution
     */
    async queueCommand(
        command: string,
        options?: ExecOptions,
        resourceLock?: string
    ): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                command,
                options,
                resolve,
                reject,
                resourceLock
            });
            
            this.processQueue();
        });
    }

    /**
     * Process the command queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.commandQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        while (this.commandQueue.length > 0) {
            const request = this.commandQueue.shift()!;
            
            try {
                let result: CommandResult;
                
                if (request.resourceLock) {
                    result = await this.executeExclusive(request.resourceLock, () =>
                        this.execute(request.command, request.options)
                    );
                } else {
                    result = await this.execute(request.command, request.options);
                }
                
                request.resolve(result);
            } catch (error) {
                request.reject(error as Error);
            }
        }
        
        this.isProcessing = false;
    }

    /**
     * Set up default retry strategies
     */
    private setupDefaultStrategies(): void {
        // Network-related commands
        this.retryStrategies.set('network', {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2,
            shouldRetry: (error) => {
                const message = error.message.toLowerCase();
                return message.includes('network') ||
                       message.includes('timeout') ||
                       message.includes('econnrefused');
            }
        });
        
        // File system operations
        this.retryStrategies.set('filesystem', {
            maxAttempts: 3,
            initialDelay: 200,
            maxDelay: 1000,
            backoffFactor: 1.5,
            shouldRetry: (error) => {
                const message = error.message.toLowerCase();
                return message.includes('ebusy') ||
                       message.includes('eacces') ||
                       message.includes('locked');
            }
        });
        
        // Adobe CLI operations
        this.retryStrategies.set('adobe-cli', {
            maxAttempts: 2,
            initialDelay: 1000, // Reduced from 2000ms to 1000ms
            maxDelay: 5000,
            backoffFactor: 1.5,
            shouldRetry: (error, attempt) => {
                // Only retry on specific errors, not shell syntax errors
                const message = error.message.toLowerCase();
                
                // Don't retry if it's a shell syntax/redirection issue
                if (message.includes('> /dev/null') || message.includes('2>&1') || 
                    message.includes('--log-level')) {
                    return false;
                }
                
                return attempt === 1 && (
                    message.includes('token') ||
                    message.includes('unauthorized') ||
                    message.includes('session') ||
                    message.includes('timeout')
                );
            }
        });
    }

    /**
     * Get a retry strategy by name
     */
    getStrategy(name: string): RetryStrategy | undefined {
        return this.retryStrategies.get(name);
    }

    /**
     * Get the default retry strategy
     */
    private getDefaultStrategy(): RetryStrategy {
        return {
            maxAttempts: 1,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2
        };
    }

    /**
     * Delay for a specified time
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Find all possible npm global binary paths
     */
    private findNpmGlobalPaths(): string[] {
        const paths: string[] = [];
        const homeDir = os.homedir();
        
        // Check fnm paths using FNM_DIR environment variable or fallback
        // fnm sets FNM_DIR to its installation directory
        let fnmBase = process.env.FNM_DIR 
            ? path.join(process.env.FNM_DIR, 'node-versions')
            : path.join(homeDir, '.local/share/fnm/node-versions'); // Fallback to common location
        
        if (fsSync.existsSync(fnmBase)) {
            try {
                const versions = fsSync.readdirSync(fnmBase);
                for (const version of versions) {
                    const binPath = path.join(fnmBase, version, 'installation/bin');
                    if (fsSync.existsSync(binPath)) {
                        paths.push(binPath);
                    }
                    // Also check lib directory for npm global installs
                    const libBinPath = path.join(fnmBase, version, 'installation/lib/node_modules/.bin');
                    if (fsSync.existsSync(libBinPath)) {
                        paths.push(libBinPath);
                    }
                }
            } catch {
                // Ignore errors reading directory
            }
        }
        
        // Check nvm paths
        const nvmBase = path.join(homeDir, '.nvm/versions/node');
        if (fsSync.existsSync(nvmBase)) {
            try {
                const versions = fsSync.readdirSync(nvmBase);
                for (const version of versions) {
                    const binPath = path.join(nvmBase, version, 'bin');
                    if (fsSync.existsSync(binPath)) {
                        paths.push(binPath);
                    }
                }
            } catch {
                // Ignore errors reading directory
            }
        }
        
        // Check common npm global locations
        const commonPaths = [
            path.join(homeDir, '.npm-global', 'bin'),
            path.join(homeDir, '.npm', 'bin'),
            '/usr/local/lib/node_modules/.bin',
            '/usr/local/bin',
            '/opt/homebrew/bin'
        ];
        
        for (const p of commonPaths) {
            if (fsSync.existsSync(p)) {
                paths.push(p);
            }
        }
        
        return paths;
    }

    /**
     * Find fnm executable path by checking common installation locations
     * Cached per session to avoid repeated filesystem lookups
     */
    private findFnmPath(): string | null {
        // Return cached value if already looked up
        if (this.cachedFnmPath !== undefined) {
            return this.cachedFnmPath;
        }
        
        const commonPaths = [
            '/opt/homebrew/bin/fnm',        // Homebrew on Apple Silicon
            '/usr/local/bin/fnm',           // Homebrew on Intel Mac
            path.join(os.homedir(), '.local/bin/fnm'),  // Manual install
            path.join(os.homedir(), '.fnm/fnm'),        // fnm self-install
        ];
        
        for (const fnmPath of commonPaths) {
            if (fsSync.existsSync(fnmPath)) {
                this.logger.debug(`[fnm] Found at: ${fnmPath}`);
                this.cachedFnmPath = fnmPath; // Cache the result
                return fnmPath;
            }
        }
        
        // If not found in common locations, check if it's in PATH
        try {
            const which = process.platform === 'win32' ? 'where' : 'which';
            const result = execSync(`${which} fnm`, { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
            });
            const fnmPath = result.trim().split('\n')[0];
            if (fnmPath) {
                this.logger.debug(`[fnm] Found in PATH: ${fnmPath}`);
                this.cachedFnmPath = fnmPath; // Cache the result
                return fnmPath;
            }
        } catch {
            // Not in PATH
        }
        
        this.cachedFnmPath = null; // Cache null result to avoid repeated lookups
        return null;
    }

    /**
     * Check if fnm is available on the system
     */
    async isFnmAvailable(): Promise<boolean> {
        const fnmPath = this.findFnmPath();
        if (!fnmPath) {
            return false;
        }
        
        try {
            await this.execute(`${fnmPath} --version`, { 
                timeout: 2000 // Quick check
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the current Node version from fnm
     */
    async getCurrentFnmVersion(): Promise<string | null> {
        const fnmPath = this.findFnmPath();
        if (!fnmPath) {
            return null;
        }
        
        try {
            const result = await this.execute(`${fnmPath} current`, { 
                timeout: 2000 // Quick check
            });
            return result.stdout?.trim() || null;
        } catch {
            return null;
        }
    }

    // Cache for Adobe CLI Node version to avoid repeated filesystem lookups
    private cachedAdobeCLINodeVersion: string | null | undefined = undefined;
    private cachedFnmPath: string | null | undefined = undefined;
    
    // Session-level Node version setup for Adobe CLI
    private isAdobeCLINodeVersionSet: boolean = false;
    private sessionNodeVersion: string | null = null;
    private nodeVersionSetupLock: Promise<void> | null = null;
    
    // Session-level caching for Adobe CLI commands
    private adobeVersionCache: CommandResult | null = null;
    private adobePluginsCache: CommandResult | null = null;

    /**
     * Find which Node version has Adobe CLI installed (fnm only)
     * Tests actual execution rather than file existence for reliability
     * Returns the highest version number to ensure we use the most compatible/modern version
     * Cached per session for performance
     */
    async findAdobeCLINodeVersion(): Promise<string | null> {
        // Return cached value if we've already looked it up
        if (this.cachedAdobeCLINodeVersion !== undefined) {
            return this.cachedAdobeCLINodeVersion;
        }
        
        // Use FNM_DIR if available, otherwise fallback to default location
        const homeDir = os.homedir();
        const fnmBase = process.env.FNM_DIR 
            ? path.join(process.env.FNM_DIR, 'node-versions')
            : path.join(homeDir, '.local/share/fnm/node-versions');
        
        if (fsSync.existsSync(fnmBase)) {
            try {
                const versions = fsSync.readdirSync(fnmBase);
                const versionsWithAio: Array<{version: string, major: number}> = [];
                
                // Test each Node version by actually running aio --version
                for (const version of versions) {
                    const match = version.match(/v?(\d+)/);
                    if (!match) continue;
                    
                    const major = parseInt(match[1], 10);
                    
                    // Try to run aio --version with this Node version
                    try {
                        const fnmPath = this.findFnmPath();
                        if (!fnmPath) continue;
                        
                        const result = await this.execute(
                            `${fnmPath} exec --using=${major} -- aio --version`,
                            { 
                                timeout: 5000, // 5 second timeout per version test
                                configureTelemetry: false
                            }
                        );
                        
                        if (result.code === 0) {
                            versionsWithAio.push({ version, major });
                            this.logger.debug(`[Adobe CLI] Node v${major}: aio-cli works ✓`);
                        }
                    } catch (error) {
                        // This version doesn't have aio-cli or it failed - skip it
                        this.logger.debug(`[Adobe CLI] Node v${major}: aio-cli not available`);
                    }
                }
                
                // Sort by major version descending and pick the highest
                if (versionsWithAio.length > 0) {
                    versionsWithAio.sort((a, b) => b.major - a.major);
                    const best = versionsWithAio[0];
                    this.logger.debug(`[Adobe CLI] Found ${versionsWithAio.length} fnm Node version(s) with working aio-cli, using highest: Node v${best.major}`);
                    this.cachedAdobeCLINodeVersion = best.major.toString();
                    return best.major.toString();
                }
            } catch (error) {
                this.logger.debug(`[Adobe CLI] Error testing fnm Node versions: ${error}`);
            }
        }
        
        // Cache the null result to avoid repeated lookups
        this.logger.debug('[Adobe CLI] No fnm Node versions found with working aio-cli');
        this.cachedAdobeCLINodeVersion = null;
        return null;
    }

    /**
     * Ensure Adobe CLI Node version is set once per session
     * This eliminates repeated version checking for subsequent Adobe CLI commands
     */
    async ensureAdobeCLINodeVersion(): Promise<void> {
        // Skip if already set for this session
        if (this.isAdobeCLINodeVersionSet) {
            return;
        }

        // If setup is already in progress, wait for it to complete
        if (this.nodeVersionSetupLock) {
            await this.nodeVersionSetupLock;
            return;
        }

        // Create lock and start setup
        this.nodeVersionSetupLock = this.doNodeVersionSetup();
        
        try {
            await this.nodeVersionSetupLock;
        } finally {
            this.nodeVersionSetupLock = null;
        }
    }

    private async doNodeVersionSetup(): Promise<void> {
        try {
            // Find which Node version has Adobe CLI installed
            // We use fnm exec --using=X for all commands, so we don't need to globally switch
            const requiredVersion = await this.findAdobeCLINodeVersion();
            if (!requiredVersion) {
                this.logger.debug('[Adobe CLI] Could not detect Node version with aio-cli installed');
                this.isAdobeCLINodeVersionSet = true;
                return;
            }

            // Store the detected version for all Adobe CLI commands
            // Note: cachedAdobeCLINodeVersion is already set by findAdobeCLINodeVersion()
            this.sessionNodeVersion = requiredVersion;
            this.isAdobeCLINodeVersionSet = true;
            
            this.logger.debug(`[Adobe CLI] Will use Node v${requiredVersion} for all Adobe CLI commands`);

        } catch (error) {
            this.logger.warn(`[Adobe CLI] Failed to detect Node version: ${error instanceof Error ? error.message : String(error)}`);
            // Continue anyway - commands will use 'auto' detection per-command
            this.isAdobeCLINodeVersionSet = true;
        }
    }

    // Track if telemetry has been configured globally (static to persist across instances)
    private static telemetryConfigured = false;
    // Guard against infinite recursion (static to prevent race conditions)
    private static checkingTelemetry = false;

    /**
     * Ensure Adobe CLI telemetry is configured to prevent interactive prompts
     * Directly sets the config without checking first (checking can trigger the prompt!)
     */
    async ensureAdobeCLIConfigured(): Promise<void> {
        // Skip if already handled this session (prevent repeated attempts)
        if (ExternalCommandManager.telemetryConfigured || ExternalCommandManager.checkingTelemetry) {
            return;
        }
        
        // Set guard to prevent infinite recursion
        ExternalCommandManager.checkingTelemetry = true;
        
        try {
            // IMPORTANT: Just SET the config directly without checking first
            // Checking with "aio config get" can trigger the interactive prompt on first run!
            await this.execute(
                'aio config set aio-cli-telemetry.optOut true',
                { 
                    configureTelemetry: false,  // CRITICAL: Don't check telemetry for telemetry commands
                    encoding: 'utf8',
                    timeout: 5000 // 5 second timeout - should be quick
                }
            ).catch(error => {
                // Log but don't fail - telemetry config is not critical
                this.logger.debug('[Telemetry] Failed to configure (non-critical):', error.message);
            });
            
            // Mark as configured
            ExternalCommandManager.telemetryConfigured = true;
            this.logger.info('[Telemetry] ✓ Configured aio-cli to opt out of telemetry');
            
        } catch {
            // Still mark as configured to avoid repeated attempts
            ExternalCommandManager.telemetryConfigured = true;
        } finally {
            // Always clear the recursion guard
            ExternalCommandManager.checkingTelemetry = false;
        }
    }

    /**
     * Execute Adobe CLI command with the correct Node version
     * This ensures Adobe CLI runs with a compatible Node version
     */
    async executeAdobeCLI(command: string, options?: ExecuteOptions): Promise<CommandResult> {
        // Check cache for specific commands that don't change during session
        if (command === 'aio --version' && this.adobeVersionCache) {
            this.logger.debug('[CommandManager] Using cached aio --version result');
            return this.adobeVersionCache;
        }
        if (command === 'aio plugins' && this.adobePluginsCache) {
            this.logger.debug('[CommandManager] Using cached aio plugins result');
            return this.adobePluginsCache;
        }
        
        // Ensure we know which Node version has Adobe CLI installed (once per session)
        await this.ensureAdobeCLINodeVersion();
        
        // Use the detected Node version (or 'auto' if not found, which will use fnm exec with detected version)
        // This ensures all Adobe CLI commands use the same Node version consistently
        const result = await this.execute(command, {
            ...options,
            configureTelemetry: false, // Explicitly false to prevent redundant check
            useNodeVersion: this.cachedAdobeCLINodeVersion || 'auto', // Use detected version or auto-detect
            enhancePath: true,
            retryStrategy: this.getStrategy('adobe-cli')
            // Let Adobe CLI work normally - browsers may open for auth but that's acceptable
        });
        
        // Cache results for version and plugins commands
        if (command === 'aio --version' && result.code === 0) {
            this.adobeVersionCache = result;
            this.logger.debug('[CommandManager] Cached aio --version result for session');
        } else if (command === 'aio plugins' && result.code === 0) {
            this.adobePluginsCache = result;
            this.logger.debug('[CommandManager] Cached aio plugins result for session');
        }
        
        return result;
    }

    /**
     * Check if a command exists in the system
     */
    async commandExists(command: string): Promise<boolean> {
        try {
            // Try with fnm environment first for Node.js related commands
            if (command === 'node' || command === 'npm' || command === 'npx') {
                const result = await this.execute(`which ${command}`, {
                    useNodeVersion: 'current'
                });
                return result.stdout.trim().length > 0;
            }
            
            // For other commands, use enhanced path
            const result = await this.execute(`which ${command}`, {
                enhancePath: true
            });
            return result.stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if a port is available for use
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
        // Clear all locks
        this.locks.clear();
        
        // Clear command queue
        this.commandQueue.forEach(req => {
            req.reject(new Error('Command manager disposed'));
        });
        this.commandQueue = [];
        
        // Dispose file watchers
        this.fileWatchers.forEach(watcher => watcher.dispose());
        this.fileWatchers.clear();
        
        // Dispose other resources
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}