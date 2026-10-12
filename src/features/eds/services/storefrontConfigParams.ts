/**
 * Storefront config params: what a project says config.json should carry.
 *
 * Reads a project (or a raw componentConfigs map) and answers the
 * {@link ConfigGeneratorParams} that `generateConfigJson` renders: the backend's
 * environment type, the Commerce endpoint (a deployed mesh first), the store
 * scope the backend owns, the AEM Assets flag, and the repository coordinates
 * from the EDS storefront's metadata. Project creation, Reset, republish, the
 * catalog prewarm, the store-structure reader and the commerce-endpoints MCP
 * tool all read their params here, so every path renders from the same answer.
 *
 * @module features/eds/services/storefrontConfigParams
 */

import { applyBackendOwnedScope } from '@/core/config/backendOwnedScope';
import {
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_ENVIRONMENT_ID,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
    PAAS_WEBSITE_CODE,
    PAAS_CUSTOMER_GROUP,
    PAAS_CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_STORE_VIEW_CODE,
    ACCS_STORE_CODE,
    ACCS_WEBSITE_CODE,
    ACCS_CUSTOMER_GROUP,
} from '@/core/config/envVarKeys';
import { isMeshComponentId, COMPONENT_IDS } from '@/core/constants';
import {
    getProvidedEnvVars,
    getMeshAppBuilderComponent,
} from '@/core/state/appBuilderComponentState';
import componentsConfig from '@/features/components/config/components.json';
import type { ConfigGeneratorParams, EnvironmentType } from '@/features/eds/services/configGenerator';
import type { Project } from '@/types/base';

/**
 * Component configs type for extraction
 */
type ComponentConfigs = Record<string, Record<string, string | boolean | number | undefined>>;

/**
 * Map backend component ID to environment type.
 *
 * @param backendComponentId - The component ID (e.g., 'adobe-commerce-paas')
 * @returns The corresponding environment type
 */
export function mapBackendToEnvironmentType(backendComponentId?: string): EnvironmentType {
    switch (backendComponentId) {
        case 'adobe-commerce-accs':
            return 'accs';
        case 'adobe-commerce-aco':
            return 'aco';
        case 'adobe-commerce-paas':
        default:
            return 'paas';
    }
}

/**
 * Merge all component env vars into a single flat config.
 * Mesh components win over others (mesh endpoint overrides direct backend URL).
 * Non-mesh components are merged in iteration order (last wins for duplicates).
 */
export function mergeComponentConfigs(
    componentConfigs: ComponentConfigs | undefined,
    meshEndpoint?: string,
    backendComponentId?: string,
): Record<string, string | boolean | number | undefined> {
    if (!componentConfigs) return {};

    const nonMesh: Record<string, string | boolean | number | undefined> = {};
    const mesh: Record<string, string | boolean | number | undefined> = {};

    for (const [componentId, config] of Object.entries(componentConfigs)) {
        const target = isMeshComponentId(componentId) ? mesh : nonMesh;
        Object.assign(target, config);
    }

    // Mesh values override non-mesh (spread order = last wins) — EXCEPT the
    // Commerce store scope, which the BACKEND component owns.
    //
    // The override exists so a deployed mesh endpoint beats a direct backend
    // URL; that is one key's worth of intent, and it was applied to every key.
    // Mesh component configs also carry a COPY of the store scope, and only the
    // backend's copy is updated when the user changes website/store/store view.
    // So a stale mesh copy silently won and config.json shipped the old scope.
    //
    // Live 2026-08-10: a project moved to the `citisignal` website kept
    // publishing `base`. The storefront queried a website with no products, so
    // every PDP rendered a valid 200 with an empty product block, and the
    // republish reported success because it had faithfully published what the
    // merge told it. Endpoint precedence is handled explicitly below and in
    // `extractConfigParamsFromConfigs`, so nothing here needs to cover it.
    // The BACKEND's own entry when the caller knows it. `nonMesh` is only an
    // approximation of "the backend": `headless` is a FRONTEND and declares all
    // three ADOBE_COMMERCE_* scope keys, so on a headless project the scope was
    // still decided by whichever non-mesh component iterated last. Callers that
    // cannot name the backend keep the old approximation rather than losing the
    // mesh protection entirely.
    const authoritative = backendComponentId ? componentConfigs[backendComponentId] : nonMesh;
    const merged = applyBackendOwnedScope({ ...nonMesh, ...mesh }, authoritative);

    // Deployed mesh endpoint overrides everything
    if (meshEndpoint) {
        merged.MESH_ENDPOINT = meshEndpoint;
    }

    return merged;
}

