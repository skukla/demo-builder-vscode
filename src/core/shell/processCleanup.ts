/**
 * ProcessCleanup Service
 *
 * Cross-platform process tree termination with event-driven completion.
 * Replaces grace period anti-patterns with actual process exit events.
 *
 * Key Features:
 * - Event-driven: Waits for actual process exit, not arbitrary delays
 * - Graceful shutdown: SIGTERM first, SIGKILL if timeout
 * - Process tree: Kills parent and all children
 * - Cross-platform: Handles Unix signals vs Windows termination
 * - Error resilient: Handles non-existent PIDs, permission errors
 *
 * @example Basic Usage
 * ```typescript
 * const cleanup = new ProcessCleanup();
 * await cleanup.killProcessTree(pid); // Graceful SIGTERM with 5s timeout
 * ```
 *
 * @example Custom Timeout
 * ```typescript
 * const cleanup = new ProcessCleanup({ gracefulTimeout: 2000 });
 * await cleanup.killProcessTree(pid, 'SIGTERM');
 * ```
 *
 * @example Force Kill
 * ```typescript
 * const cleanup = new ProcessCleanup();
 * await cleanup.killProcessTree(pid, 'SIGKILL'); // Immediate force kill
 * ```
 */

import { getLogger, DebugLogger } from '@/core/logging';

// Lazy-initialized logger to avoid calling getLogger() before initializeLogger()
let _logger: DebugLogger | null = null;
function getLoggerLazy(): DebugLogger {
    if (!_logger) {
        _logger = getLogger();
    }
    return _logger;
}

export interface ProcessCleanupOptions {
    /** Milliseconds to wait for graceful shutdown before force-kill (default: 5000) */
    gracefulTimeout?: number;
}

export class ProcessCleanup {
    private gracefulTimeout: number;
    private readonly checkInterval = 100; // Poll every 100ms

    constructor(options: ProcessCleanupOptions = {}) {
        this.gracefulTimeout = options.gracefulTimeout ?? 5000;
    }

    /**
     * Kill process tree with graceful shutdown
     *
     * Sends initial signal (default: SIGTERM), waits for process exit event,
     * and sends SIGKILL if timeout expires.
     *
     * @param pid Process ID to kill
     * @param signal Initial signal (default: SIGTERM for graceful shutdown)
     * @returns Promise that resolves when process tree killed
     * @throws Error if process cannot be killed (e.g., permission denied)
     *
     * @example Graceful shutdown
     * ```typescript
     * await cleanup.killProcessTree(1234); // SIGTERM with 5s timeout
     * ```
     *
     * @example Force kill
     * ```typescript
     * await cleanup.killProcessTree(1234, 'SIGKILL'); // Immediate
     * ```
     */
    public async killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
        // Check if process exists
        if (!this.processExists(pid)) {
            getLoggerLazy().warn(`[ProcessCleanup] Process ${pid} does not exist, nothing to kill`);
            return;
        }

        // Try tree-kill if available (handles process tree)
        if (this.isTreeKillAvailable()) {
            return this.killWithTreeKill(pid, signal);
        }

