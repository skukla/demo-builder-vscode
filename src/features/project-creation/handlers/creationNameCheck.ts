/**
 * Whether a project may be created under a name: one check for every door.
 *
 * Creation's first step removes whatever folder already has the new project's
 * name (`cleanupOrphanedDirectory`), so this check is what stands between a
 * repeated name and a deleted project. The wizard ran it; the agent's
 * `create_project` did not, so an agent reusing a name deleted that project, and a
 * name with `..` in it reached outside the projects folder (AI-73, 2026-10-16).
 *
 * @module features/project-creation/handlers/creationNameCheck
 */

import { validateProjectNameSecurity } from '@/core/validation/validators/ProjectNameValidator';
import type { StateManager } from '@/types/state';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** Why a name was refused: the short line, and the line that says what to do. */
interface NameProblem {
    summary: string;
    detail: string;
    /** The validator's error, when the name itself is unsafe. */
    invalid?: Error;
    /** The project that already has the name, when it is taken. */
    takenBy?: string;
}

/**
 * Refuse a name that is unsafe or already a project's.
 *
 * An edit may keep its own project's name; nothing else may reuse one.
 *
 * @param stateManager - where the existing projects are listed
 * @param config - the creation request (its name, and the edited project's path if any)
 * @returns the problem, or undefined when the name may be used
 */
export async function projectNameProblem(
    stateManager: Pick<StateManager, 'getAllProjects'>,
    config: Pick<ProjectCreationConfig, 'projectName' | 'editProjectPath'>,
): Promise<NameProblem | undefined> {
    try {
        validateProjectNameSecurity(config.projectName);
    } catch (error) {
        const invalid = error instanceof Error ? error : new Error(String(error));
        const summary = `Invalid project name: ${invalid.message}`;
        return { summary, detail: summary, invalid };
    }
    const taken = (await stateManager.getAllProjects()).find(
        (p) => p.name === config.projectName && p.path !== config.editProjectPath,
    );
    if (!taken) return undefined;
    return {
        takenBy: taken.path,
        summary: `Project "${config.projectName}" already exists`,
        detail:
            `Project "${config.projectName}" already exists. ` +
            'Please choose a different name or delete the existing project first.',
    };
}
