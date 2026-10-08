/**
 * EDS Reset Service
 *
 * Shared service for resetting EDS projects to template state.
 * Used by both dashboard and projects-dashboard handlers to eliminate code duplication.
 *
 * The reset workflow:
 * 1. Reset repo to template (Git Tree API)
 * 2. Install block libraries
 * 3. Install inspector tagging
 * 4. Sync code to CDN
 * 5. Configure site permissions
 * 6. Update Configuration Service
 * 7. Publish config.json to CDN
 * 8. Clear + copy demo content to DA.live
 * 9. Create block library in DA.live
 * 10. Apply EDS settings
 * 11. Purge cache + publish content; category pages + catalog menu re-written (EDS-24)
 * 12. (Optional) Redeploy API Mesh
 *
 * This file is the orchestration only. The steps live beside it: the repo reset
 * (`edsResetRepoHelper`), steps 4-5 (`edsResetCodeSyncStep`), 6-7
 * (`edsResetConfigStep`), 8-11 (`edsResetContentStep`) and the last steps with
 * the result (`edsResetFinalize`).
 *
 * @module features/eds/services/reset/edsResetService
 */

import { getGitHubServices } from '../../handlers/edsHelpers';
import { ConfigurationService } from '../configService/configurationService';
import { lostGrantsMessage } from '../configService/lostGrantsMessage';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import { migrateStorefrontNamingIfNeeded } from '../storefront/storefrontNameMigration';
import { GitHubAppNotInstalledError } from '../types';
import { putBackCatalogMenu, takeOutCatalogMenu } from './edsResetCatalogMenu';
import { syncCodeAndPermissions } from './edsResetCodeSyncStep';
import {
    publishConfigAndRegisterSite,
    type ConfigStepServices,
} from './edsResetConfigStep';
import { runContentPipeline } from './edsResetContentStep';
import { finalizeReset, recordBoilerplate, recordSyncedCommit } from './edsResetFinalize';
import type { MeshRedeployDeps } from './edsResetMeshHelper';
import type { EdsResetParams, EdsResetProgress, EdsResetResult } from './edsResetParams';
import { takeOutProductPages, withPageSentences } from './edsResetProductPages';
import { resetRepoToTemplate } from './edsResetRepoHelper';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/** Map an unknown caught error to a structured EdsResetResult. */
function handleResetError(error: unknown, logger: Logger): EdsResetResult {
    if (error instanceof GitHubAppNotInstalledError) {
        logger.info(`[EdsReset] GitHub App not installed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            errorType: 'GITHUB_APP_NOT_INSTALLED',
            errorDetails: { owner: error.owner, repo: error.repo, installUrl: error.installUrl },
        };
    }
    const errorMessage = (error as Error).message;
    logger.error('[EdsReset] Reset failed', error as Error);
    return { success: false, error: errorMessage };
}

/**
 * Execute EDS project reset
 *
 * Resets the repository contents to match the template without deleting the repo.
 * This preserves the repo URL, settings, webhooks, and GitHub App installation.
 *
 * @param params - Reset parameters
 * @param context - Handler context with services
 * @param tokenProvider - Token provider for DA.live operations
 * @param onProgress - Optional progress callback
 * @returns Reset result
 */
export async function executeEdsReset(
    params: EdsResetParams,
    context: HandlerContext,
    tokenProvider: TokenProvider,
    deps: MeshRedeployDeps,
    onProgress?: (progress: EdsResetProgress) => void,
    /**
     * Service seam for the config step, forwarded verbatim to
     * {@link publishConfigAndRegisterSite}. Production never passes it — see
     * {@link ConfigStepServices} for why it exists.
     */
    services?: ConfigStepServices,
): Promise<EdsResetResult> {
    const { redeployMesh = false } = params;

    const baseSteps = 11;
    const totalSteps = redeployMesh ? baseSteps + 1 : baseSteps;
    const report = (step: number, message: string) => {
        onProgress?.({ step, totalSteps, message });
    };

    const { tokenService: githubTokenService, fileOperations: githubFileOps } =
        getGitHubServices(context.context.secrets);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

    let filesReset = 0;
    let contentCopied = 0;

    try {
        // Step 0: One-time DA/repo name migration for storefronts created on
        // pre-`164fd251` builds where the DA site name doesn't match the
        // GitHub repo name. No-op when they already match. Mutates
        // params.daLiveSite and project metadata in place when it runs so
        // the rest of the pipeline uses the new (matching) name.
        // Same seam as the config step below: one Config Service, one place to
        // supply it. `RegistrarConfigService` declares both methods, so it satisfies
        // the migration's narrower `MigrationConfigService` too.
        const configServiceForMigration =
            services?.configService ?? new ConfigurationService(tokenProvider, context.logger);
        const migrationResult = await migrateStorefrontNamingIfNeeded(
            params,
            params.project,
            daLiveContentOps,
            configServiceForMigration,
            context.logger,
        );
        if (migrationResult.error) {
            return {
                success: false,
                error: migrationResult.error,
            };
        }
        if (migrationResult.lostGrants?.length) {
            report(
                0,
                `⚠️ ${lostGrantsMessage(migrationResult.lostGrants, 'Storefront name migration completed')}`,
            );
        }

        // Step 1: Reset repo to template
        const repoResetResult = await resetRepoToTemplate(params, context, githubFileOps, report);
        filesReset = repoResetResult.filesReset;

        // Steps 4-5: Sync code to CDN + configure permissions
        await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, report);

        const { configWritten } = await publishConfigAndRegisterSite(
            params,
            githubTokenService,
            tokenProvider,
            context.logger,
            report,
            services,
        );

        // Out before the content is re-copied: category pages (EDS-24), product pages (EDS-26).
        const clients = { daLiveContentOps, githubFileOps, githubTokenService, tokenProvider };
        const catalogMenuSite = await takeOutCatalogMenu(params, context.logger, clients, report);
        const productPages = await takeOutProductPages(
            params,
            context,
            { ...clients, daLiveContentOps: daLiveContentOps.sourceOps },
            report,
        );

        // Steps 8-11: Content Pipeline (with DA.live re-auth retry)
        contentCopied = await runContentPipeline(
            params,
            repoResetResult,
            daLiveContentOps,
            githubFileOps,
            githubTokenService,
            tokenProvider,
            context,
            report,
        );
        const catalogMenu = await putBackCatalogMenu(params, catalogMenuSite, context.logger, report);
        recordSyncedCommit(params.project, repoResetResult.templateCommitSha, context.logger);
        recordBoilerplate(params.project, repoResetResult.boilerplate);

        // Steps 11-12: CDN verification + optional mesh redeploy + state persistence
        const result = await finalizeReset(
            params,
            context,
            report,
            filesReset,
            contentCopied,
            deps,
            configWritten,
            { demoCaveats: repoResetResult.demoCaveats, demoFixes: repoResetResult.demoFixes },
        );
        return withPageSentences(result, { catalogMenu, productPages });
    } catch (error) {
        return handleResetError(error, context.logger);
    }
}
