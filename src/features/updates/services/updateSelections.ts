/**
 * What updates are waiting, across every category: for one project (the MCP
 * `apply_updates` tool, which reports this set without confirm and hands it to
 * `applyUpdatesHeadless` with it) or for every project (Check for Updates' modal,
 * through `allUpdates.ts`). It asks the checker services and returns the selection
 * fields each apply core in `updateApplyService.ts` needs.
 */

import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import {
    findUninstalledBlockLibraries,
    type BlockLibraryInstallTarget,
} from '@/features/updates/services/blockLibraryInstall';
import { checkBoilerplate, type BoilerplateUpdate } from '@/features/updates/services/boilerplateCheck';
import { createBoilerplateGitHub } from '@/features/updates/services/boilerplateGitHub';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import {
    findIntegrationPairUpdates,
    type IntegrationPairUpdate,
    type IntegrationUpdateProbe,
} from '@/features/updates/services/integrationUpdates';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { UpdateManager } from '@/features/updates/services/updateManager';
import { getTemplateSource } from '@/features/updates/services/updateSources';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';

/**
 * Minimal, UI-free selection fields each apply core needs, plus two a person reads before
 * applying: the version now (`currentVersion`) and a fork's upstream (`parentFullName`).
 * The apply cores ignore those; the Updates modal (PL-80) shows them.
 */
export interface UpdateSelections {
    forkSync: Array<{
        owner: string;
        repo: string;
        branch: string;
        parentFullName?: string;
    }>;
    template: Array<{ project: Project }>;
    /**
     * A colleague's storefront whose Adobe half can move to our tested version (EDS-56),
     * beside its `template` entry, which follows the colleague's own repository.
     */
    boilerplate: BoilerplateUpdate[];
    component: Array<{
        project: Project;
        componentId: string;
        latestVersion: string;
        downloadUrl?: string;
        currentVersion?: string;
    }>;
    adobeMcp: Array<{
        project: Project;
        packageName: string;
        latestVersion: string;
        currentVersion?: string;
    }>;
    blockLibrary: Array<{
        project: Project;
        library: InstalledBlockLibrary;
        latestCommit: string;
    }>;
    /** Selected but not yet in the storefront (EDS-28) — an install, not an update. */
    blockLibraryInstall: BlockLibraryInstallTarget[];
    inspector: Array<{ project: Project; latestCommit: string }>;
    /** Deployed integration pairs (an integration and its ERPs) with newer code (AB-73). */
    integration: IntegrationPairUpdate[];
}

/**
 * Compute available updates for ONE project across all categories: the multi-project
 * check with one project. Each category degrades independently — a checker failure
 * logs and yields an empty list rather than aborting the whole computation.
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
    return computeUpdateSelections([project], handlerCtx, integrationProbe);
}

/**
 * Compute available updates for several projects across all categories (PL-80): what
 * Check for Updates offers, and, with one project, what the agent's `apply_updates`
 * reports. A template repository two projects share is one fork sync; components are
 * asked about in one call; a checker that fails for one project costs that project's
 * answer in that category only, with one warning.
 *
 * @param projects - the projects to check, in the order their updates are listed
 * @param handlerCtx - the handler context the checkers are built from
 * @param integrationProbe - see {@link computeProjectUpdateSelections}
 * @returns every pending update, each carrying its project
 */
export async function computeUpdateSelections(
    projects: Project[],
    handlerCtx: HandlerContext,
    integrationProbe: IntegrationUpdateProbe,
): Promise<UpdateSelections> {
    const check: Check = { secrets: handlerCtx.context.secrets, logger: handlerCtx.logger };
    // Started first and awaited last: each deployed pair costs a git fetch per clone, so it
    // runs alongside the GitHub checks below instead of after them. It cannot reject.
    const integration = checkIntegrations(projects, integrationProbe, handlerCtx.logger);
    const addons = await checkAddons(projects, check);
    return {
        forkSync: await checkForkSyncs(projects, check),
        template: await checkTemplates(projects, check),
        boilerplate: await checkAdobeBoilerplate(projects, check, handlerCtx),
        component: await checkComponents(projects, handlerCtx),
        adobeMcp: await checkAdobeMcp(projects, check),
        blockLibrary: addons.blockLibrary,
        // Selected but never installed. No network, so no try.
        blockLibraryInstall: projects.flatMap((project) =>
            findUninstalledBlockLibraries(project).map((library) => ({ project, library })),
        ),
        inspector: addons.inspector,
        integration: await integration,
    };
}

/** What every checker is built from. */
interface Check {
    secrets: HandlerContext['context']['secrets'];
    logger: HandlerContext['logger'];
}

function warnFailed(logger: Check['logger'], what: string, error: unknown): void {
    logger.warn(`[Updates] ${what} check failed: ${sanitizeErrorForLogging(error as Error)}`);
}

