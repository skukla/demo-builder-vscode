/**
 * The runner's ERP collaborators: filling, listing, detaching and wiping the ERPs
 * an integration serves, wired as `AppBuilderComponentRunnerDeps` entries.
 *
 * Split from `appBuilderComponentRunnerDeps.ts` on 2026-09-30 when that factory
 * crossed the service size limit: the ERP pair grew six entries there (fill on
 * install, the list on add, remove and deploy, the undo and the wipe on remove,
 * the events credential on deploy) and they change together, for the ERP's
 * reasons, not the runner's. The runner itself knows nothing of ERPs; it calls
 * these by their generic names (`fillSystem`, `unlistSystem`, …).
 *
 * @module features/project-creation/services/erpRunnerDeps
 */

import type { AppBuilderComponentRunnerDeps } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { erpCredentialReader } from '@/features/app-builder/services/erpCredential';
import { detachErpWrites } from '@/features/app-builder/services/erpDetach';
import { erpEventsEnvResolver } from '@/features/app-builder/services/erpEventsDelivery';
import { wipeSystemRecords } from '@/features/app-builder/services/systemRecordsWipe';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    fillEveryErp,
    summarizeFills,
} from '@/features/project-creation/services/erpFillForProject';
import { syncErpList, unlistErp } from '@/features/project-creation/services/erpListSync';
import type { Project } from '@/types/base';

/** What the ERP deps need from the host: a subset of `RunnerDepsContext`, by structure. */
export type ErpRunnerContext = Parameters<typeof erpEventsEnvResolver>[0] & {
    authManager: AuthenticationService;
    getCachedOrganization: () => Parameters<typeof erpCredentialReader>[2];
    commandManager: Parameters<typeof erpCredentialReader>[0];
};

/** The signed-in identity every per-app call carries, built per project. */
export type AuthFor = (project: Project) => () => Promise<AppManagementAuth | undefined>;

type ErpDeps = Pick<
    AppBuilderComponentRunnerDeps,
    | 'fillSystem'
    | 'unlistSystem'
    | 'listSystems'
    | 'detachFromCommerce'
    | 'wipeSystemRecords'
    | 'resolveEventsEnv'
>;

/**
 * The ERP entries of the runner's deps.
 *
 * @param ctx - the host context (auth, command runner, cached org, secrets, logger)
 * @param authFor - the identity a call carries, per project
 * @param onProgress - where the wipe's steps go
 */
export function erpRunnerDeps(
    ctx: ErpRunnerContext,
    authFor: AuthFor,
    onProgress?: AppBuilderComponentRunnerDeps['onProgress'],
): ErpDeps {
    return {
        // Every ERP is filled once the install stands (AB-26y); an added one leaves the list first (AB-16).
        fillSystem: async (project, entry, onStep) =>
            summarizeFills(
                await fillEveryErp(project, entry.id, {
                    authManager: ctx.authManager,
                    getAuth: authFor(project),
                    onProgress: onStep,
                }),
            ),
        unlistSystem: async (project, integrationId, erpId) =>
            unlistErp(project, integrationId, erpId, await authFor(project)()),
        // After an integration or one of its ERPs deploys, the integration is sent the list
        // again, each added ERP with the credential its own workspace answers (AB-51).
        listSystems: async (project, integrationId) => {
            const outcome = await syncErpList(project, integrationId, await authFor(project)(), {
                readCredential: erpCredentialReader(
                    ctx.commandManager,
                    project,
                    ctx.getCachedOrganization(),
                ),
            });
            return outcome.status === 'failed' ? outcome.detail : undefined;
        },
        // The clean-ups ahead of a remove (appBuilderComponentTeardown): first the ERP
        // integration's undo of its Commerce writes …
        detachFromCommerce: (project, deployedUrls, detachProgress) =>
            detachErpWrites(deployedUrls, {
                getAuth: authFor(project),
                onProgress: detachProgress,
            }),
        // … and a system's records, deleted while its wipe action still exists.
        wipeSystemRecords: (project, entry, deployedUrls, name) =>
            wipeSystemRecords(entry, deployedUrls, name, { getAuth: authFor(project), onProgress }),
        resolveEventsEnv: erpEventsEnvResolver(ctx),
    };
}
