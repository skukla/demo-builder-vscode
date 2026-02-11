/**
 * Config Generator for EDS Storefronts
 *
 * Generates config.json content for EDS storefronts using a bundled template.
 * This is the single source of truth for config.json generation, used by both
 * project creation and EDS Reset operations.
 *
 * ## Generation Timeline (EDS Projects)
 *
 * config.json must be generated AFTER mesh deployment because it requires the mesh endpoint:
 *
 * 1. **StorefrontSetupStep (preflight)**: Creates repo, fstab.yaml, content (no mesh needed)
 * 2. **executor Phase 3**: Deploys mesh → project.meshState.endpoint
 * 3. **executor Phase 4**: Generates config.json WITH mesh endpoint (this module)
 * 4. **executor Phase 5**: Syncs config.json to GitHub and publishes to CDN
 *
 * The mesh endpoint is required for `commerce-core-endpoint` and `commerce-endpoint` fields.
 * Without it, Commerce features will not work on the live site.
 *
 * @module features/eds/services/configGenerator
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types';
import type { Project } from '@/types';

// Bundled template - single source of truth
import configTemplate from '../config/config-template.json';

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
export function extractConfigParamsFromConfigs(
    componentConfigs: ComponentConfigs | undefined,
    meshEndpoint?: string,
    backendComponentId?: string,
): Partial<ConfigGeneratorParams> {
    const edsConfig = componentConfigs?.[COMPONENT_IDS.EDS_STOREFRONT] || {};
    // Check both mesh configs - only one will be present depending on backend
    const paasMeshConfig = componentConfigs?.[COMPONENT_IDS.EDS_COMMERCE_MESH] || {};
    const accsMeshConfig = componentConfigs?.[COMPONENT_IDS.EDS_ACCS_MESH] || {};

    // Map backend component ID to environment type (defaults to 'paas' if not provided)
    const environmentType = mapBackendToEnvironmentType(backendComponentId);
    const isAccs = environmentType === 'accs';

    // For ACCS: prefer mesh endpoint, then ACCS endpoint
    // For PaaS: prefer mesh endpoint, then Commerce GraphQL endpoint
    const commerceEndpoint = meshEndpoint ||
        (isAccs
            ? (edsConfig.ACCS_GRAPHQL_ENDPOINT || accsMeshConfig.ACCS_GRAPHQL_ENDPOINT)
            : edsConfig.ADOBE_COMMERCE_GRAPHQL_ENDPOINT);

    // Map store codes based on backend type
    const storeViewCode = isAccs
        ? (edsConfig.ACCS_STORE_VIEW_CODE || accsMeshConfig.ACCS_STORE_VIEW_CODE)
        : (edsConfig.ADOBE_COMMERCE_STORE_VIEW_CODE || paasMeshConfig.ADOBE_COMMERCE_STORE_VIEW_CODE);

    const storeCode = isAccs
        ? (edsConfig.ACCS_STORE_CODE || accsMeshConfig.ACCS_STORE_CODE)
        : (edsConfig.ADOBE_COMMERCE_STORE_CODE || paasMeshConfig.ADOBE_COMMERCE_STORE_CODE);

    const websiteCode = isAccs
        ? (edsConfig.ACCS_WEBSITE_CODE || accsMeshConfig.ACCS_WEBSITE_CODE)
        : (edsConfig.ADOBE_COMMERCE_WEBSITE_CODE || paasMeshConfig.ADOBE_COMMERCE_WEBSITE_CODE);

    const customerGroup = isAccs
        ? (edsConfig.ACCS_CUSTOMER_GROUP || accsMeshConfig.ACCS_CUSTOMER_GROUP)
        : (edsConfig.ADOBE_COMMERCE_CUSTOMER_GROUP || paasMeshConfig.ADOBE_COMMERCE_CUSTOMER_GROUP);

    return {
        environmentType,
        commerceEndpoint: commerceEndpoint as string | undefined,
        // ACCS: no separate catalog service endpoint (built into supergraph)
        catalogServiceEndpoint: isAccs
            ? undefined
            : (edsConfig.PAAS_CATALOG_SERVICE_ENDPOINT) as string | undefined,
        // ACCS: no API key or environment ID needed
        commerceApiKey: isAccs
            ? undefined
            : (edsConfig.ADOBE_CATALOG_API_KEY || paasMeshConfig.ADOBE_CATALOG_API_KEY) as string | undefined,
        commerceEnvironmentId: isAccs
            ? undefined
            : (edsConfig.ADOBE_COMMERCE_ENVIRONMENT_ID || paasMeshConfig.ADOBE_COMMERCE_ENVIRONMENT_ID) as string | undefined,
        storeViewCode: storeViewCode as string | undefined,
        storeCode: storeCode as string | undefined,
        websiteCode: websiteCode as string | undefined,
        customerGroup: customerGroup as string | undefined,
        aemAssetsEnabled: edsConfig.AEM_ASSETS_ENABLED === 'true',
    };
}

/**
 * Extract config parameters from a Project
 *
 * Convenience wrapper that extracts componentConfigs and meshState from project.
 *
 * @param project - The project to extract config from
 * @returns Config parameters for generation
 */
export function extractConfigParams(project: Project): Partial<ConfigGeneratorParams> {
    return extractConfigParamsFromConfigs(
        project.componentConfigs as ComponentConfigs | undefined,
        project.meshState?.endpoint,
        project.componentSelections?.backend,
    );
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
        const contentSourceUrl = `https://content.da.live/${params.daLiveOrg}/${params.daLiveSite}`;
        const storeUrl = `https://main--${params.repoName}--${params.githubOwner}.aem.live/`;

        // Determine commerce endpoints based on environment type
        // PaaS has both commerce-core-endpoint (catalog service) and commerce-endpoint (mesh)
        // ACCS/ACO have commerce-endpoint only
        const commerceEndpoint = params.commerceEndpoint || '';
        const catalogServiceEndpoint = environmentType === 'paas'
            ? (params.catalogServiceEndpoint || commerceEndpoint)
            : commerceEndpoint;

        // Replace placeholders throughout the config
        const replacements: Record<string, string> = {
            '{ORG}': params.githubOwner,
            '{REPO}': params.repoName,
            '{SITE}': params.daLiveSite,
            '{CONTENT_SOURCE}': contentSourceUrl,
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

        // Convert to string, replace all placeholders, parse back
        let configStr = JSON.stringify(config, null, 2);
        for (const [placeholder, value] of Object.entries(replacements)) {
            configStr = configStr.split(placeholder).join(value);
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
