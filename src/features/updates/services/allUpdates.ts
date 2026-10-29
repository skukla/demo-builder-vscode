/**
 * Every update waiting on this computer (PL-80): the extension's own, and each project's.
 *
 * What the Updates modal lists and what the background check counts. Projects are read
 * from disk without saving (`persistAfterLoad: false`): a check must never write a
 * project file.
 *
 * @module features/updates/services/allUpdates
 */

import type { IntegrationUpdateProbe } from './integrationUpdates';
import type { UpdateCheckResult } from './types';
import { UpdateManager } from './updateManager';
import { computeUpdateSelections, countSelections, type UpdateSelections } from './updateSelections';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** One check of everything. */
export interface FoundUpdates {
    selections: UpdateSelections;
    /** The extension's own update, only when there is one. */
    extension?: UpdateCheckResult;
    /** The open project, listed first. */
    currentProjectPath?: string;
    /** Every update, the extension's included. */
    count: number;
}

/**
 * Check the extension and every project.
 *
 * @param handlerCtx - the context the checkers are built from
 * @param integrationProbe - the Integrations screen's check, bound by the boundary
 * @returns what is waiting
 */
export async function findAllUpdates(
    handlerCtx: HandlerContext,
    integrationProbe: IntegrationUpdateProbe,
): Promise<FoundUpdates> {
    const extensionCheck = await new UpdateManager(handlerCtx.context, handlerCtx.logger).checkExtensionUpdate();
    const extension = extensionCheck.hasUpdate ? extensionCheck : undefined;
    const projects = await loadEveryProject(handlerCtx.stateManager);
    const current = await handlerCtx.stateManager.getCurrentProject();
    const selections = await computeUpdateSelections(projects, handlerCtx, integrationProbe);
    return {
        selections,
        extension,
        currentProjectPath: current?.path,
        count: countSelections(selections) + (extension ? 1 : 0),
    };
}

async function loadEveryProject(stateManager: HandlerContext['stateManager']): Promise<Project[]> {
    const projects: Project[] = [];
    for (const meta of await stateManager.getAllProjects()) {
        const project = await stateManager.loadProjectFromPath(meta.path, undefined, { persistAfterLoad: false });
        if (project) projects.push(project);
    }
    return projects;
}
