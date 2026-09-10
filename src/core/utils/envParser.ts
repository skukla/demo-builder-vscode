/**
 * Environment File Parser
 *
 * Shared utility for parsing .env file content into key-value pairs.
 */

/**
 * Parse .env file content into key-value pairs.
 *
 * THE FORMAT IT ACCEPTS: `KEY=value`, one per line. Blank lines and lines whose
 * first non-space character is `#` are dropped, so a commented-out setting stays
 * a comment even though it carries an `=`. Key and value are trimmed. A value
 * wrapped in a MATCHING pair of quotes loses them; a lone quote at one end is
 * part of the value. Everything after the FIRST `=` belongs to the value, which
 * is what keeps connection strings and base64 padding intact. A line with no `=`,
 * or one whose `=` is the first character, has no key and is skipped rather than
 * thrown on. A repeated key takes its last value.
 *
 * THE ONLY .env PARSER. A second copy of this loop lived beside it in
 * `envVarExtraction.ts` — a regex spelling of the same decisions, in the same
 * directory — until 2026-09-07, when that module was deleted for having no
 * caller anywhere in the repository's history. The two were fuzzed against each
 * other over 200k inputs first, because a duplicate is only safe to delete once
 * you know what it did differently: they agreed on everything except a line
 * holding an interior line-terminator character (CR, U+2028, U+2029), which
 * `trim()` does not remove and `/(.*)$/` cannot cross. The copy dropped the
 * whole variable there. This one keeps its value, which is the behaviour the
 * five live callers get.
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
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            values[key] = value;
        }
    }

    return values;
}
