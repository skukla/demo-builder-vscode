/**
 * Config Generator for EDS Storefronts
 *
 * Generates config.json content for EDS storefronts using a bundled template.
 * This is the single source of truth for config.json generation, used by both
 * project creation and EDS Reset operations.
 *
 * ## Generation Timeline (EDS Projects)
 *
 * When a mesh component is included, config.json must be generated AFTER mesh deployment
 * because it requires the mesh endpoint. When no mesh is included, config generation uses
 * direct backend endpoints instead.
 *
 * 1. **StorefrontSetupStep (preflight)**: Creates repo, fstab.yaml, content (no mesh needed)
 * 2. **executor Phase 3**: Deploys mesh (if included) → project.meshState.endpoint
 * 3. **executor Phase 4**: Generates config.json with mesh endpoint OR direct backend endpoints
 * 4. **executor Phase 5**: Syncs config.json to GitHub and publishes to CDN
 *
 * @module features/eds/services/configGenerator
 */

import configTemplate from '../config/config-template.json';
import { isMeshComponentId, COMPONENT_IDS } from '@/core/constants';
import { getProvidedEnvVars, getMeshDeployable } from '@/features/app-builder/services/deployableState';
import componentsConfig from '@/features/components/config/components.json';
import {
    PAAS_GRAPHQL_ENDPOINT, PAAS_ENVIRONMENT_ID, PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE, PAAS_WEBSITE_CODE, PAAS_CUSTOMER_GROUP,
    PAAS_CATALOG_SERVICE_ENDPOINT, CATALOG_API_KEY,
    ACCS_GRAPHQL_ENDPOINT, ACCS_STORE_VIEW_CODE, ACCS_STORE_CODE,
    ACCS_WEBSITE_CODE, ACCS_CUSTOMER_GROUP,
} from '@/features/components/config/envVarKeys';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import type { Logger , Project } from '@/types';

// Bundled template - single source of truth

// ==========================================================
// Types
// ==========================================================

/**
 * Backend environment type for config.json generation.
 * Different environments require different headers in the config.
 *
 * - **paas**: Adobe Commerce PaaS - requires x-api-key, Magento-Environment-Id headers
 * - **accs**: Adobe Commerce Cloud Services - store codes only, no API key headers
 * - **aco**: Adobe Commerce Optimizer - AC-View-ID, AC-Price-Book-ID placeholders
 */
export type EnvironmentType = 'paas' | 'accs' | 'aco';

/**
 * Parameters for config.json generation
 */
export interface ConfigGeneratorParams {
    /** GitHub owner/org for the user's repo */
    githubOwner: string;
    /** Repository name */
    repoName: string;
    /** DA.live organization */
    daLiveOrg: string;
    /** DA.live site name */
    daLiveSite: string;
    /** Backend environment type (paas, accs, aco) - defaults to 'paas' for backward compatibility */
    environmentType?: EnvironmentType;
    /** Commerce GraphQL endpoint (mesh or direct) */
    commerceEndpoint?: string;
    /** Catalog Service endpoint */
    catalogServiceEndpoint?: string;
    /** Commerce API key (PaaS only) */
    commerceApiKey?: string;
    /** Commerce environment ID (PaaS only) */
    commerceEnvironmentId?: string;
    /** Store view code */
    storeViewCode?: string;
    /** Store code */
    storeCode?: string;
    /** Website code */
    websiteCode?: string;
    /** Customer group hash */
    customerGroup?: string;
    /** Whether AEM Assets integration is enabled */
    aemAssetsEnabled?: boolean;
    /** Selected addon IDs (e.g., ['adobe-commerce-aco']) */
    selectedAddons?: string[];
    /** Selected demo package ID (e.g., 'b2b') - drives package-level configFlags */
    selectedPackage?: string;
}

/**
 * Result of config.json generation
 */
export interface ConfigGeneratorResult {
    success: boolean;
    content?: string;
    error?: string;
}

// ==========================================================
// Functions
// ==========================================================

/**
 * Component configs type for extraction
 */
