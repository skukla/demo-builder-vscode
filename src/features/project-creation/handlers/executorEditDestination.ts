/**
 * Project Creation — an Edit that moves the project to another Adobe project or
 * workspace, in the same org (PL-75).
 *
 * The rebuild deployed every integration again at the new destination and left the
 * old deployments running. Now Finish runs the Integrations screen's own move
 * (`applyDestination`): it records the new destination and moves each integration
 * and the mesh there, and, when the Adobe project changes, takes an integration
 * with a workspace of its own out of the one it leaves. That one is asked about
 * first, with the screen's own question, before anything in the Edit runs.
 *
 * @module features/project-creation/handlers/executorEditDestination
 */

import type { ProgressTracker } from './shared';
import { applyDestination } from '@/features/dashboard/handlers/destinationHandlers';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { DestinationRef, ProjectCreationConfig } from '@/types/webviewRequests';

type Ref = DestinationRef & { id: string };

/** Asks before a move that takes integrations out of the Adobe project they are in. */
export type AskLeaveAdobeProject = (project: Project, next: Ref) => Promise<boolean>;

/** Where the Edit moves the project, decided before anything runs. */
export type DestinationPlan = { moves: false } | { moves: true; project: Ref; workspace: Ref; target: string };

/**
 * Decide the move, and ask the screen's question about it now.
 *
 * @param project - the project as it was before the Edit
 * @param config - what Finish was given
 * @param changes - the changed choices (`editChanges`)
 * @param removed - integrations this Edit removes first: they are not moved, so not asked about
 * @param ask - the question (the Integrations screen's own, in production)
 * @returns the plan
 * @throws when the SC declines, or the wizard sent half a destination
 */
export async function planDestinationChange(
    project: Project,
    config: ProjectCreationConfig,
    changes: readonly string[],
    removed: readonly string[],
    ask: AskLeaveAdobeProject,
): Promise<DestinationPlan> {
    if (!changes.includes('adobeProject') && !changes.includes('adobeWorkspace')) return { moves: false };
    const adobe = config.adobe;
    if (!adobe?.projectId || !adobe.workspace) {
        throw new Error('A destination needs both an Adobe project and a workspace. Nothing was changed.');
    }
    const next: Ref = { id: adobe.projectId, name: adobe.projectName, title: adobe.projectTitle };
    const workspace: Ref = { id: adobe.workspace, name: adobe.workspaceName, title: adobe.workspaceTitle };
    if (!(await ask(withoutComponents(project, removed), next))) {
        throw new Error('Saving changes was cancelled by user. Nothing was changed.');
    }
    const target = `${next.title ?? next.name ?? next.id}, workspace ${workspace.title ?? workspace.name ?? workspace.id}`;
    return { moves: true, project: next, workspace, target };
}

/**
 * Move the project, already asked. Runs after the Edit's removals, so what goes
 * is not moved first, and before its adds, so what arrives deploys to the new one.
 *
 * @throws when the move does not finish, with the screen's own account of what was left where
 */
export async function applyDestinationChange(
    context: HandlerContext,
    project: Project,
    plan: DestinationPlan,
    progressTracker: ProgressTracker,
): Promise<void> {
    if (!plan.moves) return;
    const moved = await applyDestination(
        context,
        project,
        plan.project,
        plan.workspace,
        plan.target,
        (stage, step) => progressTracker(stage, 60, step ?? plan.target),
        // Asked already, with every other question, before the Edit ran.
        async () => true,
    );
    if (!moved.success) throw new Error(moved.error ?? `The project was not moved to ${plan.target}.`);
}

/** The project as the move will see it: without what the Edit removes first. */
function withoutComponents(project: Project, removed: readonly string[]): Project {
    if (removed.length === 0) return project;
    const kept = Object.entries(project.appBuilderComponents ?? {}).filter(([id]) => !removed.includes(id));
    return { ...project, appBuilderComponents: Object.fromEntries(kept) };
}
