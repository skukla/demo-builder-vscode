/**
 * Writes a component's configuration files during project creation.
 *
 * A component with no `configFiles` declaration gets the default `.env`; one with
 * declarations gets each file it names — `.env` format through the shared `.env`
 * writer, the EDS `config.json` through the canonical EDS config generator, and
 * json files built from the component's env vars.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { generateComponentEnvFile } from './envFileGenerator';
import { resolveComponentEnvVars } from './envVarResolution';
import { generateConfigFile } from '@/core/config/configFileGenerator';
import {
    PAAS_CATALOG_SERVICE_ENDPOINT,
    CATALOG_SERVICE_ENDPOINT,
    ACCS_CATALOG_SERVICE_ENDPOINT,
} from '@/core/config/envVarKeys';
import { COMPONENT_IDS } from '@/core/constants';
import {
    generateConfigJson,
    extractConfigParamsFromConfigs,
    type ConfigGeneratorParams,
} from '@/features/eds/services/configGenerator';
import type { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { ConfigFileDefinition, TransformedComponentDefinition } from '@/types/components';

/**
 * Generate all configuration files for a component using ProjectSetupContext
 *
 * If component has explicit configFiles definition, generates only those files.
 * Otherwise, defaults to generating .env (or .env.local for Next.js).
 *
 * @param componentPath - Path to the component directory
 * @param componentId - ID of the component
 * @param componentDef - Component definition from components.json
 * @param context - Project setup context with registry, config, logger
 */
export async function generateComponentConfigFiles(
    componentPath: string,
    componentId: string,
    componentDef: TransformedComponentDefinition,
    context: ProjectSetupContext,
): Promise<void> {
    const configFiles = componentDef.configuration?.configFiles;

    // If no explicit configFiles, use default .env behavior
    if (!configFiles || Object.keys(configFiles).length === 0) {
        await generateComponentEnvFile(componentPath, componentId, componentDef, context);
        return;
    }

    // Generate all explicitly defined config files
    context.logger.debug(
        `[Project Creation] Generating ${Object.keys(configFiles).length} config file(s) for ${componentDef.name}`,
    );

    for (const [filename, configFileDef] of Object.entries(configFiles)) {
        if (configFileDef.format === 'env') {
            // Generate .env format file
            await generateComponentEnvFile(componentPath, componentId, componentDef, context);
        } else if (configFileDef.generator === 'eds-config') {
            // Use canonical EDS config generator
            await generateEdsConfigJson(componentPath, context);
        } else {
            // Generate other format files (json, yaml, etc.)
            await generateSingleConfigFile(
                componentPath,
                filename,
                configFileDef,
                componentDef,
                context,
            );
        }
    }
}

/**
 * Generate a single non-env configuration file (json, yaml, etc.) using ProjectSetupContext
 *
 * Takes env vars and optionally renames them for the output format.
 */
