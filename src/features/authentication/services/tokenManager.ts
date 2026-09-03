import * as aioConfig from '@adobe/aio-lib-core-config';
import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import { getLogger } from '@/core/logging/debugLogger';
import { withTimeout } from '@/core/utils/promiseUtils';
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
 * Attempt a SILENT IMS token refresh; resolves the refreshed stored token, or
 * undefined when no refresh is possible (no refresh credentials, network down).
 * Injectable for the same reason as {@link TokenConfigReader}.
 */
export type SilentTokenRefresh = () => Promise<StoredTokenConfig | undefined>;

/**
 * How much life a stored token needs before it counts as usable: ten minutes,
 * the same floor `aio-lib-ims`'s own `getTokenIfValid` applies.
 */
const IMS_TOKEN_VALIDITY_FLOOR_MS = 10 * 60 * 1000;

/**
 * The real refresh: the refresh-token exchange the `aio` CLI performs on every
 * invocation, which is why the CLI never asks anyone to re-login while this
 * extension did. With a live refresh token it mints a new access token and
 * persists it exactly where the CLI looks for it.
 *
 * Measured 2026-08-27: with the stored access token 30+ minutes expired, the
 * context still held a refresh token valid for ~14 DAYS, and the exchange
 * restored the session in ~2s with no interaction — while the extension,
 * reading only the stored expiry, declared the user signed out and parked a
 * deploy on a Sign In prompt nobody saw. The owner's question was "why would
 * I need to log in?", and the answer was: you didn't.
 *
 * WHY THIS CALLS THE EXCHANGE AND NOT `getToken`. It used to call
 * `getToken('cli')` behind a precheck on the LOCAL refresh-token expiry, and
 * a comment here called that precheck load-bearing. A local expiry is a CLAIM,
 * not proof: when IMS rejects a refresh token the machine still believes in
 * (revoked, org changed, password reset), `getToken`'s chain falls through to
 * `_generateToken`, which runs the login plugins and OPENS A BROWSER. On
 * 2026-09-02 that is what a project-load auth check did — an unrequested
 * sign-in page, with no prompt in front of it. Read out of the library's own
 * `src/token-helper.js`; the fallback cannot be switched off by any option.
 *
 * So the middle step is called on its own. `Ims#getAccessToken` with a refresh
 * token does exactly the silent exchange and REJECTS instead of escalating to
 * a human. A rejection returns undefined, and the caller's prompt path takes
 * over — the human chooses, from a notification they can see.
 *
 * Dynamic import: aio-lib-ims is heavy and this path runs only when the
 * stored token is already unusable.
 */
export const refreshStoredToken: SilentTokenRefresh = async () => {
    const ims = await import('@adobe/aio-lib-ims');
    const stored = await ims.context.get('cli');
    const config = stored?.data;
    const refreshToken = config?.refresh_token;

    // The library's own validity floor (`getTokenIfValid`): a token counts as
    // usable only with at least ten minutes left. Matching it means this decides
    // the same way the CLI would, rather than sending a nearly-dead token to IMS.
    const refreshable =
        typeof refreshToken?.token === 'string' &&
        (refreshToken.expiry ?? 0) > Date.now() + IMS_TOKEN_VALIDITY_FLOOR_MS;
    if (!config || !refreshable) {
        return undefined;
    }

    const minted = await new ims.Ims(config.env).getAccessToken(
        refreshToken.token as string,
        config.client_id,
        config.client_secret,
        config.scope,
    );
    if (typeof minted?.access_token?.token !== 'string') {
        return undefined;
    }

    // Persist the way the library's `_persistTokens` does, so the CLI and every
    // later read of the stored config see the refreshed token instead of
    // re-exchanging on each check. A rotated refresh token is written too when
    // IMS returned one; failing to store either is not worth failing the refresh
    // that already succeeded.
    try {
        await ims.context.set('cli.access_token', minted.access_token, stored?.local);
        if (minted.refresh_token) {
            await ims.context.set('cli.refresh_token', minted.refresh_token, stored?.local);
        }
    } catch {
        // Left unstored: the caller still gets the live token for this session.
    }
    return minted.access_token;
};

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
     */
    constructor(
        cacheManager?: AuthCacheManager,
        logger?: Logger,
        private readonly readTokenConfig: TokenConfigReader = readStoredTokenConfig,
        private readonly silentRefresh: SilentTokenRefresh = refreshStoredToken,
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

        const first = this.classifyStoredToken(tokenData);
        if (first.valid) {
            this.cacheManager?.setCachedTokenInspection(first);
            return first;
        }

        // An unusable stored token is NOT "signed out" yet: the aio CLI itself
        // silently refreshes via the context's stored refresh credentials on
        // every run, which is why `aio` never re-prompts while this read did
        // (a deploy parked on a Sign In prompt for a token the library could
        // revive — 2026-08-27). Ask the library before asking a human.
        const refreshed = await this.trySilentRefresh();
        if (!refreshed) {
            return first;
        }
        const second = this.classifyStoredToken(refreshed);
        if (second.valid) {
            this.logger.info('[Token] Silent IMS refresh restored the session');
            this.cacheManager?.setCachedTokenInspection(second);
            return second;
        }
        return first;
    }

    /** The refresh attempt, timeout-bound so it can never become the next hang. */
    private async trySilentRefresh(): Promise<StoredTokenConfig | undefined> {
        try {
            this.logger.info('[Token] Stored token unusable — attempting silent IMS refresh…');
            return await withTimeout(this.silentRefresh(), {
                timeoutMs: TIMEOUTS.NORMAL,
                timeoutMessage: 'IMS silent refresh timed out',
            });
        } catch (error) {
            this.logger.debug(`[Token] Silent refresh unavailable: ${toError(error).message}`);
            return undefined;
        }
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
        this.logger.debug(`[Token] Token valid, expires in ${formatMinutes(expiresIn)}`);

        // Caching is the CALLER's job (fetchTokenInspection): classify runs on
        // both the stored and the refreshed token, and only the accepted one
        // may land in the cache.
        return { valid: true, expiresIn, token };
    }

    /**
     * Check if token is valid and not expired
     * Uses atomic token inspection to prevent race conditions
     */
    async isTokenValid(): Promise<boolean> {
        const inspection = await this.inspectToken();
        return inspection.valid;
    }
}
