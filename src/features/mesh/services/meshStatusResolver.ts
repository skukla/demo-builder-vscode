/**
 * Mesh Status Resolver
 *
 * Answers "what state is this project's mesh in?" from the deploy record,
 * the mesh .env INPUT variables, and the staleness/decline signals. Moved
 * from the dashboard's meshStatusHelpers (2026-08-24 cycle break): both
 * dashboards consume it, and its domain is the mesh, not either dashboard.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isMeshUpdateDeclined } from './meshUpdateDecline';
import {
    PAAS_URL,
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_ENVIRONMENT_ID,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
} from '@/core/config/envVarKeys';
import { COMPONENT_IDS } from '@/core/constants';
import { getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import { parseEnvFile } from '@/core/utils/envParser';
import { ComponentInstance, Project } from '@/types/base';

/**
 * Required environment variables for mesh deployment (INPUT variables)
 * These must all be present in the mesh's .env file for deployment to work.
 *
 * Note: MESH_ENDPOINT is NOT in this list because it's an OUTPUT of deployment,
 * not an input. The mesh endpoint is stored in meshState.endpoint
 * and is checked separately.
 */
const REQUIRED_PAAS_MESH_ENV_VARS = [
    PAAS_GRAPHQL_ENDPOINT,
    CATALOG_SERVICE_ENDPOINT,
    PAAS_URL,
    PAAS_ENVIRONMENT_ID,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    CATALOG_API_KEY,
];

const REQUIRED_ACCS_MESH_ENV_VARS = [
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
];

/** Get required env vars based on mesh component type */
function getRequiredMeshEnvVars(meshComponentId?: string): string[] {
    if (meshComponentId === COMPONENT_IDS.EDS_ACCS_MESH) {
        return REQUIRED_ACCS_MESH_ENV_VARS;
    }
    return REQUIRED_PAAS_MESH_ENV_VARS;
}

/**
 * Check if all required mesh configuration fields are populated
 *
 * Checks both:
 * 1. The .env file for INPUT variables (backend-specific: PaaS or ACCS)
 * 2. The mesh endpoint (OUTPUT of deployment) from componentInstances
 *
 * @param meshPath - Path to the mesh component directory
 * @param meshEndpoint - Mesh endpoint from componentInstances
 * @param meshComponentId - The mesh component ID (e.g., 'eds-accs-mesh', 'eds-commerce-mesh')
 * @returns Object with isComplete flag and list of missing fields
 */
export async function checkMeshConfigCompleteness(
    meshPath: string | undefined,
    meshEndpointFromConfigs?: string,
    meshComponentId?: string,
): Promise<{
    isComplete: boolean;
    missingFields: string[];
}> {
    const requiredVars = getRequiredMeshEnvVars(meshComponentId);
    const missingFields: string[] = [];

    if (!meshPath) {
        return { isComplete: false, missingFields: [...requiredVars, 'MESH_ENDPOINT'] };
    }

    // Read the .env file from the mesh component directory
    const envFilePath = path.join(meshPath, '.env');
    let envConfig: Record<string, string> = {};

    try {
        const content = await fs.readFile(envFilePath, 'utf-8');
        envConfig = parseEnvFile(content);
    } catch {
        // .env file doesn't exist or can't be read - all fields are missing
        return { isComplete: false, missingFields: [...requiredVars, 'MESH_ENDPOINT'] };
    }

    // Check INPUT variables from .env file (backend-specific)
    for (const field of requiredVars) {
        const value = envConfig[field];
        if (value === undefined || value === null || value === '') {
            missingFields.push(field);
        }
    }

    // Check OUTPUT variable (mesh endpoint from componentInstances)
    if (!meshEndpointFromConfigs) {
        missingFields.push('MESH_ENDPOINT');
    }

    return {
        isComplete: missingFields.length === 0,
        missingFields,
    };
}

/**
 * Determine mesh status based on changes, component state, and config completeness
 */
export async function determineMeshStatus(
    meshChanges: { hasChanges: boolean; unknownDeployedState?: boolean },
    meshComponent: ComponentInstance,
    project: Project,
): Promise<'deployed' | 'config-changed' | 'config-incomplete' | 'update-declined' | 'error'> {
    // Get MESH_ENDPOINT from componentInstances (single source of truth)
    const meshEndpointFromConfigs = getMeshEndpoint(project);

    // Check if configuration is complete (both .env INPUT vars and mesh endpoint)
    const configCheck = await checkMeshConfigCompleteness(
        meshComponent.path,
        meshEndpointFromConfigs,
        meshComponent.id,
    );
    if (!configCheck.isComplete) {
        return 'config-incomplete';
    }

    if (meshChanges.hasChanges) {
        // User previously declined update → 'update-declined' (orange badge)
        // Otherwise → 'config-changed' (yellow badge)
        return isMeshUpdateDeclined(project) ? 'update-declined' : 'config-changed';
    }
    // No config changes: show error if previous deployment failed, otherwise deployed
    return meshComponent.status === 'error' ? 'error' : 'deployed';
}
