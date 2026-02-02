/**
 * Storefront Republish Service
 *
 * Republishes config.json for EDS storefronts when configuration changes.
 * Reuses existing generateConfigJson() and syncConfigToRemote() services.
 *
 * @module features/eds/services/storefrontRepublishService
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import type * as vscode from 'vscode';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';
import type { PhaseProgressCallback } from './types';
import { COMPONENT_IDS } from '@/core/constants';
import { generateConfigJson, extractConfigParams } from './configGenerator';
import { syncConfigToRemote } from './configSyncService';
import { updateStorefrontState } from './storefrontStalenessDetector';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for republishing storefront config.json
 */
export interface RepublishParams {
    /** Project to republish config for */
    project: Project;
    /** VS Code secret storage for GitHub token */
    secrets: vscode.SecretStorage;
    /** Logger instance */
    logger: Logger;
    /** Optional progress callback */
    onProgress?: PhaseProgressCallback;
}

/**
 * Result of republish operation
 */
export interface RepublishResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Whether config.json was pushed to GitHub */
    githubPushed?: boolean;
    /** Whether config.json was published to CDN */
    cdnPublished?: boolean;
    /** Whether config.json was verified on CDN */
    cdnVerified?: boolean;
}

// ==========================================================
// Parameter Extraction
// ==========================================================

/**
 * Extract republish parameters from a project
 *
 * @param project - Project to extract parameters from
 * @returns Parameters or error
 */
export function extractRepublishParams(project: Project): {
    success: true;
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
    componentPath: string;
} | {
    success: false;
    error: string;
} {
    // Get EDS metadata from component instance
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
    const componentPath = edsInstance?.path;

    if (!repoFullName) {
        return {
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
        };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        return {
            success: false,
            error: 'Invalid repository format',
        };
    }

    if (!daLiveOrg || !daLiveSite) {
        return {
            success: false,
            error: 'DA.live configuration missing',
        };
    }

    if (!componentPath) {
        return {
            success: false,
            error: 'EDS component path not found',
        };
    }

    return {
        success: true,
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        componentPath,
    };
}

// ==========================================================
// Core Republish Implementation
// ==========================================================

/**
 * Republish storefront config.json
 *
 * This function:
 * 1. Extracts EDS metadata from project
 * 2. Generates config.json using current project configuration
 * 3. Writes config.json to component path
 * 4. Syncs config.json to GitHub and CDN
 * 5. Updates edsStorefrontState to track the new baseline
 *
 * @param params - Republish parameters
 * @returns Republish result
 */
export async function republishStorefrontConfig(
    params: RepublishParams,
): Promise<RepublishResult> {
    const { project, secrets, logger, onProgress } = params;

    try {
        // Step 1: Extract EDS metadata
        onProgress?.('Extracting configuration...');
        logger.debug('[StorefrontRepublish] Starting republish for project:', project.name);

        const extractResult = extractRepublishParams(project);
        if (!extractResult.success) {
            return {
                success: false,
                error: extractResult.error,
            };
        }

        const { repoOwner, repoName, daLiveOrg, daLiveSite, componentPath } = extractResult;

        // Step 2: Generate config.json
        onProgress?.('Generating config.json...');
        logger.debug('[StorefrontRepublish] Generating config.json');

        const configParams = {
            githubOwner: repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
            ...extractConfigParams(project),
        };

        const configResult = generateConfigJson(configParams, logger);

        if (!configResult.success || !configResult.content) {
            return {
                success: false,
                error: configResult.error || 'Failed to generate config.json',
            };
        }

        // Step 3: Write config.json to component path
        onProgress?.('Writing config.json...');
        const configJsonPath = path.join(componentPath, 'config.json');

        try {
            await fsPromises.writeFile(configJsonPath, configResult.content, 'utf-8');
            logger.debug(`[StorefrontRepublish] Wrote config.json to ${configJsonPath}`);
        } catch (writeError) {
            return {
                success: false,
                error: `Failed to write config.json: ${(writeError as Error).message}`,
            };
        }

        // Step 4: Sync to GitHub and CDN
        onProgress?.('Syncing to GitHub and CDN...');
        logger.info(`[StorefrontRepublish] Syncing config.json to ${repoOwner}/${repoName}`);

        const syncResult = await syncConfigToRemote({
            componentPath,
            repoOwner,
            repoName,
            logger,
            secrets,
            onProgress,
        });

        if (!syncResult.success) {
            return {
                success: false,
                error: syncResult.error || 'Failed to sync config.json to remote',
                githubPushed: syncResult.githubPushed,
                cdnPublished: syncResult.cdnPublished,
                cdnVerified: syncResult.cdnVerified,
            };
        }

        // Step 5: Update storefront state
        logger.debug('[StorefrontRepublish] Updating storefront state');
        updateStorefrontState(project, project.componentConfigs || {});
        project.edsStorefrontStatusSummary = 'published';

        logger.info('[StorefrontRepublish] Storefront config republished successfully');

        return {
            success: true,
            githubPushed: syncResult.githubPushed,
            cdnPublished: syncResult.cdnPublished,
            cdnVerified: syncResult.cdnVerified,
        };
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error('[StorefrontRepublish] Republish failed:', error as Error);
        return {
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Check if a project needs storefront republish
 *
 * @param project - Project to check
 * @returns True if storefront needs republishing
 */
export function needsStorefrontRepublish(project: Project): boolean {
    const status = project.edsStorefrontStatusSummary;
    return status === 'stale' || status === 'update-declined';
}