/**
 * Extract config parameters from component configs
 *
 * Core extraction logic used by both project-based and raw componentConfigs callers.
 * Pulls Commerce configuration values from eds-storefront and mesh configs.
 * Handles both PaaS (eds-commerce-mesh) and ACCS (eds-accs-mesh) configurations.
 *
 * @param componentConfigs - Component configurations (eds-storefront, eds-commerce-mesh, eds-accs-mesh, etc.)
 * @param meshEndpoint - Optional deployed mesh endpoint (overrides config value)
 * @param backendComponentId - Backend component ID for environment type (e.g., 'adobe-commerce-paas')
 * @returns Config parameters for generation
 */
export function extractConfigParamsFromConfigs(
    componentConfigs: ComponentConfigs | undefined,
    meshEndpoint?: string,
    backendComponentId?: string,
): Partial<ConfigGeneratorParams> {
    const config = mergeComponentConfigs(componentConfigs, meshEndpoint, backendComponentId);
    const environmentType = mapBackendToEnvironmentType(backendComponentId);
    const isAccs = environmentType === 'accs';

    // Commerce endpoint: deployed mesh > merged config
    const endpointKey = isAccs ? ACCS_GRAPHQL_ENDPOINT : PAAS_GRAPHQL_ENDPOINT;
    const commerceEndpoint = meshEndpoint || config[endpointKey];

    return {
        environmentType,
        commerceEndpoint: commerceEndpoint as string | undefined,
        catalogServiceEndpoint: isAccs
            ? undefined
            : (config[PAAS_CATALOG_SERVICE_ENDPOINT] as string | undefined),
        commerceApiKey: isAccs ? undefined : (config[CATALOG_API_KEY] as string | undefined),
        commerceEnvironmentId: isAccs
            ? undefined
            : (config[PAAS_ENVIRONMENT_ID] as string | undefined),
        storeViewCode: config[isAccs ? ACCS_STORE_VIEW_CODE : PAAS_STORE_VIEW_CODE] as
            | string
            | undefined,
        storeCode: config[isAccs ? ACCS_STORE_CODE : PAAS_STORE_CODE] as string | undefined,
        websiteCode: config[isAccs ? ACCS_WEBSITE_CODE : PAAS_WEBSITE_CODE] as string | undefined,
        customerGroup: config[isAccs ? ACCS_CUSTOMER_GROUP : PAAS_CUSTOMER_GROUP] as
            | string
            | undefined,
        // The saved value, else the catalog default — the same order the .env
        // generator uses. Reading only saved values shipped `false` to every
        // project that never touched the setting, after the catalog default
        // became "true" (a578893d6), while its .env and Configure said enabled.
        aemAssetsEnabled:
            String(config.AEM_ASSETS_ENABLED ?? componentsConfig.envVars.AEM_ASSETS_ENABLED.default) ===
            'true',
    };
}

/**
 * Resolve the deployed commerce/mesh endpoint from any appBuilderComponent that provides it.
 *
 * Generalizes the former hardcoded `project.meshState?.endpoint` read so the
 * storefront config sources its endpoint from the keyed `appBuilderComponents` model —
 * mesh is the first (and, in D1, only) provider. The resolution order is
 * byte-compatible with the legacy behavior:
 *
 * 1. A keyed appBuilderComponent's `providesEnvVars.MESH_ENDPOINT` (forward state).
 * 2. The mesh appBuilderComponent's `endpoint` — `getMeshAppBuilderComponent` reads through to the
 *    legacy singular `meshState.endpoint` when no keyed entry exists.
 *
 * For existing mesh-backed projects (endpoint only in `meshState`), step 1 is
 * empty and step 2 returns the identical legacy value — so `config.json` output
 * is unchanged. This is the load-bearing MESH_ENDPOINT→config.json edge.
 *
 * @param project - The project to resolve the endpoint from
 * @returns The deployed endpoint, or undefined when no appBuilderComponent provides one
 */