type ComponentConfigs = Record<string, Record<string, string | boolean | number | undefined>>;

/**
 * Header configuration structure for config.json
 */
interface ConfigHeaders {
    all?: Record<string, string>;
    cs?: Record<string, string>;
}

/**
 * Generate Commerce headers based on environment type.
 *
 * Different Adobe Commerce environments require different headers:
 * - **PaaS**: Full authentication headers (x-api-key, Magento-Environment-Id, store codes)
 * - **ACCS**: Store codes only (no API key headers required)
 * - **ACO**: Commerce Optimizer headers (AC-View-ID, AC-Price-Book-ID placeholders)
 *
 * @param params - Configuration parameters including environment type
 * @returns Headers object to inject into config.json
 */
export function generateHeaders(params: ConfigGeneratorParams): ConfigHeaders {
    const storeViewCode = params.storeViewCode || 'default';
    const storeCode = params.storeCode || 'default';
    const websiteCode = params.websiteCode || 'base';
    const customerGroup = params.customerGroup || '';

    // Base headers - common store code for all environments
    const baseHeaders: ConfigHeaders = {
        all: {
            Store: storeViewCode,
        },
    };

    const environmentType = params.environmentType || 'paas';

    switch (environmentType) {
        case 'aco':
            // Adobe Commerce Optimizer - ACO-specific headers with placeholders
            return {
                ...baseHeaders,
                cs: {
                    'AC-View-ID': '{{AC_VIEW_ID}}',
                    'AC-Price-Book-ID': '{{AC_PRICE_BOOK_ID}}',
                },
            };

        case 'accs':
            // Adobe Commerce Cloud Services - store codes only, no API key
            return {
                ...baseHeaders,
                cs: {
                    'Magento-Customer-Group': customerGroup,
                    'Magento-Store-Code': storeCode,
                    'Magento-Store-View-Code': storeViewCode,
                    'Magento-Website-Code': websiteCode,
                },
            };

        case 'paas':
        default:
            // Adobe Commerce PaaS - full authentication headers
            return {
                ...baseHeaders,
                cs: {
                    'Magento-Customer-Group': customerGroup,
                    'Magento-Store-Code': storeCode,
                    'Magento-Store-View-Code': storeViewCode,
                    'Magento-Website-Code': websiteCode,
                    'x-api-key': params.commerceApiKey || '',
                    'Magento-Environment-Id': params.commerceEnvironmentId || '',
                },
            };
    }
}

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
/**
 * Resolve a config field from ACCS or PaaS sources based on environment type.
 *
 * @param isAccs - Whether the backend is ACCS
 * @param edsConfig - EDS storefront config
 * @param meshConfig - Mesh config (ACCS or PaaS depending on isAccs)
 * @param accsKey - Config key for ACCS environments
 * @param paasKey - Config key for PaaS environments
 * @returns Resolved value or undefined
 */
/**
 * Merge all component env vars into a single flat config.
 * Mesh components win over others (mesh endpoint overrides direct backend URL).
 * Non-mesh components are merged in iteration order (last wins for duplicates).
 */
export function mergeComponentConfigs(
    componentConfigs: ComponentConfigs | undefined,
    meshEndpoint?: string,
): Record<string, string | boolean | number | undefined> {
    if (!componentConfigs) return {};

    const nonMesh: Record<string, string | boolean | number | undefined> = {};
    const mesh: Record<string, string | boolean | number | undefined> = {};

    for (const [componentId, config] of Object.entries(componentConfigs)) {
        const target = isMeshComponentId(componentId) ? mesh : nonMesh;
        Object.assign(target, config);
    }

    // Mesh values override non-mesh (spread order = last wins)
    const merged = { ...nonMesh, ...mesh };

    // Deployed mesh endpoint overrides everything
    if (meshEndpoint) {
        merged.MESH_ENDPOINT = meshEndpoint;
    }

    return merged;
}

