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
import { Project } from '../types';
import { parseJSON } from '../types/typeGuards';
import { Logger } from '../shared/logging';

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
 * Environment variables that affect frontend runtime
 * These are read by the Next.js frontend at runtime
 */
const FRONTEND_ENV_VARS = [
    'MESH_ENDPOINT',
    'ADOBE_COMMERCE_URL',
    'ADOBE_COMMERCE_ENVIRONMENT_ID',
    'ADOBE_COMMERCE_STORE_VIEW_CODE',
    'ADOBE_COMMERCE_WEBSITE_CODE',
    'ADOBE_COMMERCE_STORE_CODE',
    'ADOBE_CATALOG_API_KEY',
    'ADOBE_ASSETS_URL',
    'ADOBE_COMMERCE_CUSTOMER_GROUP',
];

export interface MeshState {
    envVars: Record<string, string>;
    sourceHash: string | null;
    lastDeployed: Date | null;
}

export interface MeshChanges {
    hasChanges: boolean;
    envVarsChanged: boolean;
    sourceFilesChanged: boolean;
    changedEnvVars: string[];
    unknownDeployedState?: boolean;  // True if meshState.envVars was empty and couldn't fetch deployed config
    shouldSaveProject?: boolean;  // True if we populated meshState.envVars and caller should save
}

/**
 * Get current mesh-related environment variables from component config
 */
export function getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
    const envVars: Record<string, string> = {};

    MESH_ENV_VARS.forEach(key => {
        // Include ALL keys, even if empty/falsy, for accurate comparison
        // Normalize undefined to empty string for consistent comparison
        const value = componentConfig[key];
        envVars[key] = (typeof value === 'string' ? value : '') || '';
    });

    return envVars;
}

/**
 * Get current frontend-related environment variables from component config
 */
export function getFrontendEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
    const envVars: Record<string, string> = {};

    FRONTEND_ENV_VARS.forEach(key => {
        // Include ALL keys, even if empty/falsy, for accurate comparison
        // Normalize undefined to empty string for consistent comparison
        const value = componentConfig[key];
        envVars[key] = (typeof value === 'string' ? value : '') || '';
    });

    return envVars;
}

/**
 * Fetch deployed mesh configuration from Adobe I/O
 * Returns environment variables that were used in the deployed mesh
 */
