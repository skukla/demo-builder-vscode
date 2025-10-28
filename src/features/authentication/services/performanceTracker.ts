import { getLogger } from '@/core/logging';
import type { PerformanceMetric } from '@/features/authentication/services/types';

/**
 * Tracks performance timing for authentication operations
 * Provides metrics and warnings for slow operations
 */
export class PerformanceTracker {
    private timings = new Map<string, number>();
    private logger = getLogger();

    // Expected operation times in milliseconds
    private readonly expectedTimes: Record<string, number> = {
        'isAuthenticated': 3000,
        'isAuthenticatedQuick': 1000,
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

        // Log performance metrics to debug channel with warning if exceeded
        const expected = this.expectedTimes[operation];
        const warning = expected && duration > expected ? ` ⚠️ SLOW (expected <${expected}ms)` : '';
        this.logger.debug(`[Performance] ${operation} took ${duration}ms${warning}`);

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