export function extractConfigParamsFromConfigs(
    componentConfigs: ComponentConfigs | undefined,
    meshEndpoint?: string,
    backendComponentId?: string,
): Partial<ConfigGeneratorParams> {
    const config = mergeComponentConfigs(componentConfigs, meshEndpoint);
    const environmentType = mapBackendToEnvironmentType(backendComponentId);
    const isAccs = environmentType === 'accs';

    // Commerce endpoint: deployed mesh > merged config
    const endpointKey = isAccs ? ACCS_GRAPHQL_ENDPOINT : PAAS_GRAPHQL_ENDPOINT;
    const commerceEndpoint = meshEndpoint || config[endpointKey];

    return {
        environmentType,
        commerceEndpoint: commerceEndpoint as string | undefined,
        catalogServiceEndpoint: isAccs ? undefined : config[PAAS_CATALOG_SERVICE_ENDPOINT] as string | undefined,
        commerceApiKey: isAccs ? undefined : config[CATALOG_API_KEY] as string | undefined,
        commerceEnvironmentId: isAccs ? undefined : config[PAAS_ENVIRONMENT_ID] as string | undefined,
        storeViewCode: config[isAccs ? ACCS_STORE_VIEW_CODE : PAAS_STORE_VIEW_CODE] as string | undefined,
        storeCode: config[isAccs ? ACCS_STORE_CODE : PAAS_STORE_CODE] as string | undefined,
        websiteCode: config[isAccs ? ACCS_WEBSITE_CODE : PAAS_WEBSITE_CODE] as string | undefined,
        customerGroup: config[isAccs ? ACCS_CUSTOMER_GROUP : PAAS_CUSTOMER_GROUP] as string | undefined,
        aemAssetsEnabled: config.AEM_ASSETS_ENABLED === 'true',
    };
}

/**
 * Resolve the deployed commerce/mesh endpoint from any deployable that provides it.
 *
 * Generalizes the former hardcoded `project.meshState?.endpoint` read so the
 * storefront config sources its endpoint from the keyed `deployables` model —
 * mesh is the first (and, in D1, only) provider. The resolution order is
 * byte-compatible with the legacy behavior:
 *
 * 1. A keyed deployable's `providesEnvVars.MESH_ENDPOINT` (forward state).
 * 2. The mesh deployable's `endpoint` — `getMeshDeployable` reads through to the
 *    legacy singular `meshState.endpoint` when no keyed entry exists.
 *
 * For existing mesh-backed projects (endpoint only in `meshState`), step 1 is
 * empty and step 2 returns the identical legacy value — so `config.json` output
 * is unchanged. This is the load-bearing MESH_ENDPOINT→config.json edge.
 *
 * @param project - The project to resolve the endpoint from
 * @returns The deployed endpoint, or undefined when no deployable provides one
 */
function resolveProvidedEndpoint(project: Project): string | undefined {
    return getProvidedEnvVars(project).MESH_ENDPOINT ?? getMeshDeployable(project)?.endpoint;
}

/**
 * Extract config parameters from a Project
 *
 * Convenience wrapper that extracts componentConfigs and the deployed endpoint
 * from the project. The endpoint is resolved via {@link resolveProvidedEndpoint}
 * (the keyed-deployable provider), which read-throughs to legacy `meshState`.
 *
 * @param project - The project to extract config from
 * @returns Config parameters for generation
 */
export function extractConfigParams(project: Project): Partial<ConfigGeneratorParams> {
    return {
        ...extractConfigParamsFromConfigs(
            project.componentConfigs as ComponentConfigs | undefined,
            resolveProvidedEndpoint(project),
            project.componentSelections?.backend,
        ),
        selectedAddons: project.selectedAddons,
        selectedPackage: project.selectedPackage,
    };
}

/**
 * Build a complete {@link ConfigGeneratorParams} for an existing project.
 *
 * Resolves the GitHub/DA.live repo coordinates from the EDS storefront component's
 * saved metadata and spreads in {@link extractConfigParams}. This is the single
 * assembly point shared by EDS Reset and storefront republish — both previously
 * hand-rolled the identical `{ githubOwner, repoName, daLiveOrg, daLiveSite,
 * ...extractConfigParams(project) }` object from the same metadata source.
 *
 * Coordinates are validated upstream (extractResetParams / extractRepublishParams)
 * before reaching config generation; missing metadata falls back to empty strings.
 *
 * @param project - The project to build generation params from
 * @returns Full ConfigGeneratorParams ready for generateConfigJson
 */
