/**
 * Storefront Staleness Detector
 *
 * Detects changes in EDS storefront configuration that require republishing config.json.
 * Simplified version - no class needed since operations are synchronous string comparisons.
 *
 * @module features/eds/services/storefrontStalenessDetector
 */

import { getLogger } from '@/core/logging';
import type { Project } from '@/types';
import { isEdsProject } from '@/types/typeGuards';

// ==========================================================
// Types
// ==========================================================

/**
 * Storefront state tracking (published configuration)
 */
export interface StorefrontState {
    envVars: Record<string, string>;
    lastPublished: Date | null;
}

/**
 * Detected changes requiring storefront republish
 */
export interface StorefrontChanges {
    hasChanges: boolean;
    changedEnvVars: string[];
}

// ==========================================================
// Constants
// ==========================================================

/**
 * Environment variables that affect config.json generation.
 * Changes to these require republishing the storefront config.
 */
const STOREFRONT_CONFIG_ENV_VARS = [
    'ADOBE_COMMERCE_ENVIRONMENT_ID',
    'ADOBE_CATALOG_API_KEY',
    'ADOBE_COMMERCE_STORE_VIEW_CODE',
    'ADOBE_COMMERCE_STORE_CODE',
    'ADOBE_COMMERCE_WEBSITE_CODE',
    'ADOBE_COMMERCE_CUSTOMER_GROUP',
    'AEM_ASSETS_ENABLED',
];

// ==========================================================
// Functions
// ==========================================================

/**
 * Get storefront-related environment variables from component config
 */
export function getStorefrontEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const key of STOREFRONT_CONFIG_ENV_VARS) {
        if (key in componentConfig) {
            const value = componentConfig[key];
            if (value !== undefined && value !== null) {
                result[key] = String(value);
            }
        }
    }

    return result;
}

/**
 * Get current storefront state from project
 */
export function getCurrentStorefrontState(project: Project): StorefrontState | null {
    if (!project.edsStorefrontState) {
        return null;
    }

    return {
        envVars: project.edsStorefrontState.envVars || {},
        lastPublished: project.edsStorefrontState.lastPublished
            ? new Date(project.edsStorefrontState.lastPublished)
            : null,
    };
}

/**
 * Detect if storefront configuration has changed since last publish
 *
 * Requires edsStorefrontState to be initialized (set during initial publish).
 * Projects without state won't trigger staleness detection.
 */
export function detectStorefrontChanges(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
): StorefrontChanges {
    const logger = getLogger();

    // Check if this is an EDS project
    if (!isEdsProject(project)) {
        return { hasChanges: false, changedEnvVars: [] };
    }

    // Get current published state - required for comparison
    const currentState = getCurrentStorefrontState(project);
    if (!currentState) {
        logger.debug('[Storefront Staleness] No edsStorefrontState - skipping detection');
        return { hasChanges: false, changedEnvVars: [] };
    }

    // Merge ALL new componentConfigs for cross-boundary values
    const allNewConfigs: Record<string, unknown> = {};
    for (const config of Object.values(newComponentConfigs)) {
        if (config && typeof config === 'object') {
            Object.assign(allNewConfigs, config as Record<string, unknown>);
        }
    }
    const newEnvVars = getStorefrontEnvVars(allNewConfigs);

    // Compare each storefront env var
    const changedEnvVars: string[] = [];
    for (const key of STOREFRONT_CONFIG_ENV_VARS) {
        const oldValue = currentState.envVars[key] || '';
        const newValue = newEnvVars[key] || '';

        if (oldValue !== newValue) {
            changedEnvVars.push(key);
            logger.debug(`[Storefront Staleness] ${key} changed: "${oldValue}" -> "${newValue}"`);
        }
    }

    const hasChanges = changedEnvVars.length > 0;

    if (hasChanges) {
        logger.debug(`[Storefront Staleness] Detected ${changedEnvVars.length} changed env vars:`, changedEnvVars);
    } else {
        logger.debug('[Storefront Staleness] No storefront-relevant env vars changed');
    }

    return { hasChanges, changedEnvVars };
}

/**
 * Update storefront state after publishing config.json
 *
 * @param project - The project to update
 * @param componentConfigs - The component configs at time of publish
 */
export function updateStorefrontState(
    project: Project,
    componentConfigs: Record<string, unknown>,
): void {
    // Merge all configs for cross-boundary values
    const allConfigs: Record<string, unknown> = {};
    for (const config of Object.values(componentConfigs)) {
        if (config && typeof config === 'object') {
            Object.assign(allConfigs, config as Record<string, unknown>);
        }
    }

    const envVars = getStorefrontEnvVars(allConfigs);

    project.edsStorefrontState = {
        envVars,
        lastPublished: new Date().toISOString(),
        userDeclinedUpdate: undefined,
        declinedAt: undefined,
    };
}

// Note: isEdsProject is imported from @/types/typeGuards (single source of truth)
// Re-exported from this module for convenience
