// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import * as sdk from '@adobe/aio-lib-console';
import { getLogger } from '@/core/logging/debugLogger';
import { validateAccessToken } from '@/core/validation/validators/AccessTokenValidator';
import type { Logger } from '@/types/logger';

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

    constructor(private _logger: Logger) {}

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
     * `initialize()` already returns at once when the client exists and joins an
     * in-flight initialization when one is running, so there is nothing to guard
     * here. Two guards that duplicated it were removed on 2026-09-03: a mutation
     * run showed neither could change the outcome.
     */
    async ensureInitialized(): Promise<boolean> {
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
            return this.sdkInitPromise;
        }

        // Already initialized
        if (this.sdkClient) {
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
            // The token is INSPECTED, never fetched. `aio-lib-ims`'s getToken
            // opens a browser when it cannot resolve a token silently, so an SDK
            // init — which runs in the background — must never reach it. Nothing
            // in this repo calls it any more (2026-09-02): it is not even in the
            // library's local typings, so a reintroduction fails to compile.
            // Dynamic imports: deferred to avoid module loading chain in tests
            // (TokenManager → loadingHTML → vscode not available during test setup)
            const { TokenManager } = await import('./tokenManager');
            const tokenManager = new TokenManager();

            const tokenInspection = await tokenManager.inspectToken();

            if (!tokenInspection.valid) {
                this.debugLogger.debug('[Auth SDK] Token not valid, deferring SDK initialization');
                return;
            }

            // From disk, not from the IMS Context memory cache: the cache can be
            // stale right after a login, while inspectToken re-reads the CLI's
            // config file. Guaranteed present when valid=true.
            const accessToken = tokenInspection.token;
            if (!accessToken) {
                this.debugLogger.debug('[Auth SDK] Token valid but missing from inspection result');
                return;
            }

            // SECURITY: Validate access token format before using it
            // This checks for shell metacharacters that inspectToken() doesn't validate
            try {
                validateAccessToken(accessToken);
            } catch (validationError) {
                this.debugLogger.error('[Auth SDK] Invalid access token format', validationError as Error);
                return;
            }

            // Initialize SDK with CLI token
            this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');

            this.debugLogger.debug('[Auth SDK] SDK initialized successfully - enabling 30x faster operations');

        } catch (error) {
            // SDK initialization failure is not critical - we'll fall back to CLI.
            // Nothing to reset: this runs only behind initialize()'s guard, so the
            // client is undefined on entry and only the awaited init could set it.
            this.debugLogger.debug('[Auth SDK] Failed to initialize SDK, will use CLI fallback:', error);
        }
    }

    /**
     * Clear SDK client (force re-initialization on next use)
     * PERFORMANCE FIX: Also clear in-flight initialization promise
     */
    clear(): void {
        this.sdkClient = undefined;
        this.sdkInitPromise = null;
    }
}
