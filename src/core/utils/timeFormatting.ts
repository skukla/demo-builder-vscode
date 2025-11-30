/**
 * Time Formatting Utilities
 *
 * Provides consistent formatting for durations and time intervals
 * across the extension's logging and UI.
 */

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Examples:
 * - 50ms → "50ms"
 * - 1500ms → "1.5s"
 * - 65000ms → "1m 5s"
 * - 3725000ms → "1h 2m"
 *
 * @param ms Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }

    const seconds = ms / 1000;
    if (seconds < 60) {
        // Show one decimal place for seconds
        return `${seconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (minutes < 60) {
        return remainingSeconds > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}m`
        : `${hours}h`;
}

/**
 * Format a time interval in minutes to a human-readable string.
 *
 * Examples:
 * - 5min → "5min"
 * - 45min → "45min"
 * - 90min → "1h 30m"
 * - 1440min → "24h"
 *
 * @param minutes Duration in minutes
 * @returns Human-readable interval string
 */
export function formatMinutes(minutes: number): string {
    if (minutes < 60) {
        return `${Math.round(minutes)}min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);

    if (hours < 24) {
        return remainingMinutes > 0
            ? `${hours}h ${remainingMinutes}m`
            : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0
        ? `${days}d ${remainingHours}h`
        : `${days}d`;
}
