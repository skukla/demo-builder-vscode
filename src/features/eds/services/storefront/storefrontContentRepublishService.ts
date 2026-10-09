/**
 * Storefront Content Republish Service
 *
 * Republishes EVERYTHING a storefront serves: the DA.live site config, config.json
 * (through `republishStorefrontConfig`), the code, site permissions, every content
 * page, the category pages and catalog menu, and the pre-warmed product pages. The
 * dashboard's Republish button and the agent's `sync_content` tool both call this.
 *
 * @module features/eds/services/storefront/storefrontContentRepublishService
 */

import type * as vscode from 'vscode';
import { resolveByomOverlayConfig } from '../../handlers/byomOverlay';
import {
    applyDaLiveOrgConfigSettings,
    configureDaLivePermissions,
    resolveProjectAuthoringExperience,
} from '../../handlers/edsHelpers';
import {
    buildAppNotOnRepositoryMessage,
    isAppNotOnRepositoryError,
} from '../appInstallationResolver';
import { createCatalogMenuSite } from '../catalogMenu/catalogMenuSiteDeps';
import { applyCatalogMenuStep } from '../catalogMenu/catalogMenuStep';
import { prewarmCatalog } from '../catalogPrewarmService';
import { verifyConfigOnCdn } from '../configSyncService';
import type { DaLiveAuthService } from '../daLive/daLiveAuthService';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import { createDaLiveServiceTokenProvider } from '../daLive/daLiveTokenProviders';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import { republishStorefrontConfig } from './storefrontRepublishService';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

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
    /** Reads the storefront repository: whether it has the catalog-menu block (EDS-24). */
    githubFiles: Pick<GitHubFileOperations, 'getFileContent'>;
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
    /** What happened to the category pages and the catalog menu (EDS-24), in SC words. */
    catalogMenu?: string;
}

/**
 * Republish ALL storefront content to the CDN — the headless pipeline
 * (EDS config → config.json → code → permissions → publish → category pages → verify) that
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
        report('Applying EDS configuration');
        const experience = resolveProjectAuthoringExperience(project);
        await applyDaLiveOrgConfigSettings(
            daLiveContentOps,
            daLiveOrg,
            daLiveSite,
            logger,
            experience,
        );

        // Step 2: Regenerate + sync config.json (picks up env var changes).
        report('Regenerating storefront configuration');
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
        report('Syncing code to CDN');
        await helixService.previewCode(repoOwner, repoName, '/*');
        const userEmail = await daLiveAuthService.getUserEmail();
        if (userEmail) {
            report('Configuring site permissions');
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
        report('Purging stale cache');
        await helixService.purgeCacheAll(repoOwner, repoName, 'main');
        report('Publishing content to CDN');
        await helixService.publishAllSiteContent(
            `${repoOwner}/${repoName}`,
            'main',
            daLiveOrg,
            daLiveSite,
            (info) => report(info.message),
        );

        // Step 4b: Category pages and the catalog menu (EDS-24) — the step storefront
        // setup and reset run. A category added since gets its page; ours are
        // refreshed only if unedited; every other page is left alone. Never throws.
        const catalogMenu = await applyCatalogMenuStep(
            project,
            createCatalogMenuSite({
                project,
                target: { repoOwner, repoName, daLiveOrg, daLiveSite },
                daLive: daLiveContentOps.sourceOps,
                helix: helixService,
                github: params.githubFiles,
            }),
        );
        if (catalogMenu !== undefined) {
            report(catalogMenu);
            logger.info(`[Republish] Catalog menu: ${catalogMenu}`);
            await persist(project);
        }

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
                report('Loading the product pages so they are quick for visitors');
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
        report('Verifying CDN');
        const cdnVerified = await verifyConfigOnCdn(repoOwner, repoName, logger);
        return { success: true, cdnVerified, ...(catalogMenu === undefined ? {} : { catalogMenu }) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
            '[Republish] Content republish failed',
            error instanceof Error ? error : undefined,
        );
        // The code endpoint's x-error is the one place that says the App does not
        // cover the repository (EDS-23); say it in words the SC can act on.
        return {
            success: false,
            error: isAppNotOnRepositoryError(message)
                ? buildAppNotOnRepositoryMessage(repoOwner, repoName)
                : message,
        };
    }
}
