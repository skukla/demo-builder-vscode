/**
 * Error Formatting for Adobe CLI Errors
 *
 * Adobe CLI uses arrow separators (›) which need conversion to newlines
 * for better readability in VS Code UI. This module provides formatters
 * specifically for Adobe I/O CLI errors (mesh deployment, project creation).
 *
 * **Use this formatter for:**
 * - Adobe I/O CLI errors (mesh deployment, project creation)
 * - Errors with arrow separators (›)
 * - Simple string-based error display
 *
 * **Returns**: `string` with newlines for display
 *
 * **See also**: `@/features/authentication/services/authenticationErrorFormatter.ts`
 * for structured authentication errors with categorization
 *
 * @example
 * ```typescript
 * // Mesh deployment error
 * const formatted = formatMeshDeploymentError(error);
 * // Output: "Failed to deploy Adobe Commerce API Mesh:\nError details here"
 *
 * // Generic Adobe CLI error
 * const formatted = formatAdobeCliError(error);
 * // Output: "Error: Config › missing › field" → "Error: Config\nmissing\nfield"
 * ```
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