function resolveProvidedEndpoint(project: Project): string | undefined {
    return (
        getProvidedEnvVars(project).MESH_ENDPOINT ?? getMeshAppBuilderComponent(project)?.endpoint
    );
}

/**
 * Everything config.json is generated from, wherever a caller reads it.
 *
 * Every key is REQUIRED on purpose, `undefined` included. Creation reads these
 * from the wizard's answers and a saved project reads them from the manifest;
 * for a while each assembled its own params, and creation's copy left out the
 * demo row, so a project built on an added demo was published without the
 * demo's flags (2026-10-12). A new source added here does not compile until
 * both readers supply it.
 */
export interface ConfigParamSources {
    /** The storefront instance's saved metadata: `githubRepo`, `daLiveOrg`, `daLiveSite`. */
    metadata: Record<string, unknown> | undefined;
    componentConfigs: ComponentConfigs | undefined;
    /** A deployed endpoint (the mesh's), which wins over the configured one. */
    providedEndpoint: string | undefined;
    /** The backend component id, which decides the environment type. */
    backendId: string | undefined;
    selectedAddons: string[] | undefined;
    selectedPackage: string | undefined;
    /** The project's own demo row, where an added demo keeps its flags. */
    demo: Project['demo'];
}

/** What a saved project supplies. */
function sourcesOfProject(project: Project): ConfigParamSources {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    return {
        metadata: edsInstance?.metadata as Record<string, unknown> | undefined,
        componentConfigs: project.componentConfigs as ComponentConfigs | undefined,
        providedEndpoint: resolveProvidedEndpoint(project),
        backendId: project.componentSelections?.backend,
        selectedAddons: project.selectedAddons,
        selectedPackage: project.selectedPackage,
        demo: project.demo,
    };
}

/** The Commerce half of the params: everything except the repository coordinates. */
function commerceParamsFrom(sources: ConfigParamSources): Partial<ConfigGeneratorParams> {
    return {
        ...extractConfigParamsFromConfigs(
            sources.componentConfigs,
            sources.providedEndpoint,
            sources.backendId,
        ),
        selectedAddons: sources.selectedAddons,
        selectedPackage: sources.selectedPackage,
        demo: sources.demo,
    };
}

/**
 * Extract config parameters from a Project: the Commerce half, without the
 * repository coordinates (the catalog prewarm and the store-structure reader
 * need no more).
 *
 * @param project - The project to extract config from
 * @returns Config parameters for generation
 */
export function extractConfigParams(project: Project): Partial<ConfigGeneratorParams> {
    return commerceParamsFrom(sourcesOfProject(project));
}

/**
 * The ONE assembly of {@link ConfigGeneratorParams}. Project creation, Reset and
 * republish all render config.json from what this returns.
 *
 * The repository coordinates come from the storefront's saved metadata. A
 * `githubRepo` that is not an `owner/repo` pair yields empty coordinates rather
 * than half of one, and the DA.live org and site fall back to the repository's
 * two halves: the org IS the GitHub namespace and the site IS the repository
 * name, and a migrated project stores neither.
 *
 * @param sources - everything the params are read from
 * @returns Full ConfigGeneratorParams ready for generateConfigJson
 */
export function configGeneratorParamsFrom(sources: ConfigParamSources): ConfigGeneratorParams {
    const githubRepo = String(sources.metadata?.githubRepo ?? '');
    const [githubOwner, repoName] = githubRepo.includes('/') ? githubRepo.split('/') : ['', ''];

    return {
        githubOwner,
        repoName,
        daLiveOrg: String(sources.metadata?.daLiveOrg || githubOwner),
        daLiveSite: String(sources.metadata?.daLiveSite || repoName),
        ...commerceParamsFrom(sources),
    };
}

/**
 * Build a complete {@link ConfigGeneratorParams} for a saved project (Reset,
 * republish, the commerce-endpoints tool).
 *
 * @param project - The project to build generation params from
 * @returns Full ConfigGeneratorParams ready for generateConfigJson
 */
export function buildConfigGeneratorParams(project: Project): ConfigGeneratorParams {
    return configGeneratorParamsFrom(sourcesOfProject(project));
}
