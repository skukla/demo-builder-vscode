/**
 * EDS Error Formatters
 *
 * Provides user-friendly error message formatting for EDS operations.
 * Transforms technical errors into actionable, non-technical messages
 * suitable for display in the UI.
 *
 * Error formatters for:
 * - GitHub operations (OAuth, repo creation, auth)
 * - DA.live operations (org access, content copy)
 * - Helix operations (config, code sync)
 */

import type { EdsError, GitHubErrorCode, DaLiveErrorCode, HelixErrorCode } from './types';

// ==========================================================
// GitHub Error Formatting
// ==========================================================

/**
 * GitHub error patterns and their user-friendly messages
 */
const GITHUB_ERROR_PATTERNS: Record<
    GitHubErrorCode,
    {
        patterns: RegExp[];
        userMessage: string;
        recoveryHint?: string;
    }
> = {
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
    const errorWithCode = error as Error & { code?: string; status?: number };
    const errorMessage = error.message || '';

    // First, check if error has explicit code
    if (errorWithCode.code && errorWithCode.code in GITHUB_ERROR_PATTERNS) {
        const pattern = GITHUB_ERROR_PATTERNS[errorWithCode.code as GitHubErrorCode];
        return {
            code: errorWithCode.code,
            message: errorMessage,
            userMessage: pattern.userMessage,
            recoveryHint: pattern.recoveryHint,
            technicalDetails: `Status: ${errorWithCode.status || 'N/A'}, Message: ${errorMessage}`,
        };
    }

    // Otherwise, match by pattern
    for (const [code, config] of Object.entries(GITHUB_ERROR_PATTERNS)) {
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
    const unknownPattern = GITHUB_ERROR_PATTERNS.UNKNOWN;
    return {
        code: 'UNKNOWN',
        message: errorMessage,
        userMessage: unknownPattern.userMessage,
        recoveryHint: unknownPattern.recoveryHint,
        technicalDetails: `Message: ${errorMessage}`,
    };
}

// ==========================================================
// DA.live Error Formatting
// ==========================================================

/**
 * DA.live error patterns and their user-friendly messages
 */
const DALIVE_ERROR_PATTERNS: Record<
    DaLiveErrorCode,
    {
        patterns: RegExp[];
        userMessage: string;
        recoveryHint?: string;
    }
> = {
    ACCESS_DENIED: {
        patterns: [/access denied/i, /403/i, /forbidden/i, /permission/i],
        userMessage:
            'You do not have permission to access this DA.live organization. Please verify you have the correct access rights.',
        recoveryHint:
            'Contact your administrator to request access to this organization, or select a different organization.',
    },
    NETWORK_ERROR: {
        patterns: [/network/i, /abort/i, /timeout/i, /econnrefused/i, /fetch failed/i],
        userMessage:
            'Could not connect to DA.live. The connection timed out or was interrupted.',
        recoveryHint:
            'Check your internet connection and try again. If the problem persists, DA.live may be temporarily unavailable.',
    },
    TIMEOUT: {
        patterns: [/timeout/i, /timed out/i],
        userMessage: 'The DA.live request took too long and timed out.',
        recoveryHint: 'Try again. If the problem persists, the content may be too large to copy.',
    },
    NOT_FOUND: {
        patterns: [/not found/i, /404/i, /does not exist/i],
        userMessage: 'The requested content could not be found on DA.live.',
        recoveryHint: 'Verify the organization and site names are correct.',
    },
    UNKNOWN: {
        patterns: [],
        userMessage: 'An unexpected error occurred with DA.live. Please try again.',
        recoveryHint: 'If the problem persists, contact support.',
    },
};

/**
 * Format DA.live errors into user-friendly messages
 *
 * @param error - The original error from DA.live operations
 * @returns Formatted EdsError with user-friendly message
 */
export function formatDaLiveError(error: Error): EdsError {
    const errorWithCode = error as Error & { code?: string; statusCode?: number };
    const errorMessage = error.message || '';

    // First, check if error has explicit code
    if (errorWithCode.code && errorWithCode.code in DALIVE_ERROR_PATTERNS) {
        const pattern = DALIVE_ERROR_PATTERNS[errorWithCode.code as DaLiveErrorCode];
        return {
            code: errorWithCode.code,
            message: errorMessage,
            userMessage: pattern.userMessage,
            recoveryHint: pattern.recoveryHint,
            technicalDetails: `Status: ${errorWithCode.statusCode || 'N/A'}, Message: ${errorMessage}`,
        };
    }

    // Otherwise, match by pattern
    for (const [code, config] of Object.entries(DALIVE_ERROR_PATTERNS)) {
        if (code === 'UNKNOWN') continue;

        for (const pattern of config.patterns) {
            if (pattern.test(errorMessage)) {
                return {
                    code,
                    message: errorMessage,
                    userMessage: config.userMessage,
                    recoveryHint: config.recoveryHint,
                    technicalDetails: `Status: ${errorWithCode.statusCode || 'N/A'}, Message: ${errorMessage}`,
                };
            }
        }
    }

    // Fall back to unknown
    const unknownPattern = DALIVE_ERROR_PATTERNS.UNKNOWN;
    return {
        code: 'UNKNOWN',
        message: errorMessage,
        userMessage: unknownPattern.userMessage,
        recoveryHint: unknownPattern.recoveryHint,
        technicalDetails: `Message: ${errorMessage}`,
    };
}

// ==========================================================
// Helix Error Formatting
// ==========================================================

/**
 * Helix error patterns and their user-friendly messages
 */
const HELIX_ERROR_PATTERNS: Record<
    HelixErrorCode,
    {
        patterns: RegExp[];
        userMessage: string;
        recoveryHint?: string;
    }
> = {
    SERVICE_UNAVAILABLE: {
        patterns: [/503/i, /service unavailable/i, /temporarily unavailable/i],
        userMessage:
            'The Helix configuration service is temporarily unavailable. Please try again in a few minutes.',
        recoveryHint:
            'This is usually a temporary issue. Try again in a few minutes.',
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
        userMessage: 'Could not connect to the Helix service. Please check your internet connection.',
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
    const errorWithCode = error as Error & { code?: string; status?: number };
    const errorMessage = error.message || '';

    // First, check if error has explicit code
    if (errorWithCode.code && errorWithCode.code in HELIX_ERROR_PATTERNS) {
        const pattern = HELIX_ERROR_PATTERNS[errorWithCode.code as HelixErrorCode];
        return {
            code: errorWithCode.code,
            message: errorMessage,
            userMessage: pattern.userMessage,
            recoveryHint: pattern.recoveryHint,
            technicalDetails: `Status: ${errorWithCode.status || 'N/A'}, Message: ${errorMessage}`,
        };
    }

    // Otherwise, match by pattern
    for (const [code, config] of Object.entries(HELIX_ERROR_PATTERNS)) {
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
    const unknownPattern = HELIX_ERROR_PATTERNS.UNKNOWN;
    return {
        code: 'UNKNOWN',
        message: errorMessage,
        userMessage: unknownPattern.userMessage,
        recoveryHint: unknownPattern.recoveryHint,
        technicalDetails: `Message: ${errorMessage}`,
    };
}
