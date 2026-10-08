/**
 * Reset steps 4-5: publish the code to the CDN, then grant the signed-in user on
 * the DA.live site.
 *
 * Extracted from `edsResetService` (EDS-8, 2026-10-08) so that file keeps only the
 * orchestration; steps 6-7 already live in `edsResetConfigStep`.
 *
 * @module features/eds/services/reset/edsResetCodeSyncStep
 */

import { configureDaLivePermissions, getDaLiveAuthService } from '../../handlers/edsHelpers';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import type { EdsResetParams } from './edsResetParams';
import type { HandlerContext } from '@/types/handlers';

/**
 * Steps 4-5: Sync code to CDN and configure DA.live permissions.
 */
export async function syncCodeAndPermissions(
    params: EdsResetParams,
    context: HandlerContext,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    report: (step: number, message: string) => void,
): Promise<void> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = params;
    // Step 4: Sync code to CDN
    report(4, 'Publishing the code');
    // tokenProvider required: DA.live auth headers needed for unpublish during bulk sync
    const helixServiceForCodeSync = new HelixService(
        context.logger,
        githubTokenService,
        tokenProvider,
    );
    try {
        await helixServiceForCodeSync.previewCode(repoOwner, repoName, '/*');
        context.logger.info('[EdsReset] Code synced to CDN');
        report(4, 'Code published');
    } catch (codeSyncError) {
        context.logger.warn(
            `[EdsReset] Code sync request failed: ${(codeSyncError as Error).message}, continuing anyway`,
        );
        report(4, 'Waiting for the publish');
    }

    // Step 5: Configure site permissions
    report(5, 'Setting site permissions');
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
}
