import { exec, ExecOptions, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { getLogger } from './debugLogger';
import { TIMEOUTS } from './timeoutConfig';

const execAsync = promisify(exec);

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
        let finalOptions: ExecOptions = { ...options };
        
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
                
            if (await this.isFnmAvailable()) {
                this.logger.debug(`[CommandManager] Setting up fnm for Node v${nodeVersion}`);
                
                // Special handling for 'current' - use fnm env instead of fnm use
                if (options.useNodeVersion === 'current' || nodeVersion === 'current') {
                    // Use fnm env to set up the environment with the current active version
                    this.logger.debug(`[CommandManager] Using current Node version with fnm env`);
                    finalCommand = `eval "$(fnm env)" && ${finalCommand}`;
                } else if (nodeVersion) {
                    // Check if we're already on the target version to avoid unnecessary switching
                    const currentVersion = await this.getCurrentFnmVersion();
                    if (currentVersion && currentVersion.includes(nodeVersion)) {
                        this.logger.debug(`[CommandManager] Already on Node v${nodeVersion}, skipping fnm entirely`);
                        // No fnm needed - run command directly with current Node version
                        // finalCommand remains unchanged (no fnm prefix)
                    } else {
                        // Use specific version with silent flag to prevent output mixing
                        this.logger.debug(`[CommandManager] Switching from v${currentVersion || 'unknown'} to Node v${nodeVersion} with fnm`);
                        finalCommand = `fnm use ${nodeVersion} --silent-if-unchanged && ${finalCommand}`;
                    }
                }
                finalOptions.shell = finalOptions.shell || '/bin/zsh';
                this.logger.debug(`[CommandManager] Final command: ${finalCommand}`);
            } else {
                this.logger.debug(`[CommandManager] fnm not available, using system Node`);
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
                this.logger.debug(`[CommandManager] Executing command (attempt ${attempt}): ${command}`);
                
                const { stdout, stderr } = await execAsync(command, {
                    ...options,
                    encoding: 'utf8'
                });
                
                const duration = Date.now() - startTime;
                this.logger.debug(`[CommandManager] Command succeeded in ${duration}ms`);
                
                return {
                    stdout,
                    stderr,
                    code: 0,
                    duration
                };
            } catch (error: any) {
                lastError = error;
                const duration = Date.now() - startTime;
                
                // Enhanced error logging with all available details
                this.logger.debug(`[CommandManager] Command failed (attempt ${attempt}) after ${duration}ms:`);
                this.logger.debug(`  Command: ${command}`);
                this.logger.debug(`  Error: ${error.message}`);
                this.logger.debug(`  Exit code: ${error.code || 'none'}`);
                this.logger.debug(`  Signal: ${error.signal || 'none'}`);
                
                if (error.stdout) {
                    this.logger.debug(`  Stdout: ${error.stdout.substring(0, 500)}`);
                }
                if (error.stderr) {
                    this.logger.debug(`  Stderr: ${error.stderr.substring(0, 500)}`);
                }
                
                // Identify timeout vs other failures
                if (error.killed && error.signal === 'SIGTERM') {
                    this.logger.debug(`  → Command timed out after ${options.timeout || TIMEOUTS.COMMAND_DEFAULT}ms`);
                } else if (error.code && error.code !== 0) {
                    this.logger.debug(`  → Command exited with non-zero code`);
                }
                
                // Check if we should retry
                if (attempt < retryStrategy.maxAttempts) {
                    if (retryStrategy.shouldRetry && !retryStrategy.shouldRetry(error, attempt)) {
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
                onOutput(output);
            });
            
            child.stderr?.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                onOutput(output);
            });
            
            child.on('error', (error) => {
                reject(error);
            });
            
            child.on('close', (code) => {
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
                setTimeout(() => {
                    child.kill();
                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout);
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
        
        // Check fnm paths - where fnm installs global npm packages
        const fnmBase = path.join(homeDir, '.local/share/fnm/node-versions');
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
            } catch (e) {
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
            } catch (e) {
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
     * Check if fnm is available on the system
     */
    async isFnmAvailable(): Promise<boolean> {
        try {
            await execAsync('fnm --version', { 
                shell: '/bin/zsh',
                encoding: 'utf8'
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
        try {
            const result = await execAsync('fnm current', { 
                shell: '/bin/zsh',
                encoding: 'utf8',
                timeout: 2000 // Quick check
            });
            return result.stdout?.trim() || null;
        } catch {
            return null;
        }
    }

    // Cache for Adobe CLI Node version to avoid repeated filesystem lookups
    private cachedAdobeCLINodeVersion: string | null | undefined = undefined;
    
    // Session-level Node version setup for Adobe CLI
    private isAdobeCLINodeVersionSet: boolean = false;
    private sessionNodeVersion: string | null = null;
    private nodeVersionSetupLock: Promise<void> | null = null;
    
    // Session-level caching for Adobe CLI commands
    private adobeVersionCache: CommandResult | null = null;
    private adobePluginsCache: CommandResult | null = null;

    /**
     * Find which Node version has Adobe CLI installed
     * Cached per session for performance
     */
    async findAdobeCLINodeVersion(): Promise<string | null> {
        // Return cached value if we've already looked it up
        if (this.cachedAdobeCLINodeVersion !== undefined) {
            return this.cachedAdobeCLINodeVersion;
        }
        
        const homeDir = os.homedir();
        const fnmBase = path.join(homeDir, '.local/share/fnm/node-versions');
        
        if (fsSync.existsSync(fnmBase)) {
            try {
                const versions = fsSync.readdirSync(fnmBase);
                for (const version of versions) {
                    const aioPath = path.join(fnmBase, version, 'installation/bin/aio');
                    if (fsSync.existsSync(aioPath)) {
                        // Extract just the major version number for fnm version families
                        // e.g., "v20.19.5" -> "20"
                        const match = version.match(/v?(\d+)/);
                        if (match) {
                            this.logger.debug(`[Adobe CLI] Found in Node ${version}, using version family: ${match[1]}`);
                            this.cachedAdobeCLINodeVersion = match[1]; // Cache the result
                            return match[1]; // Return just "20" instead of "v20.19.5"
                        }
                        this.cachedAdobeCLINodeVersion = version; // Cache the result
                        return version; // Fallback to full version if pattern doesn't match
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Also check nvm
        const nvmBase = path.join(homeDir, '.nvm/versions/node');
        if (fsSync.existsSync(nvmBase)) {
            try {
                const versions = fsSync.readdirSync(nvmBase);
                for (const version of versions) {
                    const aioPath = path.join(nvmBase, version, 'bin/aio');
                    if (fsSync.existsSync(aioPath)) {
                        // Extract just the major version number
                        const match = version.match(/v?(\d+)/);
                        if (match) {
                            this.logger.debug(`[Adobe CLI] Found in Node ${version}, using version family: ${match[1]}`);
                            this.cachedAdobeCLINodeVersion = match[1]; // Cache the result
                            return match[1];
                        }
                        this.cachedAdobeCLINodeVersion = version; // Cache the result
                        return version;
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Cache the null result to avoid repeated lookups
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
        this.logger.debug(`[CommandManager] Setting up Adobe CLI Node version for session`);
        
        try {
            // Find the required Node version for Adobe CLI
            const requiredVersion = await this.findAdobeCLINodeVersion();
            if (!requiredVersion) {
                this.logger.debug(`[CommandManager] No Adobe CLI Node version required`);
                this.isAdobeCLINodeVersionSet = true;
                return;
            }

            // Check if we're already on the correct version
            if (await this.isFnmAvailable()) {
                const currentVersion = await this.getCurrentFnmVersion();
                if (!currentVersion || !currentVersion.includes(requiredVersion)) {
                    // Switch to the required version
                    this.logger.debug(`[CommandManager] Switching from v${currentVersion || 'unknown'} to Node v${requiredVersion} for Adobe CLI`);
                    await execAsync(`fnm use ${requiredVersion} --silent-if-unchanged`, { 
                        shell: '/bin/zsh',
                        encoding: 'utf8'
                    });
                    this.logger.debug(`[CommandManager] Successfully switched to Node v${requiredVersion}`);
                } else {
                    this.logger.debug(`[CommandManager] Already on correct Node v${requiredVersion} for Adobe CLI`);
                }
            }

            // Mark as set for the session
            this.sessionNodeVersion = requiredVersion;
            this.isAdobeCLINodeVersionSet = true;
            this.logger.debug(`[CommandManager] Node v${requiredVersion} confirmed for Adobe CLI session`);

        } catch (error) {
            this.logger.debug(`[CommandManager] Failed to set Adobe CLI Node version:`, error);
            // Continue anyway - Adobe CLI might work with current version
            this.isAdobeCLINodeVersionSet = true;
        }
    }

    // Track if telemetry has been configured globally (static to persist across instances)
    private static telemetryConfigured = false;
    // Guard against infinite recursion (static to prevent race conditions)
    private static checkingTelemetry = false;

    /**
     * Ensure Adobe CLI telemetry is configured to prevent interactive prompts
     * Uses fire-and-forget approach: quick check + background configuration
     * This minimizes user delays while still configuring telemetry eventually
     */
    async ensureAdobeCLIConfigured(): Promise<void> {
        // Skip if already handled this session (prevent repeated attempts)
        if (ExternalCommandManager.telemetryConfigured || ExternalCommandManager.checkingTelemetry) {
            this.logger.debug('[Telemetry] Already handled this session - skipping (0ms)');
            return;
        }
        
        // Set guard to prevent infinite recursion
        ExternalCommandManager.checkingTelemetry = true;
        
        try {
            // Quick check with very short timeout (Adobe CLI is slow)
            // IMPORTANT: Set configureTelemetry: false to prevent infinite recursion
            const checkResult = await this.execute(
                'aio config get aio-cli-telemetry.optOut',
                { 
                    configureTelemetry: false,  // CRITICAL: Don't check telemetry for telemetry commands
                    encoding: 'utf8',
                    timeout: TIMEOUTS.TELEMETRY_CHECK // Very quick timeout - fail fast if Adobe CLI is slow
                }
            ).catch(error => {
                // If it times out, return a "not configured" result
                if (error.killed || error.signal === 'SIGTERM') {
                    this.logger.debug('[Telemetry] Check timed out as expected (500ms) - not blocking operations');
                    this.logger.debug('[Telemetry] Will configure in background to prevent future prompts');
                    return { code: 1, stdout: '', stderr: '', duration: 500 };
                }
                throw error;
            });
            
            // Check if telemetry is already configured
            if (checkResult.code === 0 && checkResult.stdout?.trim() === 'true') {
                this.logger.debug('[Telemetry] Already configured - no action needed (checked in 500ms)');
            } else {
                // Telemetry not configured - set it in background (fire-and-forget)
                this.logger.debug('[Telemetry] Starting background configuration (non-blocking)');
                this.logger.debug('[Telemetry] User operations continue immediately');
                
                // Use Node.js exec to start command without waiting
                const { exec } = require('child_process');
                const process = exec('aio config set aio-cli-telemetry.optOut true');
                const backgroundStart = Date.now();
                
                // Optional: Log completion for debugging (non-blocking)
                process.on('exit', (code: number | null) => {
                    const elapsed = ((Date.now() - backgroundStart) / 1000).toFixed(1);
                    if (code === 0) {
                        this.logger.debug(`[Telemetry] Background: Configuration completed successfully (${elapsed}s elapsed)`);
                        this.logger.debug('[Telemetry] Adobe CLI telemetry opt-out is now configured');
                    } else {
                        this.logger.debug(`[Telemetry] Background: Configuration failed after ${elapsed}s (non-critical)`);
                    }
                });
                
                process.on('error', (err: Error) => {
                    this.logger.debug('[Telemetry] Background: Configuration error (non-critical):', err);
                });
            }
            
            // Mark as configured immediately (don't wait for background completion)
            ExternalCommandManager.telemetryConfigured = true;
            this.logger.debug('[Telemetry] Performance: Handled in 500ms (non-blocking approach)');
            
        } catch (error) {
            this.logger.debug('[Telemetry] Check failed (non-critical):', error);
            // Still mark as checked to avoid repeated attempts
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
    async executeAdobeCLI(command: string, options?: ExecOptions): Promise<CommandResult> {
        // Check cache for specific commands that don't change during session
        if (command === 'aio --version' && this.adobeVersionCache) {
            this.logger.debug('[CommandManager] Using cached aio --version result');
            return this.adobeVersionCache;
        }
        if (command === 'aio plugins' && this.adobePluginsCache) {
            this.logger.debug('[CommandManager] Using cached aio plugins result');
            return this.adobePluginsCache;
        }
        
        // Ensure Node version is set once per session for Adobe CLI
        await this.ensureAdobeCLINodeVersion();
        
        // Now execute command without version checking since we've already set it up
        const result = await this.execute(command, {
            ...options,
            configureTelemetry: false, // Explicitly false to prevent redundant check
            useNodeVersion: null, // Skip version checking - already handled by session setup
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