/**
 * The list a credential is sent on subscribe: what it holds, kept; what the deploy
 * needs, added; a Commerce profile chosen by the configured tenant, never guessed.
 * Profile shapes copied from a live getServicesForOrg / getSDKProperties read
 * (2026-09-19); ids replaced.
 */
import {
    alreadySubscribed,
    buildSubscriptionList,
    profileForTenant,
} from '@/features/app-builder/services/subscriptionList';
import type { ServiceInfo } from '@/features/app-builder/services/apiServiceResolution';
import type { ServiceLicenseConfig } from '@/features/authentication/services/types';

const BODEA = { id: 'p-bodea', productId: 'prod-accs', name: 'Default - Tenant123abc', description: 'Tenant123abc' };
const OTHER = { id: 'p-other', productId: 'prod-accs', name: 'Default - OtherTenant', description: 'OtherTenant' };
const NONE: ReadonlySet<string> = new Set();

/** A resolved service as `resolveServiceInfos` returns it. */
function svc(sdkCode: string, licenseConfigs?: ServiceLicenseConfig[]): ServiceInfo {
    return { sdkCode, platformList: ['oauth_server_to_server'], domainMandatory: false, licenseConfigs };
}

describe('buildSubscriptionList', () => {
    it('keeps a service the deploy does not need, with its profile', () => {
        const list = buildSubscriptionList(
            [svc('AdobeIOManagementAPISDK')],
            [{ sdkCode: 'ACCS-REST-API', licenseConfigs: [BODEA] }],
            NONE,
            undefined,
        );

        expect(list).toStrictEqual([
            {
                sdkCode: 'ACCS-REST-API',
                licenseConfigs: [{ op: 'add', id: 'p-bodea', productId: 'prod-accs' }],
                roles: null,
            },
            { sdkCode: 'AdobeIOManagementAPISDK', licenseConfigs: null, roles: null },
        ]);
    });

    it('drops only what is being removed', () => {
        const list = buildSubscriptionList(
            [],
            [
                { sdkCode: 'ACCS-REST-API', licenseConfigs: [BODEA] },
                { sdkCode: 'DroppedSDK', licenseConfigs: [] },
            ],
            new Set(['DroppedSDK']),
            undefined,
        );

        expect(list.map((s) => s.sdkCode)).toStrictEqual(['ACCS-REST-API']);
    });

    it('adds a missing profile service with the profile naming the tenant', () => {
        const list = buildSubscriptionList(
            [svc('ACCS-REST-API', [OTHER, BODEA])],
            [],
            NONE,
            'Tenant123abc',
        );

        expect(list).toStrictEqual([
            {
                sdkCode: 'ACCS-REST-API',
                licenseConfigs: [{ op: 'add', id: 'p-bodea', productId: 'prod-accs' }],
                roles: null,
            },
        ]);
    });

    it('does not touch a profile service the credential already has', () => {
        const list = buildSubscriptionList(
            [svc('ACCS-REST-API', [OTHER, BODEA])],
            [{ sdkCode: 'ACCS-REST-API', licenseConfigs: [BODEA] }],
            NONE,
            undefined,
        );

        expect(list).toHaveLength(1);
        expect(list[0].licenseConfigs).toStrictEqual([{ op: 'add', id: 'p-bodea', productId: 'prod-accs' }]);
    });
});

describe('profileForTenant', () => {
    const service = { ...svc('ACCS-REST-API', [OTHER, BODEA]), name: 'Adobe Commerce' };

    it('matches the tenant in any case', () => {
        expect(profileForTenant(service, 'tenant123ABC')).toBe(BODEA);
    });

    it('takes the only profile on offer without needing a tenant', () => {
        expect(profileForTenant(svc('ACCS-REST-API', [BODEA]), undefined)).toBe(BODEA);
    });

    it('refuses when several are on offer and no Commerce instance is configured', () => {
        expect(() => profileForTenant(service, undefined)).toThrow('no Commerce instance configured');
    });

    it('refuses when no profile names the tenant', () => {
        expect(() => profileForTenant(service, 'Missing')).toThrow('0 of the org');
    });

    it('refuses when several profiles name the tenant', () => {
        const twice = { ...service, licenseConfigs: [BODEA, { ...BODEA, id: 'p-copy' }] };

        expect(() => profileForTenant(twice, 'Tenant123abc')).toThrow('2 of the org');
    });
});

describe('alreadySubscribed', () => {
    it('is true only when nothing is missing and nothing is leaving', () => {
        const current = [{ sdkCode: 'A', licenseConfigs: [] }, { sdkCode: 'B', licenseConfigs: [] }];

        expect(alreadySubscribed([{ sdkCode: 'A' }], current, NONE)).toBe(true);
        expect(alreadySubscribed([{ sdkCode: 'C' }], current, NONE)).toBe(false);
        expect(alreadySubscribed([{ sdkCode: 'A' }], current, new Set(['B']))).toBe(false);
    });
});