export function buildConfigGeneratorParams(project: Project): ConfigGeneratorParams {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const metadata = edsInstance?.metadata as Record<string, unknown> | undefined;
    const [githubOwner = '', repoName = ''] = String(metadata?.githubRepo ?? '').split('/');

    return {
        githubOwner,
        repoName,
        daLiveOrg: String(metadata?.daLiveOrg ?? ''),
        daLiveSite: String(metadata?.daLiveSite ?? ''),
        ...extractConfigParams(project),
    };
}

/**
 * Merge a set of data-driven config flags into config.public.default.
 *
 * The single primitive behind both addon- and package-scoped flag injection:
 * each source resolves its own `configFlags` object, then this applies it.
 * No-op when there are no flags or the target object is absent.
 *
 * @param config - The config object being built
 * @param flags - The flags to merge (from an addon or package definition)
 * @param source - Human-readable origin for the debug log (e.g. "addon: x")
 * @param logger - Logger instance
 */
function injectConfigFlags(
    config: Record<string, Record<string, Record<string, unknown>>>,
    flags: Record<string, boolean> | undefined,
    source: string,
    logger: Logger,
): void {
    if (flags && config.public?.default) {
        Object.assign(config.public.default, flags);
        logger.debug(`[ConfigGenerator] Injected config flags from ${source}`);
    }
}

/**
 * Inject addon-specific config flags into the config object.
 *
 * Reads configFlags from components.json addon definitions. This is data-driven
 * — any addon with a `configuration.configFlags` object will have its flags
 * injected into config.public.default.
 */
function injectAddonConfigFlags(
    config: Record<string, Record<string, Record<string, unknown>>>,
    selectedAddons: string[],
    logger: Logger,
): void {
    const addonsConfig = (componentsConfig as Record<string, unknown>).addons as
        Record<string, { configuration?: { configFlags?: Record<string, boolean> } }> | undefined;

    if (!addonsConfig) { return; }

    for (const addonId of selectedAddons) {
        injectConfigFlags(
            config,
            addonsConfig[addonId]?.configuration?.configFlags,
            `addon: ${addonId}`,
            logger,
        );
    }
}

/**
 * Inject demo-package-specific config flags into the config object.
 *
 * Reads configFlags from the selected package definition in demo-packages.json.
 * This is data-driven — any package with a `configFlags` object will have its
 * flags injected into config.public.default. The B2B package uses this to set
 * commerce-b2b-enabled / commerce-companies-enabled, which gate the
 * auth/permissions event the commerce-account-nav block depends on.
 */
function injectPackageConfigFlags(
    config: Record<string, Record<string, Record<string, unknown>>>,
    selectedPackage: string,
    logger: Logger,
): void {
    const packages = (demoPackagesConfig as { packages?: Array<{ id: string; configFlags?: Record<string, boolean> }> }).packages;
    const pkg = packages?.find((p) => p.id === selectedPackage);

    injectConfigFlags(config, pkg?.configFlags, `package: ${selectedPackage}`, logger);
}

/**
 * Generate config.json content for EDS storefront
 *
 * Uses a bundled template and replaces placeholders with the project's
 * actual configuration values. This is the single source of truth for
 * config.json generation, used by both project creation and EDS Reset.
 *
 * @param params - Configuration parameters to inject
 * @param logger - Logger instance
 * @returns Generation result with content or error
 */
