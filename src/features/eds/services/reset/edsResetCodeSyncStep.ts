/**
 * Reset steps 4-5: publish the code to the CDN, then grant the signed-in user on
 * the DA.live site.
 *
 * Extracted from `edsResetService` (EDS-8, 2026-10-08) so that file keeps only the
 * orchestration; steps 6-7 already live in `edsResetConfigStep`.
 *
 * Plus the code publish's second chance, {@link republishCodeIfMissed}, which runs
 * after step 7 has (re-)registered the site, and the look at what the site serves
 * afterwards, {@link confirmResetCodeServed}.
 *
 * @module features/eds/services/reset/edsResetCodeSyncStep
 */

import { configureDaLivePermissions, getDaLiveAuthService } from '../../handlers/edsHelpers';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import { previewCodeAwaitingAdminRole } from '../helix/previewCodeAwaitingAdminRole';
import { confirmStorefrontCodeServed } from '../storefront/codeServed';
import type { EdsResetParams } from './edsResetParams';
import { RESET_STEP } from '@/core/utils/resetStages';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * Steps 4-5: Sync code to CDN and configure DA.live permissions.
 *
 * @returns the code publish's error when it failed, so the reset can publish again
 *   once the site is registered ({@link republishCodeIfMissed})
 */
export async function syncCodeAndPermissions(
    params: EdsResetParams,
    context: HandlerContext,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    report: (step: number, message: string) => void,
): Promise<{ codeError?: string }> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = params;
    let codeError: string | undefined;
    // Step 4: Sync code to CDN
    report(RESET_STEP.publishingCodeAndSettings, 'Publishing the code');
    // tokenProvider required: DA.live auth headers needed for unpublish during bulk sync
    const helixServiceForCodeSync = new HelixService(
        context.logger,
        githubTokenService,
        tokenProvider,
    );
    try {
        await helixServiceForCodeSync.previewCode(repoOwner, repoName, '/*');
        context.logger.info('[EdsReset] Code synced to CDN');
        report(RESET_STEP.publishingCodeAndSettings, 'Code published');
    } catch (codeSyncError) {
        codeError = (codeSyncError as Error).message;
        context.logger.warn(
            `[EdsReset] Code sync request failed: ${(codeSyncError as Error).message}, continuing anyway`,
        );
        report(RESET_STEP.publishingCodeAndSettings, 'Waiting for the publish');
    }

    // Step 5: Configure site permissions
    report(RESET_STEP.publishingCodeAndSettings, 'Setting site permissions');
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const userEmail = await daLiveAuthService.getUserEmail();
    if (userEmail) {
        await configureDaLivePermissions(
            tokenProvider,
            daLiveOrg,
            daLiveSite,
            userEmail,
            context.logger,
        );
    } else {
        context.logger.warn('[EdsReset] No user email available for permissions');
    }
    return codeError === undefined ? {} : { codeError };
}

/** The credentials and logger the second publish is built from. */
interface RepublishClients {
    githubTokenService: GitHubTokenService;
    tokenProvider: TokenProvider;
    logger: Logger;
}

/**
 * Publish the code again when step 4's publish failed — now that step 7 has
 * (re-)registered the site.
 *
 * Owner decision 2026-10-22. A site whose config is missing refuses the code
 * publish with "config for site not found" (measured on scratch-1022), and before
 * this nothing after step 7 published code, so the reset could finish with a site
 * serving no scripts. Reset's order is otherwise kept (see `edsResetConfigStep`).
 *
 * The publish is the one storefront setup makes: the DA.live-authenticated Helix
 * service, with a 401 waited out while a just-restored admin role propagates.
 *
 * @param params - reset parameters (the repository)
 * @param codeError - step 4's error; undefined when the code published
 * @param clients - credentials and logger
 * @param report - progress reporter
 * @returns a sentence for the SC when the code is still not published, else undefined
 */
export async function republishCodeIfMissed(
    params: Pick<EdsResetParams, 'repoOwner' | 'repoName'>,
    codeError: string | undefined,
    clients: RepublishClients,
    report: (step: number, message: string) => void,
): Promise<string | undefined> {
    if (codeError === undefined) return undefined;
    const { repoOwner, repoName } = params;
    const { githubTokenService, tokenProvider, logger } = clients;
    report(RESET_STEP.publishingCodeAndSettings, 'Publishing the code');
    const helix = new HelixService(logger, githubTokenService, tokenProvider);
    try {
        await previewCodeAwaitingAdminRole(helix, { owner: repoOwner, repo: repoName, path: '/*' }, logger);
        logger.info('[EdsReset] Code synced to CDN on the second publish');
        report(RESET_STEP.publishingCodeAndSettings, 'Code published');
        return undefined;
    } catch (error) {
        const reason = (error as Error).message;
        logger.error(`[EdsReset] Code still not published to the CDN: ${reason}`);
        const sentence =
            `The storefront code could not be published, so the site serves no pages ` +
            `(${reason}). Select Republish on the project dashboard to publish it again.`;
        report(RESET_STEP.publishingCodeAndSettings, `⚠️ ${sentence}`);
        return sentence;
    }
}

/**
 * Confirm the site serves everything the reset committed after its own commit (the
 * build step's fixes, the blocks, the smart 404 handler), publishing again any file it
 * does not (`codeServed.ts`). The publish before it reads AEM's copy of the repository,
 * which can lag the last few commits: on 2026-10-23 JustRite's reset left the site on
 * the old code for all three of its fixes.
 *
 * @param params - reset parameters (the repository)
 * @param resetCommitSha - the reset's own commit
 * @param clients - credentials, the repository reader and logger
 * @param report - progress reporter
 * @returns a sentence for the SC when some code still did not reach the site, else undefined
 */
export async function confirmResetCodeServed(
    params: Pick<EdsResetParams, 'repoOwner' | 'repoName'>,
    resetCommitSha: string,
    clients: RepublishClients & { githubFileOps: GitHubFileOperations },
    report: (step: number, message: string) => void,
): Promise<string | undefined> {
    const { githubFileOps, githubTokenService, tokenProvider, logger } = clients;
    report(RESET_STEP.publishingCodeAndSettings, 'Checking the site serves the new code');
    const helix = new HelixService(logger, githubTokenService, tokenProvider);
    const site = { owner: params.repoOwner, repo: params.repoName };
    const sentence = await confirmStorefrontCodeServed(githubFileOps, helix, site, resetCommitSha, logger);
    if (sentence) report(RESET_STEP.publishingCodeAndSettings, `⚠️ ${sentence}`);
    return sentence;
}
