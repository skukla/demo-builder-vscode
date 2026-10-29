/**
 * GitHub write rejections, described for the reader.
 *
 * When GitHub refuses a write (a repository ruleset, push protection finding a
 * secret), its own message names no file and no secret. These turn the refusal
 * into one line the SC reads and a diagnostic block for the Debug Logs.
 */

import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';

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
    const data = (error as GitHubRejection).response?.data;
    // `bypass_placeholders[].token_type` FIRST — that is where push protection puts
    // the secret type. `errors[]` is the fallback for other repository-rule types;
    // reading only it named the file but never the secret, which is most of the
    // value on the one line a reader actually sees.
    const rawDetail =
        data?.metadata?.secret_scanning?.bypass_placeholders?.find((p) => p?.token_type)
            ?.token_type ?? data?.errors?.find((e) => e.message)?.message;
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