        // Fallback to built-in kill with timeout
        return this.killWithTimeout(pid, signal);
    }

    /**
     * Check if process exists
     *
     * Uses signal 0 which doesn't kill but checks existence
     *
     * @param pid Process ID to check
     * @returns true if process exists
     */
    private processExists(pid: number): boolean {
        try {
            process.kill(pid, 0); // Signal 0 checks existence without killing
            return true;
        } catch (error: any) {
            if (error.code === 'ESRCH') {
                // Process does not exist
                return false;
            }
            // Process exists but we don't have permission (EPERM)
            // Still return true because it exists
            return true;
        }
    }

    /**
     * Check if tree-kill library is available
     *
     * Uses dynamic resolution to avoid hard dependency
     *
     * @returns true if tree-kill can be loaded
     */
    private isTreeKillAvailable(): boolean {
        try {
            require.resolve('tree-kill');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Kill process using tree-kill library
     *
     * Handles process tree (parent + children) with callback-based API
     * Note: tree-kill's callback fires when signal is sent, not when process exits
     * We poll to ensure process is actually gone
     *
     * @param pid Process ID to kill
     * @param signal Signal to send
     * @returns Promise that resolves when process killed
     * @throws Error if kill fails
     */
    private async killWithTreeKill(pid: number, signal: NodeJS.Signals): Promise<void> {
        // Dynamic import to avoid hard dependency
        const treeKill = require('tree-kill');

        return new Promise<void>((resolve, reject) => {
            // tree-kill accepts signal as string
            const signalString = signal.toString();

            treeKill(pid, signalString, (error?: Error) => {
                if (error) {
                    // Check if error is because process doesn't exist
                    if (error.message && error.message.includes('ESRCH')) {
                        getLoggerLazy().debug(`[ProcessCleanup] Process ${pid} already exited`);
                        resolve();
                        return;
                    }

                    getLoggerLazy().error(`[ProcessCleanup] tree-kill failed for PID ${pid}:`, error);
                    reject(error);
                    return;
                }

                // tree-kill callback fires when signal sent, not when process exits
                // Poll to ensure process is actually gone
                const pollInterval = setInterval(() => {
                    if (!this.processExists(pid)) {
                        clearInterval(pollInterval);
                        resolve();
                    }
                }, this.checkInterval);

                // Set timeout to prevent infinite polling
                setTimeout(() => {
                    if (this.processExists(pid)) {
                        clearInterval(pollInterval);
                        getLoggerLazy().warn(`[ProcessCleanup] Process ${pid} still alive after tree-kill, force killing`);

                        // Force kill
                        try {
                            process.kill(pid, 'SIGKILL');
                        } catch (killError: any) {
                            if (killError.code !== 'ESRCH') {
                                getLoggerLazy().error(`[ProcessCleanup] Force kill failed:`, killError);
                            }
                        }

                        // Final poll
                        const finalPoll = setInterval(() => {
                            if (!this.processExists(pid)) {
                                clearInterval(finalPoll);
                                resolve();
                            }
                        }, this.checkInterval);
                    }
                }, this.gracefulTimeout);
            });
        });
    }

    /**
     * Kill process with timeout fallback
     *
     * Event-driven: polls for exit, timeout triggers force-kill
     *
     * @param pid Process ID to kill
     * @param signal Initial signal to send
     * @returns Promise that resolves when process killed
     * @throws Error if kill fails
     */
    private async killWithTimeout(pid: number, signal: NodeJS.Signals): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let pollInterval: NodeJS.Timeout | undefined;
            let forceKillTimeout: NodeJS.Timeout | undefined;

            const cleanup = () => {
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = undefined;
                }
                if (forceKillTimeout) {
                    clearTimeout(forceKillTimeout);
                    forceKillTimeout = undefined;
                }
            };

            // Send initial signal
            try {
                process.kill(pid, signal);
                getLoggerLazy().debug(`[ProcessCleanup] Sent ${signal} to PID ${pid}`);
            } catch (error: any) {
                cleanup();

                if (error.code === 'ESRCH') {
                    // Process doesn't exist (already exited)
                    getLoggerLazy().debug(`[ProcessCleanup] Process ${pid} already exited`);
                    resolve();
                    return;
                }

                // Other error (e.g., EPERM - permission denied)
                getLoggerLazy().error(`[ProcessCleanup] Failed to kill process ${pid}:`, error);
                reject(new Error(`Failed to kill process ${pid}: ${error.message}`));
                return;
            }

            // Check immediately if process already exited (before starting interval)
            if (!this.processExists(pid)) {
                getLoggerLazy().debug(`[ProcessCleanup] Process ${pid} exited immediately`);
                cleanup();
                resolve();
                return;
            }

            // Poll for process exit
            pollInterval = setInterval(() => {
                if (!this.processExists(pid)) {
                    getLoggerLazy().debug(`[ProcessCleanup] Process ${pid} exited gracefully`);
                    cleanup();
                    resolve();
                }
            }, this.checkInterval);

            // Set timeout for force-kill
            // Only set timeout if initial signal wasn't SIGKILL
            if (signal !== 'SIGKILL' && this.gracefulTimeout > 0) {
                forceKillTimeout = setTimeout(() => {
                    getLoggerLazy().warn(`[ProcessCleanup] Timeout expired for PID ${pid}, sending SIGKILL`);

                    try {
                        process.kill(pid, 'SIGKILL');
                        getLoggerLazy().debug(`[ProcessCleanup] Sent SIGKILL to PID ${pid}`);

                        // Continue polling for exit after SIGKILL
                        // SIGKILL is not ignorable, process will exit
                    } catch (error: any) {
                        cleanup();

                        if (error.code === 'ESRCH') {
                            // Process already exited
                            getLoggerLazy().debug(`[ProcessCleanup] Process ${pid} exited before SIGKILL`);
                            resolve();
                            return;
                        }

                        // Other error
                        getLoggerLazy().error(`[ProcessCleanup] SIGKILL failed for PID ${pid}:`, error);
                        reject(new Error(`Failed to force-kill process ${pid}: ${error.message}`));
                    }
                }, this.gracefulTimeout);
            }
        });
    }
}
