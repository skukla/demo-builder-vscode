/**
 * What updates ONE project has waiting, across every category.
 *
 * The headless counterpart of the QuickPick command's check: it asks the same
 * checker services and returns the minimal selection fields each apply core in
 * `updateApplyService.ts` needs. The MCP `apply_updates` tool reports this set
 * without confirm and hands it to `applyUpdatesHeadless` with it.
 */

import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { getTemplateSource } from '@/features/updates/commands/updateTypes';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import {
    findUninstalledBlockLibraries,
    type BlockLibraryInstallTarget,
} from '@/features/updates/services/blockLibraryInstall';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import {
    findIntegrationPairUpdates,
    type IntegrationPairUpdate,
    type IntegrationUpdateProbe,
} from '@/features/updates/services/integrationUpdates';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { UpdateManager } from '@/features/updates/services/updateManager';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';

/** Minimal, UI-free selection fields each apply core needs. */
export interface UpdateSelections {
    forkSync: Array<{ owner: string; repo: string; branch: string }>;
    template: Array<{ project: Project }>;
    component: Array<{
        project: Project;
        componentId: string;
        latestVersion: string;
        downloadUrl?: string;
    }>;
    adobeMcp: Array<{ project: Project; packageName: string; latestVersion: string }>;
    blockLibrary: Array<{ project: Project; library: InstalledBlockLibrary; latestCommit: string }>;
    /** Selected but not yet in the storefront (EDS-28) — an install, not an update. */
    blockLibraryInstall: BlockLibraryInstallTarget[];
    inspector: Array<{ project: Project; latestCommit: string }>;
    /** Deployed integration pairs (an integration and its ERPs) with newer code (AB-73). */
    integration: IntegrationPairUpdate[];
}

/**
 * Compute available updates for ONE project across all categories, reusing the
 * same checker services the QuickPick command uses. Each category degrades
 * independently — a checker failure logs and yields an empty list rather than
 * aborting the whole computation.
 *
 * @param project - the project to check
 * @param handlerCtx - the handler context the checkers are built from
 * @param integrationProbe - the Integrations screen's check and the guard
 *   chain's org step, bound by the calling boundary (AB-73); this service does
 *   not reach into the dashboard's handlers for it
 */
export async function computeProjectUpdateSelections(
    project: Project,
    handlerCtx: HandlerContext,
    integrationProbe: IntegrationUpdateProbe,
): Promise<UpdateSelections> {
    const { secrets } = handlerCtx.context;
    const logger = handlerCtx.logger;
    const selections: UpdateSelections = {
        forkSync: [],
        template: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [],
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };

    // Fork sync
    try {
        const source = getTemplateSource(project);
        if (source) {
            const status = await new ForkSyncService(secrets, logger).checkForkStatus(
                source.owner,
                source.repo,
            );
            if (status?.isFork && status.behindBy > 0) {
                selections.forkSync.push({
                    owner: source.owner,
                    repo: source.repo,
                    branch: status.defaultBranch || 'main',
                });
            }
        }
    } catch (error) {
        logger.warn(`[Updates] Fork sync check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Template
    try {
        const t = await new TemplateUpdateChecker(secrets, logger).checkForUpdates(project);
        if (t?.hasUpdates) selections.template.push({ project });
    } catch (error) {
        logger.warn(`[Updates] Template check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Components
    try {
        const results = await new UpdateManager(
            handlerCtx.context,
            logger,
        ).checkAllProjectsForUpdates([project]);
        for (const r of results) {
            const outdated = r.outdatedProjects.some((o) => o.project.path === project.path);
            if (outdated && r.releaseInfo?.downloadUrl) {
                selections.component.push({
                    project,
                    componentId: r.componentId,
                    latestVersion: r.latestVersion,
                    downloadUrl: r.releaseInfo.downloadUrl,
                });
            }
        }
    } catch (error) {
        logger.warn(`[Updates] Component check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Adobe MCP
    try {
        const a = await new AdobeMcpUpdateChecker(secrets, logger).checkForUpdates(project);
        if (a?.hasUpdate)
            selections.adobeMcp.push({
                project,
                packageName: a.packageName,
                latestVersion: a.latestVersion,
            });
    } catch (error) {
        logger.warn(`[Updates] Adobe MCP check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Add-ons (block libraries + inspector)
    try {
        const checker = new AddonUpdateChecker(secrets, logger);
        for (const u of await checker.checkBlockLibraries(project)) {
            selections.blockLibrary.push({
                project,
                library: u.library,
                latestCommit: u.latestCommit,
            });
        }
        const insp = await checker.checkInspectorSdk(project);
        if (insp?.hasUpdate)
            selections.inspector.push({ project, latestCommit: insp.latestCommit });
    } catch (error) {
        logger.warn(`[Updates] Add-on check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Block libraries selected but never installed. No network, so no try.
    for (const library of findUninstalledBlockLibraries(project)) {
        selections.blockLibraryInstall.push({ project, library });
    }

    // Integration pairs (AB-73): the Integrations screen's own check, through the
    // probe the boundary bound. Costs nothing for a project with no deployed integration.
    try {
        selections.integration = await findIntegrationPairUpdates([project], integrationProbe);
    } catch (error) {
        logger.warn(`[Updates] Integration check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    return selections;
}

/** Total number of pending updates across a selection set. */
export function countSelections(selections: UpdateSelections): number {
    return (
        selections.forkSync.length +
        selections.template.length +
        selections.component.length +
        selections.adobeMcp.length +
        selections.blockLibrary.length +
        selections.blockLibraryInstall.length +
        selections.inspector.length +
        selections.integration.length
    );
}
