/**
 * Storefront Content Republish Service
 *
 * Republishes EVERYTHING a storefront serves: the DA.live site config, config.json
 * (through `republishStorefrontConfig`), the code, site permissions, every content
 * page, the category pages and catalog menu, and the pre-warmed product pages. The
 * dashboard's Republish button and the agent's `republish` tool both call this.
 *
 * After a store change (EDS-44: `edsStorefrontState.catalogPagesPending`), the
 * category and product pages are not refreshed but REPLACED with the new store's, by
 * the one store-change service (`storeScopePages.ts`).
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
import { applyCatalogMenuStep, publishAuthoredListStep, type CatalogMenuSite } from '../catalogMenu/catalogMenuStep';
import { prewarmCatalog } from '../catalogPrewarmService';
import { verifyConfigOnCdn } from '../configSyncService';
import type { DaLiveAuthService } from '../daLive/daLiveAuthService';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import { createDaLiveServiceTokenProvider } from '../daLive/daLiveTokenProviders';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import { republishStorefrontConfig } from './storefrontRepublishService';
import { hasCatalogPagesPending } from './storeScopeChange';
import { replaceStoreScopePages, type StoreScopeReport } from './storeScopePages';
import { createStoreScopePagesDeps } from './storeScopePagesDeps';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

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
    /**
     * Where each STEP is reported as it starts, and then what it is doing, as the line
     * under it (progress vocabulary slice 3, owner 2026-10-16). Every step is a name
     * from the stage table (`republishSteps.ts` lists them in order); the store-change
     * steps (EDS-44) arrive the same way. The dashboard numbers them; an agent hears
     * each name once.
     */
    onStage?: StoreScopeReport;
    /** Where the other local projects are read from: the shared-repository check (EDS-44). */
    stateManager: StateManager;
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
    /** After a store change: the one sentence on the new store's pages (EDS-44). */
    storePages?: string;
}

/** The clients this pipeline built, which the catalog's page steps reuse. */
interface PageClients {
    helixService: HelixService;
    daLiveContentOps: DaLiveContentOperations;
    daLiveTokenProvider: TokenProvider;
}

const S = OPERATION_STAGES;

const targetOf = (params: RepublishContentParams) => ({
    repoOwner: params.repoOwner,
    repoName: params.repoName,
    daLiveOrg: params.daLiveOrg,
    daLiveSite: params.daLiveSite,
});

/** The storefront as the catalog menu step sees it, on this pipeline's clients. */
function catalogMenuSiteOf(
    params: RepublishContentParams,
    clients: PageClients,
    overlayUrl: string | undefined,
): CatalogMenuSite {
    return createCatalogMenuSite({
        project: params.project,
        target: targetOf(params),
        daLive: clients.daLiveContentOps.sourceOps,
        helix: clients.helixService,
        github: params.githubFiles,
        stateManager: params.stateManager,
        logger: params.logger,
        overlay: overlayUrl !== undefined,
    });
}

/** The overlay the storefront is registered with, or undefined (off, or a malformed setting). */
function overlayUrlOf(daLiveOrg: string, daLiveSite: string, logger: Logger): string | undefined {
    try {
        return resolveByomOverlayConfig(undefined, daLiveOrg, daLiveSite);
    } catch (error) {
        logger.warn(`[Republish] The product page overlay setting could not be read: ${(error as Error).message}`);
        return undefined;
    }
}

/**
 * Category pages and the catalog menu (EDS-24, EDS-61) — the step storefront setup and
 * reset run — then the product pages. Every category page is published again (so a
 * template edit reaches them), pages of categories that are gone come down, and every
 * authored page is left alone. Never throws.
 */
