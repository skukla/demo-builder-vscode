/**
 * Demo Builder makes the project's ACO credential itself, so the SC types none (PL-60,
 * owner 2026-10-31 P2): it adds Adobe's ACO ingestion API, and the admin API when the org has it, to the project's Developer Console
 * workspace credential, the OAuth server-to-server one App Builder's integrations already use and
 * create when missing (`ensureOAuthCredentialId`), reads that credential's client id and secret
 * (`getS2SDeployCredentials`), and keeps the pair in SecretStorage (`acoCredentialStore.ts`).
 *
 * Removing it is the reverse (owner's rule 1): the API is taken off the credential and the pair
 * forgotten. The credential itself stays: it is the workspace's shared one, which App Builder
 * integrations use too and which Demo Builder never deletes. Removal is refused while an ACO pack
 * Demo Builder loaded is still in the instance, because removing that pack needs the credential.
 *
 * The APIs are asked for by CODE. Read off the org's service list 2026-11-01: `ACO-Ingestion` and
 * `ACO-Admin`, each needing a product profile for the ACO instance. Looking them up by name in the
 * whole list failed: that list came back with and without them within minutes, and it marks
 * `ACO-Ingestion` `enabled: false` in an org where a credential holds it. Adobe's answer to the
 * subscribe is the verdict.
 *
 * @module features/app-builder/services/acoCredential
 */

import type { OrgServiceInfo } from '@/features/authentication/services/types';
import { type AcoSecretStore, forgetAcoCredential, saveAcoCredential } from '@/features/components/services/acoCredentialStore';
import type { AcoCredential } from '@/types/aco';

/** Adobe's Console codes for ACO's two APIs. */
export const ACO_INGESTION_API = 'ACO-Ingestion';
export const ACO_ADMIN_API = 'ACO-Admin';

/** A code in the list, or undefined when the org does not offer it. */
function offered(services: readonly OrgServiceInfo[], code: string): OrgServiceInfo | undefined {
    const matches = services.filter((service) => service.code === code);
    // A code listed once per access kind: the server-to-server row is the one a credential takes.
    return matches.find((service) => service.type === 'entp') ?? matches[0];
}

/** What setting the credential up needs, handed in so the steps are tested without Adobe. */
export interface AcoCredentialDeps {
    /** These codes' rows in the org's subscribable services (`getServicesForOrg`). */
    listOrgServices(codes: readonly string[]): Promise<OrgServiceInfo[]>;
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
export type AcoCredentialResult = { success: true; apiCode?: string; adminApiCode?: string } | { success: false; error: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Add the ACO ingestion API to the workspace credential and keep its client id and secret.
 * Running it again changes nothing that is already in place.
 */
export async function setUpAcoCredential(deps: AcoCredentialDeps): Promise<AcoCredentialResult> {
    try {
        const services = await deps.listOrgServices([ACO_INGESTION_API, ACO_ADMIN_API]);
        const api = offered(services, ACO_INGESTION_API);
        if (!api) {
            return {
                success: false,
                error:
                    'This Adobe org offers no Adobe Commerce Optimizer Ingestion API to subscribe, so Demo Builder cannot make the ' +
                    'ACO credential. Ask an org admin for Adobe Commerce Optimizer access, or check the org you are signed in to.',
            };
        }
        const admin = offered(services, ACO_ADMIN_API);
        const subscribed = await deps.setAcoApis([api.code, ...(admin ? [admin.code] : [])]);
        if (!subscribed.success) return { success: false, error: subscribed.error ?? `Adobe did not subscribe ${api.code}.` };
        await saveAcoCredential(deps.secrets, deps.projectPath, await deps.readCredential());
        return { success: true, apiCode: api.code, ...(admin ? { adminApiCode: admin.code } : {}) };
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
