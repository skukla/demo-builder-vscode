import { getLogger } from '@/core/logging';
import { formatDuration } from '@/core/utils';

/**
 * Performance benchmarks for authentication operations (milliseconds).
 *
 * These are PERFORMANCE BENCHMARKS, not operational timeouts.
 * Used only for slow operation detection and debug logging.
 * Kept here (not in TIMEOUTS config) per SOP §1 as domain-specific benchmarks.
 *
 * Values based on observed production performance (2025-11):
 * - Token validation: ~2.5s (network round-trip to Adobe)
 * - SDK operations: <500ms (fast, cached)
 * - CLI selection: 10-12s (Adobe CLI writes config files)
 */
const EXPECTED_TIMES: Record<string, number> = {
    'isAuthenticated': 3000,
    'isFullyAuthenticated': 4000,
    'getOrganizations': 5000,
    'getProjects': 5000,
    'getWorkspaces': 5000,
    'selectOrganization': 8000,
    'selectProject': 15000,
    'selectWorkspace': 15000,
    'getCurrentOrganization': 5000,
    'getCurrentProject': 5000,
    'getCurrentWorkspace': 5000,
    'login': 30000,
    'loginAndRestoreProjectContext': 60000,
};

/**
 * Execute an async operation with automatic slow-operation detection.
 * Logs a warning to the debug channel when the operation exceeds its benchmark.
 */
export async function withTiming<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
        return await fn();
    } finally {
        const duration = Date.now() - start;
        const expected = EXPECTED_TIMES[operation];
        if (expected && duration > expected) {
            getLogger().debug(
                `[Performance] ${operation} took ${formatDuration(duration)} ⚠️ SLOW (expected <${formatDuration(expected)})`,
            );
        }
    }
}
