/**
 * Config Generator for EDS Storefronts
 *
 * Generates config.json content for EDS storefronts using a bundled template.
 * This is the single source of truth for config.json generation, used by both
 * project creation and EDS Reset operations.
 *
 * @module features/eds/services/configGenerator
 */

import type { Logger } from '@/core/logging';
import type { DemoProject } from '@/types';

// Bundled template - single source of truth
import configTemplate from '../config/config-template.json';

// ==========================================================
// Types
// ==========================================================

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
    /** Commerce GraphQL endpoint (mesh or direct) */
    commerceEndpoint?: string;
    /** Catalog Service endpoint */
    catalogServiceEndpoint?: string;
    /** Commerce API key */
    commerceApiKey?: string;
    /** Commerce environment ID */
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
 * Extract config parameters from a DemoProject
 *
 * Pulls Commerce configuration values from the project's component configs
 * and mesh state to build the params needed for config.json generation.
 *
 * @param project - The demo project to extract config from
 * @returns Config parameters for generation
 */
export function extractConfigParams(project: DemoProject): Partial<ConfigGeneratorParams> {
    const edsConfig = project.componentConfigs?.['eds-storefront'] || {};
    const meshConfig = project.componentConfigs?.['eds-commerce-mesh'] || {};
    const meshState = project.meshState;

    // Prefer mesh endpoint if deployed, otherwise use direct Commerce endpoint
    const commerceEndpoint = meshState?.endpoint || edsConfig.ADOBE_COMMERCE_GRAPHQL_ENDPOINT;

    return {
        commerceEndpoint,
        catalogServiceEndpoint: edsConfig.PAAS_CATALOG_SERVICE_ENDPOINT || edsConfig.ACCS_CATALOG_SERVICE_ENDPOINT,
        commerceApiKey: edsConfig.ADOBE_CATALOG_API_KEY || meshConfig.ADOBE_CATALOG_API_KEY,
        commerceEnvironmentId: edsConfig.ADOBE_COMMERCE_ENVIRONMENT_ID || meshConfig.ADOBE_COMMERCE_ENVIRONMENT_ID,
        storeViewCode: edsConfig.ADOBE_COMMERCE_STORE_VIEW_CODE || meshConfig.ADOBE_COMMERCE_STORE_VIEW_CODE,
        storeCode: edsConfig.ADOBE_COMMERCE_STORE_CODE || meshConfig.ADOBE_COMMERCE_STORE_CODE,
        websiteCode: edsConfig.ADOBE_COMMERCE_WEBSITE_CODE || meshConfig.ADOBE_COMMERCE_WEBSITE_CODE,
        customerGroup: edsConfig.ADOBE_COMMERCE_CUSTOMER_GROUP || meshConfig.ADOBE_COMMERCE_CUSTOMER_GROUP,
        aemAssetsEnabled: edsConfig.AEM_ASSETS_ENABLED === 'true',
    };
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
        logger.debug('[ConfigGenerator] Generating config.json from bundled template');

        // Deep clone the template to avoid mutating the imported object
        const config = JSON.parse(JSON.stringify(configTemplate));

        // Build replacement map for placeholders
        const contentSourceUrl = `https://content.da.live/${params.daLiveOrg}/${params.daLiveSite}`;
        const storeUrl = `https://main--${params.repoName}--${params.githubOwner}.aem.live/`;

        // Replace placeholders throughout the config
        const replacements: Record<string, string> = {
            '{ORG}': params.githubOwner,
            '{REPO}': params.repoName,
            '{SITE}': params.daLiveSite,
            '{CONTENT_SOURCE}': contentSourceUrl,
            '{COMMERCE_ENDPOINT}': params.commerceEndpoint || '',
            '{CS_ENDPOINT}': params.catalogServiceEndpoint || params.commerceEndpoint || '',
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

        // Convert commerce-assets-enabled from string to boolean
        if (finalConfig.public?.default) {
            const assetsEnabled = finalConfig.public.default['commerce-assets-enabled'];
            if (assetsEnabled === 'true') {
                finalConfig.public.default['commerce-assets-enabled'] = true;
            } else if (assetsEnabled === 'false') {
                // Remove the field entirely if disabled (cleaner config)
                delete finalConfig.public.default['commerce-assets-enabled'];
            }
        }

        // Serialize with proper formatting
        const configContent = JSON.stringify(finalConfig, null, 2);

        logger.info('[ConfigGenerator] Successfully generated config.json');
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
