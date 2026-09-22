/**
 * Moving the components that have a workspace of their own into a DIFFERENT Adobe
 * project, when the project's destination changes (AB-23 slice 7).
 *
 * Their workspace belongs to the Adobe project being left, so it cannot come along.
 * Owner decision, 2026-09-21: remove each from the old Adobe project, then add it in
 * the new one. Every step is one a removal or an add already runs live — the Commerce
 * clean-up while the old code can still do it, the old workspace deleted (taking its
 * Runtime namespace with it), a new workspace made, its APIs, then each deploy, whose
 * install pass puts the integration into Commerce again.
 *
 * ONE CHANGE FROM A PLAIN REMOVAL: the folder on disk stays. An integration built with
 * AI exists only there, and the deploy into the new workspace runs from it.
 *
 * The new workspace is made FIRST, and deleted again if the old side cannot be
 * cleaned up, so until the old workspace goes nothing has changed. After that there
 * is nothing to go back to: a failure is reported against the component, whose record
 * already names the NEW workspace, so its Redeploy retries into the right place.
 *
 * @module features/app-builder/services/componentRelocation
 */

import { deployAppBuilderComponent, type AppBuilderComponentRunnerDeps } from './appBuilderComponentRunner';
import { cleanUpBeforeUndeploy } from './appBuilderComponentTeardown';
import { catalogEntryFor, entryFromState } from './componentEntry';
import { entriesSharingWorkspace } from './componentWorkspace';
import type { ProjectAdobeRef } from '@/core/shell/orgContextEnv';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

type Workspace = NonNullable<AppBuilderComponentState['workspace']>;

/** The components sharing one workspace of their own: one add, moved as one. */
export interface WorkspaceGroup {
    workspace: Workspace;
    /** Systems first: an ERP provides its address to the integration deployed after it. */
    members: string[];
}

export interface RelocationResult {
    /** Ids now deployed in the new Adobe project. */
    moved: string[];
    /** True once the old side is gone — from then on there is nothing to go back to. */
    released: boolean;
    failed?: { id: string; error: string };
}

/**
 * The components with a workspace of their own, grouped by that workspace.
 *
 * @param project - the project
 * @returns one group per workspace
 */
export function ownWorkspaceGroups(project: Project): WorkspaceGroup[] {
    const groups = new Map<string, WorkspaceGroup>();
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (!state.workspace) continue;
        const group = groups.get(state.workspace.id) ?? { workspace: state.workspace, members: [] };
        group.members.push(id);
        groups.set(state.workspace.id, group);
    }
    const rank = (id: string) => (project.appBuilderComponents?.[id]?.kind === 'system' ? 0 : 1);
    for (const group of groups.values()) group.members.sort((a, b) => rank(a) - rank(b));
    return [...groups.values()];
}

/**
 * Remove one group from the Adobe project being left, then add it in the new one.
 *
 * @param project - the project, with `adobe` already naming the new destination
 * @param group - the group, from {@link ownWorkspaceGroups}
 * @param previous - the destination being left
 * @param deps - runner deps
 * @returns what moved, whether the old side is gone, and what stopped it
 */
