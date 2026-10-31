/**
 * Demo Builder makes the project's ACO ingestion credential itself, so the SC types none (PL-60,
 * owner 2026-10-31 P2): it adds Adobe's ACO ingestion API to the project's Developer Console
 * workspace credential, the OAuth server-to-server one App Builder's integrations already use and
 * create when missing (`ensureOAuthCredentialId`), reads that credential's client id and secret
 * (`getS2SDeployCredentials`), and keeps the pair in SecretStorage (`acoCredentialStore.ts`).
 *
 * Removing it is the reverse (owner's rule 1): the API is taken off the credential and the pair
 * forgotten. The credential itself stays: it is the workspace's shared one, which App Builder
 * integrations use too and which Demo Builder never deletes. Removal is refused while an ACO pack
 * Demo Builder loaded is still in the instance, because removing that pack needs the credential.
 *
 * Which Console API is ACO's is looked up by NAME in the org's own service list, not by a code
 * written here: Adobe's docs name it "Adobe Commerce Optimizer Ingestion API" and say to give it an
 * OAuth server-to-server credential (developer.adobe.com/commerce/services/optimizer/data-ingestion/
 * authentication/, read 2026-10-31); no Adobe page read so far gives its sdk code. UNVERIFIED: the
 * name as the Console's service list spells it, and whether the service needs a product profile.
 *
 * @module features/app-builder/services/acoCredential
 */

import type { OrgServiceInfo } from '@/features/authentication/services/types';
import { type AcoSecretStore, forgetAcoCredential, saveAcoCredential } from '@/features/components/services/acoCredentialStore';
import type { AcoCredential } from '@/types/aco';

/** The API's name in Adobe's ingestion docs. */
export const ACO_INGESTION_API_NAME = 'Adobe Commerce Optimizer Ingestion API';

/** What the name match looks for, lower case: both words, whatever else the Console adds. */
const NAME_PARTS = ['commerce optimizer', 'ingestion'];

/** The ACO ingestion API in the org's service list, or undefined when the org has none it can use. */
export function findAcoIngestionApi(services: readonly OrgServiceInfo[]): OrgServiceInfo | undefined {
    const matches = services.filter((service) => {
        const name = (service.name ?? '').toLowerCase();
        return NAME_PARTS.every((part) => name.includes(part)) && service.enabled !== false;
    });
    // A code listed once per access kind: the server-to-server row is the one a credential takes.
    return matches.find((service) => service.type === 'entp') ?? matches[0];
}

/** What setting the credential up needs, handed in so the steps are tested without Adobe. */
export interface AcoCredentialDeps {
    /** The org's subscribable services (`getServicesForOrg`). */
    listOrgServices(): Promise<OrgServiceInfo[]>;
    /**
     * Set the ACO add-on's APIs on the workspace credential to exactly these codes, through the one
     * subscription spine (`reconcileExtras`), keeping every other owner's.
     */
    setAcoApis(codes: string[]): Promise<{ success: boolean; error?: string }>;
    /** The workspace credential's client id and secret (`getS2SDeployCredentials`). */
    readCredential(): Promise<AcoCredential>;
    secrets: AcoSecretStore;
    projectPath: string;
}

/** How setting it up or removing it went. */
export type AcoCredentialResult = { success: true; apiCode?: string } | { success: false; error: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Add the ACO ingestion API to the workspace credential and keep its client id and secret.
 * Running it again changes nothing that is already in place.
 */
export async function setUpAcoCredential(deps: AcoCredentialDeps): Promise<AcoCredentialResult> {
    try {
        const api = findAcoIngestionApi(await deps.listOrgServices());
        if (!api) {
            return {
                success: false,
                error:
                    `This Adobe org offers no "${ACO_INGESTION_API_NAME}" to subscribe, so Demo Builder cannot make the ` +
                    'ACO credential. Ask an org admin for Adobe Commerce Optimizer access, or check the org you are signed in to.',
            };
        }
        const subscribed = await deps.setAcoApis([api.code]);
        if (!subscribed.success) return { success: false, error: subscribed.error ?? `Adobe did not subscribe ${api.code}.` };
        await saveAcoCredential(deps.secrets, deps.projectPath, await deps.readCredential());
        return { success: true, apiCode: api.code };
    } catch (error) {
        return { success: false, error: `Could not set up the ACO credential: ${errorText(error)}` };
    }
}

/**
 * Take the ACO ingestion API off the workspace credential and forget the pair.
 *
 * @param loadedAcoPacks - the ACO packs Demo Builder loaded into this project's instance and has not removed
 */
export async function removeAcoCredential(
    deps: Pick<AcoCredentialDeps, 'setAcoApis' | 'secrets' | 'projectPath'>,
    loadedAcoPacks: readonly string[],
): Promise<AcoCredentialResult> {
    if (loadedAcoPacks.length > 0) {
        return {
            success: false,
            error:
                `Remove the ACO packs Demo Builder loaded first (${loadedAcoPacks.join(', ')}): removing them needs this credential, ` +
                'and ACO cannot be read back to find them later.',
        };
    }
    try {
        const unsubscribed = await deps.setAcoApis([]);
        if (!unsubscribed.success) return { success: false, error: unsubscribed.error ?? 'Adobe did not take the ACO API off the credential.' };
        await forgetAcoCredential(deps.secrets, deps.projectPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: `Could not remove the ACO credential: ${errorText(error)}` };
    }
}
