/**
 * Test Helpers for ProgressUnifier
 *
 * Provides mock implementations of dependencies and utilities for testing
 * ProgressUnifier with controlled time and process behavior.
 */

import { Logger } from '@/core/logging';
import {
    ProgressUnifier,
    IDateProvider,
    ITimerProvider,
    IProcessSpawner
} from '@/core/utils/progressUnifier';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Mock child process with controllable behavior
 */
export interface MockChildProcess {
    stdout: EventEmitter;
    stderr: EventEmitter;
    on: jest.Mock;
    kill: jest.Mock;
    triggerClose: (code: number) => Promise<void>;
    triggerStdout: (data: string) => void;
    triggerStderr: (data: string) => void;
}

/**
 * Test context providing ProgressUnifier with mocked dependencies
 */
export interface ProgressUnifierTestContext {
    progressUnifier: ProgressUnifier;
    mocks: {
        date: jest.Mocked<IDateProvider>;
        timers: jest.Mocked<ITimerProvider>;
        spawn: jest.Mock;
    };
    advanceTime: (ms: number) => Promise<void>;
    getCurrentTime: () => number;
    getActiveTimers: () => Array<{
        type: 'interval' | 'timeout';
        id: number;
        callback: () => void;
        ms: number;
        lastTriggered: number;
    }>;
    createMockProcess: () => MockChildProcess;
}

/**
 * Timer tracking for controlled time advancement
 */
interface TrackedTimer {
    type: 'interval' | 'timeout';
    callback: () => void;
    ms: number;
    lastTriggered: number;
}

/**
 * Create a testable ProgressUnifier instance with mocked dependencies
 *
 * This factory creates a ProgressUnifier where:
 * - Time is controlled via advanceTime()
 * - Timers are tracked and triggered deterministically
 * - Child processes can be mocked with specific behaviors
 *
 * @param logger Logger instance for the ProgressUnifier
 * @returns Test context with mocked ProgressUnifier and helper utilities
 */
