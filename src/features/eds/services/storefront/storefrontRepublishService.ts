/**
 * Storefront Republish Service
 *
 * Republishes config.json for EDS storefronts when configuration changes.
 * Reuses existing generateProjectConfigJson() and syncConfigToRemote() services.
 *
 * @module features/eds/services/storefront/storefrontRepublishService
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type * as vscode from 'vscode';
import { generateProjectConfigJson } from '../configGenerator';
import { syncConfigToRemote } from '../configSyncService';
import type { PhaseProgressCallback } from '../types';
import { updateStorefrontState } from './storefrontStalenessDetector';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
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
     * Ask for the DA.live sign-in before the CDN publish, when there is someone
     * to ask. Every storefront the extension sets up carries a site admin role,
     * and with that role every Helix admin call — the code publish included —
     * needs the DA.live session. The dashboard's Republish button asked; the
     * republish that runs inside an add, a deploy, a mesh deploy or a Configure
     * save did not, so on 2026-09-24 an add finished "done" while the CDN kept
     * the previous config.json and only the Debug Logs said so.
     *
     * The prompt's surface follows the operation's (the `ensureDaLiveAuth` rule,
     * owner 2026-09-20): the sign-in form in a modal-hosted operation, a modal
     * under an agent call, a notification with Sign In from a plain button. A
     * refusal does not stop the GitHub push; it names the reason on `cdnError`
     * and leaves the storefront STALE, so the Republish tile stays amber.
     *
     * Optional only for callers with nobody to ask; production callers pass it.
     */
    ensureDaLiveSession?: () => Promise<{ authenticated: boolean; error?: string }>;
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

/** What `cdnError` says when the SC declined (or nobody could answer) the sign-in. */
export const NO_DALIVE_SESSION_MESSAGE =
    'No DA.live session — sign in to DA.live and republish from the dashboard.';

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
    const { project, secrets, logger, onProgress, persist, ensureDaLiveSession } = params;

    try {
        // Step 1: Extract EDS metadata
        onProgress?.('Extracting configuration');
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
        onProgress?.('Generating config.json');
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

        const configResult = generateProjectConfigJson(project, logger);

        if (!configResult.success || !configResult.content) {
            return {
                success: false,
                error: configResult.error || 'Failed to generate config.json',
            };
        }

        // Step 3: Write config.json to component path
        //
        // A PLAIN OVERWRITE, DELIBERATELY. config.json is generated output — it is
        // derived entirely from the project's own configuration by `generateConfigJson`
        // above, and regenerating it is the whole job of a republish. It is not meant to
        // be hand-edited (owner, 2026-09-02), so there is nothing here for the ADR-013
        // hash-and-skip seam to protect and no user edit to preserve.
        //
        // That seam is scoped to the generated AI BUNDLE (`aiBundle/`), which lands in a
        // project people then edit. Reaching for it here would be applying the right rule
        // to the wrong file.
        onProgress?.('Writing config.json');
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

        // Step 4: the DA.live session the CDN publish needs — asked for BEFORE the
        // push, so a declined sign-in is known when the CDN answer comes back.
        const session = ensureDaLiveSession ? await ensureDaLiveSession() : undefined;
        if (session && !session.authenticated) {
            logger.warn(
                '[StorefrontRepublish] No DA.live session — pushing to GitHub, the CDN publish will not land',
            );
        }

        // Step 5: Sync to GitHub and CDN
        onProgress?.('Syncing to GitHub and CDN');
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

        // A refused sign-in explains the 401 better than the 401 does.
        const cdnError =
            syncResult.cdnError && session?.authenticated === false
                ? NO_DALIVE_SESSION_MESSAGE
                : syncResult.cdnError;

        // Step 6: Update storefront state — only when the CDN actually took it.
        // A GitHub push the CDN did not publish leaves the storefront serving the
        // previous config.json, which is exactly what `stale` means; recording the
        // new baseline here would turn the Republish tile green over a storefront
        // that is not current, and nothing else would ever say so.
        if (cdnError) {
            project.edsStorefrontStatusSummary = 'stale';
            logger.warn(
                '[StorefrontRepublish] Republished to GitHub, but the CDN still serves the ' +
                    `previous config.json: ${cdnError}`,
            );
        } else {
            logger.debug('[StorefrontRepublish] Updating storefront state');
            updateStorefrontState(project, publishedConfigs);
            project.edsStorefrontStatusSummary = 'published';
            logger.info('[StorefrontRepublish] Storefront config republished successfully');
        }
        // To DISK, not just memory — see `persist` on RepublishParams.
        await persist(project);

        return {
            success: true,
            githubPushed: syncResult.githubPushed,
            cdnPublished: syncResult.cdnPublished,
            cdnVerified: syncResult.cdnVerified,
            cdnError,
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
