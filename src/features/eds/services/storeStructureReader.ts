/**
 * Headless store-structure read.
 *
 * The core behind the `get_store_structure` MCP tool. Answers "what websites,
 * stores and store views exist on this project's Commerce instance, and does
 * the scope the project is configured for actually resolve against them?"
 *
 * The wizard asks the same question through `handleDiscoverStoreStructure`, but
 * it builds its request from webview form fields the user is still typing. This
 * path has no form: every input comes from the saved project, so an agent gets
 * the structure for the project as it stands on disk.
 *
 * Read-only by construction — it issues one discovery request and creates
 * nothing.
 *
 * @module features/eds/services/storeStructureReader
 */

import { selectDiscoveryService } from './accsDiscoveryConfig';
import { discoverStoreStructure } from './commerceStoreDiscovery';
import { extractConfigParams } from './configGenerator';
import { validateURL } from '@/core/validation';
import {
    ACCS_GRAPHQL_ENDPOINT,
    PAAS_ADMIN_PASSWORD,
    PAAS_ADMIN_USERNAME,
    PAAS_URL,
} from '@/features/components/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import type { Project } from '@/types';
import type { CommerceStoreStructure, StoreDiscoveryParams } from '@/types/commerceStore';

/** Whether a configured scope code was found in the discovered structure. */
export type ScopeResolution = 'ok' | 'missing' | 'not-configured';

/** The scope the project is configured for, and whether each part resolves. */
export interface StoreScopeReport {
    configured: {
        websiteCode?: string;
        storeCode?: string;
        storeViewCode?: string;
    };
    resolution: {
        websiteCode: ScopeResolution;
        storeCode: ScopeResolution;
        storeViewCode: ScopeResolution;
    };
}

/** Everything the tool returns on success. */
export interface StoreStructureReport extends StoreScopeReport, CommerceStoreStructure {
    backendType: 'paas' | 'accs';
}

/** Success carries the report; failure carries a message the caller can surface. */
export type StoreStructureOutcome =
    | { success: true; data: StoreStructureReport }
    | { success: false; error: string; authRequired?: boolean };

/**
 * Reduce a full URL to its origin, rejecting anything that fails the SSRF guard.
 *
 * Discovery only ever needs the origin; taking it here (rather than passing a
 * full GraphQL URL through) keeps the request identical to the wizard's.
 */
function toSafeOrigin(rawUrl: string | undefined): string | undefined {
    if (!rawUrl) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;

    const origin = `${parsed.protocol}//${parsed.host}`;
    try {
        validateURL(origin, ['http', 'https']);
    } catch {
        return undefined;
    }
    return origin;
}

/** A request builder either produced params, or the reason it could not. */
type RequestFailure = { error: string; authRequired?: boolean };
type DiscoveryRequest = StoreDiscoveryParams | RequestFailure;

/**
 * Build the PaaS discovery request from the project's saved admin credentials.
 */
function buildPaasRequest(
    configs: Record<string, Record<string, string | boolean | number | undefined>>,
): DiscoveryRequest {
    const baseUrl = toSafeOrigin(lookupComponentConfigValue(configs, PAAS_URL));
    if (!baseUrl) {
        return { error: 'Project has no usable Commerce URL configured.' };
    }

    const username = lookupComponentConfigValue(configs, PAAS_ADMIN_USERNAME);
    const password = lookupComponentConfigValue(configs, PAAS_ADMIN_PASSWORD);
    if (!username || !password) {
        return {
            error:
                'Project has no Commerce admin credentials saved. Add them in Configure → ' +
                'Connection, then retry.',
        };
    }

    return { backendType: 'paas', baseUrl, username, password };
}

/**
 * Build the ACCS discovery request, which proxies through a configured
 * discovery service and authenticates with the caller's IMS token.
 */
function buildAccsRequest(
    configs: Record<string, Record<string, string | boolean | number | undefined>>,
    orgId: string | undefined,
    imsToken: string | undefined,
): DiscoveryRequest {
    const accsEndpoint = lookupComponentConfigValue(configs, ACCS_GRAPHQL_ENDPOINT);
    const baseUrl = toSafeOrigin(accsEndpoint);
    if (!baseUrl || !accsEndpoint) {
        return { error: 'Project has no usable ACCS GraphQL endpoint configured.' };
    }

    if (!imsToken) {
        return { error: 'Adobe sign-in required to read store structure.', authRequired: true };
    }

    const selection = selectDiscoveryService(orgId);
    if (!selection.ok) {
        return {
            error:
                selection.reason === 'none-configured'
                    ? 'No ACCS discovery service is configured, so store structure cannot be read.'
                    : 'The configured ACCS discovery service URL is not a valid HTTPS URL.',
        };
    }

    return {
        backendType: 'accs',
        baseUrl,
        accsGraphqlEndpoint: accsEndpoint,
        imsToken,
        discoveryServiceUrl: selection.serviceUrl,
    };
}

/** Classify one configured code against the codes that actually exist. */
function resolveCode(configured: string | undefined, available: string[]): ScopeResolution {
    if (!configured) return 'not-configured';
    return available.includes(configured) ? 'ok' : 'missing';
}

/**
 * Compare the project's configured scope against the discovered structure.
 *
 * This is the part an agent cannot get anywhere else: a project can point at a
 * website or store view that no longer exists (or never did), and every
 * downstream symptom — empty PDPs, empty catalogs — looks like something else.
 */
function buildScopeReport(project: Project, structure: CommerceStoreStructure): StoreScopeReport {
    const params = extractConfigParams(project);
    const configured = {
        websiteCode: params.websiteCode || undefined,
        storeCode: params.storeCode || undefined,
        storeViewCode: params.storeViewCode || undefined,
    };

    return {
        configured,
        resolution: {
            websiteCode: resolveCode(
                configured.websiteCode,
                structure.websites.map((w) => w.code),
            ),
            storeCode: resolveCode(
                configured.storeCode,
                structure.storeGroups.map((g) => g.code),
            ),
            storeViewCode: resolveCode(
                configured.storeViewCode,
                structure.storeViews.map((v) => v.code),
            ),
        },
    };
}

/**
 * Read the project's Commerce store structure and check its configured scope.
 *
 * @param project - The project whose Commerce backend to inspect
 * @param options - `imsToken` is required for ACCS projects, ignored for PaaS
 * @returns The structure plus a scope report, or why the read was not possible
 */
export async function readStoreStructure(
    project: Project,
    options: { imsToken?: string } = {},
): Promise<StoreStructureOutcome> {
    const environmentType = extractConfigParams(project).environmentType;
    if (environmentType !== 'paas' && environmentType !== 'accs') {
        return {
            success: false,
            error: `Store structure is not available for a ${environmentType ?? 'unknown'} backend.`,
        };
    }

    const configs = (project.componentConfigs ?? {}) as Record<
        string,
        Record<string, string | boolean | number | undefined>
    >;

    const request =
        environmentType === 'paas'
            ? buildPaasRequest(configs)
            : buildAccsRequest(configs, project.adobe?.organization, options.imsToken);

    if ('error' in request) {
        return { success: false, error: request.error, authRequired: request.authRequired };
    }

    const result = await discoverStoreStructure(request);
    if (!result.success) {
        return { success: false, error: result.error };
    }

    return {
        success: true,
        data: {
            backendType: environmentType,
            ...result.data,
            ...buildScopeReport(project, result.data),
        },
    };
}
