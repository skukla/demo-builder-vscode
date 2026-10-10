/**
 * Progress Unifier Types
 *
 * Shared types used across the progress unifier module.
 */

/**
 * Date provider interface for dependency injection
 * Allows tests to control time for testing elapsed time display
 */
export interface IDateProvider {
    now(): number;
}

/**
 * Timer provider interface for dependency injection
 * Allows tests to control timers and time advancement
 */
export interface ITimerProvider {
    setInterval(callback: () => void, ms: number): NodeJS.Timeout;
    clearInterval(timeout: NodeJS.Timeout): void;
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
    clearTimeout(timeout: NodeJS.Timeout): void;
}

/**
 * Process spawner interface for dependency injection
 * Allows tests to mock child process creation
 */
import type { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import type { Logger } from '@/types/logger';

export type IProcessSpawner = typeof spawn;

/**
 * What a progress reporter (exactProgress, milestoneProgress, timedProgress) is
 * handed by ProgressUnifier: the clock, the timers, the spawner already bound to
 * the fnm environment, and the elapsed-time decoration, which stays the unifier's
 * because it reads the step's start time.
 */
export interface ProgressReporterDeps {
    logger: Logger;
    dateProvider: IDateProvider;
    timerProvider: ITimerProvider;
    spawnCommand: (command: string) => ChildProcessWithoutNullStreams;
    enhanceDetailWithElapsedTime: (detail: string) => string;
}

/**
 * Unified progress information for progress tracking
 */
export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
        currentMilestoneIndex?: number;
        totalMilestones?: number;
    };
}

/**
 * Progress handler callback type
 */
export type ProgressHandler = (progress: UnifiedProgress) => Promise<void>;

/**
 * Execution context passed to strategies
 */
export interface ExecutionContext {
    command: string;
    stepIndex: number;
    totalSteps: number;
    stepName: string;
    options?: { nodeVersion?: string };
}
