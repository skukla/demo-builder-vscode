/**
 * Which products a new ERP will own, read and saved through the integration (AB-64): what
 * the "Add another ERP" dialog needs before the add (the store's websites, each product's
 * codes, each existing ERP's rule), and the save of each ERP's rule onto its list entry
 * (`PATCH erp/erps`) before the new ERP is filled.
 *
 * A composition file: it wires the fill's Commerce readers and the integration's client into
 * the pure rules in `erpOwnership.ts`.
 *
 * @module features/project-creation/services/erpOwnershipSync
 */

import { commerceGetForProject } from './erpFillForProject';
import { listedErpNames, readErpRules, type ListedErpName } from './erpRules';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { listProducts, listWebsites, type CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import { ownedRowOf } from '@/features/app-builder/services/erpFillRows';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { ownsSettingsOf } from '@/features/app-builder/services/erpOwnership';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project } from '@/types/base';
import type { ErpOwnershipOptions, ErpOwnsEntry } from '@/types/erpOwnership';

/** The attribute every ERP's default rule reads; always carried on the product rows. */
const OWNER_ATTRIBUTE = 'erp_owner';

export interface ErpOwnershipReadDeps {
    get: CommerceGet;
    client: ErpIntegrationClient;
}

/** The attribute codes the ERPs' rules name, plus `erp_owner`. */
function attributeCodesOf(erps: readonly ErpOwnsEntry[]): string[] {
    const named = erps.flatMap((entry) => {
        const code = entry.owns.attribute?.split('=')[0]?.trim();
        return code ? [code] : [];
    });
    return [...new Set([OWNER_ATTRIBUTE, ...named])];
}

/**
 * What the dialog needs before an add. Reads Commerce the way the fill does (the same
 * products and websites reads), and each ERP's rule through the integration.
 *
 * @param deps - Commerce and the integration's client
 * @param erps - the ERPs the integration serves now, by list id and name
 * @returns the options; throws with the reader's words when a read fails
 */
export async function readErpOwnershipOptions(
    deps: ErpOwnershipReadDeps,
    erps: readonly ListedErpName[],
): Promise<ErpOwnershipOptions> {
    const [products, websites, rules] = await Promise.all([
        listProducts(deps.get),
        listWebsites(deps.get),
        readErpRules(deps.client, erps),
    ]);
    const codes = attributeCodesOf(rules);
    const websiteCodeById = new Map(websites.map((site) => [site.id, site.code]));
    const rows = products.filter((product) => product.sku).map((product) => ownedRowOf(product, websiteCodeById, codes));
    return {
        websites: websites.map((site) => ({ code: site.code, name: site.name })),
        products: rows,
        erps: rules,
        takenListIds: erps.map((erp) => erp.listId),
    };
}

/**
 * The options for one project's integration: the signed Commerce client and the
 * integration's client, wired. A missing Commerce credential is a refusal in words.
 */
export async function readErpOwnershipOptionsForProject(
    project: Project,
    integrationId: string,
    auth: AppManagementAuth,
    authManager: AuthenticationService,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ErpOwnershipOptions | { refusal: string }> {
    const integration = project.appBuilderComponents?.[integrationId];
    const get = await commerceGetForProject(project, authManager, fetchImpl);
    if ('refusal' in get) return get;
    const client = new ErpIntegrationClient(integration?.deployedUrls, auth, fetchImpl);
    return readErpOwnershipOptions({ get, client }, listedErpNames(project, integrationId));
}

/**
 * Save each ERP's rule onto its list entry (`PATCH erp/erps`), in order. Run after the list
 * is sent (the entry must exist) and before the new ERP is filled (the fill reads the rule).
 *
 * @param client - the integration's client
 * @param entries - each ERP's rule, by list id
 * @throws with the integration's words, naming the ERP, when a save is refused
 */
export async function saveErpOwnership(
    client: ErpIntegrationClient,
    entries: readonly ErpOwnsEntry[],
): Promise<void> {
    for (const entry of entries) {
        try {
            await client.updateErpSettings(entry.erp, undefined, ownsSettingsOf(entry.owns));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`${entry.erp}'s ownership was not saved: ${reason}`);
        }
    }
}
