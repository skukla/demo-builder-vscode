/**
 * The reset's last steps: optional CDN verification, optional mesh redeploy, the
 * project record (synced commit, boilerplate, storefront state) and the result.
 *
 * Extracted from `edsResetService` (EDS-8, 2026-10-08) so that file keeps only the
 * orchestration.
 *
 * @module features/eds/services/reset/edsResetFinalize
 */

import { verifyCdnResources } from '../configSyncService';
import { updateStorefrontState } from '../storefront/storefrontStalenessDetector';
import { redeployApiMesh, type MeshRedeployDeps } from './edsResetMeshHelper';
import type { EdsResetParams, EdsResetResult } from './edsResetParams';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StorefrontBoilerplate } from '@/types/projectFile';

/**
 * Record the template commit the repository was reset onto as the storefront's
 * `lastSyncedCommit` — the commit "Check for Updates" compares against. Called only
 * once the reset's own work has succeeded; the save that persists it is the one the
 * reset already makes. An unresolved commit leaves the old record in place rather
 * than writing `undefined` over it.
 */
export function recordSyncedCommit(project: Project, commitSha: string | undefined, logger: Logger): void {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    if (!commitSha || !metadata) {
        logger.warn('[EdsReset] Synced template commit not recorded — update checks may be stale');
        return;
    }
    metadata.lastSyncedCommit = commitSha;
}

/**
 * Record what the repository is built on now (EDS-13f), read back after the
 * reset wrote it. Unread leaves the old record: a failed read is not news.
 */
export function recordBoilerplate(project: Project, boilerplate: StorefrontBoilerplate | undefined): void {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    if (boilerplate && metadata) metadata.boilerplate = boilerplate;
}

/**
 * Final steps: optional CDN verification, optional mesh redeploy, and state persistence.
 */
export async function finalizeReset(
    params: EdsResetParams,
    context: HandlerContext,
    report: (step: number, message: string) => void,
    filesReset: number,
    contentCopied: number,
    deps: MeshRedeployDeps,
    /** False when step 7 could not write the site config — see below. */
    configWritten: boolean,
    /** What the fix pass said about an added demo, from the repo reset (D23, EDS-13f). */
    demo: Pick<EdsResetResult, 'demoCaveats' | 'demoFixes'> = {},
): Promise<EdsResetResult> {
    const { demoCaveats, demoFixes } = demo;
    const { repoOwner, repoName, project, verifyCdn = false, redeployMesh = false } = params;

    if (verifyCdn) {
        report(11, 'Checking the settings');
        const verification = await verifyCdnResources(repoOwner, repoName, context.logger);
        if (verification.configVerified) {
            report(11, 'Settings checked');
            context.logger.info('[EdsReset] config.json verified on CDN');
        } else {
            report(11, 'Waiting for the settings');
            context.logger.warn(
                '[EdsReset] config.json CDN verification timed out - may need more time to propagate',
            );
        }
    }

    if (redeployMesh) {
        const meshResult = await redeployApiMesh(
            project,
            repoOwner,
            repoName,
            context,
            report,
            filesReset,
            contentCopied,
            deps,
        );
        if (meshResult) return meshResult; // Partial success
    }

    // NOTE: passes the project's CURRENT configs, not a snapshot from when
    // config.json was generated earlier in this run. Same latent pattern the
    // republish path hit on 2026-08-10 (see updateStorefrontState) — narrower
    // window here, but fixing it means threading the snapshot through the
    // pipeline. Tracked in .rptc/plans/pdp-prerender-validation/.
    updateStorefrontState(project, project.componentConfigs || {});
    project.edsStorefrontStatusSummary = 'published';
    await context.stateManager.saveProject(project);
    context.logger.info('[EdsReset] EDS project reset successfully');
    // Rides out on a SUCCESSFUL result, like MESH_REDEPLOY_FAILED: the reset did
    // the rest of its work, and calling it a failure would send the user to re-run
    // something that mostly worked. But it must not be silent — the storefront
    // cannot serve product pages until this one write lands.
    return {
        success: true,
        filesReset,
        contentCopied,
        meshRedeployed: redeployMesh,
        ...(demoCaveats?.length ? { demoCaveats } : {}),
        ...(demoFixes ? { demoFixes } : {}),
        ...(configWritten
            ? {}
            : {
                  errorType: 'CONFIG_WRITE_FAILED',
                  error:
                      'The site configuration could not be written, so product detail pages ' +
                      'will not load. Run "Demo Builder: Repair Site Configuration" to finish it.',
              }),
    };
}
