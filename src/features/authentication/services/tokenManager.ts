import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { SingleFlight, TIMEOUTS, formatMinutes } from '@/core/utils';
import { sleep } from '@/core/utils/sleep';
import { toAppError, isTimeout } from '@/types/errors';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/**
 * Manages Adobe access tokens
 * Handles token storage, retrieval, and expiry checking
 */
export class TokenManager {
    private logger: Logger;
    private cacheManager: AuthCacheManager | undefined;

    /**
     * Create a TokenManager
     * @param commandManager - Command executor for running CLI commands
     * @param cacheManager - Optional cache manager for token caching
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     */
    /**
     * Shared in-flight token inspection. Distinct from the inspection CACHE, which
     * can only help callers arriving after a fetch has completed.
     */
    private readonly inspectionFlight = new SingleFlight<{
        valid: boolean;
        expiresIn: number;
        token?: string;
    }>();

    constructor(
        private commandManager: CommandExecutor,
        cacheManager?: AuthCacheManager,
        logger?: Logger,
    ) {
        this.logger = logger ?? getLogger();
        this.cacheManager = cacheManager;
    }

    /**
     * Clean CLI output by removing fnm version messages and Adobe CLI warning lines,
     * then extract the JSON object. Adobe CLI sometimes prefixes output with emoji
     * warning lines (e.g. "⚠️ Warning: token expired") that break JSON.parse.
     */
    private cleanCommandOutput(output: string): string {
        const lines = output.trim().split('\n').filter(line => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            if (trimmed.startsWith('Using Node')) return false;
            if (trimmed.includes('fnm')) return false;
            // Adobe CLI warning lines (emoji prefix or text prefix)
            if (trimmed.startsWith('⚠') || trimmed.startsWith('Warning') || trimmed.startsWith('!')) return false;
            return true;
        });

        const joined = lines.join('\n').trim();

        // If the output doesn't start with a JSON value, extract the first JSON object
        if (joined && !joined.startsWith('{') && !joined.startsWith('[') && !joined.startsWith('"')) {
            const match = joined.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (match) return match[0];
        }

        return joined;
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

    /** The uncached, retrying CLI read behind {@link inspectToken}'s single-flight. */
    private async fetchTokenInspection(): Promise<{
        valid: boolean;
        expiresIn: number;
        token?: string;
    }> {
        const maxRetries = 3;

        // Retry loop with exponential backoff
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Get ENTIRE access_token object (includes both token and expiry)
                // Using --json flag ensures atomic read of both fields
                const cmdResult = await this.commandManager.execute(
                    'aio config get ims.contexts.cli.access_token --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_VALIDATION },
                );

                if (cmdResult.code !== 0 || !cmdResult.stdout) {
                    this.logger.debug('[Token] No access token found in CLI config');
                    return { valid: false, expiresIn: 0 };
                }

                // Clean output (remove fnm/node version warnings)
                const cleanOutput = this.cleanCommandOutput(cmdResult.stdout);

                // Parse the JSON object {token: "...", expiry: 123456789}
                let tokenData: { token?: string; expiry?: number };
                try {
                    tokenData = JSON.parse(cleanOutput);
                } catch (parseError) {
                    this.logger.warn(`[Token] Failed to parse token config as JSON: ${toError(parseError).message}`);
                    return { valid: false, expiresIn: 0 };
                }

                const token = tokenData.token;
                const expiry = tokenData.expiry || 0;
                const now = Date.now();

                // CORRUPTION DETECTION (beta.42): expiry=0 indicates corrupted state
                if (token && token.length > 100 && expiry === 0) {
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

                const result = { valid: true, expiresIn, token };

                // Cache the successful result (if cacheManager available)
                if (this.cacheManager) {
                    this.cacheManager.setCachedTokenInspection(result);
                }

                return result;
            } catch (error) {
                const appError = toAppError(error);

                // Check if it's a timeout error that should be retried
                const isTimeoutError = isTimeout(appError);

                if (isTimeoutError && attempt < maxRetries) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const backoffMs = TIMEOUTS.TOKEN_RETRY_BASE * Math.pow(2, attempt - 1);
                    this.logger.warn(`[Token] Timeout on attempt ${attempt}/${maxRetries}, retrying in ${backoffMs}ms...`);
                    await sleep(backoffMs);
                    continue; // Retry
                }

                // Non-timeout error or max retries reached
                if (attempt === maxRetries) {
                    this.logger.warn(`[Token] Failed after ${maxRetries} attempts: ${appError.userMessage}`);
                } else {
                    this.logger.warn(`[Token] Non-timeout error on attempt ${attempt}, giving up: ${appError.userMessage}`);
                }

                return { valid: false, expiresIn: 0 };
            }
        }

        // Should never reach here, but TypeScript requires a return
        this.logger.error('[Token] Unexpected: retry loop completed without return');
        return { valid: false, expiresIn: 0 };
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
