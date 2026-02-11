/**
 * Project State Synchronization Utilities
 *
 * Functions for synchronizing and updating project state properties.
 * Used by features to maintain consistent project state.
 */

import { Project } from '@/types';
import { getComponentInstancesByType } from '@/types/typeGuards';

/**
 * Frontend env vars tracked for change detection.
 * Matches the headless component's requiredEnvVars + optionalEnvVars in components.json.
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

/**
 * Get frontend-related environment variables from component config.
 *
 * @param componentConfig - The component configuration to extract env vars from
 */
export function getFrontendEnvVars(
    componentConfig: Record<string, unknown>,
): Record<string, string> {
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
 * Update frontend state after demo starts.
 * Captures the env vars that were active when demo started.
 */
export function updateFrontendState(project: Project): void {
    const frontendInstance = getComponentInstancesByType(project, 'frontend')[0];
    if (!frontendInstance || !project.componentConfigs) {
        return;
    }

    const frontendConfig = project.componentConfigs[frontendInstance.id] || {};
    const envVars = getFrontendEnvVars(frontendConfig);

    project.frontendEnvState = {
        envVars,
        capturedAt: new Date().toISOString(),
    };
}
