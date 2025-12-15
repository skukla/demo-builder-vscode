/**
 * ElapsedTimeTracker
 *
 * Tracks elapsed time for long-running operations and formats display strings.
 * Shows elapsed time in progress messages after a configurable threshold.
 */

import { IDateProvider, ITimerProvider } from './types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Threshold in milliseconds for showing elapsed time in progress messages.
 * Only operations exceeding this duration will display elapsed time.
 */
const ELAPSED_TIME_THRESHOLD_MS = TIMEOUTS.ELAPSED_TIME_THRESHOLD;

/**
 * Format elapsed time in human-readable format
 * @param ms Milliseconds elapsed
 * @returns Formatted string like "35s" or "1m 15s"
 */
export function formatElapsedTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Elapsed time tracker for progress operations
 *
 * Provides:
 * - Start/stop tracking for operations
 * - Detail enhancement with elapsed time (only for long operations)
 * - Human-readable time formatting
 */
export class ElapsedTimeTracker {
    private startTime: number | undefined;
    private timer: NodeJS.Timeout | undefined;

    constructor(
        private readonly dateProvider: IDateProvider,
        private readonly timerProvider: ITimerProvider,
    ) {}

    /**
     * Start tracking elapsed time
     */
    start(): void {
        this.startTime = this.dateProvider.now();
        this.timer = undefined;
    }

    /**
     * Stop tracking and cleanup
     */
    stop(): void {
        if (this.timer) {
            this.timerProvider.clearInterval(this.timer);
            this.timer = undefined;
        }
        this.startTime = undefined;
    }

    /**
     * Get current elapsed time in milliseconds
     * @returns Elapsed time in ms, or 0 if not tracking
     */
    getElapsed(): number {
        if (!this.startTime) {
            return 0;
        }
        return this.dateProvider.now() - this.startTime;
    }

    /**
     * Enhance a detail string with elapsed time if operation exceeds threshold
     * @param detail Original detail string
     * @returns Detail with elapsed time appended if threshold exceeded
     */
    enhanceDetailWithElapsedTime(detail: string): string {
        if (!this.startTime) {
            return detail;
        }

        const elapsed = this.dateProvider.now() - this.startTime;

        // Only show elapsed time for operations exceeding threshold (30s)
        if (elapsed > ELAPSED_TIME_THRESHOLD_MS) {
            const elapsedStr = formatElapsedTime(elapsed);
            return `${detail} (${elapsedStr})`;
        }

        return detail;
    }

    /**
     * Check if currently tracking
     */
    isTracking(): boolean {
        return this.startTime !== undefined;
    }
}
