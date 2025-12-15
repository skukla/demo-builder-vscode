/**
 * String Helper Utilities
 *
 * Defensive utilities for handling potentially unsafe values from external APIs.
 * Adobe API responses sometimes contain object types where strings are expected,
 * which causes React error #185 ("Objects are not valid as a React child").
 */

/**
 * Safely convert a value to string, handling objects that should be strings.
 *
 * Adobe API occasionally returns object types where strings are expected.
 * This helper ensures we always get a string for rendering in React.
 *
 * @param value - The value to convert (may be string, object, null, or undefined)
 * @returns The string value, or undefined if the value is falsy
 *
 * @example
 * // Safe for React rendering
 * <Text>{safeString(item.name)}</Text>
 * <Text>{safeString(org.name) || 'Unknown'}</Text>
 */
export function safeString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'string') {
        return value;
    }
    // Convert objects/numbers/etc to string as fallback
    return String(value);
}

/**
 * Safely get display text from an item with title/name properties.
 *
 * Common pattern for Adobe entities (projects, workspaces, orgs) that have
 * both title and name properties. Prefers title, falls back to name.
 *
 * @param item - Object with optional title and name properties
 * @returns The display text, or empty string if neither exists
 *
 * @example
 * const displayText = getDisplayText(project);
 * // Returns project.title if string, else project.name if string, else ''
 */
export function getDisplayText(item: { title?: unknown; name?: unknown } | null | undefined): string {
    if (!item) return '';

    const title = typeof item.title === 'string' ? item.title : '';
    const name = typeof item.name === 'string' ? item.name : '';

    return title || name;
}
