// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import * as sdk from '@adobe/aio-lib-console';
// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import { getToken } from '@adobe/aio-lib-ims';
import { getLogger, Logger } from '@/shared/logging';
import { validateAccessToken } from '@/shared/validation';
import { TIMEOUTS } from '@/utils/timeoutConfig';

/**
 * Manages Adobe Console SDK client for high-performance operations
 * Provides 30x faster operations compared to pure CLI approach
 * Falls back to CLI if SDK initialization fails
 */
export class AdobeSDKClient {
    private debugLogger = getLogger();
    // Adobe SDK lacks TypeScript declarations, use unknown for type safety
    private sdkClient: unknown | undefined = undefined;

    constructor(private logger: Logger) {}

    /**
     * Check if SDK is initialized
     */
    isInitialized(): boolean {
        return this.sdkClient !== undefined;
    }

    /**
     * Get SDK client instance
     */
    getClient(): unknown | undefined {
        return this.sdkClient;
    }

    /**
     * Ensure SDK is initialized and ready for use
     * Waits for SDK initialization if in progress
     * Returns true if SDK is available, false if fallback to CLI needed
     */
    async ensureInitialized(): Promise<boolean> {
        // Already initialized
        if (this.sdkClient) {
            this.debugLogger.debug('[Auth SDK] SDK already initialized');
            return true;
        }

        // Not initialized, do it now (blocking)
        this.debugLogger.debug('[Auth SDK] Ensuring SDK is initialized...');
        await this.initialize();

        return this.sdkClient !== undefined;
    }

    /**
     * Initialize Adobe Console SDK client for high-performance operations
     * Called after successful authentication to enable SDK-based operations
     * Falls back to CLI if SDK initialization fails
     */
    async initialize(): Promise<void> {
        try {
            if (this.sdkClient) {
                this.debugLogger.debug('[Auth SDK] SDK client already initialized');
                return;
            }

            this.debugLogger.debug('[Auth SDK] Initializing Adobe Console SDK...');

            // Get CLI access token with timeout protection
            const accessToken = await Promise.race([
                getToken('cli'),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('SDK token fetch timed out')), TIMEOUTS.SDK_INIT),
                ),
            ]) as string;

            if (!accessToken) {
                this.debugLogger.debug('[Auth SDK] No access token available, skipping SDK initialization');
                return;
            }

            // SECURITY: Validate access token before using it
            try {
                validateAccessToken(accessToken);
            } catch (validationError) {
                this.debugLogger.error('[Auth SDK] Invalid access token format', validationError as Error);
                this.sdkClient = undefined;
                return;
            }

            // Initialize SDK with CLI token
            this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');

            this.debugLogger.debug('[Auth SDK] SDK initialized successfully - enabling 30x faster operations');
            this.logger.info('[Auth] Enabled high-performance mode for Adobe operations');

        } catch (error) {
            // SDK initialization failure is not critical - we'll fall back to CLI
            this.debugLogger.debug('[Auth SDK] Failed to initialize SDK, will use CLI fallback:', error);
            this.sdkClient = undefined;
        }
    }

    /**
     * Clear SDK client (force re-initialization on next use)
     */
    clear(): void {
        this.sdkClient = undefined;
        this.debugLogger.debug('[Auth SDK] Cleared SDK client');
    }
}
