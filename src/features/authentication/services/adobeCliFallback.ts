/**
 * AdobeCliFallback — the `aio console` CLI half of the SDK-first strategy.
 *
 * Owns everything about running a CLI listing command and turning its output
 * into entities: exit-code validation, the noise-tolerant JSON parse (aio
 * mixes warnings and update notices into stdout), the 401/403 classification
 * (session-expiry vs org-mismatch — with the token-validity check that keeps
 * a valid session from being blamed, 2026-08-17), and the raw-output capture
 * whose LENGTH solved issue #63. It knows nothing about the SDK.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23);
 * the fetcher facade wires one instance into `AdobeEntityReads`.
 *
 * @module features/authentication/services/adobeCliFallback
 */

import { AuthError } from '@/core/errors';
import { getLogger } from '@/core/logging/debugLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { formatDuration } from '@/core/utils/timeFormatting';
import { ErrorCode } from '@/types/errorCodes';
import { parseJSON } from '@/types/typeGuards';

/** The slice of the fetcher config the CLI fallback consults. */
export interface CliFallbackConfig {
    /**
     * Is the Adobe session actually still valid?
     *
     * Consulted before telling a user their session expired. A CLI 401 is matched
     * by substring, and on 2026-08-17 that produced "your session has expired"
     * four seconds after the token manager reported 23h 22m remaining — so the
     * user signed in three times against a problem sign-in could not touch.
     *
     * Optional: without it the old assertion stands, which keeps every existing
     * caller behaving exactly as before.
     */
    isTokenValid?: () => Promise<boolean>;
}

/** Keep only lines that look like JSON content (start with [, ], {, }, or "). */
function jsonLookingLines(output: string): string {
    return output
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return false;
            const firstChar = trimmed[0];
            return (
                firstChar === '[' ||
                firstChar === ']' ||
                firstChar === '{' ||
                firstChar === '}' ||
                firstChar === '"'
            );
        })
        .join('\n');
}

/**
 * Runs `aio console * list` commands and parses their output into entities.
 */
