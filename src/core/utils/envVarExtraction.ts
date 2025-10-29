/**
 * Environment Variable Extraction
 *
 * Utilities for extracting and parsing environment variables from .env files.
 */
import * as fs from 'fs/promises';

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
        const content = await fs.readFile(filePath, 'utf8');
        const envVars: Record<string, string> = {};

        // Parse .env format (KEY=value)
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
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                envVars[key] = value;
            }
        }

        return envVars;
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
    const fs = require('fs');

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const envVars: Record<string, string> = {};

        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) continue;

            const match = trimmed.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();

                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                envVars[key] = value;
            }
        }

        return envVars;
    } catch (error) {
        throw new Error(`Failed to extract env vars from ${filePath}: ${(error as Error).message}`);
    }
}
