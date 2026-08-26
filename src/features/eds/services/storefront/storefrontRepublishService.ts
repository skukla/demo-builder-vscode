/**
 * Storefront Republish Service
 *
 * Republishes config.json for EDS storefronts when configuration changes.
 * Reuses existing generateConfigJson() and syncConfigToRemote() services.
 *
 * @module features/eds/services/storefront/storefrontRepublishService
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type * as vscode from 'vscode';
import { resolveByomOverlayConfig } from '../../handlers/byomOverlay';
import {
    applyDaLiveOrgConfigSettings,
    configureDaLivePermissions,
    resolveProjectAuthoringExperience,
} from '../../handlers/edsHelpers';
import { prewarmCatalog } from '../catalogPrewarmService';
import { generateConfigJson, buildConfigGeneratorParams } from '../configGenerator';
import { syncConfigToRemote, verifyConfigOnCdn } from '../configSyncService';
import type { DaLiveAuthService } from '../daLive/daLiveAuthService';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '../daLive/daLiveContentOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import type { PhaseProgressCallback } from '../types';
import { updateStorefrontState } from './storefrontStalenessDetector';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

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
    /**
     * Persist the project after the publish clears its stale flag.
     *
     * REQUIRED, not optional. This service used to set
     * `edsStorefrontStatusSummary = 'published'` in memory and leave saving to
     * the caller — and neither caller did it, while Configure (which sets the
     * OPPOSITE value) saves immediately. The manifest could go stale and never
     * come back: reopening the dashboard re-read `stale` from disk and the
     * Republish tile was amber again after a successful republish.
     *
     * Required so the compiler asks a future caller for it.
     */
    persist: (project: Project) => Promise<void>;
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
    /**
     * Why the CDN publish failed, when the GitHub push still succeeded. A
     * caller that reports a bare "republished successfully" while this is set
     * is telling the user the storefront is current when it is not.
     */
    cdnError?: string;
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
export function extractRepublishParams(project: Project):
    | {
          success: true;
          repoOwner: string;
          repoName: string;
          daLiveOrg: string;
          daLiveSite: string;
          componentPath: string;
      }
    | {
          success: false;
          error: string;
      } {
    // Get EDS metadata from component instance
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    // Legacy-first, repo fallback: `daLiveSite` metadata survives only on
    // unmigrated projects (the loader strips the redundant equal copy).
    const daLiveSite =
        (edsInstance?.metadata?.daLiveSite as string | undefined) ??
        (repoFullName ? repoFullName.split('/')[1] : undefined);
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
export async function republishStorefrontConfig(params: RepublishParams): Promise<RepublishResult> {
    const { project, secrets, logger, onProgress, persist } = params;

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

        const { repoOwner, repoName, componentPath } = extractResult;

        // Step 2: Generate config.json
        onProgress?.('Generating config.json...');
        logger.debug('[StorefrontRepublish] Generating config.json');

        // Snapshot the configs THIS publish is generated from, before the push.
        // Step 5 records these — not `project.componentConfigs` re-read later.
        // A concurrent Configure save reassigns that field while the push is in
        // flight, and reading it again recorded values that were never
        // published, permanently blinding staleness detection. See
        // `updateStorefrontState`.
        const publishedConfigs: Record<string, unknown> = structuredClone(
            project.componentConfigs ?? {},
        );

        const configResult = generateConfigJson(buildConfigGeneratorParams(project), logger);

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
        updateStorefrontState(project, publishedConfigs);
        project.edsStorefrontStatusSummary = 'published';
        // To DISK, not just memory — see `persist` on RepublishParams.
        await persist(project);

        if (syncResult.cdnError) {
            logger.warn(
                '[StorefrontRepublish] Republished to GitHub, but the CDN still serves the ' +
                    `previous config.json: ${syncResult.cdnError}`,
            );
        } else {
            logger.info('[StorefrontRepublish] Storefront config republished successfully');
        }

        return {
            success: true,
            githubPushed: syncResult.githubPushed,
            cdnPublished: syncResult.cdnPublished,
            cdnVerified: syncResult.cdnVerified,
            cdnError: syncResult.cdnError,
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

// ==========================================================
// Full content republish (config + code + DA.live content)
// ==========================================================

/** Parameters for the full storefront content republish pipeline. */
export interface RepublishContentParams {
    project: Project;
    /** Forwarded to the config step, which clears and saves the stale flag. */
    persist: (project: Project) => Promise<void>;
    /** GitHub repo owner. */
    repoOwner: string;
    /** GitHub repo name. */
    repoName: string;
    /** DA.live organization. */
    daLiveOrg: string;
    /** DA.live site. */
    daLiveSite: string;
    /** Secret storage for the GitHub token (config.json push). */
    secrets: vscode.SecretStorage;
    logger: Logger;
    /** Authenticated DA.live auth service (token provider + user email source). */
    daLiveAuthService: DaLiveAuthService;
    /** GitHub token service for the Helix Admin API. */
    githubTokenService: GitHubTokenService;
    /** Optional per-step progress callback. */
    onProgress?: (message: string) => void;
}

/** Result of the full content republish. */
export interface RepublishContentResult {
    success: boolean;
    error?: string;
    /** Whether config.json was verified on the CDN (best-effort — may still be propagating). */
    cdnVerified?: boolean;
}

/**
 * Republish ALL storefront content to the CDN — the headless 5-step pipeline
 * (EDS config → config.json → code → permissions → publish + verify) that
 * `handleRepublishContent` wraps with UI (auth modal, progress, status).
 *
 * Single source of truth: both the dashboard's Republish button and the MCP
 * `sync_content` tool call this, so the pipeline never diverges. Callers are
 * responsible for ensuring DA.live + GitHub auth before invoking (the UI pops a
 * sign-in modal; the MCP tool returns a `needsAuth` handoff).
 */
export async function republishStorefrontContent(
    params: RepublishContentParams,
): Promise<RepublishContentResult> {
    const {
        project,
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        secrets,
        logger,
        daLiveAuthService,
        githubTokenService,
        persist,
    } = params;
    const report = (message: string): void => params.onProgress?.(message);

    try {
        const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
        const helixService = new HelixService(logger, githubTokenService, daLiveTokenProvider);
        const daLiveContentOps = new DaLiveContentOperations(daLiveTokenProvider, logger);

        // Step 1: Apply EDS site config (AEM Assets, authoring experience).
        report('Applying EDS configuration…');
        const experience = resolveProjectAuthoringExperience(project);
        await applyDaLiveOrgConfigSettings(
            daLiveContentOps,
            daLiveOrg,
            daLiveSite,
            logger,
            experience,
        );

        // Step 2: Regenerate + sync config.json (picks up env var changes).
        report('Regenerating storefront configuration…');
        const configResult = await republishStorefrontConfig({
            project,
            secrets,
            logger,
            onProgress: report,
            persist,
        });
        if (!configResult.success) {
            logger.warn(`[Republish] Config regeneration warning: ${configResult.error}`);
        }

        // Step 3: Sync code to CDN + configure site permissions.
        report('Syncing code to CDN…');
        await helixService.previewCode(repoOwner, repoName, '/*');
        const userEmail = await daLiveAuthService.getUserEmail();
        if (userEmail) {
            report('Configuring site permissions…');
            await configureDaLivePermissions(
                daLiveTokenProvider,
                daLiveOrg,
                daLiveSite,
                userEmail,
                logger,
            );
        } else {
            logger.warn('[Republish] No user email available for permissions');
        }

        // Step 4: Purge stale cache + publish all content.
        report('Purging stale cache…');
        await helixService.purgeCacheAll(repoOwner, repoName, 'main');
        report('Publishing content to CDN…');
        await helixService.publishAllSiteContent(
            `${repoOwner}/${repoName}`,
            'main',
            daLiveOrg,
            daLiveSite,
            (info) => report(info.message),
        );

        // Step 5: Pre-warm the catalog's PDP pages (self-gating: ACCS + BYOM
        // only; non-fatal). Decided 2026-08-23: Republish is the lightweight
        // retry for a prewarm that failed at creation — e.g. a hibernated
        // Live Search index since reactivated via the "Reactivate Live
        // Search" support request — and it also refreshes previously-prewarmed
        // PDPs, which Step 4's content publish never reaches (they are
        // synthetic pages, not DA content). Reset remains the heavyweight path.
        try {
            const overlayUrl = resolveByomOverlayConfig(undefined, daLiveOrg, daLiveSite);
            if (overlayUrl) {
                report('Loading the product pages so they are quick for visitors…');
                const prewarm = await prewarmCatalog(
                    project,
                    overlayUrl,
                    daLiveOrg,
                    daLiveSite,
                    helixService,
                    logger,
                    (p) => report(p.message),
                );
                if (!prewarm.skipped) {
                    logger.info(
                        `[Republish] Catalog pre-warming: ${prewarm.succeeded}/${prewarm.attempted} SKUs pre-published`,
                    );
                }
            }
        } catch (prewarmError) {
            logger.warn(
                `[Republish] Catalog pre-warming failed (non-fatal): ${(prewarmError as Error).message}`,
            );
        }

        // Step 6: Verify config.json on the CDN (best-effort).
        report('Verifying CDN…');
        const cdnVerified = await verifyConfigOnCdn(repoOwner, repoName, logger);
        return { success: true, cdnVerified };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
            '[Republish] Content republish failed',
            error instanceof Error ? error : undefined,
        );
        return { success: false, error: message };
    }
}