export function generateConfigJson(
    params: ConfigGeneratorParams,
    logger: Logger,
): ConfigGeneratorResult {
    try {
        const environmentType = params.environmentType || 'paas';
        logger.debug(`[ConfigGenerator] Generating config.json from bundled template (env: ${environmentType})`);

        // Deep clone the template to avoid mutating the imported object
        const config = JSON.parse(JSON.stringify(configTemplate));

        // Build replacement map for placeholders
        const storeUrl = `https://main--${params.repoName}--${params.githubOwner}.aem.live/`;

        // Determine commerce endpoints based on environment type
        // PaaS has both commerce-core-endpoint (catalog service) and commerce-endpoint (mesh)
        // ACCS/ACO have commerce-endpoint only
        const commerceEndpoint = params.commerceEndpoint || '';
        const catalogServiceEndpoint = environmentType === 'paas'
            ? (params.catalogServiceEndpoint || commerceEndpoint)
            : commerceEndpoint;

        // Replace placeholders throughout the config
        // Note: {ORG} and {REPO} are used in analytics.store-url, robots.txt, and sidekick plugin URLs.
        // Site-level config (code, content, folders, cdn) lives in fstab.yaml, not config.json.
        const replacements: Record<string, string> = {
            '{ORG}': params.githubOwner,
            '{REPO}': params.repoName,
            '{COMMERCE_ENDPOINT}': commerceEndpoint,
            '{CS_ENDPOINT}': catalogServiceEndpoint,
            '{STORE_VIEW_CODE}': params.storeViewCode || 'default',
            '{STORE_CODE}': params.storeCode || 'default',
            '{WEBSITE_CODE}': params.websiteCode || 'base',
            '{COMMERCE_API_KEY}': params.commerceApiKey || '',
            '{COMMERCE_ENVIRONMENT_ID}': params.commerceEnvironmentId || '',
            '{CUSTOMER_GROUP}': params.customerGroup || '',
            '{DOMAIN}': storeUrl,
            '{AEM_ASSETS_ENABLED}': params.aemAssetsEnabled ? 'true' : 'false',
        };

        // Convert to string, replace all placeholders, parse back.
        // Placeholders sit INSIDE JSON string literals, so each value must be
        // JSON-string-escaped before substitution — otherwise a value containing
        // a quote, backslash, or newline would corrupt the JSON and fail the parse
        // below. JSON.stringify(value).slice(1, -1) yields the escaped inner text
        // without the surrounding quotes.
        let configStr = JSON.stringify(config, null, 2);
        for (const [placeholder, value] of Object.entries(replacements)) {
            const escaped = JSON.stringify(value).slice(1, -1);
            configStr = configStr.split(placeholder).join(escaped);
        }

        // Parse back to object to handle special conversions
        const finalConfig = JSON.parse(configStr);

        // Generate environment-specific headers
        const headers = generateHeaders(params);

        // Inject dynamically generated headers into public.default.headers
        if (finalConfig.public?.default) {
            finalConfig.public.default.headers = headers;

            // Convert commerce-assets-enabled from string to boolean
            const assetsEnabled = finalConfig.public.default['commerce-assets-enabled'];
            if (assetsEnabled === 'true') {
                finalConfig.public.default['commerce-assets-enabled'] = true;
            } else {
                // Set to false explicitly - storefront code expects this property to exist
                finalConfig.public.default['commerce-assets-enabled'] = false;
            }

            // Note: commerce-core-endpoint is preserved for ALL environment types,
            // even when it equals commerce-endpoint. The storefront uses its existence
            // to route cs headers (Magento-Website-Code, etc.) to catalog queries.
        }

        // Inject addon-specific config flags
        if (params.selectedAddons?.length) {
            injectAddonConfigFlags(finalConfig, params.selectedAddons, logger);
        }

        // Inject demo-package-specific config flags (e.g., B2B flags)
        if (params.selectedPackage) {
            injectPackageConfigFlags(finalConfig, params.selectedPackage, logger);
        }

        // Serialize with proper formatting
        const configContent = JSON.stringify(finalConfig, null, 2);

        logger.info(`[ConfigGenerator] Successfully generated config.json (env: ${environmentType})`);
        logger.debug(`[ConfigGenerator] Config size: ${configContent.length} bytes`);

        return {
            success: true,
            content: configContent,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[ConfigGenerator] Failed to generate config.json: ${message}`);
        return {
            success: false,
            error: message,
        };
    }
}