export async function fetchDeployedMeshConfig(): Promise<Record<string, string> | null> {
    try {
        const { ServiceLocator } = await import('../services/serviceLocator');
        const commandManager = ServiceLocator.getCommandExecutor();
        
        logger.debug('[MeshStaleness] Fetching deployed mesh config from Adobe I/O...');
        
        // Pre-check: Verify authentication status without triggering browser auth
        // Use a fast command that doesn't trigger interactive login
        logger.debug('[MeshStaleness] Checking authentication status...');
        try {
            const { TIMEOUTS } = await import('./timeoutConfig');
            const authCheckResult = await commandManager.executeAdobeCLI('aio console where --json', {
                timeout: TIMEOUTS.API_CALL, // Use existing timeout constant
            });
            
            if (authCheckResult.code !== 0) {
                logger.debug('[MeshStaleness] Not authenticated or no org selected, skipping mesh fetch');
                return null;
            }
            
            logger.debug('[MeshStaleness] Authentication verified, proceeding with mesh fetch');
        } catch (authError) {
            logger.debug('[MeshStaleness] Auth check failed, skipping mesh fetch:', authError);
            return null;
        }
        
        // Query the deployed mesh configuration
        const result = await commandManager.executeAdobeCLI('aio api-mesh:get --active --json', {
            timeout: 30000,
        });
        
        logger.debug('[MeshStaleness] Raw mesh response received, parsing...');

        // Parse the JSON response
        const meshData = parseJSON<{ meshConfig?: { sources?: { name?: string; handler?: { graphql?: { endpoint?: string; operationHeaders?: Record<string, string> } } }[] } }>(result.stdout);
        if (!meshData) {
            logger.debug('[MeshStaleness] Failed to parse mesh data');
            return null;
        }
        
        // Extract environment variables from the mesh configuration
        // Match the structure we generate in meshDeployer.ts
        const deployedEnvVars: Record<string, string> = {};
        
        if (meshData.meshConfig?.sources) {
            logger.debug(`[MeshStaleness] Found ${meshData.meshConfig.sources.length} mesh sources`);
            
            for (const source of meshData.meshConfig.sources) {
                // Commerce GraphQL endpoint (source name: 'magento')
                if (source.name === 'magento' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_COMMERCE_GRAPHQL_ENDPOINT = source.handler.graphql.endpoint;
                    logger.debug(`[MeshStaleness] Found Commerce endpoint: ${source.handler.graphql.endpoint}`);
                }
                
                // Catalog Service endpoint (source name: 'catalog')
                if (source.name === 'catalog' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_CATALOG_SERVICE_ENDPOINT = source.handler.graphql.endpoint;
                    logger.debug(`[MeshStaleness] Found Catalog endpoint: ${source.handler.graphql.endpoint}`);
                }
                
                // Extract API key from catalog source headers
                if (source.name === 'catalog' && source.handler?.graphql?.operationHeaders) {
                    const headers = source.handler.graphql.operationHeaders;
                    // The key might be a placeholder like {context.headers['x-api-key']}
                    // Or an actual value - we want the actual value
                    if (headers['x-api-key'] && !headers['x-api-key'].includes('context.headers')) {
                        deployedEnvVars.ADOBE_CATALOG_API_KEY = headers['x-api-key'];
                        logger.debug('[MeshStaleness] Found Catalog API key');
                    }
                }
            }
        }
        
        logger.info('[MeshStaleness] Successfully fetched deployed mesh config', {
            keysFound: Object.keys(deployedEnvVars),
        });
        
        return deployedEnvVars;
        
    } catch (error) {
        logger.debug('[MeshStaleness] Failed to fetch deployed mesh config:', error);
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
        console.error('[MeshChangeDetector] Error calculating source hash:', error);
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
    const hasEnvVars = Object.keys(currentState.envVars).length > 0;
    let didPopulateFromDeployedConfig = false;
    
    if (!hasEnvVars) {
        logger.debug('[MeshStaleness] meshState.envVars is empty, attempting to fetch deployed config from Adobe I/O');
        
        const deployedConfig = await fetchDeployedMeshConfig();
        
        if (deployedConfig) {
            // Successfully fetched deployed config - use it as baseline
            logger.info('[MeshStaleness] Successfully fetched deployed config, populating meshState.envVars');
            logger.debug('[MeshStaleness] Deployed config:', deployedConfig);
            
            project.meshState!.envVars = deployedConfig;
            didPopulateFromDeployedConfig = true;
            
            // Now continue with normal comparison using the fetched baseline
            currentState.envVars = deployedConfig;
            // Fall through to regular comparison logic below
        } else {
            // Failed to fetch - can't verify deployed state
            // Conservative approach: flag as changed to prompt redeployment
            logger.warn('[MeshStaleness] Failed to fetch deployed config, flagging as changed to prompt redeployment');
            return {
                hasChanges: true,
                envVarsChanged: true,
                sourceFilesChanged: false,
                changedEnvVars: ['UNKNOWN_DEPLOYED_STATE'],
                unknownDeployedState: true,
            };
        }
    }
    
    // Check env vars changes
    const newMeshConfig = (newComponentConfigs['commerce-mesh'] as Record<string, unknown> | undefined) || {};
    const newEnvVars = getMeshEnvVars(newMeshConfig);
    
    logger.debug('[MeshStaleness] Comparing deployed state vs current config:');
    logger.debug('[MeshStaleness]   Deployed (meshState):', currentState.envVars);
    logger.debug('[MeshStaleness]   Current (config):', newEnvVars);
    
    const changedEnvVars: string[] = [];
    MESH_ENV_VARS.forEach(key => {
        // Normalize: treat missing keys as empty strings for robust comparison
        const oldValue = currentState.envVars[key] || '';
        const newValue = newEnvVars[key] || '';
        
        if (oldValue !== newValue) {
            changedEnvVars.push(key);
            logger.debug(`[MeshStaleness]   ❌ ${key} changed: "${oldValue}" → "${newValue}"`);
        }
    });
    
    const envVarsChanged = changedEnvVars.length > 0;
    
    if (envVarsChanged) {
        logger.info(`[MeshStaleness] Detected ${changedEnvVars.length} changed env vars:`, changedEnvVars);
    } else {
        logger.debug('[MeshStaleness] No env var changes detected');
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
    
    // Check if any frontend-relevant var changed
    for (const key of FRONTEND_ENV_VARS) {
        const oldValue = deployedEnvVars[key];
        const newValue = currentEnvVars[key];
        
        if (oldValue !== newValue) {
            return true;
        }
    }
    
    return false;
}

/**
 * Update frontend state after demo starts
 * Captures the env vars that were active when demo started
 */
export function updateFrontendState(project: Project): void {
    const frontendInstance = project.componentInstances?.['citisignal-nextjs'];
    if (!frontendInstance || !project.componentConfigs) {
        return;
    }
    
    const frontendConfig = project.componentConfigs['citisignal-nextjs'] || {};
    const envVars = getFrontendEnvVars(frontendConfig);
    
    project.frontendEnvState = {
        envVars,
        capturedAt: new Date().toISOString(),
    };
}

