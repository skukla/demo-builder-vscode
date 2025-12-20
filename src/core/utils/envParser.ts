/**
 * Environment File Parser
 *
 * Shared utility for parsing .env file content into key-value pairs.
 */

/**
 * Parse .env file content into key-value pairs
 *
 * Handles:
 * - Comments (lines starting with #)
 * - Empty lines
 * - Quoted values (single and double quotes)
 * - KEY=value format
 *
 * @param content - Raw .env file content
 * @returns Object mapping variable names to their values
 */
export function parseEnvFile(content: string): Record<string, string> {
    const values: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        // Parse KEY=value format
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim();
            let value = trimmed.substring(equalIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            values[key] = value;
        }
    }

    return values;
}
