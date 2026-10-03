/**
 * Which products a new ERP will own, read and saved through the integration (AB-64): what
 * the "Add another ERP" dialog needs before the add (the store's websites and sources, each
 * product's codes, each existing ERP's rule), and the save of each ERP's rule onto its list
 * entry (`PATCH erp/erps`) before the new ERP is filled.
 *
 * A composition file: it wires the fill's Commerce readers and the integration's client into
 * the pure rules in `erpOwnership.ts`.
 *
 * @module features/project-creation/services/erpOwnershipSync
 */

import { commerceGetForProject } from './erpFillForProject';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import {
    listProducts,
    listSources,
    listStock,
    listWebsites,
    type CommerceGet,
} from '@/features/app-builder/services/erpFillReaders';
import { ownedProductOf, type CommerceProductRow } from '@/features/app-builder/services/erpFillRows';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { ownsRuleOf, ownsSettingsOf } from '@/features/app-builder/services/erpOwnership';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import type {
    ErpOwnedProductRow,
    ErpOwnershipOptions,
    ErpOwnsEntry,
} from '@/types/erpOwnership';

/** The attribute every ERP's default rule reads; always carried on the product rows. */
const OWNER_ATTRIBUTE = 'erp_owner';

export interface ErpOwnershipReadDeps {
    get: CommerceGet;
    client: ErpIntegrationClient;
}

/** One ERP the integration serves, as the read names it. */
export interface ListedErpName {
    listId: string;
    name: string;
}

/** The attribute codes the ERPs' rules name, plus `erp_owner`. */
function attributeCodesOf(erps: readonly ErpOwnsEntry[]): string[] {
    const named = erps.flatMap((entry) => {
        const code = entry.owns.attribute?.split('=')[0]?.trim();
        return code ? [code] : [];
    });
    return [...new Set([OWNER_ATTRIBUTE, ...named])];
}

/** A product's attributes, only those named, as strings. */
function attributesOf(product: CommerceProductRow, codes: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const code of codes) {
        const value = product.customAttributes[code];
        if (value !== undefined && value !== null && value !== '') out[code] = String(value);
    }
    return out;
}

/** Each ERP's rule, read off the settings the integration resolves for it. */
async function rulesOf(
    client: ErpIntegrationClient,
    erps: readonly ListedErpName[],
): Promise<ErpOwnershipOptions['erps']> {
    const out: ErpOwnershipOptions['erps'] = [];
    // One at a time: a handful of ERPs, and the integration's action is not built for a burst.
    for (const erp of erps) {
        const settings = await client.resolvedSettings([], erp.listId);
        out.push({ erp: erp.listId, name: erp.name, owns: ownsRuleOf(settings.default) });
    }
    return out;
}

/**
 * What the dialog needs before an add. Reads Commerce the way the fill does (the same
 * products and stock reads), and each ERP's rule through the integration.
 *
 * @param deps - Commerce and the integration's client
 * @param erps - the ERPs the integration serves now, by list id and name
 * @returns the options; throws with the reader's words when a read fails
 */
export async function readErpOwnershipOptions(
    deps: ErpOwnershipReadDeps,
    erps: readonly ListedErpName[],
): Promise<ErpOwnershipOptions> {
    const [products, stock, sourceNames, websites, rules] = await Promise.all([
        listProducts(deps.get),
        listStock(deps.get),
        listSources(deps.get),
        listWebsites(deps.get),
        rulesOf(deps.client, erps),
    ]);
    const codes = attributeCodesOf(rules);
    const websiteCodeById = new Map(websites.map((site) => [site.id, site.code]));
    const rows = products
        .filter((product) => product.sku)
        .map((product): ErpOwnedProductRow => {
            const sourceCodes = (stock.get(product.sku) ?? []).map((row) => row.code);
            const owned = ownedProductOf(product, sourceCodes, websiteCodeById);
            return {
                sku: product.sku,
                websiteCodes: owned.websiteCodes,
                sourceCodes,
                attributes: attributesOf(product, codes),
            };
        });
    return {
        websites: websites.map((site) => ({ code: site.code, name: site.name })),
        sources: [...sourceNames].map(([code, name]) => ({ code, name })),
        products: rows,
        erps: rules,
        takenListIds: erps.map((erp) => erp.listId),
    };
}

/** The ERPs an integration serves in the project, by list id and name, in link order. */
function listedErpNames(project: Project, integrationId: string): ListedErpName[] {
    const catalog = getAppBuilderComponentCatalog();
    return systemsUsedBy(project, integrationId, catalog).flatMap((componentId) => {
        const listId = erpListIdOf(project, componentId, catalog);
        const name = project.appBuilderComponents?.[componentId]?.name ?? componentId;
        return listId ? [{ listId, name }] : [];
    });
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
