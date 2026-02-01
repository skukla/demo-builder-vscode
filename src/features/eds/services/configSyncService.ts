/**
 * Config Sync Service
 *
 * Syncs locally generated config.json to GitHub and publishes to Helix CDN.
 * Extracted from executor.ts post-mesh section for reuse in Phase 5 finalization.
 *
 * This service is responsible for the "sync to remote" step, which happens
 * AFTER config.json is generated locally with the mesh endpoint.
 *
 * @module features/eds/services/configSyncService
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import type { Logger } from '@/types';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { GitHubTokenService } from './githubTokenService';
import { GitHubFileOperations } from './githubFileOperations';
import { HelixService } from './helixService';
import type { PhaseProgressCallback } from './types';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for syncing config.json to remote
 */
export interface ConfigSyncParams {
    /** Path to the EDS component directory containing config.json */
    componentPath: string;
    /** GitHub repository owner */
    repoOwner: string;
    /** GitHub repository name */
    repoName: string;
    /** Logger instance */
    logger: Logger;
    /** VS Code secret storage for GitHub token */
    secrets: vscode.SecretStorage;
    /** Authentication service for Adobe operations */
    authManager?: AuthenticationService;
    /** Optional progress callback for UI updates during CDN verification */
    onProgress?: PhaseProgressCallback;
}

/**
 * Result of config sync operation
 */
export interface ConfigSyncResult {
    /** Whether the overall sync was successful */
    success: boolean;
    /** Error message if sync failed */
    error?: string;
    /** Whether config.json was pushed to GitHub */
    githubPushed: boolean;
    /** Whether config.json was published to Helix CDN */
    cdnPublished: boolean;
    /** Whether config.json was verified accessible on CDN */
    cdnVerified: boolean;
}

// ==========================================================
// Functions
// ==========================================================

/**
 * Sync locally generated config.json to GitHub and publish to Helix CDN.
 *
 * This function:
 * 1. Reads local config.json from the component path
 * 2. Pushes config.json to GitHub (creating or updating)
 * 3. Publishes config.json to Helix CDN via preview/publish API
 *
 * @param params - Sync parameters including paths and credentials
 * @returns Sync result with status for each operation
 */
export async function syncConfigToRemote(params: ConfigSyncParams): Promise<ConfigSyncResult> {
    const { componentPath, repoOwner, repoName, logger, secrets, authManager: _authManager, onProgress } = params;

    const result: ConfigSyncResult = {
        success: false,
        githubPushed: false,
        cdnPublished: false,
        cdnVerified: false,
    };

    try {
        // Step 1: Read local config.json
        const configJsonPath = path.join(componentPath, 'config.json');
        let configContent: string;

        try {
            configContent = await fsPromises.readFile(configJsonPath, 'utf-8');
            logger.debug(`[ConfigSync] Read local config.json (${configContent.length} bytes)`);
        } catch (error) {
            const message = `Local config.json not found at ${configJsonPath}`;
            logger.error(`[ConfigSync] ${message}`);
            result.error = message;
            return result;
        }

        // Step 2: Push to GitHub
        const githubTokenService = new GitHubTokenService(secrets, logger);
        const githubFileOperations = new GitHubFileOperations(githubTokenService, logger);

        try {
            // Check if config.json already exists on GitHub (to get SHA for update)
            logger.debug(`[ConfigSync] Checking for existing config.json on GitHub...`);
            const existingFile = await githubFileOperations.getFileContent(
                repoOwner,
                repoName,
                'config.json',
            );
            logger.debug(`[ConfigSync] Existing file SHA: ${existingFile?.sha || 'not found'}`);

            // Push config.json to GitHub
            logger.debug(`[ConfigSync] Pushing config.json to GitHub (${repoOwner}/${repoName})...`);
            await githubFileOperations.createOrUpdateFile(
                repoOwner,
                repoName,
                'config.json',
                configContent,
                'chore: sync config.json with mesh endpoint',
                existingFile?.sha,
            );

            result.githubPushed = true;
            logger.info(`[ConfigSync] config.json pushed to GitHub (${repoOwner}/${repoName})`);
        } catch (error) {
            const message = `Failed to push config.json to GitHub: ${(error as Error).message}`;
            logger.error(`[ConfigSync] ${message}`);
            result.error = message;
            return result;
        }

        // Step 3: Publish to Helix CDN
        // After pushing to GitHub, we must preview/publish via Helix Admin API
        // for the CDN to serve the updated config.json
        try {
            logger.debug(`[ConfigSync] Publishing config.json to Helix CDN...`);

            // HelixService needs GitHub token for admin API auth
            // Note: Code preview/publish only requires GitHub auth (no DA.live token)
            const helixService = new HelixService(
                logger,
                githubTokenService,
            );

            await helixService.previewCode(
                repoOwner,
                repoName,
                '/config.json',
            );

            result.cdnPublished = true;
            logger.info(`[ConfigSync] config.json published to Helix CDN`);

            // Step 4: Verify CDN accessibility for config.json
            onProgress?.('Waiting for configuration to reach CDN edge...');

            const verification = await verifyCdnResources(
                repoOwner,
                repoName,
                logger,
            );

            result.cdnVerified = verification.configVerified;

            if (!result.cdnVerified) {
                logger.warn(`[ConfigSync] config.json published but CDN verification timed out - may need a few more seconds to propagate`);
            }
        } catch (error) {
            // CDN publish failure is not fatal - GitHub push succeeded
            // Site may work with stale config until CDN is updated manually
            const message = `Failed to publish config.json to CDN: ${(error as Error).message}`;
            logger.warn(`[ConfigSync] ${message}`);
            // Don't set result.error - GitHub push succeeded, which is the critical part
        }

        // Success if GitHub push succeeded (CDN publish is optional)
        result.success = result.githubPushed;
        return result;

    } catch (error) {
        const message = `Config sync failed: ${(error as Error).message}`;
        logger.error(`[ConfigSync] ${message}`);
        result.error = message;
        return result;
    }
}

