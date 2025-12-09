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
 * Also strips HTML response bodies that Adobe CLI sometimes includes in errors.
 *
 * @example
 * Input:  "Error: Issue in .env file › missing keys › ADOBE_CATALOG_ENDPOINT"
 * Output: "Error: Issue in .env file\nmissing keys\nADOBE_CATALOG_ENDPOINT"
 *
 * @example
 * Input:  "HTTP error: 404 - <!DOCTYPE html>...(50KB of HTML)..."
 * Output: "HTTP error: 404"
 *
 * @param error - Error object or string to format
 * @returns Formatted error message with arrows replaced by newlines
 */
export function formatAdobeCliError(error: Error | string): string {
    let errorMessage = toError(error).message;

    // Strip HTML response bodies (Adobe CLI sometimes includes entire error pages)
    // Look for HTML content markers and truncate there
    const htmlMarkers = ['<!DOCTYPE', '<html', '<HTML', '<!doctype'];
    for (const marker of htmlMarkers) {
        const htmlIndex = errorMessage.indexOf(marker);
        if (htmlIndex !== -1) {
            // Keep everything before the HTML, trim whitespace and trailing separators
            errorMessage = errorMessage.substring(0, htmlIndex).replace(/[\s\-:]+$/, '');
            break;
        }
    }

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

/**
 * Extract user-friendly summary from verbose mesh deployment errors
 *
 * Adobe mesh errors contain verbose build logs that aren't useful to users.
 * This extracts just the actionable information:
 * - What URL failed
 * - What the error was
 * - What the user can do
 *
 * @example
 * Input: "Building Mesh with config: /usr/src/node-app/...💡 🕸️  Mesh Cleaning...
 *         💥 🕸️  Mesh - CommerceGraphQL Failed to fetch introspection from
 *         https://example.com/graphq: GraphQLError: Unexpected response: \"<!doctype..."
 *
 * Output: "Could not reach GraphQL endpoint: https://example.com/graphq
 *          The server returned an error page. Check that the URL is correct."
 */
/**
 * Check if a line is meaningful error content (not noise)
 *
 * SOP §10: Extracted 4-condition AND chain to named predicate
 *
 * @param line - The line to check
 * @returns true if the line contains meaningful error content
 */
function isMeaningfulErrorLine(line: string): boolean {
    if (!line.trim()) return false;
    if (line.includes('Building Mesh')) return false;
    if (line.includes('💡')) return false;
    if (line.includes('Cleaning existing')) return false;
    return true;
}

export function extractMeshErrorSummary(error: string): string {
    // Try to extract the failing URL from introspection errors
    // URL is followed by ": GraphQLError" so we match non-whitespace until the trailing colon
    const introspectionMatch = /Failed to fetch introspection from (\S+):/i.exec(error);
    if (introspectionMatch) {
        const url = introspectionMatch[1];
        return `Could not reach GraphQL endpoint: ${url}\nThe server returned an error. Check that the URL in your .env file is correct.`;
    }

    // Try to extract connection errors
    const connectionMatch = /(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect ECONNREFUSED) ([^\s]+)/i.exec(error);
    if (connectionMatch) {
        return `Could not connect to: ${connectionMatch[1]}\nCheck that the server is running and the URL is correct.`;
    }

    // mesh.json schema validation errors
    const schemaMatch = /must NOT have additional properties|missing required property|should be (string|array|object|number|boolean)/i.exec(error);
    if (schemaMatch) {
        return `Invalid mesh.json configuration: ${schemaMatch[0]}\nCheck your mesh.json file for syntax errors.`;
    }

    // Authentication/permission errors
    if (/unauthorized|403|401|access denied|not authorized/i.test(error)) {
        return 'Authentication failed. Your Adobe credentials may have expired.\nTry signing out and back in via the Project Dashboard.';
    }

    // Rate limiting
    if (/rate limit|too many requests|429/i.test(error)) {
        return 'Adobe API rate limit reached. Please wait a few minutes and try again.';
    }

    // Truncated "Building Mesh with config" error - Adobe returned incomplete error
    // This happens when mesh build fails but Adobe doesn't return the actual error details
    if (/Building Mesh with config:.*\/$/.test(error) || /^Building Mesh with config:/.test(error)) {
        return 'Mesh build failed. This is usually caused by:\n' +
            '• Invalid Commerce GraphQL endpoint URL\n' +
            '• Commerce instance not reachable from Adobe I/O\n' +
            '• Missing or invalid API credentials\n\n' +
            'Check the Debug logs for more details.';
    }

    // Try to extract the 💥 error line (the actual failure)
    const fatalMatch = /💥[^💥\n]*?(?:Failed|Error)[^💥\n]*/i.exec(error);
    if (fatalMatch) {
        // Clean up the match - remove emojis and internal paths
        let summary = fatalMatch[0]
            .replace(/💥\s*🕸️\s*Mesh\s*-?\s*/g, '')
            .replace(/\/usr\/src\/node-app\/[^\s]+/g, '')
            .trim();

        // Strip HTML if present
        summary = formatAdobeCliError(summary);
        return summary;
    }

    // Fallback: just strip HTML and return first meaningful line
    const cleaned = formatAdobeCliError(error);
    const lines = cleaned.split('\n').filter(isMeaningfulErrorLine);

    return lines[0] || 'Mesh deployment failed. Check the Debug logs for details.';
}
