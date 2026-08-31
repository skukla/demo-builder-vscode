/**
 * Catalog pre-warming, run at the END of project creation.
 *
 * The EDS pipeline pre-warms at its step 8, which is correct for RESET — that
 * flow imports sample data BEFORE the pipeline runs. Creation is the other way
 * round: the pipeline runs during storefront setup, and the datapack import is a
 * later phase. Pre-warming there could only ever enumerate a catalog that had
 * not been seeded yet.
 *
 * Worse, the setup path had no project to give it. `storefront-setup-start` is
 * registered by the WIZARD as well as the dashboard, and during creation the new
 * project does not exist, so its `getCurrentProject()` read returned whatever was
 * last open — pre-warming ANOTHER project's catalog onto this site. That read is
 * now guarded by `projectTargetsStorefront`, which correctly yields nothing on the
 * create path. This phase is where creation pre-warms instead: after the project
 * is real and after its sample data has landed.
 *
 * Never throws. A cold catalog costs a slow first PDP, which the runtime
 * smart-404 handles; aborting a completed project over it would be absurd.
 *
 * @module features/project-creation/services/catalogPrewarmPhase
 */

import type { Project } from '@/types';
import type { PdpPublisher } from '@/features/eds/services/catalogPrewarmService';
import type { HandlerContext } from '@/types/handlers';

/** Progress reporter shared with the executor's other phases. */
export type ProgressReporter = (step: string, percent: number, message?: string) => void;

/**
 * Pre-warm the project's Commerce catalog, if it has one worth warming.
 *
 * @param context - Handler context (secrets, extension context, logger)
 * @param project - The project just created — real, saved, and seeded
 * @param progressTracker - Creation progress reporter
 * @param makeHelix - Helix FACTORY seam. Defaults to constructing the real service
 *   from this call's logger and secrets; production never passes it.
 *
 *   A factory rather than an instance, and that is load-bearing here: two of this
 *   module's contracts are that NOTHING is constructed on the skip paths. An instance
 *   parameter would be built by the caller whether or not the phase ran, so the
 *   laziness those tests assert would become unobservable. A factory keeps "was it
 *   built, and with what" answerable — which is exactly what the suite was written to
 *   pin (it calls itself the witness for this conversion in its own header).
 */
export async function executeCatalogPrewarmPhase(
    context: HandlerContext,
    project: Project,
    progressTracker: ProgressReporter,
    makeHelix?: (
        logger: HandlerContext['logger'],
        secrets: HandlerContext['context']['secrets'],
        daLiveTokenProvider: unknown,
    ) => PdpPublisher,
): Promise<void> {
    const logger = context.logger;
    try {
        const { extractRepublishParams } = await import(
            '@/features/eds/services/storefront/storefrontRepublishService'
        );
        const params = extractRepublishParams(project);
        if (!params.success) {
            logger.debug(`[Catalog Prewarm] Skipping — ${params.error}`);
            return;
        }

        const { resolveByomOverlayConfig } = await import('@/features/eds/handlers/edsHelpers');
        const overlayUrl = resolveByomOverlayConfig(
            undefined,
            params.daLiveOrg,
            params.daLiveSite,
        );
        if (!overlayUrl) {
            logger.debug('[Catalog Prewarm] Skipping — no BYOM overlay configured');
            return;
        }

        const { createDaLiveServiceTokenProvider } = await import(
            '@/features/eds/services/daLive/daLiveContentOperations'
        );
        const { getDaLiveAuthService } = await import('@/features/eds/handlers/edsHelpers');
        const { getGitHubServices } = await import('@/features/eds/handlers/edsServiceCache');
        const { HelixService } = await import('@/features/eds/services/helix/helixService');
        const { prewarmCatalog } = await import('@/features/eds/services/catalogPrewarmService');

        const daLiveTokenProvider = createDaLiveServiceTokenProvider(
            getDaLiveAuthService(context.context),
        );
        const helixService = makeHelix
            ? makeHelix(logger, context.context.secrets, daLiveTokenProvider)
            : new HelixService(
                  logger,
                  // The SHARED token service. Its validation cache is per-instance with
                  // a five-minute TTL, so a fresh one here would send this publish
                  // through a GitHub round trip the cache had already answered.
                  getGitHubServices(context).tokenService,
                  daLiveTokenProvider,
              );

        progressTracker('Pre-warming Catalog', 96, 'Publishing product pages…');

        const result = await prewarmCatalog(
            project,
            overlayUrl,
            params.daLiveOrg,
            params.daLiveSite,
            helixService,
            logger,
        );
        if (!result.skipped) {
            logger.info(
                `[Catalog Prewarm] ${result.succeeded}/${result.attempted} SKUs pre-published`,
            );
        }
    } catch (error) {
        // Non-fatal by design — see the module docblock.
        logger.warn(`[Catalog Prewarm] Phase failed: ${(error as Error).message}`);
    }
}
