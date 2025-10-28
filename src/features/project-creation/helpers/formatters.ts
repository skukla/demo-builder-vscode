/**
 * Pure utility functions for formatting and text manipulation
 */

/**
 * Format group name for display
 * Converts hyphenated names to title case
 *
 * @example
 * formatGroupName('api-mesh') // returns 'Api Mesh'
 * formatGroupName('commerce-backend') // returns 'Commerce Backend'
 */
export function formatGroupName(group: string): string {
    return group
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
