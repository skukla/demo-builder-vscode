/**
 * HelixApiKeys — the Admin API key lifecycle against admin.hlx.page.
 *
 * Create-with-reuse (in-memory cache → persisted store → delete-old-then-create),
 * site-deletion cleanup, and the best-effort deletion of a superseded key.
 * Persistence itself lives in `helixKeyStore` (the keychain side); this class
 * is the server-side half that mints and destroys keys.
 *
 * Extracted from `helixService.ts` (god-file cut 3, 2026-08-23).
 *
 * @module features/eds/services/helixApiKeys
 */

import { HELIX_ADMIN_URL } from './helixApiClient';
import * as keyStore from './helixKeyStore';
import { getCacheTTLWithJitter, isExpired, createCacheEntry } from '@/core/cache/cacheUtils';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** What the key operations need from their host. */
export interface HelixApiKeysDeps {
    logger: Logger;
    /** The DA.live IMS token — key create/delete authenticate with it. */
    getDaLiveToken(): Promise<string>;
}

/**
 * Mints, restores, and destroys Helix Admin API keys for a site.
 */
export class HelixApiKeys {
    constructor(private deps: HelixApiKeysDeps) {}

    private get logger(): Logger {
        return this.deps.logger;
    }

    private getDaLiveToken(): Promise<string> {
        return this.deps.getDaLiveToken();
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
    async createAdminApiKey(org: string, site: string): Promise<string | null> {
        const cacheKey = `${org}/${site}`;

        // 1. Check in-memory cache (fast path)
        const cached = keyStore.getApiKeyCache().get(cacheKey);
        if (cached && !isExpired(cached)) {
            this.logger.debug(`[Helix] Reusing cached Admin API Key for ${cacheKey}`);
            return cached.value;
        }

        // 2. Check persistent store (survives restarts)
        const persisted = await keyStore.getPersistedKey(cacheKey);
        if (persisted) {
            this.logger.debug(`[Helix] Restoring persisted Admin API Key for ${cacheKey}`);
            const jitteredTtl = getCacheTTLWithJitter(CACHE_TTL.LONG);
            keyStore.getApiKeyCache().set(cacheKey, createCacheEntry(persisted.value, jitteredTtl));
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
                    Authorization: `Bearer ${imsToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    // Shown in the site's apiKeys listing, so name what it can
                    // actually do. Unpublish is NOT in scope: DELETE /live
                    // authenticates with the DA.live bearer, not this key.
                    description: 'Demo Builder publish key',
                    roles: ['publish'],
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
                this.logger.info(
                    `[Helix] Admin API Key created (id=${keyId}, expires=${data.expiration})`,
                );
                const jitteredTtl = getCacheTTLWithJitter(CACHE_TTL.LONG);
                keyStore.getApiKeyCache().set(cacheKey, createCacheEntry(keyValue, jitteredTtl));

                // Persist for restart resilience (7 days or server expiry, whichever is shorter)
                if (keyId) {
                    const serverExpiry = data.expiration
                        ? new Date(data.expiration).getTime()
                        : Infinity;
                    const persistExpiry = Math.min(
                        Date.now() + keyStore.PERSIST_TTL_MS,
                        serverExpiry,
                    );
                    await keyStore.setPersistedKey(cacheKey, {
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
        const persisted = await keyStore.getPersistedKeyRaw(cacheKey);

        // Clear both caches regardless
        keyStore.getApiKeyCache().delete(cacheKey);
        await keyStore.deletePersistedKey(cacheKey);

        if (!persisted?.id) {
            this.logger.debug(`[Helix] No persisted API key to delete for ${cacheKey}`);
            return { success: true };
        }

        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys/${keyStore.toUrlSafeKeyId(persisted.id)}.json`;
        try {
            const imsToken = await this.getDaLiveToken();
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${imsToken}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (response.ok || response.status === 404) {
                this.logger.debug(
                    `[Helix] Admin API key deleted for ${cacheKey} (id=${persisted.id}, status=${response.status})`,
                );
                return { success: true };
            }
            this.logger.debug(
                `[Helix] Admin API key deletion returned ${response.status} for ${cacheKey}`,
            );
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
        const persisted = await keyStore.getPersistedKeyRaw(cacheKey);
        if (!persisted?.id) {
            return;
        }

        // Remove from persistent store first (even if API call fails)
        await keyStore.deletePersistedKey(cacheKey);

        const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys/${keyStore.toUrlSafeKeyId(persisted.id)}.json`;
        try {
            const imsToken = await this.getDaLiveToken();
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${imsToken}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (response.ok || response.status === 404) {
                this.logger.debug(
                    `[Helix] Old API key deleted (id=${persisted.id}, status=${response.status})`,
                );
            } else {
                this.logger.debug(
                    `[Helix] Old API key deletion returned ${response.status}, continuing`,
                );
            }
        } catch (error) {
            this.logger.debug(
                `[Helix] Old API key deletion failed: ${(error as Error).message}, continuing`,
            );
        }
    }
}
