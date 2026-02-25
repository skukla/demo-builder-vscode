import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS, formatMinutes } from '@/core/utils';
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
    constructor(
        private commandManager: CommandExecutor,
        cacheManager?: AuthCacheManager,
        logger?: Logger,
    ) {
        this.logger = logger ?? getLogger();
        this.cacheManager = cacheManager;
    }

    /**
     * Clean CLI output by removing fnm messages
     */
    private cleanCommandOutput(output: string): string {
        return output.trim().split('\n')
            .filter(line =>
                !line.startsWith('Using Node') &&
                !line.includes('fnm') &&
                line.trim().length > 0,
            )
            .join('\n').trim();
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

        // Cache miss or expired, fetch fresh
        const maxRetries = 3;

        // Retry loop with exponential backoff
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Get ENTIRE access_token object (includes both token and expiry)
                // Using --json flag ensures atomic read of both fields
                const cmdResult = await this.commandManager.execute(
                    'aio config get ims.contexts.cli.access_token --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.QUICK },
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
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
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
     * Get current access token
     * @deprecated Use inspectToken() for atomic access to token and expiry
     */
    async getAccessToken(): Promise<string | undefined> {
        const result = await this.inspectToken();
        return result.token;
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
