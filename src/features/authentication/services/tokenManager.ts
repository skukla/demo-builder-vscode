import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS, formatMinutes } from '@/core/utils';
import { toAppError, isTimeout } from '@/types/errors';
import { toError } from '@/types/typeGuards';

/**
 * Manages Adobe access tokens
 * Handles token storage, retrieval, and expiry checking
 */
export class TokenManager {
    private logger = getLogger();
    private cacheManager: AuthCacheManager | undefined;

    constructor(
        private commandManager: CommandExecutor,
        cacheManager?: AuthCacheManager,
    ) {
        // Use provided cacheManager, or try to get from ServiceLocator
        if (cacheManager) {
            this.cacheManager = cacheManager;
        } else {
            // Attempt to get shared cache from AuthenticationService via ServiceLocator
            this.cacheManager = this.getSharedCacheManager();
        }
    }

    /**
     * Get shared cache manager from ServiceLocator
     * Allows all TokenManager instances to use the same cache
     */
    private getSharedCacheManager(): AuthCacheManager | undefined {
        try {
            // Dynamic import to avoid circular dependency at module load time
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { ServiceLocator } = require('@/core/di');
            const authService = ServiceLocator.getAuthenticationService();
            return authService.getCacheManager();
        } catch {
            // ServiceLocator not initialized yet, or AuthenticationService not registered
            // This is OK - caching will be disabled for this instance
            this.logger.debug('[Token] Shared cache not available, caching disabled');
            return undefined;
        }
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
        let _lastError: Error | null = null;

        // Retry loop with exponential backoff
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Get ENTIRE access_token object (includes both token and expiry)
                // Using --json flag ensures atomic read of both fields
                const cmdResult = await this.commandManager.execute(
                    'aio config get ims.contexts.cli.access_token --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ },
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
                _lastError = toError(error);
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
     * Get token expiry timestamp
     * @deprecated Use inspectToken() for atomic access to token and expiry
     */
    async getTokenExpiry(): Promise<number | undefined> {
        try {
            const result = await this.commandManager.execute(
                'aio config get ims.contexts.cli.access_token.expiry',
                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ },
            );

            if (result.code !== 0 || !result.stdout) {
                return undefined;
            }

            const expiryOutput = this.cleanCommandOutput(result.stdout);
            const expiry = parseInt(expiryOutput);
            return isNaN(expiry) ? undefined : expiry;
        } catch (error) {
            this.logger.error('[Token] Failed to get token expiry', error as Error);
            return undefined;
        }
    }

    /**
     * Check if token is valid and not expired
     * Uses atomic token inspection to prevent race conditions
     */
    async isTokenValid(): Promise<boolean> {
        const inspection = await this.inspectToken();
        return inspection.valid;
    }

    /**
     * Verify that Adobe CLI successfully stored the token
     * This method reads back the token to ensure it's available
     *
     * Use this after 'aio auth login' to verify Adobe CLI stored the token correctly.
     * This is the preferred pattern - let Adobe CLI manage tokens, extension verifies.
     *
     * @param expectedToken - Token returned from 'aio auth login' stdout
     * @returns true if token is stored and matches, false otherwise
     */
    async verifyTokenStored(expectedToken: string): Promise<boolean> {
        try {
            const inspection = await this.inspectToken();

            if (!inspection.valid) {
                this.logger.warn('[Token] Verification failed: token not valid');
                return false;
            }

            if (!inspection.token) {
                this.logger.warn('[Token] Verification failed: token not found in CLI config');
                return false;
            }

            // Verify token matches what Adobe CLI returned
            if (inspection.token !== expectedToken) {
                this.logger.warn('[Token] Verification failed: token mismatch');
                this.logger.trace('[Token] Expected length:', expectedToken.length);
                this.logger.trace('[Token] Stored length:', inspection.token.length);
                return false;
            }

            this.logger.debug('[Token] Verification successful: Adobe CLI stored token correctly');
            return true;
        } catch (error) {
            this.logger.error('[Token] Verification failed with error', error as Error);
            return false;
        }
    }

}
