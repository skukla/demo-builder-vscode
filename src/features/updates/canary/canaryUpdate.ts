/**
 * Bring the patch canary's storefront up to the tested boilerplate version, with the
 * extension's OWN update code (EDS-49 step B).
 *
 * The canary (`skukla/eds-demo-patches`, `canary.yml`) checks that the patched
 * storefront still behaves. For that to answer "does an SC's storefront still work
 * after Check for Updates?", the canary has to take the update the way an SC's
 * project does. A second copy of the update logic in the patches repo would drift
 * and test the copy, so this runs `TemplateSyncService` itself: the same merge to the
 * tested (LKG) version, the same patch re-apply, the same restore of Demo Builder's
 * pieces, outside VS Code.
 *
 * The canary has no project file in CI, so its record is built here from the bundled
 * demo-package catalog, the same source creation reads.
 *
 * @module features/updates/canary/canaryUpdate
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { resolveStorefrontConfig } from '@/features/eds/services/reset/edsResetParams';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { GitHubAccess, TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** Which storefront the canary is, and the version it was last brought to. */
export interface CanaryInputs {
    /** The canary's GitHub repository, `owner/name`. */
    repo: string;
    /** Demo package and stack it was created from (`starter`, `eds-accs`). */
    packageId: string;
    stackId: string;
    daLiveOrg: string;
    daLiveSite: string;
    /** The template commit the canary last matched (the canary's recorded version). */
    lastSynced: string;
}

/**
 * The canary's project record: what an SC's project would record for the same
 * package and stack, with the canary's repository and recorded version.
 *
 * @throws Error when the package and stack name no thin-layer storefront: the canary
 *         exists to test the tested-version update, which a plain fork never takes.
 */
export function canaryProject(inputs: CanaryInputs): Project {
    const now = new Date();
    const project: Project = {
        name: 'patch-canary',
        path: '/canary',
        status: 'ready',
        created: now,
        lastModified: now,
        selectedPackage: inputs.packageId,
        selectedStack: inputs.stackId,
        componentInstances: {},
    };
    const { templateOwner, templateRepo, codePatchSource } = resolveStorefrontConfig(project);
    if (!templateOwner || !templateRepo || !codePatchSource) {
        throw new Error(
            `${inputs.packageId}/${inputs.stackId} is not a thin-layer storefront (no template or patch source)`,
        );
    }
    const lkgSource = {
        owner: codePatchSource.owner,
        repo: codePatchSource.repo,
        ...(codePatchSource.lkgFile ? { lkgFile: codePatchSource.lkgFile } : {}),
    };
    project.componentInstances = {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            id: COMPONENT_IDS.EDS_STOREFRONT,
            name: 'EDS Storefront',
            type: 'frontend',
            status: 'ready',
            metadata: {
                githubRepo: inputs.repo,
                templateOwner,
                templateRepo,
                lastSyncedCommit: inputs.lastSynced,
                lkgSource,
                daLiveOrg: inputs.daLiveOrg,
                daLiveSite: inputs.daLiveSite,
            },
        },
    };
    return project;
}

/** What the update needs: GitHub, a logger, and something that runs git. */
export interface CanaryUpdateDeps {
    github: GitHubAccess;
    logger: Logger;
    executor: Pick<CommandExecutor, 'execute'>;
}

/**
 * Run an SC's template update on the canary.
 *
 * @returns the sync's result: on success `syncedCommit` is the version to record
 */
export async function runCanaryUpdate(
    inputs: CanaryInputs,
    deps: CanaryUpdateDeps,
): Promise<TemplateSyncResult> {
    const service = new TemplateSyncService(deps.github, deps.logger, deps.executor);
    return service.syncWithTemplate(canaryProject(inputs), { strategy: 'merge' });
}
