/**
 * Move installed components to Demo Builder's Node when a release moves it (PR-1a
 * step 9, owner 2026-10-07).
 *
 * The only thing that ever puts an installed component behind is a release that moves
 * Demo Builder's Node, so this runs at that moment, in the background, and Start never
 * has to ask. For every known project it reinstalls the packages of each component
 * recorded under another Node and rewrites the record. Safe by construction: the
 * release check guarantees every shipped component accepts the new Node.
 *
 * Left alone: a component of an SC's own repo that carries its own Node, a component
 * with no record (it reads as the current Node), and every component of a project whose
 * demo is running (it catches up at the next activation). A failed reinstall keeps its
 * old record, so it goes on running on the old Node, which still works.
 *
 * Pure orchestration: every collaborator arrives in `deps` (`nodeMigrationDeps.ts`).
 *
 * @module features/components/services/nodeMigration
 */

import type { ComponentInstance, Project } from '@/types/base';

export interface NodeMigrationDeps {
    /** Every project Demo Builder knows about, read without opening any. */
    knownProjects(): Promise<Project[]>;
    /** Make the Node available with the Adobe CLI under it; an error string, or undefined. */
    ensureNode(major: string): Promise<string | undefined>;
    /** Reinstall one component's packages (and its build step) on `major`. */
    reinstall(project: Project, componentId: string, component: ComponentInstance, major: string): Promise<string | undefined>;
    /** Persist a changed project without opening it. */
    saveProject(project: Project): Promise<void>;
    /** One step, for the progress notification and User Logs. */
    report(line: string): void;
}

export interface NodeMigrationResult {
    /** The Node could not be prepared; nothing moved. */
    nodeError?: string;
    moved: string[];
    failed: Array<{ component: string; error: string }>;
    /** Projects left for later because their demo is running. */
    running: string[];
}

/** The components of `project` recorded under a Node other than `major`, that may move. */
function componentsBehind(project: Project, major: string): Array<[string, ComponentInstance]> {
    return Object.entries(project.componentInstances ?? {}).filter(([id, component]) => {
        const recorded = component.metadata?.nodeVersion;
        const ownNode = project.appBuilderComponents?.[id]?.nodeVersion;
        return typeof recorded === 'string' && recorded !== major && !ownNode;
    });
}

async function moveProject(project: Project, major: string, deps: NodeMigrationDeps, result: NodeMigrationResult) {
    let changed = false;
    for (const [id, component] of componentsBehind(project, major)) {
        const label = `${project.name}: ${component.name ?? id}`;
        deps.report(`Moving ${label} to Node ${major}`);
        const error = await deps.reinstall(project, id, component, major);
        if (error) {
            result.failed.push({ component: label, error });
            deps.report(`Could not move ${label} to Node ${major}; it still runs on its old Node: ${error}`);
            continue;
        }
        component.metadata = { ...component.metadata, nodeVersion: major };
        result.moved.push(label);
        changed = true;
    }
    if (changed) await deps.saveProject(project);
}

/**
 * Prepare `major` (with the Adobe CLI), then move every known project's components to it.
 *
 * @returns what moved, what failed and why, and which projects were left running
 */
export async function moveInstalledComponentsToNode(major: string, deps: NodeMigrationDeps): Promise<NodeMigrationResult> {
    const result: NodeMigrationResult = { moved: [], failed: [], running: [] };
    // First, and whether or not anything is behind: the new Node is what every command
    // now runs on, so it is prepared here rather than in the middle of someone's demo.
    deps.report(`Preparing Node ${major}`);
    const nodeError = await deps.ensureNode(major);
    if (nodeError) return { ...result, nodeError };

    const projects = (await deps.knownProjects()).filter((project) => componentsBehind(project, major).length > 0);

    for (const project of projects) {
        if (project.status === 'running') {
            result.running.push(project.name);
            deps.report(`${project.name} is running; it moves to Node ${major} after it stops`);
            continue;
        }
        await moveProject(project, major, deps, result);
    }
    return result;
}
