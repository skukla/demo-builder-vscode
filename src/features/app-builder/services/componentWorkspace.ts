/**
 * The Adobe workspace a component is added into (AB-23).
 *
 * One workspace per ADD, not per component. An integration and the system bound to
 * it are added as one act and removed as one act, they already share a Runtime
 * namespace by design (`demo-erp` declares `web: no-static-site` because a namespace
 * serves ONE static site and its integration needs it), and separating them would
 * cost a bespoke credential for the calls that an Adobe token already covers inside
 * one workspace. So the bound pair joins one workspace and the unit matches the act.
 *
 * WHY THE NAME COMES FROM THE COMPONENT ID. The id is already the machine identity
 * everywhere else — the folder, the keyed-state key, and the deployed OpenWhisk
 * package through `deriveOwPackage` — and it is immutable by declaration, while the
 * SC's display name is not. That matters because Adobe REFUSES to change a
 * workspace's machine name after creation (`400 "Workspace name can not be
 * changed"`, measured 2026-09-20), and the name reaches the Runtime namespace and so
 * every action URL. A name tracking something renameable would be wrong the first
 * time an SC renamed it, permanently.
 *
 * The TITLE carries the SC's display name, because that is the field a rename can
 * safely follow.
 *
 * @module features/app-builder/services/componentWorkspace
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

/** What this needs from Adobe: make a workspace in the project's Console project. */
export interface WorkspaceMaker {
    createWorkspace: (
        title: string,
        description: string,
        target?: { orgId?: string; projectId?: string },
    ) => Promise<{ id: string; name: string; title?: string } | { error: string }>;
}

/** Persisting the project, so a created workspace is never lost to a later failure. */
export type SaveProject = (project: Project) => Promise<void>;

/** The workspace an entry should JOIN rather than create: its bound partner's. */
export function inheritedWorkspace(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): NonNullable<AppBuilderComponentState['workspace']> | undefined {
    const partnerIds = [
        // A system names the integration it belongs to.
        entry.boundTo,
        // An integration's systems name it instead, so look from the other side.
        ...Object.entries(project.appBuilderComponents ?? {})
            .filter(([, state]) => state.usedBy === entry.id)
            .map(([id]) => id),
    ].filter((id): id is string => Boolean(id));

    for (const id of partnerIds) {
        const workspace = project.appBuilderComponents?.[id]?.workspace;
        if (workspace) return workspace;
    }
    return undefined;
}

/**
 * Ensure the component being added has a workspace recorded, creating one when it
 * needs its own.
 *
 * Records BEFORE returning and saves immediately: a workspace that exists in Adobe
 * but not in the manifest is an orphan nothing can find, target or delete, which is
 * the one outcome here that cannot be undone by retrying.
 *
 * @returns a reason when the workspace could not be made, otherwise undefined
 */
export async function ensureComponentWorkspace(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: { maker: WorkspaceMaker; saveProject: SaveProject; displayName: string },
): Promise<{ error: string } | undefined> {
    const existing = project.appBuilderComponents?.[entry.id]?.workspace;
    if (existing) return undefined;

    const workspace = inheritedWorkspace(project, entry) ?? (await make(project, entry, deps));
    if ('error' in workspace) return workspace;
    // `make` never answers undefined — it returns a workspace or a reason — so this
    // is the type narrowing, not a fallback. A silent skip here would deploy into the
    // project's workspace, which is the collision this whole path avoids.
    if (!workspace.id) {
        return { error: `Adobe returned a workspace with no id for "${deps.displayName}".` };
    }

    await record(project, entry.id, workspace, deps.saveProject);
    return undefined;
}

/** Create the workspace in Adobe, titled for the SC and named for the id. */
async function make(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: { maker: WorkspaceMaker; displayName: string },
): Promise<NonNullable<AppBuilderComponentState['workspace']> | { error: string }> {
    const created = await deps.maker.createWorkspace(
        deps.displayName,
        `Demo Builder: ${entry.id}`,
        { orgId: project.adobe?.organization, projectId: project.adobe?.projectId },
    );
    if ('error' in created) {
        return {
            error:
                `Couldn't make an Adobe workspace for "${deps.displayName}", so it was not ` +
                `added. ${created.error}`,
        };
    }
    return { id: created.id, name: created.name, title: created.title ?? deps.displayName };
}

/** Write the workspace onto the component and persist before anything else runs. */
async function record(
    project: Project,
    id: string,
    workspace: NonNullable<AppBuilderComponentState['workspace']>,
    saveProject: SaveProject,
): Promise<void> {
    const current = project.appBuilderComponents?.[id];
    project.appBuilderComponents = {
        ...(project.appBuilderComponents ?? {}),
        [id]: { ...(current ?? ({} as AppBuilderComponentState)), workspace },
    };
    await saveProject(project);
}