/** Interval between CDN verification attempts (2 seconds) */
const CDN_VERIFY_INTERVAL = 2000;

/** Number of CDN verification attempts (10 attempts × 2s = ~20s total) */
const CDN_VERIFY_ATTEMPTS = 10;

/**
 * Verify config.json is accessible on the live CDN.
 *
 * After publishing via Helix Admin API, config.json needs time to propagate
 * to all CDN edge nodes globally. This function waits for propagation by
 * polling the live CDN URL with retries.
 *
 * We use a longer verification window (~20 seconds) because:
 * - Origin update is fast, but edge propagation takes time
 * - Different edge nodes may update at different rates
 * - User's browser may hit different edges than our verification
 *
 * @param repoOwner - GitHub repository owner
 * @param repoName - GitHub repository name
 * @param logger - Logger instance
 * @returns true if config.json is accessible and valid, false if verification timed out
 */
export async function verifyConfigOnCdn(
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<boolean> {
    const cdnUrl = `https://main--${repoName}--${repoOwner}.aem.live/config.json`;
    logger.debug(`[ConfigSync] Verifying CDN availability: ${cdnUrl}`);

    for (let attempt = 1; attempt <= CDN_VERIFY_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(cdnUrl, {
                signal: AbortSignal.timeout(TIMEOUTS.QUICK),
            });

            if (response.ok) {
                // Verify it's valid JSON with expected commerce fields
                const content = await response.text();
                const json = JSON.parse(content);

                if (json.public?.default?.['commerce-endpoint']) {
                    // After first success, wait a bit more for edge propagation
                    if (attempt < 3) {
                        logger.debug(`[ConfigSync] CDN returned valid config, waiting for edge propagation...`);
                        await new Promise(resolve => setTimeout(resolve, CDN_VERIFY_INTERVAL * 2));
                    }
                    logger.info(`[ConfigSync] CDN verification successful (attempt ${attempt}/${CDN_VERIFY_ATTEMPTS})`);
                    return true;
                }

                logger.debug(`[ConfigSync] CDN returned config but missing commerce-endpoint, retrying...`);
            } else {
                logger.debug(`[ConfigSync] CDN returned ${response.status}, retrying (${attempt}/${CDN_VERIFY_ATTEMPTS})...`);
            }
        } catch (error) {
            logger.debug(`[ConfigSync] CDN verification attempt ${attempt}/${CDN_VERIFY_ATTEMPTS} failed: ${(error as Error).message}`);
        }

        // Wait before next attempt (skip delay on last attempt)
        if (attempt < CDN_VERIFY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CDN_VERIFY_INTERVAL));
        }
    }

    return false;
}

/**
 * Result of CDN verification for config.json
 */
export interface CdnVerificationResult {
    /** Whether config.json was verified on CDN */
    configVerified: boolean;
}

/**
 * Verify CDN resources are accessible (config.json)
 *
 * Note: Block library verification was removed because the library is served
 * from content.da.live (via DA.live APIs), not the public CDN. The config
 * references content.da.live URLs, so CDN verification is not applicable.
 *
 * @param repoOwner - GitHub repository owner
 * @param repoName - GitHub repository name
 * @param logger - Logger instance
 * @returns Verification result for config.json
 */
export async function verifyCdnResources(
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<CdnVerificationResult> {
    const configVerified = await verifyConfigOnCdn(repoOwner, repoName, logger);
    return { configVerified };
}
