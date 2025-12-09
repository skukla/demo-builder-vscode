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

/**
 * Normalize project name for valid directory/identifier format
 *
 * Transforms user input to valid project name:
 * - Converts to lowercase
 * - Converts spaces and underscores to hyphens
 * - Removes special characters (keeps only a-z, 0-9, hyphens)
 * - Collapses multiple consecutive hyphens to single hyphen
 * - Trims leading hyphens only (preserves trailing for typing flow)
 *
 * @example
 * normalizeProjectName('My Project') // returns 'my-project'
 * normalizeProjectName('Test_Demo') // returns 'test-demo'
 * normalizeProjectName('Hello World!') // returns 'hello-world'
 * normalizeProjectName('Demo--Name') // returns 'demo-name'
 */
export function normalizeProjectName(input: string): string {
    return input
        .toLowerCase()
        .replace(/[\s_]+/g, '-')      // Convert spaces and underscores to hyphens
        .replace(/[^a-z0-9-]/g, '')   // Remove special characters
        .replace(/-+/g, '-')          // Collapse multiple hyphens
        .replace(/^-/, '');           // Trim leading hyphen only (preserve trailing for typing)
}
