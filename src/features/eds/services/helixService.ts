/**
 * Helix Service
 *
 * Handles Helix Admin API operations for EDS (Edge Delivery Services)
 * including preview/publish and unpublish operations.
 *
 * Features:
 * - DA.live token integration via DaLiveTokenProvider
 * - Preview content (POST /preview/{org}/{site}/main/{path})
 * - Publish content (POST /live/{org}/{site}/main/{path})
 * - 404 handling as success (site never published)
 * - Repo fullName parsing for org/site extraction
 */

import * as vscode from 'vscode';
import { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';
import { getCacheTTLWithJitter, isExpired, createCacheEntry, type CacheEntry } from '@/core/cache/cacheUtils';
import { getLogger } from '@/core/logging';
import { runInBatches } from '@/core/utils/promiseUtils';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

// ==========================================================
// Constants
// ==========================================================

/** Helix Admin API base URL */
const HELIX_ADMIN_URL = 'https://admin.hlx.page';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Max concurrent DELETE requests per batch.
 * Helix Admin API enforces 10 req/s per project — batching at 5 keeps
 * well under the limit even with sequential live + parallel preview DELETEs.
 */
const HELIX_DELETE_BATCH_SIZE = 5;

/** Max retry attempts for 429 Too Many Requests responses */
const HELIX_RATE_LIMIT_MAX_RETRIES = 3;

/**
 * Response from bulk preview/publish operations (202 Accepted)
 * @see https://www.aem.live/docs/admin.html
 */
interface BulkJobResponse {
    /** Job information for async operations (nested format) */
    job?: {
        /** Job name for status tracking */
        name: string;
        /** Topic (preview or live) */
        topic: string;
        /** Current job state */
        state: 'created' | 'running' | 'stopped';
    };
    /** Message ID for the bulk operation */
    messageId?: string;
    /** Job name (flat format - alternative to job.name) */
    name?: string;
    /** Topic (flat format - alternative to job.topic) */
    topic?: string;
}

/**
 * Response from job status endpoint
 */
interface JobStatusResponse {
    /** Current job state */
    state: 'created' | 'running' | 'stopped' | 'finished';
    /** Alternative status field (some API versions use 'status' instead of 'state') */
    status?: string;
    /** Progress information (nested format) */
    progress?: {
        /** Number of items processed */
        processed: number;
        /** Total number of items */
        total: number;
    };
    /** Number of items processed (flat format) */
    processed?: number;
    /** Total number of items (flat format) */
    total?: number;
    /** Error information if job failed */
    error?: string;
    /** Result data when job completes */
    data?: {
        resources?: Array<{
            path: string;
            status: number;
        }>;
    };
}

/** Progress callback for bulk operations */
type BulkProgressCallback = (processed: number, total: number) => void;

// ==========================================================
// Persistent API Key Storage
// ==========================================================

/** Persisted API key data for cross-restart reuse */
interface PersistedHelixKey {
    value: string;
    id: string;
    expiresAt: number;
}

/** SecretStorage key for persisted Helix API keys */
const HELIX_KEYS_STATE_KEY = 'helix.apiKeys';

/** Persistence expiry: 7 days (keys have ~1 year server expiry) */
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Token provider interface for DA.live authentication
 */
export interface DaLiveTokenProvider {
    getAccessToken: () => Promise<string | null>;
}

/**
 * Helix Service for admin operations
 */
export class HelixService {
    private logger: Logger;
    private githubTokenService?: GitHubTokenService;
    private daLiveOps: DaLiveContentOperations;
    private daLiveTokenProvider?: DaLiveTokenProvider;

    /**
     * Static cache for Admin API keys, keyed by "org/site".
     * Shared across all HelixService instances within the same extension session.
     * Keys have ~1 year server expiry; we cache for CACHE_TTL.LONG (1 hour).
     */
    private static apiKeyCache = new Map<string, CacheEntry<string>>();

    /** Clear all cached API keys */
    static clearApiKeyCache(): void {
        HelixService.apiKeyCache.clear();
    }

    /** Encrypted persistent storage (OS keychain via SecretStorage). Null = in-memory only. */
    private static secretStorage: vscode.SecretStorage | null = null;

    /**
     * Initialize persistent key storage with encrypted SecretStorage.
     * Idempotent — safe to call multiple times (first caller wins).
     *
     * @param secretStorage - VS Code SecretStorage (OS keychain) for encrypted key persistence
     * @param legacyState - Optional globalState Memento for one-time migration of plaintext keys
     */
    static async initKeyStore(
        secretStorage: vscode.SecretStorage,
        legacyState?: vscode.Memento,
    ): Promise<void> {
        if (!HelixService.secretStorage) {
            HelixService.secretStorage = secretStorage;

            // One-time migration: move keys from plaintext globalState to encrypted SecretStorage
            if (legacyState) {
                const legacyKeys = legacyState.get<Record<string, PersistedHelixKey>>(HELIX_KEYS_STATE_KEY);
                if (legacyKeys && Object.keys(legacyKeys).length > 0) {
                    await secretStorage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(legacyKeys));
                    await legacyState.update(HELIX_KEYS_STATE_KEY, undefined);
                }
            }
        }
    }

    /** Clear persistent key store (for testing). */
    static clearKeyStore(): void {
        HelixService.secretStorage = null;
    }

    /** Read all persisted keys from SecretStorage. */
    private static async getAllPersistedKeys(): Promise<Record<string, PersistedHelixKey>> {
        const raw = await HelixService.secretStorage?.get(HELIX_KEYS_STATE_KEY);
        if (!raw) return {};
        try {
            return JSON.parse(raw) as Record<string, PersistedHelixKey>;
        } catch {
            return {};
        }
    }

    /** Read a persisted key entry (returns undefined if missing or expired). */
    private static async getPersistedKey(cacheKey: string): Promise<PersistedHelixKey | undefined> {
        const keys = await HelixService.getAllPersistedKeys();
        const entry = keys[cacheKey];
        if (!entry || Date.now() >= entry.expiresAt) {
            return undefined;
        }
        return entry;
    }

    /** Read a persisted key entry regardless of expiry (for old key deletion). */
    private static async getPersistedKeyRaw(cacheKey: string): Promise<PersistedHelixKey | undefined> {
        const keys = await HelixService.getAllPersistedKeys();
        return keys[cacheKey];
    }

    /** Write a persisted key entry to encrypted storage. */
    private static async setPersistedKey(cacheKey: string, key: PersistedHelixKey): Promise<void> {
        if (!HelixService.secretStorage) return;
        const keys = await HelixService.getAllPersistedKeys();
        keys[cacheKey] = key;
        await HelixService.secretStorage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(keys));
    }

    /** Remove a persisted key entry from encrypted storage. */
    private static async deletePersistedKey(cacheKey: string): Promise<void> {
        if (!HelixService.secretStorage) return;
        const keys = await HelixService.getAllPersistedKeys();
        delete keys[cacheKey];
        await HelixService.secretStorage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(keys));
    }

    /**
     * Create a HelixService
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     * @param githubTokenService - Optional GitHub token service for Helix Admin API authentication
     * @param daLiveTokenProvider - DA.live token provider for content source authorization.
     *        REQUIRED for operations that use x-content-source-authorization header.
     *        IMPORTANT: This MUST be a DA.live IMS token, NOT the Adobe Console IMS token.
     *        These are separate authentication systems. Using the wrong token causes
     *        silent failures where images become `about:error`.
     */
    constructor(
        logger?: Logger,
        githubTokenService?: GitHubTokenService,
        daLiveTokenProvider?: DaLiveTokenProvider,
    ) {
        this.logger = logger ?? getLogger();
        this.githubTokenService = githubTokenService;
        this.daLiveTokenProvider = daLiveTokenProvider;

        // DaLiveContentOperations needs DA.live token - will throw if not provided when used
        if (daLiveTokenProvider) {
            this.daLiveOps = new DaLiveContentOperations(daLiveTokenProvider, this.logger);
        } else {
            // Create a placeholder that will throw clear error if used without token provider
            this.daLiveOps = new DaLiveContentOperations(
                {
                    getAccessToken: async () => {
                        throw new Error(
                            'DA.live token provider not configured. ' +
                            'HelixService requires a DA.live token provider for content operations.',
                        );
                    },
                },
                this.logger,
            );
        }
    }

    // ==========================================================
    // Path & Auth Helpers
    // ==========================================================

    /** Normalize web path: ensure leading slash, remove trailing slash (except for root). */
    private normalizeWebPath(path: string): string {
        const p = path.startsWith('/') ? path : `/${path}`;
        return p.endsWith('/') && p !== '/' ? p.slice(0, -1) : p;
    }

    /**
     * Build auth headers for DELETE operations (unpublish/delete preview).
     *
     * Uses `Authorization: Bearer ${daLiveToken}` which bypasses the Helix Admin API's
     * "delete not allowed while source exists" restriction. GitHub token and API key
     * auth are both blocked by this restriction when a content source is configured
     * via fstab.yaml.
     *
     * Discovered via diagnostic testing (scripts/test-fstab-codesync-timing.ts):
     * - DELETE /live + GitHub token (x-auth-token) → 403 "source exists"
     * - DELETE /live + API key (Authorization: token) → 403 "source exists"
     * - DELETE /live + DA.live Bearer (Authorization: Bearer) → 204 SUCCESS
     */
    private async getDeleteAuthHeaders(): Promise<Record<string, string>> {
        return { 'Authorization': `Bearer ${await this.getDaLiveToken()}` };
    }

    /** Capture error response body for diagnostics (403, 401, 5xx). */
    private async captureErrorBody(response: Response): Promise<string | null> {
        try {
            const text = await response.text();
            if (!text || text.length > 500) return text ? text.slice(0, 500) + '...' : null;
            return text;
        } catch {
            return null;
        }
    }

    /** AEM returns error details in x-error header; body is often empty for 403. */
    private getXError(response: Response): string | null {
        return response?.headers?.get?.('x-error') ?? null;
    }

    /** Build diagnostic string from body and x-error for 403/401. */
    private async captureErrorDetail(response: Response): Promise<string> {
        const body = await this.captureErrorBody(response);
        const xError = this.getXError(response);
        const parts = [xError, body].filter(Boolean);
        return parts.length ? parts.join(' — ') : `${response.status} ${response.statusText}`;
    }

    /** Parse 202 bulk job response. */
    private async parseBulkJobResponse(response: Response, defaultTopic: string): Promise<{ jobName?: string; jobTopic: string }> {
        let jobInfo: BulkJobResponse | undefined;
        try {
            jobInfo = await response.json();
        } catch {
            this.logger.warn('[Helix] Could not parse job info from 202 response');
        }
        return {
            jobName: jobInfo?.job?.name || jobInfo?.name,
            jobTopic: jobInfo?.job?.topic || jobInfo?.topic || defaultTopic,
        };
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Get DA.live IMS token for content source authorization
     *
     * IMPORTANT: DA.live uses a SEPARATE IMS authentication from Adobe Console.
     * The x-content-source-authorization header MUST use the DA.live IMS token,
     * NOT the Adobe Console IMS token - they are different authentication systems.
     *
     * Using the wrong token (Adobe IMS instead of DA.live IMS) causes the Admin API
     * to fail silently when downloading images, resulting in `about:error` in img src.
     *
     * @throws Error if DA.live token provider not configured or token expired
     */
    private async getDaLiveToken(): Promise<string> {
        if (!this.daLiveTokenProvider) {
            throw new Error(
                'DA.live token provider not configured. ' +
                'HelixService requires a DA.live token provider for content source operations.',
            );
        }

        const token = await this.daLiveTokenProvider.getAccessToken();
        if (!token) {
            throw new Error('DA.live session expired. Please sign in to DA.live.');
        }
        return token;
    }

    /**
     * Get GitHub token for Helix Admin API authentication
     * The Helix Admin API uses GitHub-based auth to verify repo write access.
     * @throws Error if GitHub token not available
     */
    private async getGitHubToken(): Promise<string> {
        if (!this.githubTokenService) {
            throw new Error('GitHub authentication required for Helix Admin API. Please log in to GitHub.');
        }

        const tokenData = await this.githubTokenService.getToken();
        if (!tokenData) {
            throw new Error('GitHub token not found. Please log in to GitHub.');
        }

        return tokenData.token;
    }

    // ==========================================================
    // Bulk Job Polling
    // ==========================================================

    /** Maximum time to wait for a bulk job to complete (5 minutes) */
    private static readonly JOB_TIMEOUT_MS = 5 * 60 * 1000;

    /** Polling interval for job status checks (2 seconds) */
    private static readonly JOB_POLL_INTERVAL_MS = 2000;

    /**
     * Poll for bulk job completion
     *
     * Bulk operations (preview/publish) return 202 with job info.
     * This method polls the job status endpoint until the job completes.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name
     * @param jobName - Job name from 202 response
     * @param topic - Job topic (preview, live, preview-remove, live-remove)
     * @param onProgress - Optional callback for progress updates
     * @param apiKey - Optional Admin API Key (used for unpublish jobs created with API key auth)
     * @throws Error if job fails or times out
     */
    private async pollJobCompletion(
        org: string,
        site: string,
        branch: string,
        jobName: string,
        topic: string,
        onProgress?: BulkProgressCallback,
        apiKey?: string,
    ): Promise<void> {
        // Use API key auth when provided (unpublish jobs), otherwise GitHub token
        const authHeaders: Record<string, string> = apiKey
            ? { 'Authorization': `token ${apiKey}` }
            : { 'x-auth-token': await this.getGitHubToken() };
        // Job status URL format: GET /job/{org}/{site}/{ref}/{topic}/{jobId}
        const url = `${HELIX_ADMIN_URL}/job/${org}/${site}/${branch}/${topic}/${jobName}`;
        const startTime = Date.now();

        this.logger.debug(`[Helix] Polling job status: ${url}`);

        while (true) {
            // Check timeout
            if (Date.now() - startTime > HelixService.JOB_TIMEOUT_MS) {
                throw new Error(`Bulk ${topic} job timed out after ${HelixService.JOB_TIMEOUT_MS / 1000} seconds`);
            }

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: authHeaders,
                    signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });

                if (!response.ok) {
                    // Job endpoint may not exist immediately, retry
                    if (response.status === 404) {
                        this.logger.debug(`[Helix] Job not found yet, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
                        continue;
                    }
                    throw new Error(`Job status check failed: ${response.status} ${response.statusText}`);
                }

                const status: JobStatusResponse = await response.json();


                // Report progress if available
                if (status.progress && onProgress) {
                    onProgress(status.progress.processed, status.progress.total);
                }

                // Check job state - handle both 'stopped' and 'finished' states
                if (status.state === 'stopped' || status.state === 'finished' || status.status === 'finished') {
                    // Job completed
                    if (status.error) {
                        throw new Error(`Bulk ${topic} job failed: ${status.error}`);
                    }
                    this.logger.debug(`[Helix] Bulk ${topic} job completed successfully`);
                    return;
                }

                // Job still running, wait and poll again
                this.logger.debug(`[Helix] Job state: ${status.state || status.status}, progress: ${status.progress?.processed ?? status.processed ?? '?'}/${status.progress?.total ?? status.total ?? '?'}`);
                await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
            } catch (error) {
                const errorMessage = (error as Error).message;
                // Timeout errors should be retried
                if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
                    this.logger.debug(`[Helix] Job status request timed out, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, HelixService.JOB_POLL_INTERVAL_MS));
                    continue;
                }
                throw error;
            }
        }
    }

    // ==========================================================
    // Preview/Publish Operations
    // ==========================================================

    /**
     * Preview a page (sync content from DA.live to preview CDN)
     *
     * This triggers the Helix Admin to fetch content from DA.live
     * and make it available at the .aem.page preview URL.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async previewPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        const cleanPath = this.normalizeWebPath(path);
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Previewing page: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to preview page: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully previewed: ${cleanPath}`);
    }

    /**
     * Publish a page to live (sync from preview to live CDN)
     *
     * This triggers the Helix Admin to copy content from preview
     * to the .aem.live production URL.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async publishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        const cleanPath = this.normalizeWebPath(path);
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Publishing page: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to publish this content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to publish page: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully published: ${cleanPath}`);
    }

    /**
     * Get or create an Admin API Key with publish role for a site.
     *
     * Returns a cached key if one exists and hasn't expired (CACHE_TTL.LONG).
     * On cache miss, checks the persistent store (survives restarts).
     * Otherwise creates a new key via the Config Service API using the
     * DA.live IMS token, deleting any previously persisted key first.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @returns The API key value, or null if creation failed
     */
    async createAdminApiKey(
        org: string,
        site: string,
    ): Promise<string | null> {
        const cacheKey = `${org}/${site}`;

        // 1. Check in-memory cache (fast path)
        const cached = HelixService.apiKeyCache.get(cacheKey);
        if (cached && !isExpired(cached)) {
            this.logger.debug(`[Helix] Reusing cached Admin API Key for ${cacheKey}`);
            return cached.value;
        }

        // 2. Check persistent store (survives restarts)
        const persisted = await HelixService.getPersistedKey(cacheKey);
        if (persisted) {
            this.logger.debug(`[Helix] Restoring persisted Admin API Key for ${cacheKey}`);
            const jitteredTtl = getCacheTTLWithJitter(CACHE_TTL.LONG);
            HelixService.apiKeyCache.set(cacheKey, createCacheEntry(persisted.value, jitteredTtl));
            return persisted.value;
        }

        // 3. Delete old key before creating new one (best-effort)
        await this.deleteOldApiKey(org, site, cacheKey);

        // 4. Create new key via API
        const imsToken = await this.getDaLiveToken();
        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys.json`;

        this.logger.debug(`[Helix] Creating Admin API Key for ${cacheKey}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${imsToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    description: 'Demo Builder publish/unpublish key',
                    roles: ['admin'],
                }),
                signal: AbortSignal.timeout(TIMEOUTS.LONG),
            });

            if (!response.ok) {
                this.logger.warn(`[Helix] Admin API Key creation failed: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const keyValue = data.value as string | undefined;
            const keyId = data.id as string | undefined;

            if (keyValue) {
                this.logger.info(`[Helix] Admin API Key created (id=${keyId}, expires=${data.expiration})`);
                const jitteredTtl = getCacheTTLWithJitter(CACHE_TTL.LONG);
                HelixService.apiKeyCache.set(cacheKey, createCacheEntry(keyValue, jitteredTtl));

                // Persist for restart resilience (7 days or server expiry, whichever is shorter)
                if (keyId) {
                    const serverExpiry = data.expiration
                        ? new Date(data.expiration).getTime()
                        : Infinity;
                    const persistExpiry = Math.min(Date.now() + PERSIST_TTL_MS, serverExpiry);
                    await HelixService.setPersistedKey(cacheKey, {
                        value: keyValue,
                        id: keyId,
                        expiresAt: persistExpiry,
                    });
                }
            }

            return keyValue || null;
        } catch (error) {
            this.logger.warn(`[Helix] Admin API Key creation error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Delete the Admin API Key for a site (public).
     *
     * Use this when a site is being permanently deleted — it removes
     * the server-side key to prevent orphaned keys accumulating.
     * Clears both in-memory cache and persistent store.
     * Best-effort: catches all errors and returns a result object.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @returns Result with success status
     */
    async deleteAdminApiKey(
        org: string,
        site: string,
    ): Promise<{ success: boolean; error?: string }> {
        const cacheKey = `${org}/${site}`;

        // Look up persisted key for server-side ID
        const persisted = await HelixService.getPersistedKeyRaw(cacheKey);

        // Clear both caches regardless
        HelixService.apiKeyCache.delete(cacheKey);
        await HelixService.deletePersistedKey(cacheKey);

        if (!persisted?.id) {
            this.logger.debug(`[Helix] No persisted API key to delete for ${cacheKey}`);
            return { success: true };
        }

        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys/${persisted.id}.json`;
        try {
            const imsToken = await this.getDaLiveToken();
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${imsToken}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (response.ok || response.status === 404) {
                this.logger.debug(`[Helix] Admin API key deleted for ${cacheKey} (id=${persisted.id}, status=${response.status})`);
                return { success: true };
            }
            this.logger.debug(`[Helix] Admin API key deletion returned ${response.status} for ${cacheKey}`);
            return { success: false, error: `DELETE returned ${response.status}` };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.debug(`[Helix] Admin API key deletion failed for ${cacheKey}: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Best-effort deletion of a previously persisted API key.
     * Removes from persistent store first, then attempts server-side deletion.
     * Catches all errors — old key will expire naturally (~1 year).
     */
    private async deleteOldApiKey(org: string, site: string, cacheKey: string): Promise<void> {
        const persisted = await HelixService.getPersistedKeyRaw(cacheKey);
        if (!persisted?.id) {
            return;
        }

        // Remove from persistent store first (even if API call fails)
        await HelixService.deletePersistedKey(cacheKey);

        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys/${persisted.id}.json`;
        try {
            const imsToken = await this.getDaLiveToken();
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${imsToken}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (response.ok || response.status === 404) {
                this.logger.debug(`[Helix] Old API key deleted (id=${persisted.id}, status=${response.status})`);
            } else {
                this.logger.debug(`[Helix] Old API key deletion returned ${response.status}, continuing`);
            }
        } catch (error) {
            this.logger.debug(`[Helix] Old API key deletion failed: ${(error as Error).message}, continuing`);
        }
    }

    /**
     * Delete a resource from preview or live CDN partition.
     * Shared implementation for deletePreview and unpublishPage.
     *
     * Uses DA.live Bearer token auth which bypasses the "source exists" restriction.
     * See `getDeleteAuthHeaders()` for auth strategy details.
     *
     * @returns `{ success }` — false on auth failure (401/403)
     */
    private async deleteResource(
        partition: 'live' | 'preview',
        org: string,
        site: string,
        path: string,
        branch: string,
        retryCount: number = 0,
    ): Promise<{ success: boolean }> {
        const cleanPath = this.normalizeWebPath(path);
        const url = `${HELIX_ADMIN_URL}/${partition}/${org}/${site}/${branch}${cleanPath}`;
        const action = partition === 'live' ? 'Unpublishing' : 'Deleting preview';
        const successLog = partition === 'live' ? 'Unpublished' : 'Preview deleted';
        const errorPrefix = partition === 'live' ? 'unpublish' : 'delete preview';

        this.logger.debug(`[Helix] ${action}: ${url}`);

        const headers = await this.getDeleteAuthHeaders();
        const response = await fetch(url, {
            method: 'DELETE',
            headers,
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401 || response.status === 403) {
            const detail = await this.captureErrorDetail(response);
            this.logger.warn(`[Helix] ${action} failed (${response.status}): ${detail}`);
            return { success: false };
        }
        if (response.status === 429) {
            if (retryCount >= HELIX_RATE_LIMIT_MAX_RETRIES) {
                throw new Error(`Rate limited after ${retryCount} retries: ${partition} ${cleanPath}`);
            }
            const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10);
            const waitMs = Math.min(retryAfter * 1000, 30000);
            this.logger.warn(
                `[Helix] Rate limited on ${partition} ${cleanPath}, ` +
                `retrying after ${retryAfter}s (attempt ${retryCount + 1}/${HELIX_RATE_LIMIT_MAX_RETRIES})`,
            );
            await new Promise(resolve => setTimeout(resolve, waitMs));
            return this.deleteResource(partition, org, site, path, branch, retryCount + 1);
        }
        if (response.status === 204 || response.status === 404) {
            this.logger.debug(`[Helix] ${successLog}: ${cleanPath}`);
            return { success: true };
        }
        if (!response.ok) {
            throw new Error(`Failed to ${errorPrefix}: ${response.status} ${response.statusText}`);
        }
        return { success: true };
    }

    /**
     * Delete preview for a resource.
     *
     * Sends DELETE /preview/{org}/{site}/{ref}/{path} to remove the page
     * from the preview CDN partition. Uses DA.live Bearer token auth.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @returns true if deleted (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async deletePreview(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await this.deleteResource('preview', org, site, path, branch);
        return result.success;
    }

    /**
     * Unpublish a resource from the live content bus.
     *
     * Sends DELETE /live/{org}/{site}/{ref}/{path} to remove the page
     * from the live CDN partition and purge associated caches.
     * Uses DA.live Bearer token auth which bypasses the "source exists" restriction.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (e.g., '/' for homepage, '/products')
     * @param branch - Branch name (default: main)
     * @returns true if unpublished (204) or not found (404), false if auth failed
     * @throws Error on non-auth failures (5xx, network)
     */
    async unpublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<boolean> {
        const result = await this.deleteResource('live', org, site, path, branch);
        return result.success;
    }

    /**
     * Unpublish pages from both live and preview CDN.
     *
     * Uses page-by-page DELETE with DA.live Bearer token authentication,
     * which bypasses the "source exists" restriction. No need to manipulate
     * fstab.yaml or Configuration Service config before unpublishing.
     *
     * See ADR-002 for auth strategy investigation history.
     *
     * @param org - GitHub organization/owner
     * @param site - GitHub repository name
     * @param branch - Branch name
     * @param webPaths - Web paths to unpublish (e.g., ['/about', '/products'])
     * @returns Whether unpublish succeeded and count processed
     */
    async unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[],
    ): Promise<{ success: boolean; count: number }> {
        if (webPaths.length === 0) {
            return { success: true, count: 0 };
        }

        this.logger.info(`[Helix] Unpublishing ${webPaths.length} pages (page-by-page)`);

        // Delete live and preview CDN entries in batches to respect rate limits
        const liveResults = await runInBatches(
            webPaths, HELIX_DELETE_BATCH_SIZE,
            async path => (await this.deleteResource('live', org, site, path, branch)).success,
        );
        const liveCount = liveResults.filter(Boolean).length;

        const previewResults = await runInBatches(
            webPaths, HELIX_DELETE_BATCH_SIZE,
            path => this.deletePreview(org, site, path, branch),
        );
        const previewCount = previewResults.filter(Boolean).length;

        this.logger.info(`[Helix] Unpublish complete: ${liveCount}/${webPaths.length} live, ${previewCount}/${webPaths.length} preview`);
        return { success: liveCount > 0 || previewCount > 0, count: Math.max(liveCount, previewCount) };
    }

    /**
     * Preview and publish a page in one operation
     * First previews to sync from DA.live, then publishes to live CDN
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - Content path (default: '/' for homepage)
     * @param branch - Branch name (default: main)
     */
    async previewAndPublishPage(
        org: string,
        site: string,
        path: string = '/',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        await this.previewPage(org, site, path, branch);
        await this.publishPage(org, site, path, branch);
    }

    /**
     * Preview all content (bulk operation)
     * Uses the bulk API endpoint to sync all content from DA.live to preview CDN.
     * Polls for job completion before returning.
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to preview (if not provided, uses "/" which only processes root)
     * @see https://www.aem.live/docs/admin.html
     */
    async previewAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Bulk API: POST to /preview/{org}/{site}/{ref}/*
        // The /* in the URL triggers bulk/async processing (returns 202)
        // The paths array in the body specifies what to process
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/*`;

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = paths && paths.length > 0 ? paths : ['/'];

        this.logger.debug(`[Helix] Previewing all content (bulk): ${url} - ${pathsToProcess.length} paths`);

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: pathsToProcess,
                forceUpdate: true,
            }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this content.');
        }

        // 400 = Bad request - log details for debugging
        if (response.status === 400) {
            let errorBody: string | undefined;
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }
            this.logger.error(`[Helix] Bulk preview returned 400 Bad Request. Response: ${errorBody || 'empty'}`);
            throw new Error(`Failed to preview all content: 400 Bad Request - ${errorBody || 'Invalid request'}`);
        }

        // 202 = Bulk preview scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk preview job created, polling for completion...');

            const { jobName, jobTopic } = await this.parseBulkJobResponse(response, 'preview');

            if (jobName) {
                await this.pollJobCompletion(
                    org,
                    site,
                    branch,
                    jobName,
                    jobTopic,
                    onProgress,
                );
            } else {
                // No job info, wait a reasonable time for the operation
                this.logger.warn('[Helix] No job info in response, assuming operation completed');
            }
            return;
        }

        if (response.ok) {
            // 200 OK = synchronous success (small path count processed immediately)
            // The Admin API returns 200 for small batches and 202 for large ones
            this.logger.debug('[Helix] Bulk preview completed synchronously (200)');
            return;
        }

        throw new Error(`Failed to preview all content: ${response.status} ${response.statusText}`);
    }

    /**
     * Publish all content to live (bulk operation)
     * Uses the bulk API endpoint to sync all content from preview to live CDN.
     * Polls for job completion before returning.
     *
     * The bulk API requires:
     * - Content-Type: application/json header
     * - JSON body with paths array (e.g., ["/*"] for recursive)
     * - Optional forceUpdate flag
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @param onProgress - Optional callback for progress updates (processed, total)
     * @param paths - Optional explicit list of paths to publish (if not provided, uses "/" which only processes root)
     * @see https://www.aem.live/docs/admin.html
     */
    async publishAllContent(
        org: string,
        site: string,
        branch: string = DEFAULT_BRANCH,
        onProgress?: BulkProgressCallback,
        paths?: string[],
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const imsToken = await this.getDaLiveToken();
        // Bulk API: POST to /live/{org}/{site}/{ref}/*
        // The /* in the URL triggers bulk/async processing (returns 202)
        // The paths array in the body specifies what to process
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}/*`;

        // Use explicit paths if provided, otherwise default to root
        const pathsToProcess = paths && paths.length > 0 ? paths : ['/'];

        this.logger.debug(`[Helix] Publishing all content (bulk): ${url} - ${pathsToProcess.length} paths`);

        // Bulk API requires JSON body with paths array
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${imsToken}`, // Required for DA.live content source
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paths: pathsToProcess,
                forceUpdate: true,
            }),
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to publish this content.');
        }

        // 400 = Bad request - log details for debugging
        if (response.status === 400) {
            let errorBody: string | undefined;
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }
            this.logger.error(`[Helix] Bulk publish returned 400 Bad Request. Response: ${errorBody || 'empty'}`);
            throw new Error(`Failed to publish all content: 400 Bad Request - ${errorBody || 'Invalid request'}`);
        }

        // 202 = Bulk publish scheduled (async job created)
        if (response.status === 202) {
            this.logger.debug('[Helix] Bulk publish job created, polling for completion...');

            const { jobName, jobTopic } = await this.parseBulkJobResponse(response, 'live');

            if (jobName) {
                await this.pollJobCompletion(
                    org,
                    site,
                    branch,
                    jobName,
                    jobTopic,
                    onProgress,
                );
            } else {
                // No job info, assume operation completed
                this.logger.warn('[Helix] No job info in response, assuming operation completed');
            }
            return;
        }

        if (response.ok) {
            // 200 OK = synchronous success (small path count processed immediately)
            // The Admin API returns 200 for small batches and 202 for large ones
            this.logger.debug('[Helix] Bulk publish completed synchronously (200)');
            return;
        }

        throw new Error(`Failed to publish all content: ${response.status} ${response.statusText}`);
    }

    /**
     * File names to exclude from publishing (non-content files)
     */
    private static readonly EXCLUDED_NAMES = [
        'metadata', // metadata.json
        'redirects', // redirects.json
        'placeholders', // placeholders.json
        'query-index', // query-index.json
        'test-index', // test files
    ];

    /**
     * Folder names to exclude from publishing
     */
    private static readonly EXCLUDED_FOLDERS = [
        '.helix',
        '.milo',
        'placeholders',
        'experiments', // A/B test config
        'enrichment', // PDP enrichment data
    ];

    /**
     * Recursively list all publishable pages from DA.live
     *
     * DA.live API response structure:
     * - Files have: { name, path, ext, lastModified }
     * - Folders have: { name, path } (no ext field)
     *
     * @param org - Organization name (DA.live org)
     * @param site - Site name in DA.live
     * @param path - Starting path (default: root)
     * @returns Array of web paths to publish
     */
    async listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
        const pages: string[] = [];
        // DA.live paths include org/site prefix, need to strip it for recursion
        const pathPrefix = `/${org}/${site}`;

        try {
            const entries = await this.daLiveOps.listDirectory(org, site, path);

            for (const entry of entries) {
                // Determine if it's a folder (no ext field) or file (has ext field)
                const isFolder = !entry.ext;

                if (isFolder) {
                    // Skip excluded folders
                    if (HelixService.EXCLUDED_FOLDERS.includes(entry.name)) {
                        continue;
                    }

                    // Recursively list subdirectory
                    // The path in the response is like /org/site/folder, need to strip prefix for recursion
                    const relativePath = entry.path.replace(pathPrefix, '') || '/';
                    const subPages = await this.listAllPages(org, site, relativePath);
                    pages.push(...subPages);
                } else {
                    // It's a file - check if it's publishable HTML content
                    if (entry.ext !== 'html') {
                        continue;
                    }

                    // Skip excluded names
                    if (HelixService.EXCLUDED_NAMES.includes(entry.name)) {
                        continue;
                    }

                    // Convert DA.live path to web path
                    // entry.path is like /org/site/accessories.html
                    // We need /accessories (strip prefix and .html)
                    const webPath = this.daLivePathToWebPath(entry.path, pathPrefix);
                    pages.push(webPath);
                }
            }
        } catch (error) {
            this.logger.warn(`[Helix] Failed to list ${path}: ${(error as Error).message}`);
        }

        return pages;
    }

    /**
     * Convert a DA.live path to a web path
     * DA.live path: /org/site/accessories.html -> /accessories
     * DA.live path: /org/site/products/index.html -> /products
     */
    private daLivePathToWebPath(daLivePath: string, pathPrefix: string): string {
        // Strip the org/site prefix
        let webPath = daLivePath.replace(pathPrefix, '');

        // Remove .html extension
        webPath = webPath.replace(/\.html$/i, '');

        // Convert /index to /
        if (webPath === '/index' || webPath.endsWith('/index')) {
            webPath = webPath.slice(0, -6) || '/';
        }

        return webPath || '/';
    }

    /**
     * Progress callback for publish operations
     */
    public static readonly PublishPhases = {
        DISCOVERING: 'discovering',
        PUBLISHING: 'publishing',
        COMPLETE: 'complete',
    } as const;

    /**
     * Preview and publish all content in one operation.
     * Attempts bulk APIs first for performance, falls back to page-by-page if bulk fails.
     *
     * @param repoFullName - Full repository name (owner/repo) for Helix API
     * @param branch - Branch name (default: main)
     * @param daLiveOrg - DA.live organization (for listing content, may differ from GitHub owner)
     * @param daLiveSite - DA.live site name (for listing content, may differ from GitHub repo)
     * @param onProgress - Optional callback for progress updates
     */
    async publishAllSiteContent(
        repoFullName: string,
        branch: string = DEFAULT_BRANCH,
        daLiveOrg?: string,
        daLiveSite?: string,
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        const [githubOrg, githubSite] = this.parseRepoFullName(repoFullName);

        // Use provided DA.live org/site, or fall back to GitHub org/site
        const contentOrg = daLiveOrg || githubOrg;
        const contentSite = daLiveSite || githubSite;

        this.logger.info(`[Helix] Publishing all content from DA.live: ${contentOrg}/${contentSite}`);
        this.logger.info(`[Helix] Target GitHub repo: ${repoFullName}`);

        // Report: Discovering content (still needed to get page count for progress)
        onProgress?.({
            phase: HelixService.PublishPhases.DISCOVERING,
            message: 'Discovering content to publish...',
        });

        // List all publishable pages from DA.live to get count for progress reporting
        const pages = await this.listAllPages(contentOrg, contentSite);

        if (pages.length === 0) {
            this.logger.warn('[Helix] No publishable pages found');
            throw new Error('No publishable pages found. Ensure the site has content in DA.live.');
        }

        this.logger.info(`[Helix] Found ${pages.length} pages to publish`);

        // Try bulk APIs first for better performance
        // If bulk fails (404 = site not configured), fall back to page-by-page
        try {
            await this.publishAllSiteContentBulk(githubOrg, githubSite, branch, pages, onProgress);
        } catch (error) {
            // Bulk API is a fast path — any failure falls back to reliable page-by-page
            this.logger.warn(`[Helix] Bulk publish failed: ${(error as Error).message}, falling back to page-by-page`);
            await this.publishAllSiteContentPageByPage(githubOrg, githubSite, branch, pages, onProgress);
        }
    }

    /**
     * Publish all content using bulk APIs (fast path)
     */
    private async publishAllSiteContentBulk(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        // Phase 1: Bulk preview (sync from DA.live to preview CDN)
        onProgress?.({
            phase: HelixService.PublishPhases.PUBLISHING,
            message: 'Previewing all content...',
            current: 0,
            total: pages.length,
        });

        await this.previewAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: HelixService.PublishPhases.PUBLISHING,
                    message: `Previewing content (${processed}/${total})`,
                    current: Math.floor(processed / 2), // First half of progress
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info('[Helix] Bulk preview completed');

        // Phase 2: Bulk publish (sync from preview to live CDN)
        onProgress?.({
            phase: HelixService.PublishPhases.PUBLISHING,
            message: 'Publishing to live CDN...',
            current: Math.floor(pages.length / 2),
            total: pages.length,
        });

        await this.publishAllContent(
            githubOrg,
            githubSite,
            branch,
            (processed, total) => {
                onProgress?.({
                    phase: HelixService.PublishPhases.PUBLISHING,
                    message: `Publishing to CDN (${processed}/${total})`,
                    current: Math.floor(pages.length / 2) + Math.floor(processed / 2), // Second half
                    total: pages.length,
                });
            },
            pages, // Pass the discovered pages explicitly
        );

        this.logger.info(`[Helix] Successfully published ${pages.length} pages using bulk API`);

        // Report completion
        onProgress?.({
            phase: HelixService.PublishPhases.COMPLETE,
            message: `Published ${pages.length} pages to CDN`,
            current: pages.length,
            total: pages.length,
        });
    }

    /**
     * Publish all content page-by-page (fallback for sites where bulk API isn't available)
     */
    private async publishAllSiteContentPageByPage(
        githubOrg: string,
        githubSite: string,
        branch: string,
        pages: string[],
        onProgress?: (info: {
            phase: typeof HelixService.PublishPhases[keyof typeof HelixService.PublishPhases];
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => void,
    ): Promise<void> {
        let publishedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < pages.length; i++) {
            const path = pages[i];

            onProgress?.({
                phase: HelixService.PublishPhases.PUBLISHING,
                message: `Publishing pages (${i + 1}/${pages.length})`,
                current: i,
                total: pages.length,
                currentPath: path,
            });

            try {
                await this.previewAndPublishPage(githubOrg, githubSite, path, branch);
                publishedCount++;
                this.logger.debug(`[Helix] Published: ${path}`);
            } catch (error) {
                const errorMessage = (error as Error).message;

                // 404 means the page has no content (placeholder) - skip it
                if (errorMessage.includes('404')) {
                    skippedCount++;
                    this.logger.debug(`[Helix] Skipping ${path} - no content (404)`);
                    continue;
                }

                // Other errors should propagate
                throw error;
            }
        }

        this.logger.info(`[Helix] Successfully published ${publishedCount}/${pages.length} pages (${skippedCount} skipped)`);

        // Report completion
        onProgress?.({
            phase: HelixService.PublishPhases.COMPLETE,
            message: `Published ${publishedCount} pages to CDN${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
            current: pages.length,
            total: pages.length,
        });
    }

    // ==========================================================
    // Cache Operations
    // ==========================================================

    /**
     * Purge all cached content from the live CDN
     *
     * Use this before publishing when recreating a site with the same name,
     * or when resetting/republishing to ensure stale content is cleared.
     *
     * This is especially important when:
     * - A site was deleted and recreated with the same name
     * - Reset to template operations
     * - Republishing after content source changes
     *
     * The purge request is sent to all CDN edge nodes, but propagation
     * may take a few seconds to complete globally.
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async purgeCacheAll(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getGitHubToken();
        const url = `${HELIX_ADMIN_URL}/cache/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Purging all cached content: ${url}`);

        // Cache purge only needs GitHub token (x-auth-token) for caller auth.
        // No x-content-source-authorization needed — cache operations don't
        // access DA.live content, they only invalidate the CDN cache layer.
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': token,
            },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        // 404 is acceptable (nothing cached yet)
        if (response.status === 404) {
            this.logger.debug('[Helix] No cached content to purge (404)');
            return;
        }

        // 401 is authentication failure
        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to purge this site cache.');
        }

        if (!response.ok) {
            throw new Error(`Failed to purge cache: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully purged all cached content');
    }

    // ==========================================================
    // Code Preview Operations
    // ==========================================================

    /**
     * Preview a code file (sync from GitHub to CDN)
     *
     * This triggers the Helix Admin to fetch code from GitHub
     * and make it available on the CDN. Used for config files
     * like config.json that need to be refreshed after updates.
     *
     * Unlike content preview, code preview only requires GitHub auth
     * (no DA.live token needed since code comes from GitHub).
     *
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param path - File path (e.g., '/config.json')
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async previewCode(
        org: string,
        site: string,
        path: string = '/*',
        branch: string = DEFAULT_BRANCH,
    ): Promise<void> {
        const githubToken = await this.getGitHubToken();
        const cleanPath = this.normalizeWebPath(path);
        const url = `${HELIX_ADMIN_URL}/code/${org}/${site}/${branch}${cleanPath}`;

        this.logger.debug(`[Helix] Previewing code: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
            },
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error('GitHub authentication failed. Please ensure you have write access to the repository.');
        }

        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to preview this code.');
        }

        if (!response.ok) {
            throw new Error(`Failed to preview code: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`[Helix] Successfully previewed code: ${cleanPath}`);
    }
    // ==========================================================
    // Helpers
    // ==========================================================

    /**
     * Parse repository full name into org and site
     * @param fullName - Full repository name (owner/repo)
     * @returns Tuple of [org, site]
     */
    private parseRepoFullName(fullName: string): [string, string] {
        const parts = fullName.split('/');
        if (parts.length !== 2) {
            throw new Error(`Invalid repository name: ${fullName}. Expected format: owner/repo`);
        }
        return [parts[0], parts[1]];
    }
}
