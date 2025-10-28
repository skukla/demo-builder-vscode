/**
 * Error Formatting Utilities
 *
 * Provides consistent error message formatting across the extension,
 * particularly for Adobe CLI errors that use arrows (›) as separators.
 */

import { toError } from '@/types/typeGuards';

/**
 * Format Adobe CLI error messages for better readability
 *
 * Adobe CLI errors often use arrows (›) as separators between error parts.
 * This function replaces those with newlines for clearer display in UI.
 *
 * @example
 * Input:  "Error: Issue in .env file › missing keys › ADOBE_CATALOG_ENDPOINT"
 * Output: "Error: Issue in .env file\nmissing keys\nADOBE_CATALOG_ENDPOINT"
 *
 * @param error - Error object or string to format
 * @returns Formatted error message with arrows replaced by newlines
 */
export function formatAdobeCliError(error: Error | string): string {
    const errorMessage = toError(error).message;
    return errorMessage.replace(/\s*›\s*/g, '\n');
}

/**
 * Format mesh deployment errors with context
 * 
 * Wraps mesh deployment errors with a clear header and formats the details.
 * 
 * @param error - The error from mesh deployment
 * @returns Formatted error message ready for display
 */
export function formatMeshDeploymentError(error: Error | string): string {
    const formatted = formatAdobeCliError(error);
    return `Failed to deploy Adobe Commerce API Mesh:\n${formatted}`;
}

/**
 * Format generic Adobe Commerce errors
 * 
 * @param error - The error to format
 * @param context - Optional context (e.g., "API Mesh", "Authentication")
 * @returns Formatted error message
 */
export function formatAdobeError(error: Error | string, context?: string): string {
    const formatted = formatAdobeCliError(error);
    
    if (context) {
        return `${context} Error:\n${formatted}`;
    }
    
    return formatted;
}
