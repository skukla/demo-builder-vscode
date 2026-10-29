/**
 * Which catalog row a service resolves to, when Adobe lists the code more than once.
 *
 * FIXTURES ARE THE LIVE SHAPE, ANONYMISED. On 2026-09-21 `getServicesForOrg` was
 * read repeatedly against a real org. ACCS-REST-API came back as two rows — one
 * `type: "adobeid"` with web/SPA/native platforms, one `type: "entp"` with none —
 * and across twenty minutes the pair arrived in THREE shapes. The ids, profile
 * names and tenant below are made up; the fields, their placement, and which row
 * carries what are copied from those reads. Do not "simplify" them: the shape is
 * the whole test.
 *
 * The rule used to be "the row that has `properties`". It picked the row with NO
 * profiles whenever both carried `properties` and the wrong one came first.
 */

import { resolveServiceInfos } from '@/features/app-builder/services/apiServiceResolution';
import type { OrgServiceInfo } from '@/features/authentication/services/types';

const PROFILE = {
    id: 'p-tenant',
    productId: 'prod-accs',
    name: 'Default - Tenant123abc',
    description: 'Tenant123abc',
};

/** The user sign-in row. Never carries profiles in any read. */
function signInRow(properties?: OrgServiceInfo['properties']): OrgServiceInfo {
    return {
        code: 'ACCS-REST-API',
        name: 'Adobe Commerce as a Cloud Service',
        type: 'adobeid',
        platformList: ['WebApp', 'SinglePageApp', 'NativeApp'],
        oauthServerToServerOnly: true,
        enabled: true,
        disabledReasons: [],
        ...(properties !== undefined ? { properties } : {}),
    } as OrgServiceInfo;
}

/** The server-to-server row — where the profiles live. */
function serverRow(properties?: OrgServiceInfo['properties']): OrgServiceInfo {
    return {
        code: 'ACCS-REST-API',
        name: 'Adobe Commerce as a Cloud Service',
        type: 'entp',
        oauthServerToServerOnly: true,
        enabled: true,
        disabledReasons: [],
        ...(properties !== undefined ? { properties } : {}),
    } as OrgServiceInfo;
}

const profilesOf = (rows: OrgServiceInfo[]) =>
    resolveServiceInfos(['ACCS-REST-API'], rows)[0].licenseConfigs?.length ?? 0;

describe('picking the server-to-server row', () => {
    it('finds the profiles when only the right row carries them', () => {
        expect(profilesOf([signInRow(), serverRow({ licenseConfigs: [PROFILE] })])).toBe(1);
    });

    // THE regression. Both rows carry `properties`, the sign-in one first and
    // empty. "First row with properties" took it and resolved to zero profiles.
    it('finds the profiles when BOTH rows carry properties and the wrong one is first', () => {
        const rows = [signInRow({}), serverRow({ licenseConfigs: [PROFILE] })];

        expect(profilesOf(rows)).toBe(1);
    });

    it('does not depend on the order Adobe lists them in', () => {
        const rows = [serverRow({ licenseConfigs: [PROFILE] }), signInRow({})];

        expect(profilesOf(rows)).toBe(1);
    });

    /**
     * A response without `type` at all — the 2026-09-16 fixture in
     * apiSubscriber.test.ts records exactly that. Both ACCS rows are marked
     * `oauthServerToServerOnly`, so "first server-to-server row" takes the sign-in
     * one. The first draft of this fix did that, and that pin caught it.
     */
    it('still finds the profiles when Adobe sends no type label', () => {
        const unlabelled = (row: OrgServiceInfo): OrgServiceInfo => {
            const { type: _type, ...rest } = row;
            return rest as OrgServiceInfo;
        };
        const rows = [unlabelled(signInRow()), unlabelled(serverRow({ licenseConfigs: [PROFILE] }))];

        expect(profilesOf(rows)).toBe(1);
    });

    // The third shape: neither row carries anything. Resolution cannot conjure
    // profiles, so it reports none — and the REFUSAL for that lives in
    // buildSubscriptionList, which knows whether the service is being added.
    it('reports no profiles when neither row carries them', () => {
        expect(profilesOf([signInRow(), serverRow()])).toBe(0);
    });

    // API Mesh has a single sign-in / apiKey row and rides the OTHER credential
    // path. With no `entp` row to prefer, it must resolve exactly as before.
    it('leaves a service with no entp row alone', () => {
        const mesh = {
            code: 'GraphQLServiceSDK',
            name: 'API Mesh',
            type: 'adobeid',
            platformList: ['apiKey'],
        } as OrgServiceInfo;

        expect(resolveServiceInfos(['GraphQLServiceSDK'], [mesh])[0].platformList).toEqual([
            'apiKey',
        ]);
    });
});

describe('reading Adobe\'s own "no access" verdict', () => {
    it('marks a service disabled for USER_MISSING_PRODUCT_PROFILES', () => {
        const noAccess = {
            ...serverRow(),
            enabled: false,
            disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'],
        } as OrgServiceInfo;

        expect(resolveServiceInfos(['ACCS-REST-API'], [noAccess])[0].profileAccessMissing).toBe(
            true,
        );
    });

    it('does NOT mark one disabled for a different reason', () => {
        const other = {
            ...serverRow(),
            enabled: false,
            disabledReasons: ['PENDING_ADOBE_REVIEW'],
        } as OrgServiceInfo;

        expect(resolveServiceInfos(['ACCS-REST-API'], [other])[0].profileAccessMissing).toBe(
            false,
        );
    });

    it('CONTROL: an enabled service is not marked', () => {
        expect(
            resolveServiceInfos(['ACCS-REST-API'], [serverRow({ licenseConfigs: [PROFILE] })])[0]
                .profileAccessMissing,
        ).toBe(false);
    });
});
