/**
 * Detects changes that require API Mesh redeployment
 *
 * Tracks:
 * - Environment variables used in mesh.json
 * - Source file hashes (resolvers, schemas, config)
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@/core/logging';
import { getFrontendEnvVars } from '@/core/state';
import type { MeshState, MeshChanges } from '@/features/mesh/services/types';
import { Project } from '@/types';
import { parseJSON, hasEntries } from '@/types/typeGuards';

export type { MeshState, MeshChanges };

// Create logger instance for this module
const logger = new Logger('MeshStaleness');

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
 * Get current mesh-related environment variables from component config
 */
export function getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
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
 * Fetch deployed mesh configuration from Adobe I/O
 * Returns environment variables that were used in the deployed mesh
 */
export async function fetchDeployedMeshConfig(): Promise<Record<string, string> | null> {
    try {
        const { ServiceLocator } = await import('@/core/di');
        const { TIMEOUTS } = await import('@/core/utils/timeoutConfig');
        const commandManager = ServiceLocator.getCommandExecutor();

        logger.debug('[Mesh Staleness] Fetching deployed mesh config from Adobe I/O...');

        // Pre-check: Verify authentication status without triggering browser auth
        // Use a fast command that doesn't trigger interactive login
        try {
            const authCheckResult = await commandManager.execute('aio console where --json', {
                timeout: TIMEOUTS.API_CALL,
            });

            if (authCheckResult.code !== 0) {
                logger.debug('[Mesh Staleness] Not authenticated or no org selected, skipping mesh fetch');
                return null;
            }
        } catch (authError) {
            logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
            return null;
        }

        // Query the deployed mesh configuration
        const result = await commandManager.execute('aio api-mesh:get --active --json', {
            timeout: TIMEOUTS.MESH_DESCRIBE,
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
            keysFound: Object.keys(deployedEnvVars),
        });
        
        return deployedEnvVars;
        
    } catch (error) {
        logger.debug('[Mesh Staleness] Failed to fetch deployed mesh config:', error);
        return null;
    }
}

/**
 * Calculate hash of mesh source files (same logic as update-mesh.js)
 */
export async function calculateMeshSourceHash(meshComponentPath: string): Promise<string | null> {
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
 * Get current mesh state from project
 */
export function getCurrentMeshState(project: Project): MeshState | null {
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
 * Detect if mesh has changes requiring redeployment
 */
export async function detectMeshChanges(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
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
    const currentState = getCurrentMeshState(project);
    
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

        const deployedConfig = await fetchDeployedMeshConfig();

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
    const newEnvVars = getMeshEnvVars(newMeshConfig);

    const changedEnvVars: string[] = [];
    MESH_ENV_VARS.forEach(key => {
        // Normalize: treat missing keys as empty strings for robust comparison
        const oldValue = currentState.envVars[key] || '';
        const newValue = newEnvVars[key] || '';
        
        if (oldValue !== newValue) {
            changedEnvVars.push(key);
            logger.debug(`[Mesh Staleness]   ❌ ${key} changed: "${oldValue}" → "${newValue}"`);
        }
    });
    
    const envVarsChanged = changedEnvVars.length > 0;

    if (envVarsChanged) {
        logger.debug(`[Mesh Staleness] Detected ${changedEnvVars.length} changed env vars:`, changedEnvVars);
    }
    
    // Check source files changes
    const newSourceHash = await calculateMeshSourceHash(meshInstance.path);
    
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
 * Update mesh state after deployment
 */
export async function updateMeshState(project: Project): Promise<void> {
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance?.path) {
        return;
    }
    
    const meshConfig = project.componentConfigs?.['commerce-mesh'] || {};
    const envVars = getMeshEnvVars(meshConfig);
    const sourceHash = await calculateMeshSourceHash(meshInstance.path);
    
    project.meshState = {
        envVars,
        sourceHash,
        lastDeployed: new Date().toISOString(),
        // Clear any previous decline state since mesh is now deployed
        userDeclinedUpdate: undefined,
        declinedAt: undefined,
    };
}

/**
 * Detect if frontend env vars have changed since demo started
 * Returns true if any frontend-relevant env var changed
 */
export function detectFrontendChanges(project: Project): boolean {
    const frontendInstance = project.componentInstances?.['citisignal-nextjs'];
    if (!frontendInstance || !project.frontendEnvState) {
        return false;
    }

    const currentConfig = project.componentConfigs?.['citisignal-nextjs'] || {};
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

