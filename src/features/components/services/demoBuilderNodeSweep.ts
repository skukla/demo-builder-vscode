/**
 * Converge every project's installed components onto Demo Builder's Node, one of the
 * activation upkeep sweeps (PR-1a step 9, owner 2026-10-07).
 *
 * The only thing that ever puts an installed component behind is a release that moves
 * Demo Builder's Node, so this runs on the activation path and Start never has to ask.
 * Like the other sweeps it decides from what is on disk, not from a record of its own
 * last run: when the Node is ready and nothing is behind it does nothing and shows
 * nothing. Otherwise it prepares the Node (with the Adobe CLI) and reinstalls each
 * component recorded under another Node, moving its record. Safe by construction: the
 * release check (`npm run node:resolve -- --check`, a `cut-release` precondition)
 * stops a release whose components do not all accept the new Node.
 *
 * Left alone: a custom integration's component that carries its own Node, a component
 * with no record (it reads as the current Node), every component of a project whose
 * demo is running (it catches up next activation), and every project when there are
 * none yet (a new SC's prerequisites prepare the Node). A failed reinstall keeps its
 * old record, so it goes on running on the old Node, which still works.
 *
 * UI-free: the progress surface and every collaborator arrive in `deps`, and the
 * glue (`extension.ts`, `sweepDemoBuilderNode`) runs it in the sequential upkeep chain.
 *
 * @module features/components/services/demoBuilderNodeSweep
 */

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { stageLine } from '@/core/utils/stageLine';
import type { ComponentInstance, Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { OperationPosition } from '@/types/webviewPayloads';

export interface NodeSweepDeps {
    projects: Project[];
    /** Demo Builder's Node (`demoBuilderNode()`). */
    node: string;
    /** The Node is in Demo Builder's Node folder with the Adobe CLI under it. */
    nodeReady: () => Promise<boolean>;
    /** Make the Node available with the Adobe CLI under it; an error string, or undefined. */
    ensureNode: (major: string) => Promise<string | undefined>;
    /** Reinstall one component's packages (and its build step) on `major`. */
    reinstall: (componentId: string, component: ComponentInstance, major: string) => Promise<string | undefined>;
    /** Persists a project whose records moved. Only called for changed ones. */
    saveProject: (project: Project) => Promise<void>;
    /** Runs the work behind the progress notification; `report` writes one line. */
    withProgress: <T>(title: string, run: (report: (line: string) => void) => Promise<T>) => Promise<T>;
    log: (line: string) => void;
}

export interface NodeSweepResult {
    /** Nothing was needed, so nothing ran and nothing was shown. */
    ran: boolean;
    /** The Node could not be prepared; nothing moved. */
    nodeError?: string;
    moved: string[];
    failed: Array<{ component: string; error: string }>;
    /** Projects left for later because their demo is running. */
    running: string[];
}

/** A component the catalog does not define (an App Builder one): it needs only its packages. */
export function bareDefinition(componentId: string, component: ComponentInstance): TransformedComponentDefinition {
    return { id: componentId, name: component.name || componentId, type: 'app-builder' };
}

/** The components of `project` recorded under a Node other than `node`, that may move. */
function componentsBehind(project: Project, node: string): Array<[string, ComponentInstance]> {
    return Object.entries(project.componentInstances ?? {}).filter(([id, component]) => {
        const recorded = component.metadata?.nodeVersion;
        const ownNode = project.appBuilderComponents?.[id]?.nodeVersion;
        return typeof recorded === 'string' && recorded !== node && !ownNode;
    });
}

/** Reinstall one project's components that are behind; log the detail, show only the stage. */
async function moveProject(
    project: Project,
    deps: NodeSweepDeps,
    show: (position: OperationPosition) => void,
    counter: { index: number; total: number },
    result: NodeSweepResult,
): Promise<void> {
    let changed = false;
    for (const [id, component] of componentsBehind(project, deps.node)) {
        counter.index += 1;
        show({ index: counter.index, total: counter.total });
        const label = `${project.name}: ${component.name || id}`;
        deps.log(`Reinstalling ${label} on Node ${deps.node}`);
        const error = await deps.reinstall(id, component, deps.node);
        if (error) {
            result.failed.push({ component: label, error });
            deps.log(`Could not reinstall ${label} on Node ${deps.node}; it still runs on its old Node: ${error}`);
            continue;
        }
        component.metadata = { ...component.metadata, nodeVersion: deps.node };
        result.moved.push(label);
        changed = true;
    }
    if (changed) await deps.saveProject(project);
}

/**
 * Prepare Demo Builder's Node and move every project's components onto it, when
 * anything needs it. The notification shows only the stage and a count (handbook:
 * the stage name alone, 25 characters at most); which component, and any error,
 * go to the log.
 *
 * @returns what ran, what moved, what failed and why, and which projects were running
 */
export async function sweepOntoDemoBuilderNode(deps: NodeSweepDeps): Promise<NodeSweepResult> {
    const result: NodeSweepResult = { ran: false, moved: [], failed: [], running: [] };
    if (deps.projects.length === 0) return result;
    const behind = deps.projects.filter((project) => componentsBehind(project, deps.node).length > 0);
    if (behind.length === 0 && (await deps.nodeReady())) return result;

    return deps.withProgress(`Updating to Node ${deps.node}`, async (progress) => {
        result.ran = true;
        progress(OPERATION_STAGES.preparingNode.label);
        const nodeError = await deps.ensureNode(deps.node);
        if (nodeError) {
            deps.log(`Could not prepare Node ${deps.node}: ${nodeError}`);
            return { ...result, nodeError };
        }
        const stopped = behind.filter((project) => {
            if (project.status !== 'running') return true;
            result.running.push(project.name);
            deps.log(`${project.name} is running; it moves to Node ${deps.node} after it stops`);
            return false;
        });
        const counter = {
            index: 0,
            total: stopped.reduce((sum, project) => sum + componentsBehind(project, deps.node).length, 0),
        };
        const show = (position: OperationPosition) =>
            progress(stageLine(OPERATION_STAGES.reinstallingPackages.label, position));
        for (const project of stopped) {
            await moveProject(project, deps, show, counter, result);
        }
        return result;
    });
}
