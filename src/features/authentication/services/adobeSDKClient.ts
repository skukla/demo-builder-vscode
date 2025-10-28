// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import * as sdk from '@adobe/aio-lib-console';
import { getLogger, Logger } from '@/core/logging';
import { validateAccessToken } from '@/core/validation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Manages Adobe Console SDK client for high-performance operations
 * Provides 30x faster operations compared to pure CLI approach
 * Falls back to CLI if SDK initialization fails
 *
 * PERFORMANCE FIX: Singleton promise pattern prevents concurrent SDK initializations
 * Multiple calls to initialize() will reuse the in-flight promise
 */
export class AdobeSDKClient {
    private debugLogger = getLogger();
    // Adobe SDK lacks TypeScript declarations, use unknown for type safety
    private sdkClient: unknown | undefined = undefined;
    // PERFORMANCE FIX: Track in-flight initialization to prevent concurrent calls
    private sdkInitPromise: Promise<void> | null = null;

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
     *
     * PERFORMANCE FIX: Reuses in-flight initialization promise to prevent concurrent calls
     * If multiple callers request SDK init simultaneously, they all wait for the same promise
     */
    async ensureInitialized(): Promise<boolean> {
        // Already initialized
        if (this.sdkClient) {
            this.debugLogger.debug('[Auth SDK] SDK already initialized');
            return true;
        }

        // PERFORMANCE FIX: If initialization is in flight, wait for it
        if (this.sdkInitPromise) {
            this.debugLogger.debug('[Auth SDK] SDK initialization in progress, waiting for completion...');
            await this.sdkInitPromise;
            return this.sdkClient !== undefined;
        }

        // Not initialized and not in flight, start now (blocking)
        this.debugLogger.debug('[Auth SDK] Ensuring SDK is initialized...');
        await this.initialize();

        return this.sdkClient !== undefined;
    }

    /**
     * Initialize Adobe Console SDK client for high-performance operations
     * Called after successful authentication to enable SDK-based operations
     * Falls back to CLI if SDK initialization fails
     *
     * PERFORMANCE FIX: Singleton promise pattern prevents concurrent initializations
     * If called while initialization is in flight, waits for existing initialization
     */
    async initialize(): Promise<void> {
        // PERFORMANCE FIX: If initialization is in flight, wait for it
        if (this.sdkInitPromise) {
            this.debugLogger.debug('[Auth SDK] SDK initialization already in progress, waiting...');
            return this.sdkInitPromise;
        }

        // Already initialized
        if (this.sdkClient) {
            this.debugLogger.debug('[Auth SDK] SDK client already initialized');
            return;
        }

        // Start initialization and track the promise
        this.sdkInitPromise = this.doInitialize();

        try {
            await this.sdkInitPromise;
        } finally {
            // Clear the promise once done (success or failure)
            this.sdkInitPromise = null;
        }
    }

    /**
     * Internal initialization logic
     * Separated to allow promise tracking in initialize()
     */
    private async doInitialize(): Promise<void> {
        try {
            this.debugLogger.debug('[Auth SDK] Initializing Adobe Console SDK...');

            // CRITICAL FIX: Pre-check token validity before calling getToken('cli')
            // This prevents Adobe IMS library from opening browser if token not ready
            // getToken('cli') can trigger browser auth if token is missing/invalid/expired
            const { TokenManager } = await import('./tokenManager');
            const { ServiceLocator } = await import('@/core/di');
            const commandManager = ServiceLocator.getCommandExecutor();
            const tokenManager = new TokenManager(commandManager);

            const tokenInspection = await tokenManager.inspectToken();

            if (!tokenInspection.valid) {
                this.debugLogger.debug('[Auth SDK] Token not valid yet, deferring SDK initialization');
                this.debugLogger.debug(`[Auth SDK] Token status: expiresIn=${tokenInspection.expiresIn}min`);
                this.debugLogger.debug('[Auth SDK] SDK will be initialized on next call when token is stable');
                return;
            }

            this.debugLogger.debug('[Auth SDK] Token pre-check passed, proceeding with SDK init');

            // CRITICAL FIX: Use token from disk (inspectToken) instead of Adobe IMS Context cache
            // getToken('cli') reads from Adobe IMS Context memory cache which can be stale after login
            // inspectToken() reads directly from Adobe CLI config file, always current
            // Token is guaranteed to exist if valid=true, no need for additional check
            const accessToken = tokenInspection.token!;

            // SECURITY: Validate access token format before using it
            // This checks for shell metacharacters that inspectToken() doesn't validate
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
     * PERFORMANCE FIX: Also clear in-flight initialization promise
     */
    clear(): void {
        this.sdkClient = undefined;
        this.sdkInitPromise = null;
        this.debugLogger.debug('[Auth SDK] Cleared SDK client and initialization promise');
    }
}
