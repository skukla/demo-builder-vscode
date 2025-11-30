import { getLogger } from '@/core/logging';
import { formatDuration } from '@/core/utils';
import type { PerformanceMetric } from '@/features/authentication/services/types';

/**
 * Tracks performance timing for authentication operations
 * Provides metrics and warnings for slow operations
 */
export class PerformanceTracker {
    private timings = new Map<string, number>();
    private logger = getLogger();

    /**
     * Expected operation times in milliseconds (performance benchmarks)
     *
     * NOTE: These are PERFORMANCE BENCHMARKS, not operational timeouts.
     * They're used only for slow operation detection and logging.
     * Intentionally kept here (not in TIMEOUTS config) per SOP §1
     * as they're domain-specific benchmarks rather than configurable timeouts.
     */
    private readonly expectedTimes: Record<string, number> = {
        'isAuthenticated': 2500,
        'isFullyAuthenticated': 3000,
        'getOrganizations': 5000,
        'getProjects': 5000,
        'getWorkspaces': 5000,
        'selectOrganization': 5000,
        'selectProject': 5000,
        'selectWorkspace': 5000,
        'getCurrentOrganization': 3000,
        'getCurrentProject': 3000,
        'getCurrentWorkspace': 3000,
        'login': 30000,
    };

    /**
     * Start timing an operation
     */
    startTiming(operation: string): void {
        this.timings.set(operation, Date.now());
    }

    /**
     * End timing and log performance metrics
     * Returns the duration in milliseconds
     */
    endTiming(operation: string): number {
        const start = this.timings.get(operation);
        if (!start) {
            return 0;
        }

        const duration = Date.now() - start;
        this.timings.delete(operation);

        // Log performance metrics to debug channel only when slow (exceeded expected time)
        const expected = this.expectedTimes[operation];
        const warning = expected && duration > expected ? ` ⚠️ SLOW (expected <${formatDuration(expected)})` : '';
        if (warning) {
            this.logger.debug(`[Performance] ${operation} took ${formatDuration(duration)}${warning}`);
        }

        return duration;
    }

    /**
     * Get all tracked metrics
     */
    getMetrics(): PerformanceMetric[] {
        const metrics: PerformanceMetric[] = [];
        const now = Date.now();

        this.timings.forEach((timestamp, operation) => {
            metrics.push({
                operation,
                duration: now - timestamp,
                timestamp,
            });
        });

        return metrics;
    }

    /**
     * Clear all timing data
     */
    clear(): void {
        this.timings.clear();
    }
}
