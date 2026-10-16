/**
 * Every project, as the projects list shows it.
 *
 * The list loads in two places: when the webview asks (`handleGetProjects`) and when
 * a project file changes under it (`ShowProjectsListCommand`). Both read through
 * here, so the two cannot disagree about what a project looks like.
 *
 * @module features/projects-dashboard/services/loadProjectsForList
 */

import { isCreationRunning } from '@/core/state/creationsRunning';
import type { Project } from '@/types/base';
import type { StateManager } from '@/types/state';

/**
 * Load every project, read-only (nothing is written back), dropping any that will
 * not load.
 *
 * A project still marked `creating` whose creation is not running in this window
 * failed or was cut off, so it is shown as `error` rather than as being created
 * forever (PL-82). Only the copy shown changes; the file is left as it is.
 *
 * @param stateManager - where the projects are read from
 * @returns the projects, in the order the state manager lists them
 */
export async function loadProjectsForList(
    stateManager: Pick<StateManager, 'getAllProjects' | 'loadProjectFromPath'>,
): Promise<Project[]> {
    const projects: Project[] = [];
    for (const item of await stateManager.getAllProjects()) {
        const project = await stateManager.loadProjectFromPath(item.path, undefined, {
            persistAfterLoad: false,
        });
        if (!project) continue;
        if (project.status === 'creating' && !isCreationRunning(project.path)) {
            project.status = 'error';
        }
        projects.push(project);
    }
    return projects;
}