async function generateSingleConfigFile(
    componentPath: string,
    filename: string,
    configFileDef: ConfigFileDefinition,
    componentDef: TransformedComponentDefinition,
    context: ProjectSetupContext,
): Promise<void> {
    if (configFileDef.format !== 'json') {
        context.logger.warn(
            `[Project Creation] Unsupported config file format: ${configFileDef.format} for ${filename}`,
        );
        return;
    }

    const filePath = path.join(componentPath, filename);
    const templatePath = configFileDef.template
        ? path.join(componentPath, configFileDef.template)
        : undefined;

    // Get all relevant env var keys (component vars + service vars)
    const allEnvVarKeys = resolveComponentEnvVars(
        componentDef,
        context.registry,
        context.getBackendId(),
    );

    // Helper to get value from config
    const getConfigValue = (key: string): string | undefined => {
        const componentConfigs = context.getComponentConfigs();
        if (componentConfigs) {
            for (const componentConfig of Object.values(componentConfigs)) {
                if (componentConfig[key] !== undefined) {
                    return String(componentConfig[key]);
                }
            }
        }
        return undefined;
    };

    // Compute derived values FIRST (before processing keys)
    const derivedValues = new Map<string, string>();

    // Derive CATALOG_SERVICE_ENDPOINT from backend-specific source
    const paasEndpoint = getConfigValue(PAAS_CATALOG_SERVICE_ENDPOINT);
    const accsEndpoint = getConfigValue(ACCS_CATALOG_SERVICE_ENDPOINT);
    if (paasEndpoint || accsEndpoint) {
        const derivedEndpoint = paasEndpoint || accsEndpoint;
        derivedValues.set(CATALOG_SERVICE_ENDPOINT, derivedEndpoint ?? '');
        context.logger.debug(
            `[Config Generator] Computed ADOBE_CATALOG_SERVICE_ENDPOINT from ${paasEndpoint ? 'PAAS' : 'ACCS'}_CATALOG_SERVICE_ENDPOINT: ${derivedEndpoint}`,
        );
    }

    // Add derived keys to the list of keys to process
    const allKeys = [...allEnvVarKeys, ...Array.from(derivedValues.keys())];

    // Build the output config
    const outputConfig: Record<string, unknown> = {};

    // Process each env var (including derived ones)
    for (const envVarKey of allKeys) {
        let value = '';

        // Get value from config
        // Priority: 1. Derived values, 2. Runtime values, 3. User-provided values
        if (derivedValues.has(envVarKey)) {
            value = derivedValues.get(envVarKey) ?? '';
        } else if (envVarKey === 'MESH_ENDPOINT') {
            const meshEndpoint = context.getMeshEndpoint();
            if (meshEndpoint) {
                value = meshEndpoint;
            }
        } else {
            const componentConfigs = context.getComponentConfigs();
            if (componentConfigs) {
                for (const componentConfig of Object.values(componentConfigs)) {
                    if (componentConfig[envVarKey]) {
                        value = String(componentConfig[envVarKey]);
                        break;
                    }
                }
            }
        }

        // Determine output field name (rename if mapping exists)
        const outputFieldName = configFileDef.fieldRenames?.[envVarKey] || envVarKey;
        outputConfig[outputFieldName] = value;
    }

    // Add additional static fields
    if (configFileDef.additionalFields) {
        Object.assign(outputConfig, configFileDef.additionalFields);
    }

    // Generate the file
    if (templatePath) {
        // Build placeholders for template replacement
        const placeholders: Record<string, string> = {};
        for (const [fieldName, value] of Object.entries(outputConfig)) {
            const placeholderKey = `{${fieldName.toUpperCase().replace(/-/g, '_')}}`;
            placeholders[placeholderKey] = String(value || '');
        }

        await generateConfigFile({
            filePath,
            templatePath,
            defaultConfig: outputConfig,
            placeholders,
            logger: context.logger,
            description: `${filename} for ${componentDef.name}`,
        });
    } else {
        // No template, write directly
        await fsPromises.writeFile(filePath, JSON.stringify(outputConfig, null, 2), 'utf-8');
    }

    context.logger.debug(`[Project Creation] Created ${filename} for ${componentDef.name}`);
}

/**
 * Generate config.json for EDS storefront using the canonical config generator
 *
 * This is the single canonical method for generating EDS config.json.
 * It uses the bundled template and replaces placeholders with project-specific values.
 *
 * @param componentPath - Path to the EDS component directory
 * @param context - Project setup context with registry, config, logger
 */
async function generateEdsConfigJson(
    componentPath: string,
    context: ProjectSetupContext,
): Promise<void> {
    const logger = context.logger;

    // Get EDS component instance metadata (populated during EDS setup phases)
    const edsInstance = context.project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const metadata = edsInstance?.metadata || {};

    // Extract GitHub owner and repo from githubRepo (format: "owner/repo")
    const githubRepo = metadata.githubRepo as string | undefined;
    let githubOwner = '';
    let repoName = '';
    if (githubRepo && githubRepo.includes('/')) {
        [githubOwner, repoName] = githubRepo.split('/');
    }

    // Get DA.live org and site. Falling back to the repo halves just parsed
    // above, not to '': the org IS the namespace and the site IS the repo name,
    // and a migrated project stores neither (owner sweep, 2026-09-20).
    const daLiveOrg = (metadata.daLiveOrg as string) || githubOwner;
    const daLiveSite = (metadata.daLiveSite as string) || repoName;

    // Extract Commerce config params from componentConfigs
    const componentConfigs = context.getComponentConfigs();
    const meshEndpoint = context.getMeshEndpoint();
    const backendId = context.getBackendId();

    const configParams = extractConfigParamsFromConfigs(componentConfigs, meshEndpoint, backendId);

    // Build full ConfigGeneratorParams
    const params: ConfigGeneratorParams = {
        githubOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        ...configParams,
        selectedAddons: context.getSelectedAddons(),
        selectedPackage: context.getSelectedPackage(),
    };

    // Validate required params
    if (!githubOwner || !repoName) {
        logger.warn(
            '[Config Generator] Missing GitHub repo info, config.json may have incomplete values',
        );
    }
    if (!daLiveOrg || !daLiveSite) {
        logger.warn(
            '[Config Generator] Missing DA.live info, config.json may have incomplete values',
        );
    }

    // Generate config.json using canonical generator
    const result = generateConfigJson(params, logger);

    if (!result.success || !result.content) {
        // Throw error instead of silent return - caller must know config generation failed
        // This ensures Phase 5 sync doesn't try to push stale/missing config
        throw new Error(`Config.json generation failed: ${result.error || 'Unknown error'}`);
    }

    // Write config.json locally
    const configFilePath = path.join(componentPath, 'config.json');
    await fsPromises.writeFile(configFilePath, result.content, 'utf-8');

    logger.info(
        `[Config Generator] Created config.json for EDS storefront (env: ${configParams.environmentType || 'paas'})`,
    );
}
