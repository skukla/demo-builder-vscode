import * as aioConfig from '@adobe/aio-lib-core-config';
import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import type { RejectedTokens } from './rejectedTokens';
import { getLogger } from '@/core/logging/debugLogger';
import { SingleFlight } from '@/core/utils/singleFlight';
import { formatMinutes } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** The stored CLI token, as `aio` writes it. */
export interface StoredTokenConfig {
    token?: string;
    expiry?: number;
}

/**
 * Reads the `aio` CLI's stored token.
 *
 * Injectable so tests drive the parsing and expiry rules directly, with no
 * subprocess AND no dependence on whatever is in the developer's real
 * `~/.config/aio`. The previous design injected a whole `CommandExecutor` for
 * this one read, which meant every test had to fake CLI stdout — including its
 * fnm warnings and emoji noise — to exercise a date comparison.
 */
export type TokenConfigReader = () => StoredTokenConfig | undefined;

/**
 * The real read: the same library, and the same key, the CLI itself uses.
 *
 * `reload()` first, every time, because the library caches the parsed config in
 * memory and reloads only when it holds nothing (`Config.js`: `this.values ||
 * this.reload()`). Without it the first read of the session is the ONLY read of
 * the file — and `aio login` writes that file from another process, so a
 * successful sign-in was invisible here: the check that follows it re-inspected
 * the expired snapshot, said `expiresIn=-15 min`, and sent the user back to the
 * browser. Three logins in a row in the 2026-08-17 log, all "successful".
 *
 * Exported so the reload is under test. It is the default argument of a
 * `TokenConfigReader` parameter, and every other test injects past it.
 */
export const readStoredTokenConfig: TokenConfigReader = () => {
    try {
        aioConfig.reload();
    } catch {
        // Serve whatever the library already holds. A stale token is a poor
        // answer; throwing is a worse one, because the caller reads a throw as
        // "not signed in" and offers a login that cannot fix an unreadable file.
    }
    return aioConfig.get('ims.contexts.cli.access_token') as StoredTokenConfig | undefined;
};

/**
 * Manages Adobe access tokens
 * Handles token storage, retrieval, and expiry checking
 */
export class TokenManager {
    private logger: Logger;
    private cacheManager: AuthCacheManager | undefined;

    /**
     * Shared in-flight token inspection. Distinct from the inspection CACHE, which
     * can only help callers arriving after a fetch has completed.
     */
    private readonly inspectionFlight = new SingleFlight<{
        valid: boolean;
        expiresIn: number;
        token?: string;
    }>();

    /**
     * Create a TokenManager.
     *
     * The first parameter used to be a `CommandExecutor`, for the sole purpose of
     * spawning `aio config get`. That read is now in-process, so the executor is
     * gone rather than kept and ignored.
     *
     * @param cacheManager - Optional cache manager for token caching
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     * @param readTokenConfig - Optional reader override; tests inject a fake store
     * @param rejected - The tokens Adobe refused this session (walk F247): one of them is signed out
     */
    constructor(
        cacheManager?: AuthCacheManager,
        logger?: Logger,
        private readonly readTokenConfig: TokenConfigReader = readStoredTokenConfig,
        private readonly rejected?: RejectedTokens,
    ) {
        this.logger = logger ?? getLogger();
        this.cacheManager = cacheManager;
    }

    /**
     * Inspect token atomically to prevent race condition (with caching)
     * CRITICAL FIX (beta.42): Fetches entire access_token object in one call
     * to prevent token/expiry mismatch that causes authentication failures.
     *
     * PERFORMANCE FIX: Retries on timeout with exponential backoff (max 3 attempts)
     * to handle transient failures without failing the entire authentication flow.
     *
     * PERFORMANCE FIX: Caches inspection results via AuthCacheManager (2-minute TTL with jitter)
     * Prevents redundant 4-second Adobe CLI calls when token was recently verified
     */
    async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
        // Check cache first (if cacheManager available)
        if (this.cacheManager) {
            const cached = this.cacheManager.getCachedTokenInspection();
            if (cached) {
                return cached;
            }
        }

