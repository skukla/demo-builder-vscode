/**
 * IProgressStrategy Interface
 *
 * Strategy pattern interface for different progress tracking approaches.
 * Each strategy handles command execution with its own progress reporting logic.
 */

import { ChildProcessWithoutNullStreams } from 'child_process';
import { ProgressHandler, ExecutionContext, ITimerProvider, IDateProvider } from '../types';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Dependencies required by progress strategies
 */
export interface StrategyDependencies {
    /** Timer provider for setInterval/setTimeout */
    timerProvider: ITimerProvider;
    /** Date provider for time tracking */
    dateProvider: IDateProvider;
    /** Logger for output */
    logger: {
        trace(message: string): void;
        debug(message: string): void;
        info(message: string): void;
        warn(message: string): void;
    };
    /** Function to spawn commands */
    spawnCommand: (command: string) => ChildProcessWithoutNullStreams;
    /** Function to enhance detail with elapsed time */
    enhanceDetailWithElapsedTime: (detail: string) => string;
}

/**
 * Progress strategy interface
 *
 * Implementations handle different progress tracking approaches:
 * - Exact: Parses real progress from command output (e.g., fnm downloads)
 * - Milestones: Matches output patterns to predefined progress milestones
 * - Synthetic: Time-based estimated progress for unknown durations
 * - Immediate: Fast commands with minimal progress steps
 */
export interface IProgressStrategy {
    /**
     * Execute a command with progress tracking
     *
     * @param step The install step definition
     * @param context Execution context with step info
     * @param onProgress Callback for progress updates
     * @param deps Strategy dependencies
     * @returns Promise that resolves on success, rejects on failure
     */
    execute(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        deps: StrategyDependencies
    ): Promise<void>;
}
