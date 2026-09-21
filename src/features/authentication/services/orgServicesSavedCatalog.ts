/**
 * The org's API list, saved between sessions.
 *
 * The list is Adobe's catalog of API names the org can subscribe to — the same
 * for every workspace, and it barely changes — while fetching it cold takes about
 * a minute and can hit Adobe's 60s gateway cutoff. Kept in memory only, every
 * window reload threw it away; on 2026-09-21 the first Manage APIs after a reload
 * hit that cutoff twice running. So each successful load is saved per org, and a
 * new session starts from it ({@link AdobeOrgServices} refreshes it when old).
 *
 * @module features/authentication/services/orgServicesSavedCatalog
 */

import type { OrgServiceInfo } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';

/**
 * Where the org's API list is kept between sessions. Production passes
 * `context.globalState`; this is the two methods of it that are used.
 */
export interface OrgServicesStore {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

/** One org's saved list, and when Adobe sent it. */
interface SavedCatalog {
    services: OrgServiceInfo[];
    fetchedAt: number;
}

const savedCatalogKey = (orgId: string): string => `demoBuilder.orgServicesCatalog.${orgId}`;

/** A saved value is used only if it is a non-empty list with a timestamp. */
function isSavedCatalog(value: unknown): value is SavedCatalog {
    const saved = value as Partial<SavedCatalog> | undefined;
    return typeof saved?.fetchedAt === 'number' &&
        Array.isArray(saved.services) && saved.services.length > 0;
}

/** The org's saved list, or `undefined` when there is none worth using. */
function readSavedCatalog(
    store: OrgServicesStore | undefined,
    orgId: string,
): SavedCatalog | undefined {
    const saved = store?.get<unknown>(savedCatalogKey(orgId));
    return isSavedCatalog(saved) ? saved : undefined;
}

/** Save a fresh list for the next session. A failed save costs only that. */
function saveCatalog(
    store: OrgServicesStore | undefined,
    orgId: string,
    services: OrgServiceInfo[],
): void {
    if (!store) {
        return;
    }
    const saved: SavedCatalog = { services, fetchedAt: Date.now() };
    Promise.resolve(store.update(savedCatalogKey(orgId), saved)).catch((error) => {
        getLogger().debug('[Entity Fetcher] Could not save the org services list', error);
    });
}

/** A kept copy of an org's list, and when it stops being fresh. */
export interface CatalogCopy {
    services: OrgServiceInfo[];
    expiresAt: number;
}

/**
 * Each org's kept API list: in memory for this session, and saved so the next
 * session starts from it instead of waiting on Adobe. A copy read back from the
 * store keeps its original age, so an old one is refreshed straight away.
 */
export class OrgServicesCatalog {
    private readonly copies = new Map<string, CatalogCopy>();

    constructor(private readonly store?: OrgServicesStore) {}

    /** The org's kept copy — from memory, else from the store — or `undefined`. */
    get(orgId: string): CatalogCopy | undefined {
        const kept = this.copies.get(orgId);
        if (kept) {
            return kept;
        }
        const saved = readSavedCatalog(this.store, orgId);
        if (!saved) {
            return undefined;
        }
        const copy = { services: saved.services, expiresAt: saved.fetchedAt + CACHE_TTL.ORG_SERVICES };
        this.copies.set(orgId, copy);
        return copy;
    }

    /** Keep a freshly fetched list, in memory and in the store. */
    keep(orgId: string, services: OrgServiceInfo[]): void {
        this.copies.set(orgId, { services, expiresAt: Date.now() + CACHE_TTL.ORG_SERVICES });
        saveCatalog(this.store, orgId, services);
    }
}
