/**
 * Detects changes that require API Mesh redeployment
 *
 * Tracks:
 * - Environment variables used in mesh.json
 * - Source file hashes (resolvers, schemas, config)
 *
 * DI Pattern: StalenessDetectorService uses constructor injection for logger.
 * Backward-compatible function exports use a lazy-loaded default logger.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '@/core/logging';
import { getFrontendEnvVars } from '@/core/state';
import type { MeshState, MeshChanges } from '@/features/mesh/services/types';
import { Project } from '@/types';
import type { Logger } from '@/types/logger';
import { parseJSON, hasEntries, getComponentInstancesByType } from '@/types/typeGuards';

export type { MeshState, MeshChanges };

/**
 * Environment variables that affect mesh deployment
 * These are used in mesh.json configuration
 */
const MESH_ENV_VARS = [
    'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
    'ADOBE_CATALOG_SERVICE_ENDPOINT',
    'ADOBE_CATALOG_API_KEY',
    'ADOBE_COMMERCE_ENVIRONMENT_ID',
    'ADOBE_COMMERCE_WEBSITE_CODE',
    'ADOBE_COMMERCE_STORE_VIEW_CODE',
    'ADOBE_COMMERCE_STORE_CODE',
];

/**
 * Lazy-loaded default logger for backward-compatible function exports.
 * Avoids module-level instantiation issues during testing.
 */
let _defaultLogger: Logger | null = null;
function getDefaultLogger(): Logger {
    if (!_defaultLogger) {
        _defaultLogger = getLogger();
    }
    return _defaultLogger;
}

/**
 * StalenessDetectorService - Detects changes requiring API Mesh redeployment
 *
 * Uses constructor injection for the logger dependency (DI pattern).
 * Provides instance methods that use the injected logger.
 */
export class StalenessDetectorService {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Get current mesh-related environment variables from component config
     * (Static method for backward compatibility)
     */
    static getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
        return getMeshEnvVarsImpl(componentConfig);
    }

    /**
     * Get current mesh-related environment variables from component config
     */
    getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
        return getMeshEnvVarsImpl(componentConfig);
    }

    /**
     * Fetch deployed mesh configuration from Adobe I/O
     */
    async fetchDeployedMeshConfig(): Promise<Record<string, string> | null> {
        return fetchDeployedMeshConfigImpl(this.logger);
    }

    /**
     * Calculate hash of mesh source files
     */
    async calculateMeshSourceHash(meshComponentPath: string): Promise<string | null> {
        return calculateMeshSourceHashImpl(meshComponentPath, this.logger);
    }

    /**
     * Get current mesh state from project
     */
    getCurrentMeshState(project: Project): MeshState | null {
        return getCurrentMeshStateImpl(project);
    }

    /**
     * Detect if mesh has changes requiring redeployment
     */
    async detectMeshChanges(
        project: Project,
        newComponentConfigs: Record<string, unknown>,
    ): Promise<MeshChanges> {
        return detectMeshChangesImpl(project, newComponentConfigs, this.logger);
    }

    /**
     * Update mesh state after deployment
     *
     * @param project - The project to update
     * @param endpoint - The deployed mesh endpoint URL
     */
    async updateMeshState(project: Project, endpoint?: string): Promise<void> {
        return updateMeshStateImpl(project, endpoint, this.logger);
    }

    /**
     * Detect if frontend env vars have changed since demo started
     */
    detectFrontendChanges(project: Project): boolean {
        return detectFrontendChangesImpl(project);
    }
}

// ============================================================================
// Implementation Functions (shared between service and backward-compatible exports)
// ============================================================================

/**
 * Get current mesh-related environment variables from component config
 */
function getMeshEnvVarsImpl(componentConfig: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};

    // Extract only mesh-related env vars from component config
    for (const key of MESH_ENV_VARS) {
        if (key in componentConfig) {
            const value = componentConfig[key];
            // Convert to string, filtering out undefined/null
            if (value !== undefined && value !== null) {
                result[key] = String(value);
            }
        }
    }

    return result;
}

/**
 * Backward-compatible export: Get current mesh-related environment variables
 */
export function getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
    return getMeshEnvVarsImpl(componentConfig);
}

/**
 * Read mesh-related environment variables from the .env file in a mesh component directory.
 * Returns only the MESH_ENV_VARS keys, filtering out all other variables.
 *
 * @param meshComponentPath - Path to the mesh component directory
 * @returns Record of mesh env var key-value pairs (empty object if file doesn't exist)
 */
