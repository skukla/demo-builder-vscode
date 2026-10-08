/**
 * Reset steps 8-11: the EDS content pipeline (clear and copy the demo content,
 * the block library, the EDS settings, purge and publish), with the shared
 * DA.live re-auth retry around it.
 *
 * Extracted from `edsResetService` (EDS-8, 2026-10-08) so that file keeps only the
 * orchestration.
 *
 * @module features/eds/services/reset/edsResetContentStep
 */

import { withDaLiveAuthRetry } from '../daLive/daLiveAuthRetry';
import type { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import { executeEdsPipeline } from '../edsPipeline';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import { createPatchReport, addCodeResult, reportUnapplied } from '../patches/patchReportHelper';
import { writeBrokenLinks } from '../storefront/brokenLinksRecord';
import type { EdsResetParams } from './edsResetParams';
import type { HandlerContext } from '@/types/handlers';

/** Maps EDS pipeline operation names to wizard step numbers for progress reporting. */
const PIPELINE_STEP_MAP: Record<string, number> = {
    'content-clear': 8,
    'content-copy': 8,
    'block-library': 9,
    'eds-settings': 10,
    'cache-purge': 11,
    'content-publish': 11,
    'library-publish': 11,
    'catalog-prewarm': 11,
};

/** Map a pipeline progress event to the wizard step number and format the message. */
function mapPipelineProgress(
    info: { operation: string; message: string; current?: number; total?: number },
    report: (step: number, message: string) => void,
): void {
    let message = info.message;
    if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
        message = `Publishing to CDN (${info.current}/${info.total} pages)`;
    }
    report(PIPELINE_STEP_MAP[info.operation] ?? 8, message);
}

/**
 * Steps 8-11: Run the EDS content pipeline with automatic DA.live re-auth retry.
 * Returns the number of content files copied.
 */
export async function runContentPipeline(
    params: EdsResetParams,
    repoResetResult: {
        blockCollectionIds?: string[];
        libraryContentSources: Array<{ org: string; site: string }>;
        canonicalCodePatchResults?: import('../patches/codePatchRegistry').CodePatchResult[];
    },
    daLiveContentOps: DaLiveContentOperations,
    githubFileOps: GitHubFileOperations,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    context: HandlerContext,
    report: (step: number, message: string) => void,
): Promise<number> {
    const {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        templateOwner,
        templateRepo,
        contentSource: contentSourceConfig,
        accountContentSource: accountContentSourceConfig,
        includeBlockLibrary = false,
        contentPatches,
        contentPatchSource,
        codePatches,
        codePatchSource,
        brandAssets,
        byomOverlayUrl,
        project,
    } = params;

    // Seed the pipeline's patch report with the canonical-phase code-patch
    // results from `resetRepoToTemplate`. The pipeline appends block-phase
    // results and (eventually) content-patch results to the same report so
    // the final aggregate carries everything the UI surface needs.
    const patchReport = createPatchReport();
    for (const r of repoResetResult.canonicalCodePatchResults ?? []) {
        addCodeResult(patchReport, r);
    }

    // tokenProvider required: DA.live content operations (copy, publish) need IMS token
    const helixService = new HelixService(context.logger, githubTokenService, tokenProvider);
    // The SHARED recovery, not a third hand-rolled copy. Reset, storefront setup
    // and (until 2026-08-16) nothing else each had their own loop; they must agree
    // on when a refusal is retryable, and a divergence there is invisible until a
    // pipeline fails in the field.
    return withDaLiveAuthRetry(
        context,
        async () => {
            const pipelineResult = await executeEdsPipeline(
                {
                    repoOwner,
                    repoName,
                    daLiveOrg,
                    daLiveSite,
                    templateOwner,
                    templateRepo,
                    // Keep-my-current-content: an added demo's content site is gone,
                    // the SC chose to reset the code only (content is not forkable).
                    clearExistingContent: !params.keepContent,
                    skipContent: Boolean(params.keepContent) || !contentSourceConfig,
                    contentSource: contentSourceConfig,
                    accountContentSource: accountContentSourceConfig,
                    contentPatches,
                    contentPatchSource,
                    includeBlockLibrary,
                    codePatches,
                    codePatchSource,
                    brandAssets,
                    patchReport,
                    blockCollectionIds: repoResetResult.blockCollectionIds,
                    libraryContentSources: repoResetResult.libraryContentSources,
                    purgeCache: true,
                    skipPublish: false,
                    byomOverlayUrl,
                    project,
                },
                { daLiveContentOps, githubFileOps, helixService, logger: context.logger },
                (info) => mapPipelineProgress(info, report),
            );

            if (!pipelineResult.success) {
                throw new Error(pipelineResult.error || 'Content pipeline failed');
            }

            // Surface unapplied patches (if any) via the unified toast helper.
            // Headless callers (MCP/AI reset) get warn-level logging only; UI
            // callers can wrap this function and inject `showWarning` later.
            await reportUnapplied(patchReport, context.logger);
            // The content was copied afresh, so its broken links replace the last
            // ones; kept content was not, and its record still stands. Saved with
            // the project by finalizeReset.
            if (!params.keepContent && contentSourceConfig) {
                writeBrokenLinks(project, patchReport.brokenLinks);
            }

            context.logger.info('[EdsReset] Content pipeline completed successfully');
            return pipelineResult.contentFilesCopied;
        },
        {
            logPrefix: '[EdsReset]',
            operationLabel: 'Reset',
            onExpired: async () => report(8, 'Sign in to DA.live again'),
            onBeforeRetry: async () => report(8, 'Resuming the content copy'),
        },
    );
}
