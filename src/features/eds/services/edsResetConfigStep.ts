/**
 * Reset steps 6-7: publish `config.json` to the CDN, then register the site.
 *
 * Extracted from `edsResetService` to keep that file to orchestration. This step
 * carries most of the reset's error nuance, and all of it is load-bearing —
 * see the comments inline.
 *
 * @module features/eds/services/edsResetConfigStep
 */

import {
    surfaceOverlayRegistrationFailure,
    byomRegistrationFailureMessage,
} from '../handlers/edsHelpers';
import { logConfigAccessState } from './configAccessRecovery';
import { buildSiteConfigParams, ConfigurationService } from './configurationService';
import type { TokenProvider } from './daLiveOrgOperations';
import type { EdsResetParams } from './edsResetParams';
import type { GitHubTokenService } from './githubTokenService';
import { HelixService } from './helixService';
import { lostGrantsMessage } from './lostGrantsMessage';
import { registerSiteConfig } from './siteConfigRegistrar';
import { DaLiveAuthError } from './types';
import type { Logger } from '@/types/logger';

/**
 * Steps 6-7: Publish config.json to CDN and register site with Configuration Service.
 *
 * Step 6 (config.json publish) runs before Config Service registration so the bulk
 * code sync (previewCode '/*') has fully settled before we write to the Config Service.
 * The bulk sync is async on Helix's side and can race with a Config Service write if
 * we register immediately after.
 *
 * Step 7 (Config Service registration) runs after all code sync operations to avoid
 * a race where Helix's async bulk processing overwrites or clears the Config Service entry.
 */
export async function publishConfigAndRegisterSite(
    {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        byomOverlayUrl,
    }: Pick<
        EdsResetParams,
        'repoOwner' | 'repoName' | 'daLiveOrg' | 'daLiveSite' | 'byomOverlayUrl'
    >,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    logger: Logger,
    report: (step: number, message: string) => void,
): Promise<{ configWritten: boolean }> {
    // Reported on the RESULT, not just the progress line. Steps 8-11 overwrite
    // that line within seconds, so a run that skipped this write used to end with
    // '"<project>" reset successfully' — repo rewritten, PDPs dead, user misled.
    let configWritten = true;

    // Step 6: Publish config.json to CDN
    // No tokenProvider: publishing config.json only needs GitHub token (no DA.live auth)
    report(6, 'Publishing config.json to CDN...');
    logger.info(`[EdsReset] Publishing config.json to CDN for ${repoOwner}/${repoName}`);
    const helixServiceForCode = new HelixService(logger, githubTokenService);
    try {
        await helixServiceForCode.previewCode(repoOwner, repoName, '/config.json');
        logger.info('[EdsReset] config.json published to CDN');
        report(6, 'config.json published');
    } catch (configError) {
        logger.warn(`[EdsReset] Failed to publish config.json: ${(configError as Error).message}`);
        report(6, 'config.json publish failed, continuing...');
    }

    // Step 7: Update Configuration Service with current content source.
    // Folder mapping is intentionally NOT configured — deprecated by Adobe
    // (see aem.live/developer/byom). CitiSignal handles /products/{sku} via client-side routing.
    report(7, 'Updating Configuration Service...');
    // Same telegraph as the create path: state access before the write that
    // depends on it, so a reset log explains itself.
    await logConfigAccessState(tokenProvider, { owner: repoOwner, repo: repoName }, logger);
    const configService = new ConfigurationService(tokenProvider, logger);
    try {
        // The SAME protocol the wizard runs — 409→update, 401→re-auth, 403→wait
        // out admin-role propagation. This path used to have its own retry helper
        // that handled only the 403, so a reset (the path used to REPAIR a broken
        // storefront) got no 409 or 401 handling at all.
        const outcome = await registerSiteConfig({
            configurationService: configService,
            siteParams: buildSiteConfigParams(
                repoOwner,
                repoName,
                daLiveOrg,
                daLiveSite,
                byomOverlayUrl,
            ),
            logger,
            retryOn403: true,
            onProgress: (message) => report(7, message),
        });
        if (outcome.lostGrants?.length) {
            report(7, `⚠️ ${lostGrantsMessage(outcome.lostGrants, 'Site configuration updated')}`);
        }
        const configResult = {
            success: outcome.registered,
            statusCode: outcome.statusCode,
            error: outcome.registered
                ? undefined
                : (outcome.error ?? `registration failed (${outcome.statusCode ?? 'unknown'})`),
        };
        configWritten = configResult.success;
        if (configResult.success) {
            logger.info('[EdsReset] Configuration Service updated');
            report(7, 'Configuration Service updated');
        } else if (byomOverlayUrl) {
            // The overlay rides in this same config write. A failure here leaves
            // PDPs resolving against da.live (404). Log-only helper (headless-safe);
            // report() is the context-appropriate surface (UI progress or MCP tool
            // output).
            //
            // Both lines come from the SAME helper — literally, not by paraphrase.
            // A hand-written copy of the 403 advice lived here and had already
            // drifted from the constant once (it still said "re-install the
            // GitHub App", the remedy the constant was written to replace). Two
            // remedy texts one line apart is the drift, not the fix for it.
            surfaceOverlayRegistrationFailure(logger, undefined, configResult.statusCode);
            report(7, `⚠️ ${byomRegistrationFailureMessage(configResult.statusCode)}`);
        } else {
            logger.warn(`[EdsReset] Configuration Service update warning: ${configResult.error}`);
        }
    } catch (configError) {
        // A dead DA.live session gets its own message, but NOT a rethrow.
        //
        // Rethrowing aborted the run at step 7 — after `resetRepoToTemplate` has
        // already wiped the repo and before the content pipeline copies anything
        // back — and skipped `handlePipelineAuthRetry`, the only re-auth recovery
        // in the reset. That left a half-reset storefront and a bare error.
        //
        // Continuing is strictly better: the pipeline re-authenticates and
        // finishes the reset, and the one write that was missed has a command of
        // its own. The BYOM branch below must not run for this — "reset the
        // storefront" repeats the same write with the same dead session.
        if (configError instanceof DaLiveAuthError) {
            logger.warn(`[EdsReset] DA.live session expired before the site config write`);
            report(
                7,
                '⚠️ Your DA.live session expired before the site configuration was written. ' +
                    'The reset will continue — afterwards, sign in and run ' +
                    '"Demo Builder: Repair Site Configuration" to finish it.',
            );
            return { configWritten: false };
        }
        if (byomOverlayUrl) {
            // Same constant as the branch above. "Reset again" lived here and is
            // exactly the advice this batch exists to replace — a reset repeats
            // the same write with the same identity.
            surfaceOverlayRegistrationFailure(logger);
            report(7, `⚠️ ${byomRegistrationFailureMessage()}`);
        } else {
            logger.warn(
                `[EdsReset] Configuration Service update skipped: ${(configError as Error).message}`,
            );
        }
        configWritten = false;
    }

    return { configWritten };
}
