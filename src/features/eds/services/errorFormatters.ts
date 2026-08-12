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
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';

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
 * A repository ruleset rejected the write. `GH013` covers EVERY ruleset rule —
 * push protection, file-path restrictions, file-size limits, required signatures,
 * commit-message patterns — so this alone does NOT mean a secret was involved.
 */
const RULESET_REJECTION_PATTERNS = [/repository rule violations/i, /GH013/];

/** The subset that means push protection specifically found a secret. */
const SECRET_BLOCK_PATTERNS = [/secret detected in content/i, /push protection/i];

/** Longest detail we quote from GitHub into a log the user may paste into a ticket. */
const MAX_DETAIL_LENGTH = 200;

/**
 * Describe a push-protection rejection, naming the file that caused it.
 *
 * GitHub's own message names no file: a rejected write reads only "Repository
 * rule violations found / Secret detected in content". The pipeline pushes eight
 * different files, so that message cannot tell the reader which one was refused —
 * a real 2026-08-11 report ended with the reporter asking an AI what the error
 * meant. The path is known at the call site; this puts it in the message.
 *
 * Returns undefined for anything that is not a push-protection rejection. That
 * matters more than it looks: GitHub also returns 422 for a stale-SHA conflict on
 * update, which has an entirely different remedy, so detection keys on the message
 * rather than the status.
 *
 * @param error - The error octokit raised
 * @param path - Repo-relative path of the file being written
 * @returns An actionable message, or undefined when this is a different failure
 */
/**
 * Whether a GitHub error or git stderr is a repository-ruleset rejection.
 *
 * Shared by the API path ({@link describePushProtectionBlock}) and the CLI-git
 * push path, which both have to distinguish this from an ordinary rejection —
 * `git push` prints `! [remote rejected] … (push declined due to repository rule
 * violations)`, which reads as a non-fast-forward unless you look for the ruleset
 * markers first. One copy of the patterns, because two would drift.
 *
 * @param text - An error message or git stderr
 * @returns True when a repository ruleset refused the write
 */