async function refreshCatalogPages(
    params: RepublishContentParams,
    clients: PageClients,
    step: StoreScopeReport,
    site: CatalogMenuSite,
    overlayUrl: string | undefined,
): Promise<{ catalogMenu?: string }> {
    const { project, logger, persist, daLiveOrg, daLiveSite } = params;
    step(S.updatingCatalogMenu.label);
    const catalogMenu = (await applyCatalogMenuStep(project, site))?.summary;
    if (catalogMenu !== undefined) {
        step(S.updatingCatalogMenu.label, catalogMenu);
        logger.info(`[Republish] Catalog menu: ${catalogMenu}`);
        await persist(project);
    }

    // Pre-warm the catalog's PDP pages (self-gating: ACCS + BYOM only; non-fatal).
    // Decided 2026-08-23: Republish is the lightweight retry for a prewarm that failed
    // at creation — e.g. a hibernated Live Search index since reactivated via the
    // "Reactivate Live Search" support request — and it also refreshes
    // previously-prewarmed PDPs, which the content publish never reaches (they are
    // synthetic pages, not DA content). Reset remains the heavyweight path.
    try {
        if (overlayUrl) {
            step(S.warmingProductPages.label);
            const prewarm = await prewarmCatalog(
                project,
                overlayUrl,
                daLiveOrg,
                daLiveSite,
                clients.helixService,
                logger,
                (p) => step(S.warmingProductPages.label, p.message),
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
    return catalogMenu === undefined ? {} : { catalogMenu };
}

/**
 * After a store change (EDS-44): the old store's pages out, the new store's in. The
 * service reports its own steps; its sentence is the run's last word, not a step's line.
 */
async function replaceStorePages(
    params: RepublishContentParams,
    clients: PageClients,
    step: StoreScopeReport,
): Promise<string> {
    const { project, logger } = params;
    const deps = createStoreScopePagesDeps({
        project,
        target: targetOf(params),
        daLiveTokenProvider: clients.daLiveTokenProvider,
        githubFiles: params.githubFiles,
        stateManager: params.stateManager,
        persist: params.persist,
        logger,
        helixService: clients.helixService,
        daLiveSourceOps: clients.daLiveContentOps.sourceOps,
    });
    const { sentence } = await replaceStoreScopePages(project, deps, step);
    return sentence;
}

/**
 * Republish ALL storefront content to the CDN — the headless pipeline
 * (EDS config → config.json → code → permissions → publish → category pages → verify) that
 * `handleRepublishContent` wraps with UI (auth modal, progress, status).
 *
 * Single source of truth: both the dashboard's Republish button and the MCP
 * `republish` tool call this, so the pipeline never diverges. Callers are
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
    const step: StoreScopeReport = params.onStage ?? (() => undefined);

    try {
        const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
        const helixService =
            params.helixService ??
            new HelixService(logger, githubTokenService, daLiveTokenProvider);
        const daLiveContentOps = new DaLiveContentOperations(daLiveTokenProvider, logger);

        // Step 1: Apply EDS site config (AEM Assets, authoring experience).
        step(S.applyingDaLiveSettings.label);
        const experience = resolveProjectAuthoringExperience(project);
        await applyDaLiveOrgConfigSettings(
            daLiveContentOps,
            daLiveOrg,
            daLiveSite,
            logger,
            experience,
        );

        // Step 2: Regenerate + sync config.json (picks up env var changes).
        step(S.publishingSettings.label);
        const configResult = await republishStorefrontConfig({
            project,
            secrets,
            logger,
            onProgress: (line) => step(S.publishingSettings.label, line),
            persist,
        });
        if (!configResult.success) {
            logger.warn(`[Republish] Config regeneration warning: ${configResult.error}`);
        }

        // Step 3: Sync code to CDN + configure site permissions.
        step(S.publishingCode.label);
        await helixService.previewCode(repoOwner, repoName, '/*');
        const userEmail = await daLiveAuthService.getUserEmail();
        if (userEmail) {
            step(S.settingSitePermissions.label);
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

        // Step 4: Purge stale cache + publish all content — after the authored-pages sheet
        // (EDS-61): the bulk publish previews every DA.live page, and the overlay would
        // replace an authored page at a category address the published sheet does not list.
        const clients: PageClients = { helixService, daLiveContentOps, daLiveTokenProvider };
        // One answer for the run: category pages and product pages come from the same overlay.
        const overlayUrl = overlayUrlOf(daLiveOrg, daLiveSite, logger);
        const catalogMenuSite = catalogMenuSiteOf(params, clients, overlayUrl);
        const sheetProblem = await publishAuthoredListStep(project, catalogMenuSite);
        if (sheetProblem !== undefined) logger.warn(`[Republish] ${sheetProblem}`);
        step(S.clearingCache.label);
        await helixService.purgeCacheAll(repoOwner, repoName, 'main');
        step(S.publishingPages.label);
        await helixService.publishAllSiteContent(
            `${repoOwner}/${repoName}`,
            'main',
            daLiveOrg,
            daLiveSite,
            (info) => step(S.publishingPages.label, info.message),
        );

        // Steps 4b-5: the catalog's pages. After a store change whose config reached the
        // CDN, the old store's product and category pages are replaced (EDS-44);
        // otherwise they are refreshed as before.
        const storeChanged =
            hasCatalogPagesPending(project) && configResult.success && !configResult.cdnError;
        const sentences = storeChanged
            ? { storePages: await replaceStorePages(params, clients, step) }
            : await refreshCatalogPages(params, clients, step, catalogMenuSite, overlayUrl);

        // Step 6: Verify config.json on the CDN (best-effort).
        step(S.checkingSettings.label);
        const cdnVerified = await verifyConfigOnCdn(repoOwner, repoName, logger);
        return { success: true, cdnVerified, ...sentences };
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