export async function readMeshEnvVarsFromFile(meshComponentPath: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    try {
        const envFilePath = path.join(meshComponentPath, '.env');
        const content = await fs.readFile(envFilePath, 'utf-8');

        // Parse each line of the .env file
        for (const line of content.split('\n')) {
            const trimmedLine = line.trim();

            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // Find the first equals sign (value may contain additional equals signs)
            const equalsIndex = trimmedLine.indexOf('=');
            if (equalsIndex <= 0) {
                continue; // Skip lines without key=value format
            }

            const key = trimmedLine.substring(0, equalsIndex).trim();
            let value = trimmedLine.substring(equalsIndex + 1).trim();

            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            // Only include mesh-related env vars
            if (MESH_ENV_VARS.includes(key)) {
                result[key] = value;
            }
        }
    } catch (error) {
        // Return empty object if file doesn't exist or can't be read
        // This is expected for new projects or projects without mesh
    }

    return result;
}

/**
 * Implementation: Fetch deployed mesh configuration from Adobe I/O
 */
async function fetchDeployedMeshConfigImpl(logger: Logger): Promise<Record<string, string> | null> {
    try {
        const { ServiceLocator } = await import('@/core/di');
        const { TIMEOUTS } = await import('@/core/utils/timeoutConfig');
        const commandManager = ServiceLocator.getCommandExecutor();

        logger.debug('[Mesh Staleness] Fetching deployed mesh config from Adobe I/O...');

        // Pre-check: Verify authentication status without triggering browser auth
        // Use getTokenStatus() which reads token file directly (no CLI call, no browser popup)
        try {
            const authService = ServiceLocator.getAuthenticationService();
            const tokenStatus = await authService.getTokenStatus();

            if (!tokenStatus.isAuthenticated) {
                logger.debug('[Mesh Staleness] Token expired or invalid, skipping mesh fetch');
                return null;
            }
        } catch (authError) {
            logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
            return null;
        }

        // Query the deployed mesh configuration
        const result = await commandManager.execute('aio api-mesh:get --active --json', {
            timeout: TIMEOUTS.NORMAL,
        });

        // Parse the JSON response
        const meshData = parseJSON<{ meshConfig?: { sources?: { name?: string; handler?: { graphql?: { endpoint?: string; operationHeaders?: Record<string, string> } } }[] } }>(result.stdout);
        if (!meshData) {
            logger.debug('[Mesh Staleness] Failed to parse mesh data');
            return null;
        }

        // Extract environment variables from the mesh configuration
        // Match the structure we generate in meshDeployer.ts
        const deployedEnvVars: Record<string, string> = {};

        if (meshData.meshConfig?.sources) {
            for (const source of meshData.meshConfig.sources) {
                // Commerce GraphQL endpoint (source name: 'magento')
                if (source.name === 'magento' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_COMMERCE_GRAPHQL_ENDPOINT = source.handler.graphql.endpoint;
                }

                // Catalog Service endpoint (source name: 'catalog')
                if (source.name === 'catalog' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_CATALOG_SERVICE_ENDPOINT = source.handler.graphql.endpoint;
                }

                // Extract API key from catalog source headers
                if (source.name === 'catalog' && source.handler?.graphql?.operationHeaders) {
                    const headers = source.handler.graphql.operationHeaders;
                    // The key might be a placeholder like {context.headers['x-api-key']}
                    // Or an actual value - we want the actual value
                    if (headers['x-api-key'] && !headers['x-api-key'].includes('context.headers')) {
                        deployedEnvVars.ADOBE_CATALOG_API_KEY = headers['x-api-key'];
                    }
                }
            }
        }

        logger.debug('[Mesh Staleness] Successfully fetched deployed mesh config', {
            keyCount: Object.keys(deployedEnvVars).length,
        });

        return deployedEnvVars;

    } catch (error) {
        logger.trace('[Mesh Staleness] Failed to fetch deployed mesh config:', error);
        return null;
    }
}

/**
 * Backward-compatible export: Fetch deployed mesh configuration from Adobe I/O
 */
export async function fetchDeployedMeshConfig(): Promise<Record<string, string> | null> {
    return fetchDeployedMeshConfigImpl(getDefaultLogger());
}

/**
 * Implementation: Calculate hash of mesh source files
 */