export async function relocateGroup(
    project: Project,
    group: WorkspaceGroup,
    previous: ProjectAdobeRef,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RelocationResult> {
    const entryOf = (id: string): AppBuilderComponentCatalogEntry =>
        catalogEntryFor(project, id, deps.catalog) ??
        entryFromState(id, project.appBuilderComponents?.[id] as AppBuilderComponentState);
    // The old side runs against the Adobe project being left, with the records as
    // they stand now. A copy, records included: the project itself names the new
    // destination throughout, and its records are about to name the new workspace.
    const leaving: Project = {
        ...project,
        adobe: previous as Project['adobe'],
        appBuilderComponents: structuredClone(project.appBuilderComponents),
    };
    const lead = group.members[group.members.length - 1];

    // The new workspace FIRST. Made after the old side was gone, a failure would leave
    // the pair recording no workspace, and its next Redeploy would land in the
    // project's own — the collision per-integration workspaces exist to prevent.
    setWorkspace(project, group.members, undefined);
    const made = await makeNewWorkspace(project, group, entryOf, deps);
    const unfinished = made.error ?? (await cleanUpOldSide(leaving, group, entryOf, deps));
    if (unfinished) {
        await undoNewWorkspace(project, group, made.workspace, deps);
        return { moved: [], released: false, failed: { id: lead, error: unfinished } };
    }

    const deleteFailure = await deps.deleteComponentWorkspace(leaving, group.workspace);
    if (deleteFailure) {
        deps.logger.warn(
            `[Destination] The old workspace ${group.workspace.name} was left behind: ${deleteFailure.error}`,
        );
    }
    await deps.subscribeRequiredApis(
        entriesSharingWorkspace(deps.catalog, project, entryOf(lead)),
        project,
        undefined,
        { forComponent: lead },
    );
    return deployAll(project, group.members, deps);
}

/** Point every member at one workspace, or at none. */
function setWorkspace(project: Project, members: string[], workspace: Workspace | undefined): void {
    for (const id of members) {
        const state = project.appBuilderComponents?.[id];
        if (!state) continue;
        if (workspace) state.workspace = workspace;
        else delete state.workspace;
    }
}

/**
 * Make the group's workspace in the new Adobe project; the first member makes it and
 * the rest join it, as an add does.
 *
 * @returns the workspace made, if any, and why it could not be finished
 */
async function makeNewWorkspace(
    project: Project,
    group: WorkspaceGroup,
    entryOf: (id: string) => AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ workspace?: Workspace; error?: string }> {
    for (const id of group.members) {
        const failure = await deps.createComponentWorkspace(project, entryOf(id));
        const workspace = project.appBuilderComponents?.[group.members[0]]?.workspace;
        if (failure) {
            return { workspace, error: `Nothing of it was moved: ${failure.error}` };
        }
    }
    return { workspace: project.appBuilderComponents?.[group.members[0]]?.workspace };
}

/** Delete a new workspace that will not be used, and point the group back at its old one. */
async function undoNewWorkspace(
    project: Project,
    group: WorkspaceGroup,
    made: Workspace | undefined,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    if (made) {
        const failure = await deps.deleteComponentWorkspace(project, made);
        if (failure) {
            deps.logger.warn(`[Destination] The unused workspace ${made.name} was left behind: ${failure.error}`);
        }
    }
    setWorkspace(project, group.members, group.workspace);
    await deps.saveProject(project);
}

/**
 * The clean-up a removal runs before its undeploy, integration first, in the old
 * Adobe project.
 *
 * @returns why it did not finish, or undefined
 */
async function cleanUpOldSide(
    leaving: Project,
    group: WorkspaceGroup,
    entryOf: (id: string) => AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<string | undefined> {
    const reasons: string[] = [];
    for (const id of [...group.members].reverse()) {
        const state = leaving.appBuilderComponents?.[id];
        if (!state) continue;
        const outcome = await cleanUpBeforeUndeploy({ project: leaving, id, state, entry: entryOf(id) }, deps);
        reasons.push(...outcome.unfinished.map((u) => u.what));
    }
    if (reasons.length === 0) return undefined;
    return `Nothing of it was moved: ${reasons.join('; ')}.`;
}

/** Deploy each member in order, stopping at the first that fails. */
async function deployAll(
    project: Project,
    members: string[],
    deps: AppBuilderComponentRunnerDeps,
): Promise<RelocationResult> {
    const moved: string[] = [];
    for (const id of members) {
        const deployed = await deployAppBuilderComponent(project, id, deps);
        if (!deployed.success) {
            return {
                moved,
                released: true,
                failed: { id, error: deployed.error ?? 'Deploy to the new Adobe project failed.' },
            };
        }
        moved.push(id);
    }
    return { moved, released: true };
}
