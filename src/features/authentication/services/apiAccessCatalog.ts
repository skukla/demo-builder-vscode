/**
 * apiAccessCatalog — interpret the raw `getServicesForOrg` catalog for the
 * API-access picker.
 *
 * `getServicesForOrg` returns the org's WHOLE entitled catalog (~90 rows),
 * including disabled duplicates, deprecated entries, and product-family
 * metadata. This turns that into the clean rows the picker shows:
 *   - keep only usable rows: `enabled !== false`, plus disabled rows whose only
 *     blocker is a missing product profile (still worth surfacing, disabled);
 *   - dedupe by code, preferring the enabled variant (the catalog ships the same
 *     code twice — enabled + disabled — which otherwise duplicates picker rows);
 *   - classify gating from the ACCURATE signals: `requiresApproval` → "Requires
 *     Adobe review", `USER_MISSING_PRODUCT_PROFILES` → "Requires a product
 *     profile" (NOT the `licenseConfigs` length, which the live catalog proved
 *     wrong — profile-missing rows carry an empty `licenseConfigs`);
 *   - carry `cloudGrouping` through as the product `group` for sub-headers.
 *
 * Pure and shared by the wizard + dashboard console-API handlers.
 *
 * @module features/authentication/services/apiAccessCatalog
 */

import type { OrgServiceInfo } from './types';
import type { CloudGrouping } from '@/types/adobeApis';

/** The disabled-reason that means "you could subscribe, but you lack a product profile". */
const PROFILE_MISSING_REASON = 'USER_MISSING_PRODUCT_PROFILES';

/** A picker-ready row: deduped, entitlement-filtered, gating classified. */
export interface ApiCatalogRow {
    /** The service sdkCode (subscriptions key on it). */
    code: string;
    /** Display name (falls back to the code). */
    name: string;
    /** Product family (Console's "Filter by product"); absent when the catalog omits it. */
    group?: CloudGrouping;
    /** Adobe must approve access first — shown disabled under "Requires Adobe review". */
    requiresReview: boolean;
    /** Blocked only by a missing product profile — shown disabled under "Requires a product profile". */
    requiresProfile: boolean;
}

/** A row is enabled unless the catalog explicitly says `enabled: false`. */
function isEnabled(service: OrgServiceInfo): boolean {
    return service.enabled !== false;
}

/** Disabled solely because the user lacks a product profile. */
function isProfileMissing(service: OrgServiceInfo): boolean {
    return (
        service.enabled === false &&
        (service.disabledReasons ?? []).includes(PROFILE_MISSING_REASON)
    );
}

/**
 * Rank for dedupe: the enabled variant wins, then a profile-missing variant,
 * then anything else (which will be dropped unless `keep` retains its code).
 */
function rank(service: OrgServiceInfo): number {
    if (isEnabled(service)) return 2;
    if (isProfileMissing(service)) return 1;
    return 0;
}

/**
 * Reduce the raw org services to clean, deduped, classified picker rows.
 *
 * @param services - the raw `getServicesForOrg` catalog
 * @param keep - codes to retain regardless of entitlement (the reconcile union:
 *   locked/managed codes must always appear even if the catalog marks them
 *   disabled)
 * @returns picker-ready rows in first-seen order (the picker re-sorts)
 */
export function buildApiAccessCatalog(
    services: OrgServiceInfo[],
    keep?: Set<string>,
): ApiCatalogRow[] {
    // Dedupe by code, keeping the highest-ranked variant (first-seen order preserved).
    const best = new Map<string, OrgServiceInfo>();
    for (const service of services) {
        const current = best.get(service.code);
        if (!current || rank(service) > rank(current)) {
            best.set(service.code, service);
        }
    }

    const rows: ApiCatalogRow[] = [];
    for (const service of best.values()) {
        const enabled = isEnabled(service);
        const profileMissing = isProfileMissing(service);
        const forced = keep?.has(service.code) ?? false;
        // Drop the noise: deprecated / unsupported / broken rows the self-serve
        // flow can neither use nor act on. A `keep` code always survives.
        if (!enabled && !profileMissing && !forced) continue;
        rows.push({
            code: service.code,
            name: service.name ?? service.code,
            group: service.cloudGrouping,
            requiresReview: enabled && service.requiresApproval === true,
            requiresProfile: profileMissing,
        });
    }
    return rows;
}