async function calculateMeshSourceHashImpl(meshComponentPath: string, logger: Logger): Promise<string | null> {
    try {
        const resolversDir = path.join(meshComponentPath, 'build', 'resolvers');
        const schemasDir = path.join(meshComponentPath, 'schema');
        const meshConfigPath = path.join(meshComponentPath, 'mesh.config.js');

        let combinedContent = '';

        // Include mesh config - changes to this ALWAYS require deployment
        try {
            const meshConfig = await fs.readFile(meshConfigPath, 'utf-8');
            combinedContent += meshConfig;
        } catch {
            // mesh.config.js might not exist yet
        }

        // Include all resolver files
        try {
            const resolverFiles = (await fs.readdir(resolversDir))
                .filter(f => f.endsWith('.js'))
                .sort(); // Sort for consistent hash

            for (const file of resolverFiles) {
                const filePath = path.join(resolversDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // build/resolvers might not exist yet
        }

        // Include all schema files
        try {
            const schemaFiles = (await fs.readdir(schemasDir))
                .filter(f => f.endsWith('.graphql'))
                .sort();

            for (const file of schemaFiles) {
                const filePath = path.join(schemasDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // schema directory might not exist yet
        }

        if (!combinedContent) {
            return null;
        }

        return crypto.createHash('md5').update(combinedContent).digest('hex');
    } catch (error) {
        logger.error('Error calculating source hash', error instanceof Error ? error : undefined);
        return null;
    }
}

/**
 * Backward-compatible export: Calculate hash of mesh source files
 */
export async function calculateMeshSourceHash(meshComponentPath: string): Promise<string | null> {
    return calculateMeshSourceHashImpl(meshComponentPath, getDefaultLogger());
}

/**
 * Implementation: Get current mesh state from project
 */
function getCurrentMeshStateImpl(project: Project): MeshState | null {
    // Return the stored mesh state (from last deployment)
    // This represents the DEPLOYED configuration, not the current config
    if (!project.meshState) {
        return null;
    }

    return {
        envVars: project.meshState.envVars || {},
        sourceHash: project.meshState.sourceHash || null,
        lastDeployed: project.meshState.lastDeployed ? new Date(project.meshState.lastDeployed) : null,
    };
}

/**
 * Backward-compatible export: Get current mesh state from project
 */
export function getCurrentMeshState(project: Project): MeshState | null {
    return getCurrentMeshStateImpl(project);
}

/**
 * Implementation: Detect if mesh has changes requiring redeployment
 */
async function detectMeshChangesImpl(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
    logger: Logger,
): Promise<MeshChanges> {
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance?.path) {
        return {
            hasChanges: false,
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: [],
        };
    }

    // Get current deployed state
    const currentState = getCurrentMeshStateImpl(project);

    if (!currentState) {
        // No previous state, assume fresh deployment needed
        return {
            hasChanges: true,
            envVarsChanged: true,
            sourceFilesChanged: true,
            changedEnvVars: MESH_ENV_VARS,
        };
    }

    // If envVars is empty, it means meshState exists but env vars were never captured
    // Try to fetch the deployed config from Adobe I/O to establish baseline
    const envVarsExist = hasEntries(currentState.envVars);
    let didPopulateFromDeployedConfig = false;

    if (!envVarsExist) {
        logger.debug('[Mesh Staleness] meshState.envVars is empty, attempting to fetch deployed config from Adobe I/O');

        const deployedConfig = await fetchDeployedMeshConfigImpl(logger);

        if (deployedConfig) {
            // Successfully fetched deployed config - use it as baseline
            logger.debug('[Mesh Staleness] Successfully fetched deployed config, populating meshState.envVars');

            project.meshState!.envVars = deployedConfig;
            didPopulateFromDeployedConfig = true;

            // Now continue with normal comparison using the fetched baseline
            currentState.envVars = deployedConfig;
            // Fall through to regular comparison logic below
        } else {
            // Failed to fetch - can't verify deployed state
            // Conservative approach: Don't force redeployment, flag as unknown
            logger.warn('[Mesh Staleness] Failed to fetch deployed config, unable to verify deployment status');
            return {
                hasChanges: false,        // Don't force redeployment
                envVarsChanged: false,    // No changes detected
                sourceFilesChanged: false,
                changedEnvVars: [],
                unknownDeployedState: true, // Flag as unknown
            };
        }
    }

    // Check env vars changes
    const newMeshConfig = (newComponentConfigs['commerce-mesh'] as Record<string, unknown> | undefined) || {};
    const newEnvVars = getMeshEnvVarsImpl(newMeshConfig);

    const changedEnvVars: string[] = [];
    MESH_ENV_VARS.forEach(key => {
        // Normalize: treat missing keys as empty strings for robust comparison
        const oldValue = currentState.envVars[key] || '';
        const newValue = newEnvVars[key] || '';

        if (oldValue !== newValue) {
            changedEnvVars.push(key);
            logger.debug(`[Mesh Staleness]   ${key} changed: "${oldValue}" -> "${newValue}"`);
        }
    });

    const envVarsChanged = changedEnvVars.length > 0;

    if (envVarsChanged) {
        logger.debug(`[Mesh Staleness] Detected ${changedEnvVars.length} changed env vars:`, changedEnvVars);
    }

    // Check source files changes
    const newSourceHash = await calculateMeshSourceHashImpl(meshInstance.path, logger);

    // If old hash is null, it means meshState was never captured after deployment
    // In this case, DON'T flag as changed (assume deployed = current state)
    let sourceFilesChanged = false;
    if (currentState.sourceHash === null) {
        sourceFilesChanged = false;
    } else {
        sourceFilesChanged = newSourceHash !== null && newSourceHash !== currentState.sourceHash;
    }

    return {
        hasChanges: envVarsChanged || sourceFilesChanged,
        envVarsChanged,
        sourceFilesChanged,
        changedEnvVars,
        shouldSaveProject: didPopulateFromDeployedConfig,  // Save if we fetched and populated config
    };
}

/**
 * Backward-compatible export: Detect if mesh has changes requiring redeployment
 */
export async function detectMeshChanges(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
): Promise<MeshChanges> {
    return detectMeshChangesImpl(project, newComponentConfigs, getDefaultLogger());
}

/**
 * Implementation: Update mesh state after deployment
 *
 * Sets meshState with env vars, source hash, and endpoint (single source of truth).
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to update
 * @param endpoint - The deployed mesh endpoint URL (authoritative)
 * @param logger - Logger instance
 */
async function updateMeshStateImpl(project: Project, endpoint: string | undefined, logger: Logger): Promise<void> {
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance?.path) {
        return;
    }

    // Read env vars from the mesh component's .env file (not componentConfigs)
    // This is the actual deployed state since .env file is used during mesh deployment
    const envVars = await readMeshEnvVarsFromFile(meshInstance.path);
    const sourceHash = await calculateMeshSourceHashImpl(meshInstance.path, logger);

    project.meshState = {
        envVars,
        sourceHash,
        lastDeployed: new Date().toISOString(),
        endpoint, // AUTHORITATIVE location for mesh endpoint
        // Clear any previous decline state since mesh is now deployed
        userDeclinedUpdate: undefined,
        declinedAt: undefined,
    };
}

/**
 * Update mesh state after deployment
 *
 * Sets meshState.endpoint as the single source of truth for mesh endpoint.
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to update
 * @param endpoint - The deployed mesh endpoint URL (optional, for backward compatibility)
 */
export async function updateMeshState(project: Project, endpoint?: string): Promise<void> {
    return updateMeshStateImpl(project, endpoint, getDefaultLogger());
}

/**
 * Implementation: Detect if frontend env vars have changed since demo started
 */
function detectFrontendChangesImpl(project: Project): boolean {
    const frontendInstance = getComponentInstancesByType(project, 'frontend')[0];
    if (!frontendInstance || !project.frontendEnvState) {
        return false;
    }

    const currentConfig = project.componentConfigs?.[frontendInstance.id] || {};
    const currentEnvVars = getFrontendEnvVars(currentConfig);
    const deployedEnvVars = project.frontendEnvState.envVars;

    // Get the keys from currentEnvVars (since FRONTEND_ENV_VARS is now in shared)
    for (const key of Object.keys(currentEnvVars)) {
        const oldValue = deployedEnvVars[key];
        const newValue = currentEnvVars[key];

        if (oldValue !== newValue) {
            return true;
        }
    }

    return false;
}

/**
 * Backward-compatible export: Detect if frontend env vars have changed since demo started
 */
export function detectFrontendChanges(project: Project): boolean {
    return detectFrontendChangesImpl(project);
}

