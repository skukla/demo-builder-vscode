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
 * so it is what the SC reads. It may hold letters and digits only: a space 400s,
 * and a dash is accepted but its Runtime namespace then refuses every deploy
 * (measured 2026-09-22). So "Northwind ERP" is titled "Northwind ERP" and named
 * `NorthwindERP` — or `NorthwindERP1`, `NorthwindERP2` when that name is taken
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

import { catalogEntryFor, pairedEntry } from './componentEntry';
import type { RuntimeNamespaceEnv } from './runtimeNamespace';
import { pairedInstanceId, systemBoundTo } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { Logger } from '@/types/logger';

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
    // Partners are the instances THIS entry pairs with: a second ERP's partner is the
    // second integration, never the first (AB-23).
    const pairOf = (partnerCatalogId: string) => pairedInstanceId(entry.id, entry.catalogId, partnerCatalogId);
    const kind = entry.catalogId ?? entry.id;
    const ids = [
        // A system names the integration it belongs to.
        entry.boundTo && pairOf(entry.boundTo),
        // An integration's systems name it instead, so look from the other side:
        // the record once the pair is linked, the catalog before it is.
        ...Object.entries(project.appBuilderComponents ?? {})
            .filter(([, state]) => state.usedBy === entry.id)
            .map(([id]) => id),
        ...catalog.filter((candidate) => candidate.boundTo === kind).map((candidate) => pairOf(candidate.id)),
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
    const system = systemBoundTo(entry.catalogId ?? entry.id, catalog);
    return system ? pairedEntry(entry, system) : entry;
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
    // Each partner as its own entry: a second ERP is its catalog entry under its own
    // id. Only partners the catalog knows — directly or as the entry they were made
    // from — carry APIs of their own.
    const shared = [...partners]
        .filter((id) => {
            const state = project.appBuilderComponents?.[id];
            return state && catalog.some((c) => c.id === (state.catalogId ?? id));
        })
        .map((id) => catalogEntryFor(project, id, catalog))
        .filter((partner): partner is AppBuilderComponentCatalogEntry => Boolean(partner));
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
 * needs its own. A mesh never does: it stays in the project's workspace.
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
    // The mesh is the project's permanent core: it lives in the project's workspace,
    // where the storefront calls it (owner, 2026-09-20). A dashboard-added mesh used
    // to get a workspace of its own like any other add.
    if (entry.kind === 'mesh') return undefined;
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

    await record(project, entry, workspace, deps.nameOf(entry), deps.saveProject);
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
    return integration ? deps.nameOf(pairedEntry(named, integration)) : own;
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

/**
 * Write the workspace onto the component and persist before anything else runs.
 *
 * A component that has no record yet gets a WHOLE one — kind, source, the name it
 * is being added under, and `deploying`, which is what it is. It used to get the
 * workspace alone through an `as AppBuilderComponentState` cast, and an add that
 * failed before its deploy began (Adobe not listing product profiles, live
 * 2026-09-22) left that shape on disk: the manifest failed its own schema, no card
 * rendered it, and the next add read the id as taken and numbered itself higher.
 */
async function record(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    workspace: NonNullable<AppBuilderComponentState['workspace']>,
    name: string,
    saveProject: SaveProject,
): Promise<void> {
    const current = project.appBuilderComponents?.[entry.id];
    const fresh: AppBuilderComponentState = {
        kind: entry.kind,
        status: 'deploying',
        name,
        source: { owner: entry.source.owner, repo: entry.source.repo, branch: entry.source.branch },
        ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
    };
    project.appBuilderComponents = {
        ...(project.appBuilderComponents ?? {}),
        [entry.id]: { ...(current ?? fresh), workspace },
    };
    await saveProject(project);
}

// ─── Releasing a removal's workspaces (owner, 2026-09-27) ───────────────────────────────
//
// A removal no longer stops on leftovers in a workspace of the component's own: deleting the
// workspace takes them with it, about 11 minutes later (measured on Bodea, 2026-09-27; the
// key read and watch that confirm it are in `componentWorkspaceRelease.ts`). It still stops
// when the workspace is shared with something that stays, since that workspace is not deleted.

/** A component's own workspace, as its record holds it. */
type Workspace = NonNullable<AppBuilderComponentState['workspace']>;

/**
 * Whether deleting the workspace `id` deploys into will take its Runtime leftovers with it:
 * it has a workspace of its own, and nothing outside `removing` (this removal's
 * components) uses it. The project's own workspace is never deleted, so a component living
 * there answers false.
 */
export function workspaceTakesLeftovers(project: Project, id: string, removing: string[]): boolean {
    const own = project.appBuilderComponents?.[id]?.workspace?.id;
    if (!own) return false;
    return !Object.entries(project.appBuilderComponents ?? {}).some(
        ([other, state]) => !removing.includes(other) && state.workspace?.id === own,
    );
}

/** What releasing needs: the delete, and the key read and watch when wired. */
export interface WorkspaceReleaseDeps {
    deleteComponentWorkspace: (
        project: Project,
        workspace: Workspace
    ) => Promise<{ error: string } | undefined>;
    /** The workspace's Runtime key, read before it is deleted; undefined when it cannot be read. */
    namespaceKeyOf?: (
        project: Project,
        workspace: Workspace
    ) => Promise<RuntimeNamespaceEnv | undefined>;
    /** Confirm, in the background, that a deleted workspace's namespace is gone. */
    watchNamespaceRemoval?: (key: RuntimeNamespaceEnv, label: string) => void;
    /** Delete the Commerce REST credential kept for a workspace that is gone. */
    forgetWorkspaceCredential?: (workspaceId: string) => Promise<void>;
    onProgress?: (message: string, subMessage?: string) => void;
    progressLabel: string;
    logger: Logger;
}

/** The workspaces deleted, by the name a person reads, and what could not be. */
export interface WorkspaceRelease {
    deleted: string[];
    warnings: string[];
}

/** Delete each workspace; each deleted one's namespace is then watched until it is gone. */
export async function releaseWorkspaces(
    project: Project,
    workspaces: Workspace[],
    deps: WorkspaceReleaseDeps,
): Promise<WorkspaceRelease> {
    const release: WorkspaceRelease = { deleted: [], warnings: [] };
    for (const workspace of workspaces) {
        const label = workspace.title ?? workspace.name;
        deps.onProgress?.(deps.progressLabel);

        const key = await deps.namespaceKeyOf?.(project, workspace).catch(() => undefined);

        const failure = await deps.deleteComponentWorkspace(project, workspace);
        if (failure) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] workspace ${workspace.name} was left behind: ` +
                    failure.error,
            );
            release.warnings.push(
                `The ${label} workspace could not be deleted, so anything still deployed ` +
                    `in it keeps running: ` +
                    `${failure.error}`,
            );
            continue;
        }
        release.deleted.push(label);
        await deps.forgetWorkspaceCredential?.(workspace.id).catch(() => {
            deps.logger.warn(
                `[AppBuilderComponent Runner] ${label}: its kept credential could not be deleted`,
            );
        });
        if (key && deps.watchNamespaceRemoval) {
            deps.watchNamespaceRemoval(key, label);
        } else {
            deps.logger.warn(
                `[AppBuilderComponent Runner] ${label}: its Runtime key could not be read, ` +
                    'so its removal is not confirmed',
            );
        }
    }
    return release;
}
