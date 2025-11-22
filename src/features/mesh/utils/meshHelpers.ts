/**
 * Mesh Helpers
 *
 * Utility functions for mesh deployment operations including status categorization,
 * JSON extraction from CLI output, and polling for deployment completion.
 */

/**
 * Mesh status category for UI display
 */
export type MeshStatusCategory = 'deployed' | 'error' | 'pending';

/**
 * Configuration for polling operations
 */
export interface PollConfig {
    /** Function to check condition, returns success status and optional data */
    checkFn: () => Promise<{ success: boolean; data?: unknown }>;
    /** Maximum number of attempts before giving up */
    maxAttempts: number;
    /** Interval between attempts in milliseconds */
    intervalMs: number;
    /** Optional callback for progress updates */
    onProgress?: (attempt: number, maxAttempts: number) => void;
}

/**
 * Result from polling operation
 */
export interface PollResult {
    /** Whether the polling succeeded */
    success: boolean;
    /** Optional data returned from successful check */
    data?: unknown;
    /** Error message if polling failed */
    error?: string;
}

/** Statuses that indicate successful deployment */
const DEPLOYED_STATUSES = ['active', 'deployed', 'success'];

/** Statuses that indicate deployment failure */
const ERROR_STATUSES = ['failed', 'error'];

/**
 * Categorize a mesh status string into a high-level category.
 *
 * @param status - The raw status string from Adobe CLI
 * @returns Category: 'deployed', 'error', or 'pending'
 */
export function getMeshStatusCategory(status: string): MeshStatusCategory {
    const normalizedStatus = status.toLowerCase().trim();

    if (DEPLOYED_STATUSES.includes(normalizedStatus)) {
        return 'deployed';
    }

    if (ERROR_STATUSES.includes(normalizedStatus)) {
        return 'error';
    }

    return 'pending';
}

/**
 * Extract and parse JSON from CLI stdout that may contain non-JSON text.
 *
 * @param stdout - Raw stdout from CLI command
 * @returns Parsed JSON object/array or null if not found/invalid
 */
export function extractAndParseJSON<T = unknown>(stdout: string): T | null {
    if (!stdout) {
        return null;
    }

    // Find positions of first '[' and first '{'
    const arrayStart = stdout.indexOf('[');
    const objectStart = stdout.indexOf('{');

    // Try array first if it appears before object (or object not found)
    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
        // Extract from first '[' to matching ']'
        const substring = stdout.substring(arrayStart);
        const parsed = tryParseBalancedJSON(substring, '[', ']');
        if (parsed !== null) {
            return parsed as T;
        }
    }

    // Try to find JSON object
    if (objectStart !== -1) {
        const substring = stdout.substring(objectStart);
        const parsed = tryParseBalancedJSON(substring, '{', '}');
        if (parsed !== null) {
            return parsed as T;
        }
    }

    return null;
}

/**
 * Try to parse balanced JSON by finding matching brackets
 */
function tryParseBalancedJSON(str: string, open: string, close: string): unknown | null {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\' && inString) {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === open) {
                depth++;
            } else if (char === close) {
                depth--;
                if (depth === 0) {
                    const jsonStr = str.substring(0, i + 1);
                    try {
                        return JSON.parse(jsonStr);
                    } catch {
                        return null;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Poll for mesh deployment completion with configurable retries and intervals.
 *
 * @param config - Polling configuration
 * @returns Poll result with success status and optional data
 */
export async function pollForMeshDeployment(config: PollConfig): Promise<PollResult> {
    const { checkFn, maxAttempts, intervalMs, onProgress } = config;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        onProgress?.(attempt, maxAttempts);

        try {
            const result = await checkFn();
            if (result.success) {
                return { success: true, data: result.data };
            }
        } catch {
            // Continue polling on errors
        }

        // Wait before next attempt (unless this was the last attempt)
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    return {
        success: false,
        error: `Polling failed after ${maxAttempts} attempts`,
    };
}
