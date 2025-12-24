/**
 * Pure utility functions for formatting and text manipulation
 */

// Re-export name normalization from core for backward compatibility
export {
    normalizeProjectName,
    normalizeRepositoryName,
    isValidRepositoryName,
    getRepositoryNameError,
} from '@/core/validation/normalizers';

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
