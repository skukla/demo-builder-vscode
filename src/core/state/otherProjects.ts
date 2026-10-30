/**
 * Every local project but one, as the projects list reads them: the directory scan, then each
 * manifest through the project loader, never saved back.
 *
 * In `core/` because three features ask "does another project on this machine already hold
 * this?" (an ERP pair, an ERP on the same Commerce, a website a demo-data wipe would clear), and
 * its old home, a dashboard handler module, pulled that handler's whole dependency graph into
 * every service that only wanted the list.
 *
 * @module core/state/otherProjects
 */

import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';

/** What the loader needs from whoever holds the state manager (a handler context passes as-is). */
interface ProjectsSource {
    stateManager: Pick<StateManager, 'getAllProjects' | 'loadProjectFromPath'>;
}

/**
 * Every local project but one, loaded with `persistAfterLoad: false`: nothing is written, and the
 * saved current-project pointer does not move. This window's in-memory copy of the current project
 * is reassigned by each load; `StateManager.getCurrentProject` reads the saved pointer on every
 * call, so it answers the right project regardless.
 *
 * @param source - anything carrying the state manager (a handler context)
 * @param excludePath - the project to leave out; undefined loads them all
 * @returns the loaded projects; a manifest that does not load is left out
 */
export async function loadOtherProjects(source: ProjectsSource, excludePath: string | undefined): Promise<Project[]> {
    const summaries = await source.stateManager.getAllProjects();
    const loaded = await Promise.all(
        summaries
            .filter((summary) => summary.path !== excludePath)
            .map((summary) => source.stateManager.loadProjectFromPath(summary.path, undefined, { persistAfterLoad: false })),
    );
    return loaded.filter((other): other is Project => other !== null);
}