export function isRulesetRejection(text: string): boolean {
    return RULESET_REJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Cap on the whole diagnostic block — it goes to the debug log, not a report. */
const MAX_DIAGNOSTIC_LENGTH = 1200;

/**
 * Everything GitHub said about a refused write, for the debug log.
 *
 * WHY this exists rather than just the tidy one-line message: on 2026-08-11 a
 * write was refused with "Repository rule violations found / Secret detected in
 * content" and nobody could establish WHY. Three reproduction attempts failed —
 * a fake PAT and a real RSA private key were both accepted on a public repo with
 * push protection enabled — which means the block came from policy on the
 * reporter's account (custom scanning patterns or an org ruleset) and cannot be
 * triggered anywhere else. When a failure only happens on someone else's
 * machine, the response body is the only evidence that will ever exist, and the
 * extension was discarding all of it: `data.message`, `documentation_url`, and
 * every entry in `errors[]` beyond the first.
 *
 * Emits nothing when there is no body to report, so ordinary network failures
 * stay quiet.
 *
 * Every field is sanitized and the whole block is capped: this lands in the
 * exportable debug log, which users paste into tickets.
 *
 * @param error - The error octokit raised
 * @returns A multi-line diagnostic block, or '' when there is nothing to add
 */
/** The parts of a GitHub error response this module reads. */
interface GitHubRejection {
    status?: number;
    response?: {
        headers?: Record<string, string>;
        data?: {
            message?: string;
            documentation_url?: string;
            errors?: { resource?: string; message?: string }[];
            /**
             * Where push protection ACTUALLY puts the useful fields. Captured
             * 2026-08-11 by reproducing a block on a throwaway repo; the first
             * version of this code read `errors[]`, which GitHub does not populate
             * for push protection, so it logged the generic message and dropped the
             * only two facts that identify the secret.
             */
            metadata?: {
                secret_scanning?: {
                    bypass_placeholders?: { placeholder_id?: string; token_type?: string }[];
                };
            };
        };
    };
}

type Cleaner = (value: unknown) => string;

/**
 * The two facts that identify the secret: `token_type` names it (e.g.
 * SLACK_WEBHOOK) and `placeholder_id` is what the "Create a push protection
 * bypass" endpoint requires. Both live here and nowhere else in the payload.
 */
function describeDetectedSecrets(
    data: NonNullable<NonNullable<GitHubRejection['response']>['data']>,
    clean: Cleaner,
): string[] {
    const out: string[] = [];
    for (const ph of data.metadata?.secret_scanning?.bypass_placeholders ?? []) {
        const type = clean(ph?.token_type);
        const id = clean(ph?.placeholder_id);
        if (type || id) {
            out.push(`  detected: ${type || 'unknown type'}${id ? ` (bypass id ${id})` : ''}`);
        }
    }
    return out;
}

/**
 * EVERY `errors[]` entry — the first is often a generic summary and the
 * informative one sits behind it. Empty for push protection; populated for other
 * repository-rule types.
 */
function describeRuleErrors(
    data: NonNullable<NonNullable<GitHubRejection['response']>['data']>,
    clean: Cleaner,
): string[] {
    const out: string[] = [];
    for (const [i, entry] of (data.errors ?? []).entries()) {
        const detail = clean(entry?.message);
        if (detail) {
            out.push(`  errors[${i}]${entry?.resource ? ` (${entry.resource})` : ''}: ${detail}`);
        }
    }
    return out;
}

export function describeRejectionDiagnostics(error: unknown): string {
    const err = error as GitHubRejection | null;
    const data = err?.response?.data;
    if (!data) return '';

    const clean = (v: unknown): string =>
        typeof v === 'string' ? sanitizeErrorForLogging(v).slice(0, MAX_DETAIL_LENGTH) : '';

    const lines: string[] = [];
    if (err?.status) lines.push(`  status: ${err.status}`);
    // The request id is what GitHub Support asks for first.
    const requestId = err?.response?.headers?.['x-github-request-id'];
    if (requestId) lines.push(`  request-id: ${clean(requestId)}`);
    if (data.message) lines.push(`  message: ${clean(data.message)}`);
    if (data.documentation_url) lines.push(`  docs: ${clean(data.documentation_url)}`);
    lines.push(...describeDetectedSecrets(data, clean), ...describeRuleErrors(data, clean));

    if (lines.length === 0) return '';
    return `GitHub rejection detail:\n${lines.join('\n')}`.slice(0, MAX_DIAGNOSTIC_LENGTH);
}

export function describePushProtectionBlock(error: unknown, path: string): string | undefined {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!isRulesetRejection(message)) {
        return undefined;
    }

    // GitHub names the secret type in `errors[].message` when it recognises one.
    // Sanitized and capped: this string is GitHub-controlled, it lands in the
    // exportable debug log verbatim, and its multi-line form would otherwise let a
    // `\n[ERROR] …` line forge log entries. `sanitizeErrorForLogging` keeps the
    // first line — the secret TYPE — and drops the locations block behind it.
    const response = (error as { response?: { data?: { errors?: { message?: string }[] } } })
        .response;
    const rawDetail = response?.data?.errors?.find((e) => e.message)?.message;
    const detail = rawDetail
        ? sanitizeErrorForLogging(rawDetail).slice(0, MAX_DETAIL_LENGTH)
        : undefined;

    // Only claim "secret" when GitHub said so. A file-size or path-restriction
    // rejection reported as a secret sends the reader hunting for one that does not
    // exist — worse than the anonymous message this replaces, because it is
    // confidently wrong.
    const isSecretBlock =
        SECRET_BLOCK_PATTERNS.some((pattern) => pattern.test(message)) ||
        /secret/i.test(detail ?? '');

    const cause = isSecretBlock
        ? 'push protection detected a secret in the content'
        : "the repository's rules rejected the content";

    // No pointer to Security → Secret scanning: a BLOCKED push creates no alert
    // there, so that page is empty and the reader is sent to a dead end. GitHub's
    // own detail above is the evidence.
    return (
        `GitHub blocked writing ${path} — ${cause}` +
        (detail ? `: ${detail}` : '') +
        '. Nothing was written.'
    );
}

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
        userMessage: 'Could not connect to DA.live. The connection timed out or was interrupted.',
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
