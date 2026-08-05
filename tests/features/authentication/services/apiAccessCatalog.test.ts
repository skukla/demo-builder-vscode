/**
 * buildApiAccessCatalog — turns the raw `getServicesForOrg` catalog (~90 rows,
 * with disabled duplicates, deprecated entries, and product families) into the
 * clean, deduped, classified rows the API-access picker shows.
 *
 * Pins the noise-filtering + gating rules the live probe established:
 *   - keep only `enabled !== false` rows (plus profile-missing disabled rows)
 *   - dedupe by code, preferring the enabled variant
 *   - `requiresApproval` → requiresReview; `USER_MISSING_PRODUCT_PROFILES` →
 *     requiresProfile; other disabled reasons (DEPRECATED, …) are hidden
 *   - carry `cloudGrouping` through as `group`
 */

import { buildApiAccessCatalog } from '@/features/authentication/services/apiAccessCatalog';
import type { OrgServiceInfo } from '@/features/authentication/services/types';

const EC = { code: 'marketing_cloud', name: 'Experience Cloud' };
const AEP = { code: 'experience_platform', name: 'Adobe Experience Platform' };

function svc(over: Partial<OrgServiceInfo> & { code: string }): OrgServiceInfo {
    return { name: over.code, enabled: true, ...over };
}

describe('buildApiAccessCatalog', () => {
    it('keeps enabled rows and carries name + product group through', () => {
        const rows = buildApiAccessCatalog([
            svc({ code: 'ACCS-REST-API', name: 'Adobe Commerce', cloudGrouping: EC }),
        ]);
        expect(rows).toEqual([
            {
                code: 'ACCS-REST-API',
                name: 'Adobe Commerce',
                group: EC,
                requiresReview: false,
                requiresProfile: false,
            },
        ]);
    });

    it('flags requiresReview from requiresApproval (the "Requires Adobe review" badge)', () => {
        const [row] = buildApiAccessCatalog([
            svc({ code: 'AdobeCommerceWithAdobeID', requiresApproval: true, cloudGrouping: EC }),
        ]);
        expect(row.requiresReview).toBe(true);
        expect(row.requiresProfile).toBe(false);
    });

    it('flags requiresProfile from a disabled USER_MISSING_PRODUCT_PROFILES row (not licenseConfigs)', () => {
        const [row] = buildApiAccessCatalog([
            svc({
                code: 'AEMAssetsAuthor',
                enabled: false,
                disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'],
                licenseConfigs: [], // empty — the old heuristic would MISS this
            }),
        ]);
        expect(row.requiresProfile).toBe(true);
        expect(row.requiresReview).toBe(false);
    });

    it('hides deprecated / unsupported / exception disabled rows', () => {
        const rows = buildApiAccessCatalog([
            svc({ code: 'DeprecatedOne', enabled: false, disabledReasons: ['DEPRECATED'] }),
            svc({ code: 'Unsupported', enabled: false, disabledReasons: ['UNSUPPORTED_ORG_TYPE'] }),
            svc({ code: 'Broken', enabled: false, disabledReasons: ['EXCEPTION'] }),
        ]);
        expect(rows).toEqual([]);
    });

    it('dedupes by code, preferring the enabled variant over a disabled duplicate', () => {
        const rows = buildApiAccessCatalog([
            svc({ code: 'ACCS-REST-API', enabled: false, disabledReasons: ['EXCEPTION'] }),
            svc({ code: 'ACCS-REST-API', enabled: true, cloudGrouping: EC }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ code: 'ACCS-REST-API', group: EC });
    });

    it('always keeps a code named in `keep` even if it were disabled', () => {
        const rows = buildApiAccessCatalog(
            [svc({ code: 'GraphQLServiceSDK', enabled: false, disabledReasons: ['DEPRECATED'] })],
            new Set(['GraphQLServiceSDK'])
        );
        expect(rows.map((r) => r.code)).toEqual(['GraphQLServiceSDK']);
    });

    it('treats a missing `enabled` field as enabled (back-compat with lean fixtures)', () => {
        const rows = buildApiAccessCatalog([{ code: 'LeanRow', name: 'Lean' }]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            code: 'LeanRow',
            requiresReview: false,
            requiresProfile: false,
        });
    });

    it('falls back to the code when no display name is present', () => {
        const [row] = buildApiAccessCatalog([{ code: 'NoName', enabled: true }]);
        expect(row.name).toBe('NoName');
    });

    it('mixes a realistic catalog down to the pickable + gated survivors', () => {
        const rows = buildApiAccessCatalog([
            svc({ code: 'GraphQLServiceSDK', name: 'API Mesh', cloudGrouping: AEP }),
            svc({ code: 'AdobeCommerceWithAdobeID', requiresApproval: true, cloudGrouping: EC }),
            svc({
                code: 'AEMAssetsAuthor',
                enabled: false,
                disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'],
            }),
            svc({ code: 'OldThing', enabled: false, disabledReasons: ['DEPRECATED'] }),
            svc({ code: 'GraphQLServiceSDK', enabled: false, disabledReasons: ['EXCEPTION'] }),
        ]);
        expect(rows.map((r) => r.code).sort()).toEqual([
            'AEMAssetsAuthor',
            'AdobeCommerceWithAdobeID',
            'GraphQLServiceSDK',
        ]);
    });
});
