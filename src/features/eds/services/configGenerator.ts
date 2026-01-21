/**
 * Config Generator for EDS Reset
 *
 * Generates demo-config.json content for EDS storefronts during reset operations.
 * Fetches the template demo-config.json and updates Commerce configuration values
 * (endpoints, API keys, store codes) with the project's actual configuration.
 *
 * @module features/eds/services/configGenerator
 */

import type { Logger } from '@/core/logging';
import type { DemoProject } from '@/types';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for demo-config.json generation
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
}

/**
 * Result of demo-config.json generation
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
 * and mesh state to build the params needed for demo-config.json generation.
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
    };
}

/**
 * Generate demo-config.json content for EDS storefront
 *
 * Fetches the demo-config.json template from the source repository and updates
 * Commerce configuration values with the project's actual configuration.
 * This ensures the storefront connects to the correct Commerce backend after reset.
 *
 * @param templateOwner - GitHub owner of the template repo
 * @param templateRepo - Template repository name
 * @param params - Configuration parameters to inject
 * @param logger - Logger instance
 * @returns Generation result with content or error
 */
export async function generateConfigJson(
    templateOwner: string,
    templateRepo: string,
    params: ConfigGeneratorParams,
    logger: Logger,
): Promise<ConfigGeneratorResult> {
    try {
        // Fetch demo-config.json from template repository
        const configUrl = `https://raw.githubusercontent.com/${templateOwner}/${templateRepo}/main/demo-config.json`;
        logger.debug(`[ConfigGenerator] Fetching template demo-config from ${configUrl}`);

        const response = await fetch(configUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Demo-Builder-VSCode',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return {
                success: false,
                error: `Failed to fetch template demo-config.json: ${response.status} ${response.statusText}`,
            };
        }

        const templateContent = await response.text();

        // Parse the template JSON to modify it properly
        let config: Record<string, unknown>;
        try {
            config = JSON.parse(templateContent);
        } catch (parseError) {
            return {
                success: false,
                error: `Template demo-config.json is not valid JSON: ${(parseError as Error).message}`,
            };
        }

        // Update the public.default section with project's Commerce config
        const publicConfig = config.public as Record<string, Record<string, unknown>> | undefined;
        if (publicConfig?.default) {
            const defaultConfig = publicConfig.default;

            // Update Commerce endpoints
            if (params.commerceEndpoint) {
                defaultConfig['commerce-core-endpoint'] = params.commerceEndpoint;
                defaultConfig['commerce-endpoint'] = params.commerceEndpoint;
                logger.debug(`[ConfigGenerator] Set commerce endpoints to ${params.commerceEndpoint}`);
            }

            // Update headers section
            const headers = defaultConfig.headers as Record<string, Record<string, string>> | undefined;
            if (headers) {
                // Update "all" headers
                if (headers.all && params.storeViewCode) {
                    headers.all.Store = params.storeViewCode;
                }

                // Update "cs" (catalog service) headers
                if (headers.cs) {
                    if (params.storeCode) {
                        headers.cs['Magento-Store-Code'] = params.storeCode;
                    }
                    if (params.storeViewCode) {
                        headers.cs['Magento-Store-View-Code'] = params.storeViewCode;
                    }
                    if (params.websiteCode) {
                        headers.cs['Magento-Website-Code'] = params.websiteCode;
                    }
                    if (params.commerceApiKey) {
                        headers.cs['x-api-key'] = params.commerceApiKey;
                    }
                    if (params.commerceEnvironmentId) {
                        headers.cs['Magento-Environment-Id'] = params.commerceEnvironmentId;
                    }
                    if (params.customerGroup) {
                        headers.cs['Magento-Customer-Group'] = params.customerGroup;
                    }
                }
            }

            // Update analytics section with correct store URL
            const analytics = defaultConfig.analytics as Record<string, unknown> | undefined;
            if (analytics) {
                const storeUrl = `https://main--${params.daLiveSite}--${params.githubOwner}.aem.live/`;
                analytics['store-url'] = storeUrl;
            }
        }

        // Serialize back to JSON with proper formatting
        const configContent = JSON.stringify(config, null, 2);

        logger.info('[ConfigGenerator] Successfully generated demo-config.json');
        return {
            success: true,
            content: configContent,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[ConfigGenerator] Failed to generate demo-config.json: ${message}`);
        return {
            success: false,
            error: message,
        };
    }
}
