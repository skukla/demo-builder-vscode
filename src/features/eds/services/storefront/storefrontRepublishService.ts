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

        // Step 4: the DA.live session the CDN publish needs — asked for BEFORE the
        // push, so a declined sign-in is known when the CDN answer comes back.
        const session = ensureDaLiveSession ? await ensureDaLiveSession() : undefined;
        if (session && !session.authenticated) {
            logger.warn(
                '[StorefrontRepublish] No DA.live session — pushing to GitHub, the CDN publish will not land',
            );
        }

        // Step 5: Sync to GitHub and CDN
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
    /**
     * Helix seam. Defaults to a service built from this call's logger and
     * credentials; production never passes it.
     *
     * HelixService is stateless, so ADR-015 leaves the construction here — the cost
     * was test design. `storefrontRepublishContent.test.ts` had to `jest.mock` the
     * module to reach `previewCode`/`purgeCacheAll`/`publishAllSiteContent`, and its
     * prewarm assertion could only say `expect.anything()` about the instance it
     * could not name. With the seam it asserts the identity it handed in.
     */
    helixService?: HelixService;
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
        const helixService =
            params.helixService ??
            new HelixService(logger, githubTokenService, daLiveTokenProvider);
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
