/**
 * EDS Error Formatters
 *
 * Turns a failed GitHub or Helix call into the words the SC sees: a code, a
 * user-facing message and a recovery hint, looked up in one table per service.
 * Classification is the same for every table (see `formatByTable`); only the
 * table differs.
 *
 * What GitHub says when it REFUSES a write (rulesets, push protection) is a
 * different job and lives in `github/githubWriteRejection.ts`.
 */

import type { EdsError, GitHubErrorCode, HelixErrorCode } from './types';

/** One row of a service's table: the messages it matches and what the SC is told. */
interface ErrorTableEntry {
    patterns: RegExp[];
    userMessage: string;
    recoveryHint?: string;
}

/**
 * Classify an error against one service's table.
 *
 * An explicit `code` the table holds wins; otherwise the first row (in table
 * order, UNKNOWN skipped) with a pattern matching the message; otherwise UNKNOWN.
 * UNKNOWN's `technicalDetails` carry no status on purpose.
 *
 * @param error - The original error, possibly carrying `code` and `status`
 * @param table - The service's table, keyed by its error codes plus UNKNOWN
 * @returns Formatted EdsError with user-friendly message
 */
function formatByTable<C extends string>(
    error: Error,
    table: Record<C | 'UNKNOWN', ErrorTableEntry>,
): EdsError {
    const errorWithCode = error as Error & { code?: string; status?: number };
    const errorMessage = error.message || '';

    // First, check if error has explicit code
    if (errorWithCode.code && errorWithCode.code in table) {
        const pattern = table[errorWithCode.code as C];
        return {
            code: errorWithCode.code,
            message: errorMessage,
            userMessage: pattern.userMessage,
            recoveryHint: pattern.recoveryHint,
            technicalDetails: `Status: ${errorWithCode.status || 'N/A'}, Message: ${errorMessage}`,
        };
    }

    // Otherwise, match by pattern
    for (const [code, config] of Object.entries<ErrorTableEntry>(table)) {
        if (code === 'UNKNOWN') continue;

        for (const pattern of config.patterns) {
            if (pattern.test(errorMessage)) {
                return {
                    code,
                    message: errorMessage,
                    userMessage: config.userMessage,
                    recoveryHint: config.recoveryHint,
                    technicalDetails: `Status: ${errorWithCode.status || 'N/A'}, Message: ${errorMessage}`,
                };
            }
        }
    }

    // Fall back to unknown
    const unknownPattern = table.UNKNOWN;
    return {
        code: 'UNKNOWN',
        message: errorMessage,
        userMessage: unknownPattern.userMessage,
        recoveryHint: unknownPattern.recoveryHint,
        technicalDetails: `Message: ${errorMessage}`,
    };
}

// ==========================================================
// GitHub Error Formatting
// ==========================================================

/**
 * GitHub error patterns and their user-friendly messages
 */
const GITHUB_ERROR_PATTERNS: Record<GitHubErrorCode, ErrorTableEntry> = {
    OAUTH_CANCELLED: {
        patterns: [/oauth.*cancel/i, /cancelled/i, /user cancelled/i],
        userMessage: 'GitHub sign-in was cancelled. Please try again to authenticate.',
        recoveryHint: 'Click the Sign In button to start the authentication process again.',
    },
    REPO_EXISTS: {
        patterns: [/already exists/i, /name.*exists/i, /repository.*exists/i],
        userMessage:
            'A repository with this name already exists. Please choose a different name for your project.',
        recoveryHint:
            'Go back and enter a different project name, or delete the existing repository first.',
    },
    AUTH_EXPIRED: {
        patterns: [/bad credentials/i, /401/i, /unauthorized/i, /token.*expired/i],
        userMessage: 'Your GitHub session has expired. Please sign in again to continue.',
        recoveryHint: 'Click Sign In to authenticate with GitHub again.',
    },
    RATE_LIMITED: {
        patterns: [/rate limit/i, /too many requests/i, /403.*rate/i],
        userMessage: 'Too many requests to GitHub. Please try again in a few minutes.',
        recoveryHint: 'Wait 5-10 minutes before trying again. GitHub limits API requests.',
    },
    NETWORK_ERROR: {
        patterns: [/network/i, /timeout/i, /econnrefused/i, /fetch failed/i],
        userMessage: 'Could not connect to GitHub. Please check your internet connection.',
        recoveryHint: 'Verify your internet connection and try again.',
    },
    UNKNOWN: {
        patterns: [],
        userMessage: 'An unexpected error occurred with GitHub. Please try again.',
        recoveryHint: 'If the problem persists, check GitHub status at status.github.com.',
    },
};

/**
 * Format GitHub errors into user-friendly messages
 *
 * @param error - The original error from GitHub operations
 * @returns Formatted EdsError with user-friendly message
 */
export function formatGitHubError(error: Error): EdsError {
    return formatByTable(error, GITHUB_ERROR_PATTERNS);
}

// ==========================================================
// Helix Error Formatting
// ==========================================================

/**
 * Helix error patterns and their user-friendly messages
 */
const HELIX_ERROR_PATTERNS: Record<HelixErrorCode, ErrorTableEntry> = {
    SERVICE_UNAVAILABLE: {
        patterns: [/503/i, /service unavailable/i, /temporarily unavailable/i],
        userMessage:
            'The Helix configuration service is temporarily unavailable. Please try again in a few minutes.',
        recoveryHint: 'This is usually a temporary issue. Try again in a few minutes.',
    },
    SYNC_TIMEOUT: {
        patterns: [/sync.*timeout/i, /timeout.*sync/i, /code.*sync/i],
        userMessage:
            'Code synchronization is taking longer than expected. The repository may still be processing.',
        recoveryHint:
            'You can retry the setup or check back in a few minutes. The synchronization may complete in the background.',
    },
    CONFIG_FAILED: {
        patterns: [/config.*failed/i, /configuration.*error/i, /500/i],
        userMessage: 'Failed to configure the Helix site. The server encountered an error.',
        recoveryHint: 'Try again. If the problem persists, verify your project settings.',
    },
    NETWORK_ERROR: {
        patterns: [/network/i, /timeout/i, /abort/i, /econnrefused/i],
        userMessage:
            'Could not connect to the Helix service. Please check your internet connection.',
        recoveryHint: 'Verify your internet connection and try again.',
    },
    UNKNOWN: {
        patterns: [],
        userMessage: 'An unexpected error occurred with Helix configuration. Please try again.',
        recoveryHint: 'If the problem persists, contact support.',
    },
};

/**
 * Format Helix errors into user-friendly messages
 *
 * @param error - The original error from Helix operations
 * @returns Formatted EdsError with user-friendly message
 */
export function formatHelixError(error: Error): EdsError {
    return formatByTable(error, HELIX_ERROR_PATTERNS);
}
