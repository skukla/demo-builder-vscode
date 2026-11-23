/**
 * The org a datapack request names, and what to say when a store turns the sign-in away.
 *
 * Split out of `dataInstallerHandlers.ts` on 2026-11-16 (release test 1.4), when the org
 * lookup stopped sending a request without an org.
 *
 * @module features/data-installer/handlers/serviceOrg
 */

import { orgNumberOf } from '../services/dataInstallerSignIn';
import type { DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** The setting holding each store's address, which a failure offers to open. */
export const STORE_ADDRESS_SETTING: Record<DatapackStoreName, string> = {
    installer: 'demoBuilder.dataInstaller.apiBaseUrl',
    library: 'demoBuilder.datapackStore.apiBaseUrl',
};

/** What each store is called on screen, inside a sentence. */
const STORE_NAME: Record<DatapackStoreName, string> = {
    installer: 'the Data Installer',
    library: 'the datapack library',
};

type AuthManager = NonNullable<HandlerContext['authManager']>;
type OrgLookup = { orgCode?: string } | { refusal: HandlerResponse };

/** Adobe's org list, SDK only (it never opens a browser); undefined when Adobe did not answer. */
async function listOrgs(authManager: AuthManager, logger: HandlerContext['logger']) {
    try {
        return await (await authManager.getEntityServices()).orgReads.getOrganizationsSdkOnly();
    } catch (error) {
        logger.warn(`${LOG_PREFIX} Could not list Adobe orgs: ${(error as Error).message}`);
        return undefined;
    }
}

/**
 * The org the requests name, for the gateway's `x-gw-ims-org-id`: the org that RUNS the
 * service, read off its address and found in the sign-in's own orgs for its code. The
 * service refuses a request that names any other org, or none ("missing x-gw-ims-org-id
 * header", Stage, 2026-10-27).
 *
 * The cache is read first, but only counts when it IS that org. When Adobe does not answer
 * the org list, the Console client may still hold a sign-in that has since been replaced
 * (the Adobe CLI signs in again on its own), so it starts again from the stored sign-in and
 * asks once more. If Adobe still does not answer, the request is refused here, saying so:
 * it used to go without an org, and the store's "missing x-gw-ims-org-id header" reached
 * the SC instead (release test 1.4, 2026-11-16).
 *
 * @param authManager - the Adobe sign-in
 * @param baseUrl - the store's address, whose host names the org that runs it
 * @param logger - where a failed lookup is logged
 * @param store - which store is asked, for the words of a refusal
 * @returns the org code (none when the address names no org), or the refusal to return
 */
export async function serviceOrgCode(
    authManager: AuthManager,
    baseUrl: string,
    logger: HandlerContext['logger'],
    store: DatapackStoreName,
): Promise<OrgLookup> {
    const orgNumber = orgNumberOf(baseUrl);
    if (!orgNumber) return {};
    const cached = authManager.getCacheManager().getCachedOrganization();
    if (cached?.id === orgNumber) return { orgCode: cached.code };
    let orgs = await listOrgs(authManager, logger);
    if (!orgs) {
        logger.warn(
            `${LOG_PREFIX} Adobe did not list the orgs; starting its Console client again and asking once more.`,
        );
        authManager.getSdkClient().clear();
        orgs = await listOrgs(authManager, logger);
    }
    if (!orgs) {
        return {
            refusal: {
                success: false,
                error: "Adobe didn't confirm your sign-in, so the request wasn't sent. Sign in to Adobe again, then retry.",
                code: ErrorCode.AUTH_FORBIDDEN,
            },
        };
    }
    const org = orgs.find((candidate) => candidate.id === orgNumber);
    if (org) return { orgCode: org.code };
    return {
        refusal: {
            success: false,
            error:
                `Your Adobe sign-in isn't in the Adobe org that runs ${STORE_NAME[store]} (org ${orgNumber}). ` +
                'Sign in with an account in that org, or change its address in Settings.',
            code: ErrorCode.AUTH_FORBIDDEN,
            setting: STORE_ADDRESS_SETTING[store],
        },
    };
}

/**
 * The response for a store that answered 401 or 403. Only reached past the guard, so the SC
 * is signed in: the STORE turned the sign-in away, and signing in again may hand it the same
 * one. The store's own reply is in Debug Logs, not on screen (release test 1.4).
 *
 * @param store - which store answered
 * @returns the failure, with the address setting to open for the Data Installer, whose Stage
 *          deployment refuses a sign-in its Production one takes (2026-10-27)
 */
export function signInRefused(store: DatapackStoreName): HandlerResponse {
    if (store === 'library') {
        return {
            success: false,
            error: "The datapack library didn't accept your Adobe sign-in. Sign in to Adobe again, then retry.",
            code: ErrorCode.AUTH_FORBIDDEN,
        };
    }
    return {
        success: false,
        error:
            "The Data Installer didn't accept your Adobe sign-in. Its address in Settings may point at a " +
            "deployment that doesn't take your sign-in.",
        code: ErrorCode.AUTH_FORBIDDEN,
        setting: STORE_ADDRESS_SETTING.installer,
    };
}