export function createTestableProgressUnifier(logger: Logger): ProgressUnifierTestContext {
    let currentTime = 1000000; // Arbitrary start time

    // Track active timers
    const activeTimers = new Map<number, TrackedTimer>();
    let nextTimerId = 1;

    // Mock date provider - returns controlled time
    const mockDate: jest.Mocked<IDateProvider> = {
        now: jest.fn(() => currentTime)
    };

    // Mock timer provider - tracks timers without actually setting them
    const mockTimers: jest.Mocked<ITimerProvider> = {
        setInterval: jest.fn((callback: () => void, ms: number): NodeJS.Timeout => {
            const id = nextTimerId++;
            activeTimers.set(id, {
                type: 'interval',
                callback,
                ms,
                lastTriggered: currentTime
            });
            return id as unknown as NodeJS.Timeout;
        }),
        clearInterval: jest.fn((timeout: NodeJS.Timeout) => {
            activeTimers.delete(timeout as unknown as number);
        }),
        setTimeout: jest.fn((callback: () => void, ms: number): NodeJS.Timeout => {
            const id = nextTimerId++;
            activeTimers.set(id, {
                type: 'timeout',
                callback,
                ms,
                lastTriggered: currentTime
            });
            return id as unknown as NodeJS.Timeout;
        }),
        clearTimeout: jest.fn((timeout: NodeJS.Timeout) => {
            activeTimers.delete(timeout as unknown as number);
        })
    };

    /**
     * Create a mock child process with controllable events
     */
    const createMockProcess = (): MockChildProcess => {
        const stdoutEmitter = new EventEmitter();
        const stderrEmitter = new EventEmitter();
        const closeHandlers: Array<(code: number) => void | Promise<void>> = [];

        const mockProcess: MockChildProcess = {
            stdout: stdoutEmitter,
            stderr: stderrEmitter,
            on: jest.fn((event: string, handler: (...args: unknown[]) => void | Promise<void>) => {
                if (event === 'close') {
                    closeHandlers.push(handler);
                }
            }),
            kill: jest.fn(),
            triggerClose: async (code: number) => {
                // Call all close handlers and await any promises
                // Errors are caught here so they don't propagate through advanceTime
                for (const handler of closeHandlers) {
                    try {
                        const result = handler(code);
                        // Attach catch handler immediately to prevent unhandled rejection detection
                        if (result && typeof result === 'object' && 'then' in result) {
                            (result as Promise<void>).catch(() => {
                                // Swallow rejections - prevents Node unhandled rejection event
                            });
                        }
                        // Also await with Promise.resolve for completeness
                        await Promise.resolve(result).catch(() => {
                            // Swallow promise rejections from close handlers
                            // The executeStep promise will still reject appropriately
                        });
                    } catch (error) {
                        // Swallow sync errors from close handlers
                    }
                }
                // Let microtasks settle
                await new Promise(resolve => setImmediate(resolve));
            },
            triggerStdout: (data: string) => {
                stdoutEmitter.emit('data', Buffer.from(data));
            },
            triggerStderr: (data: string) => {
                stderrEmitter.emit('data', Buffer.from(data));
            }
        };

        return mockProcess;
    };

    // Store reference to current mock process for external control
    let currentMockProcess: MockChildProcess | null = null;

    /**
     * Mock spawn function - returns controllable mock process
     * By default, processes complete successfully after 10ms of fake time
     */
    const mockSpawn = jest.fn((
        command: string,
        args: string[],
        options: Record<string, unknown>
    ): ChildProcessWithoutNullStreams => {
        const process = createMockProcess();
        currentMockProcess = process;

        // Auto-complete after 10ms fake time (can be overridden in tests)
        mockTimers.setTimeout(async () => {
            await process.triggerClose(0);
        }, 10);

        return process as unknown as ChildProcessWithoutNullStreams;
    });

    /**
     * Create ProgressUnifier with mocked dependencies
     */
    const progressUnifier = new ProgressUnifier(
        logger,
        mockDate,
        mockTimers,
        mockSpawn as unknown as IProcessSpawner
    );

    /**
     * Advance fake time and trigger timers that should fire
     *
     * This simulates time passing and triggers callbacks for any
     * timers (setInterval/setTimeout) that should fire between
     * current time and target time.
     *
     * Callbacks may create new timers, so we keep checking until
     * no more timers need to fire before the target time.
     *
     * @param ms Milliseconds to advance
     */
    const advanceTime = async (ms: number): Promise<void> => {
        const targetTime = currentTime + ms;

        // Keep processing timers until we reach target time
        // Loop continues even if callbacks create new timers
        let iterations = 0;
        const MAX_ITERATIONS = 10000; // Prevent infinite loops

        while (currentTime < targetTime && iterations < MAX_ITERATIONS) {
            iterations++;

            // Find next timer that should fire
            let nextTimer: { id: number; timer: TrackedTimer; triggerTime: number } | null = null;

            for (const [id, timer] of activeTimers) {
                const triggerTime = timer.lastTriggered + timer.ms;
                if (triggerTime <= targetTime &&
                    (!nextTimer || triggerTime < nextTimer.triggerTime)) {
                    nextTimer = { id, timer, triggerTime };
                }
            }

            if (!nextTimer) {
                // No more timers to trigger, jump to target time
                currentTime = targetTime;
                break;
            }

            // Advance to timer trigger time
            currentTime = nextTimer.triggerTime;

            // Handle the timer
            const timer = nextTimer.timer;
            if (timer.type === 'timeout') {
                // Remove timeout after triggering
                activeTimers.delete(nextTimer.id);
            } else {
                // Update last triggered time for intervals
                timer.lastTriggered = currentTime;
            }

            // Execute callback (may be async and may create new timers)
            // Errors from callbacks are stored but don't stop time advancement
            try {
                const result = timer.callback();
                // Check if result is thenable (Promise-like)
                if (result != null && typeof result === 'object' && 'then' in result) {
                    await (result as Promise<unknown>).catch(() => {
                        // Swallow errors from async callbacks
                        // The original promise will still reject appropriately
                    });
                }
            } catch (e) {
                // Swallow sync errors from callbacks
            }

            // Allow promises and microtasks to resolve before checking for new timers
            // Multiple yields ensure deeply nested async work completes
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }

        if (iterations >= MAX_ITERATIONS) {
            throw new Error(`advanceTime exceeded maximum iterations (${MAX_ITERATIONS}). Possible infinite timer loop.`);
        }

        currentTime = targetTime;
    };

    /**
     * Get current fake time
     */
    const getCurrentTime = (): number => currentTime;

    /**
     * Get list of active timers (for debugging)
     */
    const getActiveTimers = () => {
        return Array.from(activeTimers.entries()).map(([id, timer]) => ({
            type: timer.type,
            id,
            callback: timer.callback,
            ms: timer.ms,
            lastTriggered: timer.lastTriggered
        }));
    };

    return {
        progressUnifier,
        mocks: {
            date: mockDate,
            timers: mockTimers,
            spawn: mockSpawn
        },
        advanceTime,
        getCurrentTime,
        getActiveTimers,
        createMockProcess
    };
}
