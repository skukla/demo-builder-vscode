/**
 * The environment variables an API Mesh deploy depends on.
 *
 * Owns the watch list (which keys a PaaS mesh and an ACCS mesh read) and the two
 * ways of reading those keys: out of a component config, and out of the mesh
 * component's `.env` file, which is what a deploy actually ships.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
    PAAS_URL,
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_ENVIRONMENT_ID,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
    CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
} from '@/core/config/envVarKeys';
import { COMPONENT_IDS } from '@/core/constants';

/**
 * PaaS-specific mesh env vars (matches eds-commerce-mesh in components.json)
 */
const PAAS_MESH_ENV_VARS = [
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_URL,
    CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    PAAS_ENVIRONMENT_ID,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
];

/**
 * ACCS-specific mesh env vars (matches eds-accs-mesh in components.json)
 */
const ACCS_MESH_ENV_VARS = [
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
];

/**
 * All environment variables that affect mesh deployment (union of PaaS + ACCS).
 * Used for extraction and .env file parsing where we need to handle both types.
 */
const MESH_ENV_VARS = [...PAAS_MESH_ENV_VARS, ...ACCS_MESH_ENV_VARS];

/**
 * Get the relevant mesh env vars for a specific mesh component type.
 * ACCS mesh only uses ACCS vars; PaaS mesh only uses PaaS vars.
 */
export function getRelevantMeshEnvVars(meshComponentId: string): string[] {
    if (meshComponentId === COMPONENT_IDS.EDS_ACCS_MESH) {
        return ACCS_MESH_ENV_VARS;
    }
    return PAAS_MESH_ENV_VARS;
}

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
 * Read mesh-related environment variables from the .env file in a mesh component directory.
 * Returns only the MESH_ENV_VARS keys, filtering out all other variables.
 *
 * @param meshComponentPath - Path to the mesh component directory
 * @returns Record of mesh env var key-value pairs (empty object if file doesn't exist)
 */
export async function readMeshEnvVarsFromFile(
    meshComponentPath: string,
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    try {
        const envFilePath = path.join(meshComponentPath, '.env');
        const content = await fsPromises.readFile(envFilePath, 'utf-8');

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
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            // Only include mesh-related env vars
            if (MESH_ENV_VARS.includes(key)) {
                result[key] = value;
            }
        }
    } catch (_error) {
        // Return empty object if file doesn't exist or can't be read
        // This is expected for new projects or projects without mesh
    }

    return result;
}
