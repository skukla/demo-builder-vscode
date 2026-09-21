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
 * THE NAME COMES FROM THE TITLE. Console's workspace boxes show the machine NAME,
 * so it is what the SC reads. A space there 400s and a dash does not (measured
 * 2026-09-21), so "Northwind ERP" is titled "Northwind ERP" and named
 * `Northwind-ERP`, with four random characters only when that name is taken
 * (`deriveFreeAdobeEntityName`). Adobe refuses to change a machine name later
 * (`400 "Workspace name can not be changed"`, measured 2026-09-20) and the name
 * reaches every action URL, so it is fixed at creation; a later rename moves the
 * title only. It came from the component id until the owner saw `erpintegration…`
 * in Console (2026-09-21): a catalog entry's id is the catalog's word, not the SC's.
 *
 * A PAIR IS TITLED AFTER ITS SYSTEM. The SC names the ERP ("Northwind ERP"), not the
 * integration that comes with it, so whichever half makes the workspace titles it
 * after the system — unless the SC gave it no name, when the system answers only the
 * catalog's word ("ERP") and the integration's name titles it instead
 * (owner, 2026-09-21).
 *
 * @module features/app-builder/services/componentWorkspace
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

/**
 * What this needs from Adobe: make a workspace in the project's Console project.
 * Adobe's machine name is derived from the title.
 */
export interface WorkspaceMaker {
    createWorkspace: (
        title: string,
        description: string,
        target: { orgId?: string; projectId?: string },
    ) => Promise<{ id: string; name: string; title?: string } | { error: string }>;
}

/** Persisting the project, so a created workspace is never lost to a later failure. */
export type SaveProject = (project: Project) => Promise<void>;

/**
 * The workspace a component is deployed into: its own when it has one, otherwise
 * the project's — where every component added before AB-23 lives.
 */
export function deployWorkspaceId(project: Project, componentId: string): string | undefined {
    return project.appBuilderComponents?.[componentId]?.workspace?.id ?? project.adobe?.workspace;
}

/** The components bound to an entry, from either side of the binding. */
function partnerIds(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[] = [],
): string[] {
    const ids = [
        // A system names the integration it belongs to.
        entry.boundTo,
        // An integration's systems name it instead, so look from the other side:
        // the record once the pair is linked, the catalog before it is.
        ...Object.entries(project.appBuilderComponents ?? {})
            .filter(([, state]) => state.usedBy === entry.id)
            .map(([id]) => id),
        ...catalog.filter((candidate) => candidate.boundTo === entry.id).map((candidate) => candidate.id),
    ].filter((id): id is string => Boolean(id));
    return [...new Set(ids)];
}

/**
 * Which entry a new workspace is named after: for a bound pair, the system — the
 * half the SC names — whichever half makes it. Anything else names its own.
 */
export function workspaceNamedFor(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[] = [],
): AppBuilderComponentCatalogEntry {
    if (entry.kind === 'system') return entry;
    const system = catalog.find(
        (candidate) => candidate.kind === 'system' && candidate.boundTo === entry.id,
    );
    return system ?? entry;
}

/**
 * The catalog entries whose APIs belong on an entry's workspace: the entry and
 * the partners it shares that workspace with — never the rest of the project.
 */
export function entriesSharingWorkspace(
    catalog: AppBuilderComponentCatalogEntry[],
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): AppBuilderComponentCatalogEntry[] {
    const partners = new Set(partnerIds(project, entry, catalog));
    const inProject = new Set(Object.keys(project.appBuilderComponents ?? {}));
    const shared = catalog.filter((c) => partners.has(c.id) && inProject.has(c.id));
    return [...shared, entry];
}

/**
 * The workspace an entry should JOIN rather than create: its bound partner's.
 * Pass the catalog: an integration added with its system runs this before the
 * pair is linked, so only the catalog knows the system is its partner.
 */
export function inheritedWorkspace(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[] = [],
): NonNullable<AppBuilderComponentState['workspace']> | undefined {
    for (const id of partnerIds(project, entry, catalog)) {
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
    deps: {
        maker: WorkspaceMaker;
        saveProject: SaveProject;
        /** The name the SC knows a component by — the workspace's title. */
        nameOf: (entry: AppBuilderComponentCatalogEntry) => string;
        catalog?: AppBuilderComponentCatalogEntry[];
        /** Told just before a workspace is made — not when one is joined. */
        onMaking?: () => void;
    },
): Promise<{ error: string } | undefined> {
    const existing = project.appBuilderComponents?.[entry.id]?.workspace;
    if (existing) return undefined;

    const workspace =
        inheritedWorkspace(project, entry, deps.catalog) ??
        (await make(project, workspaceNamedFor(entry, deps.catalog), deps));
    if ('error' in workspace) return workspace;
    // `make` never answers undefined — it returns a workspace or a reason — so this
    // is the type narrowing, not a fallback. A silent skip here would deploy into the
    // project's workspace, which is the collision this whole path avoids.
    if (!workspace.id) {
        return { error: `Adobe returned a workspace with no id for "${deps.nameOf(entry)}".` };
    }

    await record(project, entry.id, workspace, deps.saveProject);
    return undefined;
}

/**
 * A system's own name when the SC gave it one; the catalog's word for it is not one,
 * so then its integration's name. Anything else, its own name.
 */
function titleFor(
    named: AppBuilderComponentCatalogEntry,
    deps: {
        nameOf: (entry: AppBuilderComponentCatalogEntry) => string;
        catalog?: AppBuilderComponentCatalogEntry[];
    },
): string {
    const own = deps.nameOf(named);
    if (named.kind !== 'system' || own !== named.name) return own;
    const integration = deps.catalog?.find((candidate) => candidate.id === named.boundTo);
    return integration ? deps.nameOf(integration) : own;
}

/** Create a workspace in Adobe, titled — and so named — for the SC. */
async function make(
    project: Project,
    named: AppBuilderComponentCatalogEntry,
    deps: {
        maker: WorkspaceMaker;
        nameOf: (entry: AppBuilderComponentCatalogEntry) => string;
        catalog?: AppBuilderComponentCatalogEntry[];
        onMaking?: () => void;
    },
): Promise<NonNullable<AppBuilderComponentState['workspace']> | { error: string }> {
    const title = titleFor(named, deps);
    deps.onMaking?.();
    const created = await deps.maker.createWorkspace(
        title,
        `Demo Builder: ${named.id}`,
        { orgId: project.adobe?.organization, projectId: project.adobe?.projectId },
    );
    if ('error' in created) {
        return {
            error: `Couldn't make an Adobe workspace for "${title}", so it was not added. ${created.error}`,
        };
    }
    return { id: created.id, name: created.name, title: created.title ?? title };
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