async function checkForkSyncs(
    projects: Project[],
    { secrets, logger }: Check,
): Promise<UpdateSelections['forkSync']> {
    const found: UpdateSelections['forkSync'] = [];
    const asked = new Set<string>();
    const service = projects.length > 0 ? new ForkSyncService(secrets, logger) : undefined;
    for (const project of projects) {
        const source = getTemplateSource(project);
        const key = source ? `${source.owner}/${source.repo}`.toLowerCase() : '';
        if (!source || !service || asked.has(key)) continue;
        asked.add(key);
        try {
            const status = await service.checkForkStatus(source.owner, source.repo);
            // Only the SC's own repository. For an added demo the template source is the
            // colleague's repository; merging upstream into it would write to someone else's.
            if (status?.isFork && status.isYours && status.behindBy > 0) {
                found.push({
                    owner: source.owner,
                    repo: source.repo,
                    branch: status.defaultBranch || 'main',
                    parentFullName: status.parentFullName,
                });
            }
        } catch (error) {
            warnFailed(logger, 'Fork sync', error);
        }
    }
    return found;
}

/** The Adobe boilerplate check (EDS-56); a failure costs this category only, with one warning. */
async function checkAdobeBoilerplate(
    projects: Project[],
    check: Check,
    handlerCtx: HandlerContext,
): Promise<UpdateSelections['boilerplate']> {
    try {
        return await checkBoilerplate(projects, {
            secrets: check.secrets,
            logger: handlerCtx.logger,
            github: createBoilerplateGitHub(check.secrets),
            save: (project) => handlerCtx.stateManager.saveProject(project),
        });
    } catch (error) {
        warnFailed(check.logger, 'Adobe boilerplate', error);
        return [];
    }
}

async function checkTemplates(
    projects: Project[],
    { secrets, logger }: Check,
): Promise<UpdateSelections['template']> {
    const found: UpdateSelections['template'] = [];
    const checker = projects.length > 0 ? new TemplateUpdateChecker(secrets, logger) : undefined;
    for (const project of projects) {
        try {
            const t = await checker?.checkForUpdates(project);
            if (t?.hasUpdates) found.push({ project });
        } catch (error) {
            warnFailed(logger, 'Template', error);
        }
    }
    return found;
}

async function checkComponents(
    projects: Project[],
    handlerCtx: HandlerContext,
): Promise<UpdateSelections['component']> {
    if (projects.length === 0) return [];
    try {
        const results = await new UpdateManager(
            handlerCtx.context,
            handlerCtx.logger,
        ).checkAllProjectsForUpdates(projects);
        const asked = new Set(projects.map((p) => p.path));
        return results.flatMap((r) => {
            const downloadUrl = r.releaseInfo?.downloadUrl;
            if (!downloadUrl) return [];
            return r.outdatedProjects
                .filter((o) => asked.has(o.project.path))
                .map((o) => ({
                    project: o.project,
                    componentId: r.componentId,
                    latestVersion: r.latestVersion,
                    downloadUrl,
                    currentVersion: o.currentVersion,
                }));
        });
    } catch (error) {
        warnFailed(handlerCtx.logger, 'Component', error);
        return [];
    }
}

async function checkAdobeMcp(
    projects: Project[],
    { logger }: Check,
): Promise<UpdateSelections['adobeMcp']> {
    const found: UpdateSelections['adobeMcp'] = [];
    const checker = projects.length > 0 ? new AdobeMcpUpdateChecker(logger) : undefined;
    for (const project of projects) {
        try {
            const a = await checker?.checkForUpdates(project);
            if (a?.hasUpdate) {
                found.push({
                    project,
                    packageName: a.packageName,
                    latestVersion: a.latestVersion,
                    currentVersion: a.currentVersion,
                });
            }
        } catch (error) {
            warnFailed(logger, 'Adobe MCP', error);
        }
    }
    return found;
}

/** Block libraries and the inspector SDK: one checker, one failure per project costs both. */
async function checkAddons(
    projects: Project[],
    { secrets, logger }: Check,
): Promise<Pick<UpdateSelections, 'blockLibrary' | 'inspector'>> {
    const found: Pick<UpdateSelections, 'blockLibrary' | 'inspector'> = {
        blockLibrary: [],
        inspector: [],
    };
    const checker = projects.length > 0 ? new AddonUpdateChecker(secrets, logger) : undefined;
    for (const project of projects) {
        if (!checker) break;
        try {
            const libraries = (await checker.checkBlockLibraries(project)).map((u) => ({
                project,
                library: u.library,
                latestCommit: u.latestCommit,
            }));
            const insp = await checker.checkInspectorSdk(project);
            found.blockLibrary.push(...libraries);
            if (insp?.hasUpdate) {
                found.inspector.push({ project, latestCommit: insp.latestCommit });
            }
        } catch (error) {
            warnFailed(logger, 'Add-on', error);
        }
    }
    return found;
}

/**
 * Integration pairs (AB-73): the Integrations screen's own check, through the probe the
 * boundary bound. Costs nothing for a project with no deployed integration.
 */
async function checkIntegrations(
    projects: Project[],
    probe: IntegrationUpdateProbe,
    logger: Check['logger'],
): Promise<UpdateSelections['integration']> {
    try {
        return await findIntegrationPairUpdates(projects, probe);
    } catch (error) {
        warnFailed(logger, 'Integration', error);
        return [];
    }
}

/** Total number of pending updates across a selection set. */
export function countSelections(selections: UpdateSelections): number {
    return (
        selections.forkSync.length +
        selections.template.length +
        selections.boilerplate.length +
        selections.component.length +
        selections.adobeMcp.length +
        selections.blockLibrary.length +
        selections.blockLibraryInstall.length +
        selections.inspector.length +
        selections.integration.length
    );
}
