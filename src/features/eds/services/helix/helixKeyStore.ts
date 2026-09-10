/**
 * Where Helix Admin API keys live between calls, and between restarts.
 *
 * This is a credential store, not a Helix client: it knows about the OS
 * keychain, a one-time migration off plaintext, an in-memory cache and two
 * expiries — and nothing about admin.hlx.page. `helixService.ts` does the
 * opposite, which is why the two are separate files.
 *
 * **Two expiries, deliberately different.** The in-memory cache holds a key for
 * `CACHE_TTL.LONG`; the persisted copy holds it for {@link PERSIST_TTL_MS} (7
 * days) against a server-side life of roughly a year. The short local lives are
 * what keep a key that was destroyed server-side from being used for months —
 * `updateSiteConfig`'s delete-then-re-register destroys it, which is what
 * {@link forgetApiKey} exists for.
 *
 * State is module-level and shared process-wide, exactly as the statics it
 * replaced were: one extension host, one keychain, one cache.
 *
 * @module features/eds/services/helix/helixKeyStore
 */

import * as vscode from 'vscode';
import type { CacheEntry } from '@/core/cache/cacheUtils';

/** Persisted API key data for cross-restart reuse */
export interface PersistedHelixKey {
    value: string;
    id: string;
    expiresAt: number;
}

/** SecretStorage key for persisted Helix API keys */
const HELIX_KEYS_STATE_KEY = 'helix.apiKeys';

/** Persistence expiry: 7 days (keys have ~1 year server expiry) */
export const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cached Admin API keys, keyed by "org/site".
 *
 * Shared across every HelixService instance in the extension session — the
 * keys belong to the site, not to whichever object happened to fetch them.
 */
const apiKeyCache = new Map<string, CacheEntry<string>>();

/** Encrypted persistent storage (OS keychain via SecretStorage). Null = in-memory only. */
let secretStorage: vscode.SecretStorage | null = null;

/** True when the legacy plaintext key store holds at least one key to migrate. */
function hasLegacyKeys(legacyKeys?: Record<string, PersistedHelixKey>): boolean {
    return Boolean(legacyKeys && Object.keys(legacyKeys).length > 0);
}

/**
 * Convert an Admin API key id into the form the config API accepts as a URL
 * path segment: standard base64 → base64url (`+`→`-`, `/`→`_`).
 *
 * The create response returns the RAW id and the listing endpoint keys the same
 * key by its URL-safe form, so a key id containing `/` splits the DELETE path
 * and Helix answers 400. Measured 2026-08-15 on a live site: raw id → 400,
 * URL-safe id → 204. Percent-encoding does NOT work here; the server wants the
 * substituted characters. `/` was measured directly; `+` follows from the same
 * base64url mapping and is included so the other half of the alphabet cannot
 * bite later.
 */
export function toUrlSafeKeyId(id: string): string {
    return id.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Initialize persistent key storage with encrypted SecretStorage.
 * Idempotent — safe to call multiple times (first caller wins).
 *
 * @param storage - VS Code SecretStorage (OS keychain) for encrypted key persistence
 * @param legacyState - Optional globalState Memento for one-time migration of plaintext keys
 */
export async function initKeyStore(
    storage: vscode.SecretStorage,
    legacyState?: vscode.Memento,
): Promise<void> {
    if (secretStorage) return;
    secretStorage = storage;

    // One-time migration: move keys from plaintext globalState to encrypted SecretStorage
    if (legacyState) {
        const legacyKeys = legacyState.get<Record<string, PersistedHelixKey>>(HELIX_KEYS_STATE_KEY);
        if (hasLegacyKeys(legacyKeys)) {
            await storage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(legacyKeys));
            await legacyState.update(HELIX_KEYS_STATE_KEY, undefined);
        }
    }
}

/** Clear persistent key store (for testing). */
export function clearKeyStore(): void {
    secretStorage = null;
}

/** Clear all cached API keys */
export function clearApiKeyCache(): void {
    apiKeyCache.clear();
}

/** The live in-memory cache. Callers read and write it directly, as before. */
export function getApiKeyCache(): Map<string, CacheEntry<string>> {
    return apiKeyCache;
}

/**
 * Forget a locally cached/persisted key WITHOUT calling the server.
 *
 * Use after a site config write. `apiKeys` lives inside the site config
 * document, so `updateSiteConfig`'s delete-then-re-register destroys the key
 * server-side (measured 2026-08-15: 1 key → delete → re-register → 0). The
 * local copy survives for up to 7 days, so without this the next publish
 * would authenticate with a key that no longer exists and 401.
 *
 * Deliberately not `deleteAdminApiKey`: there is nothing left to delete
 * remotely, and that call would spend a round trip to be told 404.
 */
export async function forgetApiKey(org: string, site: string): Promise<void> {
    const cacheKey = `${org}/${site}`;
    apiKeyCache.delete(cacheKey);
    await deletePersistedKey(cacheKey);
}

/** Read all persisted keys from SecretStorage. */
async function getAllPersistedKeys(): Promise<Record<string, PersistedHelixKey>> {
    const raw = await secretStorage?.get(HELIX_KEYS_STATE_KEY);
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Record<string, PersistedHelixKey>;
    } catch {
        return {};
    }
}

/** Read a persisted key entry (returns undefined if missing or expired). */
export async function getPersistedKey(cacheKey: string): Promise<PersistedHelixKey | undefined> {
    const keys = await getAllPersistedKeys();
    const entry = keys[cacheKey];
    if (!entry || Date.now() >= entry.expiresAt) {
        return undefined;
    }
    return entry;
}

/** Read a persisted key entry regardless of expiry (for old key deletion). */
export async function getPersistedKeyRaw(cacheKey: string): Promise<PersistedHelixKey | undefined> {
    const keys = await getAllPersistedKeys();
    return keys[cacheKey];
}

/** Write a persisted key entry to encrypted storage. */
export async function setPersistedKey(cacheKey: string, key: PersistedHelixKey): Promise<void> {
    if (!secretStorage) return;
    const keys = await getAllPersistedKeys();
    keys[cacheKey] = key;
    await secretStorage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(keys));
}

/** Remove a persisted key entry from encrypted storage. */
export async function deletePersistedKey(cacheKey: string): Promise<void> {
    if (!secretStorage) return;
    const keys = await getAllPersistedKeys();
    delete keys[cacheKey];
    await secretStorage.store(HELIX_KEYS_STATE_KEY, JSON.stringify(keys));
}
