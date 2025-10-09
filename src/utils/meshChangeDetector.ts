/**
 * Detects changes that require API Mesh redeployment
 * 
 * Tracks:
 * - Environment variables used in mesh.json
 * - Source file hashes (resolvers, schemas, config)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Project } from '../types';

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
    'ADOBE_COMMERCE_STORE_CODE'
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
}

/**
 * Get current mesh-related environment variables from component config
 */
export function getMeshEnvVars(componentConfig: Record<string, any>): Record<string, string> {
    const envVars: Record<string, string> = {};
    
    MESH_ENV_VARS.forEach(key => {
        if (componentConfig[key]) {
            envVars[key] = componentConfig[key];
        }
    });
    
    return envVars;
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
    // Check if commerce-mesh component exists
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance) {
        return null;
    }
    
    // Get mesh config from componentConfigs
    const meshConfig = project.componentConfigs?.['commerce-mesh'] || {};
    
    return {
        envVars: getMeshEnvVars(meshConfig),
        sourceHash: project.meshState?.sourceHash || null,
        lastDeployed: project.meshState?.lastDeployed ? new Date(project.meshState.lastDeployed) : null
    };
}

/**
 * Detect if mesh has changes requiring redeployment
 */
export async function detectMeshChanges(
    project: Project,
    newComponentConfigs: Record<string, any>
): Promise<MeshChanges> {
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance || !meshInstance.path) {
        return {
            hasChanges: false,
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: []
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
            changedEnvVars: MESH_ENV_VARS
        };
    }
    
    // Check env vars changes
    const newMeshConfig = newComponentConfigs['commerce-mesh'] || {};
    const newEnvVars = getMeshEnvVars(newMeshConfig);
    
    const changedEnvVars: string[] = [];
    MESH_ENV_VARS.forEach(key => {
        const oldValue = currentState.envVars[key];
        const newValue = newEnvVars[key];
        
        if (oldValue !== newValue) {
            changedEnvVars.push(key);
        }
    });
    
    const envVarsChanged = changedEnvVars.length > 0;
    
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
        changedEnvVars
    };
}

/**
 * Update mesh state after deployment
 */
export async function updateMeshState(project: Project): Promise<void> {
    const meshInstance = project.componentInstances?.['commerce-mesh'];
    if (!meshInstance || !meshInstance.path) {
        return;
    }
    
    const meshConfig = project.componentConfigs?.['commerce-mesh'] || {};
    const envVars = getMeshEnvVars(meshConfig);
    const sourceHash = await calculateMeshSourceHash(meshInstance.path);
    
    project.meshState = {
        envVars,
        sourceHash,
        lastDeployed: new Date().toISOString()
    };
}

