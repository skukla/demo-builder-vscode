/**
 * Every project, as the projects list shows it.
 *
 * The list loads in two places: when the webview asks (`handleGetProjects`) and when
 * a project file or a running creation changes under it (`ShowProjectsListCommand`).
 * Both read through here, so the two cannot disagree about what a project looks like.
 *
 * @module features/projects-dashboard/services/loadProjectsForList
 */

import * as path from 'path';
import { runningCreations, runningWork } from '@/core/state/projectWorkRunning';
import type { Project } from '@/types/base';
import type { StateManager } from '@/types/state';

/** The tile for a creation whose project file does not exist yet. */
function beingCreated(projectPath: string): Project {
    const now = new Date();
    return {
        name: path.basename(projectPath),
        path: projectPath,
        status: 'creating',
        created: now,
        lastModified: now,
    };
}

/**
 * Load every project, read-only (nothing is written back), dropping any that will
 * not load, and show each creation, reset or republish running in this window as
 * `creating`, `resetting` or `republishing` (PL-82).
 *
 * The status is decided here, not read from the file: a project's status is never
 * written to it. An Edge Delivery creation has no file at all until its storefront
 * is set up, so it gets a tile of its own until then.
 *
 * @param stateManager - where the projects are read from
 * @returns the projects in the order the state manager lists them, then any
 *          creation that has no file yet
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
        const work = runningWork(project.path);
        if (work) project.status = work;
        projects.push(project);
    }
    const listed = new Set(projects.map((p) => p.path));
    for (const projectPath of runningCreations()) {
        if (!listed.has(projectPath)) projects.push(beingCreated(projectPath));
    }
    return projects;
}
