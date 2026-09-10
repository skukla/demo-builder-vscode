/**
 * The websites and store views an import can target, for THIS project.
 *
 * Shaping, not handling: which discovery params a backend needs, and how to fold
 * three flat id-joined lists into the website→store-view tree a picker wants.
 * It lived in `importHandlers` while it was being written and moved here once it
 * was clearly its own job — a handler should decide WHETHER to answer, not how
 * the answer is shaped.
 *
 * Uses the extension's own `discoverStoreStructure` rather than the Data
 * Installer's `get-websites-and-stores`: audited 2026-08-14, that endpoint needs
 * the credential pair the wizard does not have yet, returns two levels instead of
 * three, and belongs to another team's stage service.
 *
 * @module features/data-installer/services/importScopeDiscovery
 */

import type { CommerceCredentials } from './dataInstallerWriteClient';
import { ACCS_GRAPHQL_ENDPOINT, PAAS_URL } from '@/core/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { selectDiscoveryService } from '@/features/eds/services/accsDiscoveryConfig';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure, StoreDiscoveryParams } from '@/types/commerceStore';
import type { HandlerContext } from '@/types/handlers';

/** One website and the store views that belong to it. */
export interface TargetWebsiteScope {
    code: string;
    name: string;
    storeViews: Array<{ code: string; name: string }>;
}

/**
 * Discovery params for whichever backend this project runs.
 *
 * Returns undefined when the project cannot be discovered against (no URL, or
 * ACCS without a configured discovery service / usable token) — targeting is
 * optional, so that is an empty picker rather than an error.
 */
export async function buildScopeDiscoveryParams(
    context: HandlerContext,
    project: Project,
    credentials: CommerceCredentials,
): Promise<StoreDiscoveryParams | undefined> {
    const configs = project.componentConfigs ?? {};

    if (credentials.kind === 'paas') {
        const baseUrl = lookupComponentConfigValue(configs, PAAS_URL);
        return baseUrl
            ? {
                  backendType: 'paas',
                  baseUrl,
                  username: credentials.username,
                  password: credentials.password,
              }
            : undefined;
    }

    const accsEndpoint = lookupComponentConfigValue(configs, ACCS_GRAPHQL_ENDPOINT);
    if (!accsEndpoint) {
        return undefined;
    }
    // The ACCS path goes through the discovery service with the USER's IMS token
    // — the project's Commerce pair is not what that service authenticates.
    const selection = selectDiscoveryService(project.adobe?.organization);
    if (!selection.ok) {
        return undefined;
    }
    const inspection = await context.authManager?.getTokenManager().inspectToken();
    if (!inspection?.token) {
        return undefined;
    }
    return {
        backendType: 'accs',
        baseUrl: accsEndpoint,
        accsGraphqlEndpoint: accsEndpoint,
        discoveryServiceUrl: selection.serviceUrl,
        imsToken: inspection.token,
    };
}

/**
 * Websites, each carrying the store views that belong to it.
 *
 * The picker needs website→store view; the structure arrives as three flat
 * lists joined by numeric ids, so the join happens once here rather than in the
 * webview. Store GROUPS are deliberately collapsed: the service takes a
 * `store_code` that is a store VIEW code, so a group tier would be a level the
 * user picks through and nothing consumes.
 */
export function groupStoreViewsByWebsite(
    structure: CommerceStoreStructure,
): TargetWebsiteScope[] {
    return structure.websites.map((website) => ({
        code: website.code,
        name: website.name,
        storeViews: structure.storeViews
            .filter((view) => Number(view.website_id) === Number(website.id))
            .map((view) => ({ code: view.code, name: view.name })),
    }));
}
