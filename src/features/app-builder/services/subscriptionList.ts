/**
 * The service list a credential is sent on subscribe — what it already has, plus
 * what a deploy needs.
 *
 * WHY A MERGE. Adobe's subscribe call REPLACES a credential's whole service list.
 * The subscriber used to send only the services the deploy needed, so every other
 * service — and every product profile — was removed. Measured live on 2026-09-19: an
 * ERP redeploy took ACCS-REST-API and its one Commerce profile off Kukla Bodea /
 * Stage, and the integration after it could not put them back. So the list is built
 * from the credential's CURRENT subscriptions, carried unchanged, and only what is
 * missing is added. A service leaves only when a caller names it in `removing`
 * (Manage APIs unchecking it).
 *
 * WHICH PROFILE. A missing service that offers product profiles (Commerce does,
 * 105 in this org) cannot be subscribed without one — Adobe answers "requires
 * selection of a product". The profile attached is the one whose description names
 * the project's configured Commerce tenant: the rule the owner set fixing Bodea by
 * hand. Exactly one match is attached; none or several is a refusal, because a
 * guessed profile grants access to the wrong instance — and attaching all of them
 * locks out anyone who isn't a developer on every one.
 *
 * @module features/app-builder/services/subscriptionList
 */

import type { ServiceInfo } from './apiServiceResolution';
import type {
    ServiceLicenseConfig,
    ServiceSubscriptionInfo,
    SubscribedService,
} from '@/features/authentication/services/types';

/** Why nothing is sent when the credential's current list cannot be read. */
export const UNKNOWN_CURRENT =
    "Couldn't read which APIs the credential already has, so nothing was changed — " +
    'subscribing from a partial list would remove the rest. Try again.';

/**
 * True when the credential already carries every needed code AND none of the codes
 * being removed — so the slow PUT (~30s, sometimes minutes) can be skipped.
 *
 * The removal half: a removal happens only through the full-list PUT. Skipping
 * whenever every NEEDED code was present meant a removal never reached Adobe, since
 * after a removal every remaining code always is (found reading the code, 2026-09-18).
 */
export function alreadySubscribed(
    needed: Pick<ServiceInfo, 'sdkCode'>[],
    current: SubscribedService[],
    removing: ReadonlySet<string>,
): boolean {
    const codes = current.map((service) => service.sdkCode);
    return needed.every((s) => codes.includes(s.sdkCode)) && !codes.some((code) => removing.has(code));
}

/** The profile entry shape the aio CLI's project installer sends (`configure-apis.js`). */
function asLicenseConfigs(profiles: ServiceLicenseConfig[]): ServiceSubscriptionInfo['licenseConfigs'] {
    if (profiles.length === 0) return null;
    return profiles.map((profile) => ({ op: 'add', id: profile.id, productId: profile.productId }));
}

/**
 * The one profile for this project's Commerce instance, or a refusal saying why not.
 * An org offering a single profile needs no choosing; one offering several (105 for
 * Commerce here) is matched on the configured tenant.
 *
 * @throws when there are several and no tenant is configured, or zero or several name it
 */
export function profileForTenant(
    service: Pick<ServiceInfo, 'sdkCode' | 'name' | 'licenseConfigs'>,
    tenant: string | undefined,
): ServiceLicenseConfig {
    const label = service.name ?? service.sdkCode;
    const profiles = service.licenseConfigs ?? [];
    // One on offer: nothing to choose (and nothing another instance could lose).
    if (profiles.length === 1) return profiles[0];
    if (!tenant) {
        throw new Error(
            `${label} needs a product profile, and this project has no Commerce instance ` +
                'configured to choose one for. Nothing was changed.',
        );
    }
    const wanted = tenant.toLowerCase();
    const matches = profiles.filter((profile) =>
        `${profile.name ?? ''} ${profile.description ?? ''}`.toLowerCase().includes(wanted),
    );
    if (matches.length !== 1) {
        throw new Error(
            `${label} needs the product profile for Commerce instance ${tenant}, and ` +
                `${matches.length} of the org's ${profiles.length} profiles name it. ` +
                'Nothing was changed.',
        );
    }
    return matches[0];
}

/**
 * The full list to send: every current subscription not being removed, with its
 * profiles, plus each needed service that is not there yet.
 *
 * @param needed - the services this deploy needs
 * @param current - what the credential holds now (never a guess — see the caller)
 * @param removing - codes to take off
 * @param tenant - the configured Commerce tenant, for services that need a profile
 */
export function buildSubscriptionList(
    needed: ServiceInfo[],
    current: SubscribedService[],
    removing: ReadonlySet<string>,
    tenant: string | undefined,
): ServiceSubscriptionInfo[] {
    const kept = current
        .filter((service) => !removing.has(service.sdkCode))
        .map((service) => ({
            sdkCode: service.sdkCode,
            licenseConfigs: asLicenseConfigs(service.licenseConfigs),
            roles: null,
        }));
    const have = new Set(current.map((service) => service.sdkCode));
    const added = needed
        .filter((service) => !have.has(service.sdkCode))
        .map((service) => ({
            sdkCode: service.sdkCode,
            licenseConfigs: service.licenseConfigs?.length
                ? asLicenseConfigs([profileForTenant(service, tenant)])
                : null,
            roles: null,
        }));
    return [...kept, ...added];
}
