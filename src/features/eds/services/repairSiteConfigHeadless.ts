/**
 * Re-run a storefront's Configuration Service registration, on its own.
 *
 * ## Why this exists
 *
 * When the overlay registration is refused (403 — the caller holds no admin role
 * on the site), the storefront is built, pushed and browsable but cannot serve a
 * single product detail page. Until now the only ways back were a full setup run
 * or `edsResetService`, which rewrites the repo AND the DA.live content to the
 * template. Neither is a proportionate response to one failed write, and
 * `Sync Storefront` never touched the Configuration Service at all — verified:
 * `registerConfigurationService` had exactly one caller, `storefrontSetupPhase3`.
 *
 * So someone who fixed their access had no cheap way to finish the job, and the
 * success message told them to Republish, which could not have worked.
 *
 * ## What it does NOT do
 *
 * It does not publish content. Registration writes a routing rule; making it
 * take effect is the caller's business (`repairSiteConfiguration` follows this
 * with the same republish the Configure command runs on save). Keeping the two
 * apart means the repair is testable without a GitHub or DA.live round trip, and
 * an agent can call it without republishing a demo out from under someone.
 *
 * `verified` is reported separately from `status` on purpose: a 2xx on the write
 * and a live overlay are different claims, and only the second one means product
 * pages will load.
 *
 * @module features/eds/services/repairSiteConfigHeadless
 */

import { pinSiteAdmin } from './configAccessRecovery';
import { buildCodeSyncSetupUrl } from './configServiceAccess';
import { buildSiteConfigParams, type ConfigurationService } from './configurationService';
import { registerSiteConfig } from './siteConfigRegistrar';
import { extractRepublishParams } from './storefrontRepublishService';
import { DaLiveAuthError } from './types';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/**
 * - `repaired` — the site config was written
 * - `not_authorized` — refused; a human with the admin role must grant it first
 * - `invalid` — the project carries no EDS storefront to repair
 * - `failed` — anything else, including a dead DA.live session
 */
export type RepairSiteConfigStatus = 'repaired' | 'not_authorized' | 'invalid' | 'failed';

export interface RepairSiteConfigResult {
    status: RepairSiteConfigStatus;
    /** A read-back confirmed the overlay is registered. Never inferred from the write. */
    verified: boolean;
    org?: string;
    site?: string;
    /** The overlay this run intended to register, absent when BYOM is off. */
    overlayUrl?: string;
    /** On `not_authorized`: the Code Sync setup deep link for THIS site. */
    setupUrl?: string;
    /**
     * Masked addresses whose grants were lost when the update could not hand them
     * back. Present only in that case — and it needs saying out loud, because
     * nothing in the app can restore them.
     */
    lostGrants?: string[];
    error?: string;
}

export interface RepairSiteConfigParams {
    project: Project;
    configurationService: ConfigurationService;
    /** DA.live IMS token source — the identity the Configuration Service authorizes. */
    tokenProvider: Parameters<typeof pinSiteAdmin>[0];
    logger: Logger;
    /** Pinned as a site admin after a successful write. Skipped when absent. */
    userEmail?: string;
    /** Resolves the BYOM overlay URL for this site; absent means BYOM is off. */
    resolveOverlayUrl: (daLiveOrg: string, daLiveSite: string) => string | undefined;
    onProgress?: (message: string) => void | Promise<void>;
}

/**
 * Repair one storefront's site configuration.
 *
 * Retries a 403 on the propagation backoff unconditionally — unlike the wizard,
 * which only does so for a new repo. A repair is normally invoked seconds after
 * someone granted the role, so propagation is the expected case here, not the
 * unlikely one.
 */
export async function repairSiteConfig(
    params: RepairSiteConfigParams,
): Promise<RepairSiteConfigResult> {
    const {
        project,
        configurationService,
        tokenProvider,
        logger,
        userEmail,
        resolveOverlayUrl,
        onProgress,
    } = params;

    const extracted = extractRepublishParams(project);
    if (!extracted.success) {
        return { status: 'invalid', verified: false, error: extracted.error };
    }
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = extracted;

    const overlayUrl = resolveOverlayUrl(daLiveOrg, daLiveSite);
    const siteParams = buildSiteConfigParams(
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        overlayUrl,
    );

    await onProgress?.(`Re-registering ${repoOwner}/${repoName}...`);

    let outcome;
    try {
        outcome = await registerSiteConfig({
            configurationService,
            siteParams,
            logger,
            retryOn403: true,
            onProgress,
        });
    } catch (error) {
        // A dead DA.live session is a `failed`, not a refusal: retrying changes
        // nothing until the caller re-authenticates, and calling it
        // `not_authorized` would send the user to grant a role they already hold.
        if (error instanceof DaLiveAuthError) {
            return {
                status: 'failed',
                verified: false,
                org: repoOwner,
                site: repoName,
                error: error.message,
                ...(error.lostGrants?.length && { lostGrants: error.lostGrants }),
            };
        }
        throw error;
    }

    if (!outcome.registered) {
        const refused = outcome.statusCode === 403;
        return {
            status: refused ? 'not_authorized' : 'failed',
            verified: false,
            org: repoOwner,
            site: repoName,
            overlayUrl,
            ...(refused && {
                setupUrl: buildCodeSyncSetupUrl({
                    owner: repoOwner,
                    repo: repoName,
                    contentSourceUrl: siteParams.contentSourceUrl,
                    userEmail,
                }),
            }),
            // C: prefer the service's own words. The capture-refusal message
            // ("could not read the current site administrators…") never reached
            // anyone while this synthesized over it.
            error:
                outcome.error ??
                `Configuration Service refused the write (${outcome.statusCode ?? 'unknown'})`,
            // B: the restore is attempted even when the re-register failed, so a
            // FAILED result can carry lost grants too — config gone AND grants
            // gone is the worst outcome in this feature and must not be silent.
            ...(outcome.lostGrants?.length && { lostGrants: outcome.lostGrants }),
        };
    }

    // Same merge-not-replace pin the wizard does, so a repair cannot silently
    // drop the site's other admins.
    await pinSiteAdmin(tokenProvider, { owner: repoOwner, repo: repoName }, userEmail, logger);

    await onProgress?.('Confirming the overlay is registered...');
    const readBack = await configurationService.readSiteOverlayUrl(repoOwner, repoName);

    // With BYOM off there is no overlay to find, so a readable config IS the
    // confirmation. Demanding an overlay would report every non-BYOM storefront
    // as unverified.
    const verified = readBack.readable && (overlayUrl ? Boolean(readBack.overlayUrl) : true);
    if (!verified) {
        logger.warn(
            `[ConfigService] ${repoOwner}/${repoName}: write succeeded but the overlay did not ` +
                'read back — reporting unverified',
        );
    }

    return {
        status: 'repaired',
        verified,
        org: repoOwner,
        site: repoName,
        overlayUrl,
        ...(outcome.lostGrants?.length && { lostGrants: outcome.lostGrants }),
    };
}
