import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { getLogger } from './debugLogger';

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
     * Execute a command with retry logic
     */
    async executeCommand(
        command: string,
        options?: ExecOptions,
        retryStrategy?: RetryStrategy
    ): Promise<CommandResult> {
        const strategy = retryStrategy || this.getDefaultStrategy();
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
            try {
                this.logger.debug(`[CommandManager] Executing command (attempt ${attempt}): ${command}`);
                const startTime = Date.now();
                
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
                
                this.logger.debug(`[CommandManager] Command failed (attempt ${attempt}): ${error.message}`);
                
                // Check if we should retry
                if (attempt < strategy.maxAttempts) {
                    if (strategy.shouldRetry && !strategy.shouldRetry(error, attempt)) {
                        throw error;
                    }
                    
                    // Calculate delay with exponential backoff
                    const delay = Math.min(
                        strategy.initialDelay * Math.pow(strategy.backoffFactor, attempt - 1),
                        strategy.maxDelay
                    );
                    
                    this.logger.debug(`[CommandManager] Retrying in ${delay}ms...`);
                    await this.delay(delay);
                } else {
                    throw error;
                }
            }
        }
        
        throw lastError || new Error('Command execution failed');
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
                let result: CommandResult;
                
                if (resource) {
                    result = await this.executeExclusive(resource, () =>
                        this.executeCommand(command, options)
                    );
                } else {
                    result = await this.executeCommand(command, options);
                }
                
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
                        this.executeCommand(request.command, request.options)
                    );
                } else {
                    result = await this.executeCommand(request.command, request.options);
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
            initialDelay: 2000,
            maxDelay: 5000,
            backoffFactor: 1.5,
            shouldRetry: (error, attempt) => {
                // Only retry on specific errors
                const message = error.message.toLowerCase();
                return attempt === 1 && (
                    message.includes('token') ||
                    message.includes('unauthorized') ||
                    message.includes('session')
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