/**
 * Environment Variable Extraction
 *
 * Utilities for extracting and parsing environment variables from .env files.
 */
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

/**
 * Parse the text of a .env file into a key→value record.
 *
 * ONE parser, two callers. `extractEnvVars` and `extractEnvVarsSync` carried
 * byte-identical copies of this loop, differing only in how they read the file —
 * so every parsing decision in here had to be proved twice and was proved in
 * neither copy (36 surviving mutants, evenly split, 2026-09-06).
 *
 * The format it accepts: `KEY=value`, one per line. Blank lines and lines whose
 * first non-space character is `#` are dropped, so a comment carrying an `=`
 * stays a comment. Key and value are trimmed. A value wrapped in a MATCHING
 * pair of quotes loses them; a lone quote at one end is part of the value.
 * Everything after the first `=` belongs to the value, which is what keeps
 * connection strings and base64 padding intact.
 *
 * @param content - the raw file text
 * @returns the parsed variables; malformed lines are skipped, never thrown on
 */
function parseEnvContent(content: string): Record<string, string> {
    const envVars: Record<string, string> = {};

    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Parse KEY=value
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();

            // Remove surrounding quotes
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            envVars[key] = value;
        }
    }

    return envVars;
}

/**
 * Extracts environment variables from a .env file
 *
 * Parses KEY=value format, handles comments and quoted values.
 *
 * @param filePath - Path to .env file
 * @returns Record of environment variable key-value pairs
 */
export async function extractEnvVars(filePath: string): Promise<Record<string, string>> {
    try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        return parseEnvContent(content);
    } catch (error) {
        throw new Error(`Failed to extract env vars from ${filePath}: ${(error as Error).message}`);
    }
}

/**
 * Extracts environment variables synchronously from a .env file
 *
 * Useful when async operations aren't possible.
 *
 * @param filePath - Path to .env file
 * @returns Record of environment variable key-value pairs
 */
export function extractEnvVarsSync(filePath: string): Record<string, string> {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return parseEnvContent(content);
    } catch (error) {
        throw new Error(`Failed to extract env vars from ${filePath}: ${(error as Error).message}`);
    }
}