export class AdobeCliFallback {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private config: CliFallbackConfig = {},
    ) {}

    /**
     * Execute CLI fallback and parse JSON response
     */
    async executeCLIFallback<TRaw, TMapped>(
        command: string,
        mapper: (raw: TRaw[]) => TMapped[],
        entityName: string,
        startTime: number,
    ): Promise<TMapped[]> {
        const result = await this.commandManager.execute(command, { encoding: 'utf8' });
        const cliDuration = Date.now() - startTime;

        const isValid = this.validateCLIResult(result, entityName);
        if (!isValid) {
            this.debugLogger.debug(`[Entity Fetcher] No ${entityName} found for organization`);
            return [];
        }

        const parsed = await this.parseCLIResponse<TRaw>(
            result.stdout,
            result.stderr,
            entityName,
            result.code,
        );
        const mapped = mapper(parsed);
        this.debugLogger.debug(
            `[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via CLI in ${formatDuration(cliDuration)}`,
        );
        return mapped;
    }

    /**
     * Validate CLI result exit code
     */
    private validateCLIResult(
        result: { code: number | null; stderr: string },
        entityName: string,
    ): boolean {
        if (result.code === 0 || result.code === 2) return true;
        if (result.stderr?.includes('does not have any projects')) return false;
        throw new Error(`Failed to get ${entityName}: ${result.stderr}`);
    }

    /**
     * Parse and validate CLI JSON response.
     * Strips CLI warning lines (prefixed with ›) that the aio CLI writes to stdout
     * alongside JSON output, which would otherwise break JSON.parse.
     */
    private async parseCLIResponse<TRaw>(
        stdout: string,
        stderr: string,
        entityName: string,
        exitCode?: number | null,
    ): Promise<TRaw[]> {
        const parsed = parseJSON<TRaw[]>(stdout);
        if (parsed && Array.isArray(parsed)) return parsed;

        // Strip non-JSON lines from CLI output. The aio CLI mixes warnings, update
        // notices, and other noise into stdout alongside JSON.
        const retryParsed = parseJSON<TRaw[]>(jsonLookingLines(stdout));
        if (retryParsed && Array.isArray(retryParsed)) return retryParsed;

        // Some CLI versions write JSON to stderr when exit code is 2
        if (stderr) {
            const stderrParsed = parseJSON<TRaw[]>(jsonLookingLines(stderr));
            if (stderrParsed && Array.isArray(stderrParsed)) return stderrParsed;

            if (stderr.includes('401') || stderr.toLowerCase().includes('unauthorized')) {
                // The raw output goes down BEFORE this throws. It used to be logged
                // only at the bottom of this function, which the 401 and 403 paths
                // never reach — so the two failures most worth diagnosing were the
                // two that recorded nothing.
                this.logRawCLIOutput(stdout, stderr, entityName);

                // Only claim expiry if the session really is expired. A valid token
                // plus a CLI 401 means something else — org access, targeting, a
                // transient gateway — and "sign in again" is then the one remedy
                // guaranteed not to help. Jon signed in three times on 2026-08-17
                // while his token had 23 hours left.
                const tokenValid = (await this.config.isTokenValid?.()) ?? false;
                if (!tokenValid) {
                    throw new Error(
                        'AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.',
                    );
                }
                throw new Error(
                    `Adobe refused this request for ${entityName} (401), but your session is ` +
                        'still valid. This usually means the account cannot access the targeted ' +
                        'organization. Check the org selection rather than signing in again.',
                );
            }
            if (stderr.includes('403') || stderr.toLowerCase().includes('forbidden')) {
                this.logRawCLIOutput(stdout, stderr, entityName);
                // Typed, in-app-recoverable error. NO terminal instruction — the UI
                // routes ORG_MISMATCH through ensureOrgContext + a forced sign-in
                // recovery, and agents treat it as non-retryable.
                throw new AuthError(
                    ErrorCode.ORG_MISMATCH,
                    'Adobe CLI is targeting a different organization than this operation needs.',
                    {
                        userMessage:
                            'This operation needs a different Adobe organization. ' +
                            'Select the correct organization to continue.',
                    },
                );
            }
        }

        this.logRawCLIOutput(stdout, stderr, entityName);

        // Nothing parsed AND the CLI exited non-zero: the CLI FAILED, and it said
        // why on stderr. Reporting a "response format" problem here names the wrong
        // layer — it sent two engineers into a decompiled bundle hunting a parser
        // bug that did not exist (issue #63), while the actual error sat unread.
        //
        // Exit code 2 is the case that matters: `validateCLIResult` lets it through
        // deliberately, because some CLI versions put valid JSON on stderr with that
        // code. When the JSON is there we never reach this line; when it is not, the
        // 2 meant failure and the message above is the diagnosis.
        //
        // Reproduced live 2026-08-17: a stale AIO_CONSOLE_ORG_ID gives exit 2, zero
        // bytes of stdout, and the real 403 on stderr.
        const cliError = this.firstMeaningfulLine(stderr);
        if (exitCode !== 0 && cliError) {
            throw new Error(`Failed to get ${entityName}: ${cliError}`);
        }

        throw new Error(`Invalid ${entityName} response format`);
    }

    /**
     * Record what the CLI actually produced.
     *
     * The LENGTH is the load-bearing part: issue #63 was solved by noticing
     * "262144 chars" — a page-aligned truncation — rather than by reading the
     * content. Called from every throwing path, so no failure is unrecorded.
     */
    private logRawCLIOutput(stdout: string, stderr: string, entityName: string): void {
        this.debugLogger.error(
            `[Entity Fetcher] Raw ${entityName} stdout (${stdout.length} chars): ${stdout.substring(0, 500)}`,
        );
        this.debugLogger.error(
            `[Entity Fetcher] Raw ${entityName} stderr (${stderr.length} chars): ${stderr.substring(0, 500)}`,
        );
    }

    /**
     * The line of CLI stderr that states an ERROR, if there is one.
     *
     * The aio CLI prefixes lines with `›` and writes spinner frames starting `-`,
     * so the raw first line is usually "- Getting Projects...". Both are stripped.
     *
     * **Returns undefined when stderr holds only noise.** aio writes update notices
     * to stderr on almost every run, and issue #63's failing logs contain nothing
     * else — exit 2, truncated stdout, and two lines about an available upgrade.
     * Reporting the first line there would blame "@adobe/aio-cli update available"
     * for a truncation bug, which is worse than saying nothing: it looks like a
     * diagnosis and sends the reader somewhere there is nothing to find.
     */
    private firstMeaningfulLine(stderr: string): string | undefined {
        return stderr
            .split('\n')
            .map((line) => line.replace(/^[\s›-]+/, '').trim())
            .filter((line) => line.length > 0)
            .find((line) => /error|failed|forbidden|unauthorized|denied/i.test(line));
    }
}