        // The fetch below spawns the whole `aio` Node CLI (~3.7s of process start +
        // module load) to read one config value. The cache only helps callers
        // arriving AFTER it completes; concurrent cold-cache callers would each spawn
        // their own CLI, and there are 8 isAuthenticated() call sites in the
        // dashboard/creation handlers. Preventive — the sibling org-list path was
        // observed stampeding (2026-07-31) while this one happened to serialise.
        return this.inspectionFlight.run(() => this.fetchTokenInspection());
    }

    /**
     * The uncached read behind {@link inspectToken}'s single-flight.
     *
     * Reads the CLI's config IN PROCESS. This used to run
     * `aio config get ims.contexts.cli.access_token --json` as a subprocess,
     * which MEASURED 2.05s (twice, consistent) to read one value — the whole
     * `aio` Node CLI starting and loading its modules. The in-process read is
     * 20ms including cold module load, and returns a byte-identical token and
     * expiry (controlled against the CLI on 2026-08-17).
     *
     * Reported symptom: reset's second prompt took 2-3s to appear even after the
     * credential lookup was moved ahead of the first modal — the wait was longer
     * than the modal was open. `isAuthenticated` has eight call sites in the
     * dashboard and creation handlers, and its own `⚠️ SLOW` warnings came from
     * the same subprocess.
     *
     * `@adobe/aio-lib-core-config` is the library the CLI itself uses, so this is
     * the same read rather than a reimplementation of it. Parsing the file by
     * hand is deliberately NOT an option: `~/.config/aio` is HJSON, a format this
     * repo does not own.
     *
     * Three things went away with the subprocess, and none is a behaviour change:
     * the retry-with-backoff loop (nothing to time out), the fnm/emoji output
     * cleaning (no stdout to clean), and JSON.parse of that output. What is KEPT
     * is every semantic rule — corruption detection, the length floor, the expiry
     * comparison and the cache write.
     */
    private async fetchTokenInspection(): Promise<{
        valid: boolean;
        expiresIn: number;
        token?: string;
    }> {
        let tokenData: { token?: string; expiry?: number } | undefined;
        try {
            tokenData = this.readTokenConfig();
        } catch (error) {
            // A config store that cannot be read is "not signed in", the same
            // answer the failed subprocess gave. It is not worth a stack trace in
            // a channel users paste into tickets.
            this.logger.warn(`[Token] Could not read the CLI config: ${toError(error).message}`);
            return { valid: false, expiresIn: 0 };
        }

        // An expired token is answered as signed out, and the caller's Sign In
        // prompt takes over. There is deliberately no silent refresh: the CLI's
        // tokens belong to Adobe's `aio-cli-console-auth` app, and IMS refuses a
        // refresh-token exchange for it without the app's client secret, which
        // only Adobe's login service holds (measured 2026-11-15: `invalid
        // client_id`, then `invalid client_secret` with the token's own id). The
        // exchange that lived here failed on every call from 2026-09-02 until it
        // was removed. The library call that DOES renew, `getToken`, gets there by
        // opening a browser, which a background check must never do.
        const verdict = this.classifyStoredToken(tokenData);
        // Adobe refused this token though it has time left (walk F247): signed out, so Sign In
        // takes over instead of every action failing behind a "signed in".
        if (verdict.valid && verdict.token && this.rejected?.has(verdict.token)) {
            this.logger.debug('[Token] Adobe refused this sign-in; answering signed out');
            return { valid: false, expiresIn: verdict.expiresIn };
        }
        if (verdict.valid) {
            this.cacheManager?.setCachedTokenInspection(verdict);
        }
        return verdict;
    }

    /** Classify one stored token by the semantic rules (corruption, length, expiry). */
    private classifyStoredToken(tokenData: StoredTokenConfig | undefined): {
        valid: boolean;
        expiresIn: number;
        token?: string;
    } {
        if (!tokenData) {
            this.logger.debug('[Token] No access token found in CLI config');
            return { valid: false, expiresIn: 0 };
        }

        const token = tokenData.token;
        const expiry = tokenData.expiry || 0;
        const now = Date.now();

        // CORRUPTION DETECTION (beta.42): expiry=0 indicates corrupted state.
        // The floor is the same `>= 100` the length check below applies, so
        // every token long enough to be real is also long enough to be corrupt.
        if (token && token.length >= 100 && expiry === 0) {
            this.logger.warn('[Token] CORRUPTION DETECTED: Token present but expiry=0');

            // Format user-friendly corruption message
            const formatted = AuthenticationErrorFormatter.formatError(
                new Error('Token corruption: expiry=0'),
                { operation: 'token-validation' },
            );

            this.logger.error(`[Token] ${formatted.message}`);
            this.logger.trace(formatted.technical);

            return { valid: false, expiresIn: 0, token };
        }

        // Validate token length
        if (!token || token.length < 100) {
            this.logger.debug(`[Token] Invalid token length: ${token?.length || 0}`);
            return { valid: false, expiresIn: 0 };
        }

        // Check expiry
        if (!expiry || expiry <= now) {
            const expiresIn = expiry > 0 ? Math.floor((expiry - now) / 1000 / 60) : 0;
            this.logger.debug(`[Token] Token expired or invalid: expiresIn=${expiresIn} min`);
            return { valid: false, expiresIn, token };
        }

        const expiresIn = Math.floor((expiry - now) / 1000 / 60);
        if (expiry <= now + TIMEOUTS.AUTH.CLI_MIN_TOKEN_LIFE) {
            // The CLI would sign in through the browser for this token, unasked.
            this.logger.debug(
                `[Token] Token expires in ${formatMinutes(expiresIn)}, too soon for the Adobe CLI`,
            );
            return { valid: false, expiresIn, token };
        }
        this.logger.debug(`[Token] Token valid, expires in ${formatMinutes(expiresIn)}`);

        // Caching is the caller's job (fetchTokenInspection), so this stays a
        // pure verdict.
        return { valid: true, expiresIn, token };
    }

    /**
     * Check if token is valid and not expired
     * Uses atomic token inspection to prevent race conditions
     */
    /**
     * Adobe refused the stored token (walk F247): remember it, and forget the cached "signed in".
     */
    markStoredTokenRejected(): void {
        let token: string | undefined;
        try {
            token = this.readTokenConfig()?.token;
        } catch {
            return;
        }
        if (!token || !this.rejected) return;
        this.rejected.mark(token);
        this.cacheManager?.clearTokenInspectionCache();
        this.cacheManager?.clearAuthStatusCache();
        this.logger.warn('[Token] Adobe no longer accepts the stored sign-in; it counts as signed out until a new one');
    }

    async isTokenValid(): Promise<boolean> {
        const inspection = await this.inspectToken();
        return inspection.valid;
    }
}
