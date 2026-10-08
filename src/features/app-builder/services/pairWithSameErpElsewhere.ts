/**
 * One Adobe project holds one ERP of a given name.
 *
 * Two Demo Builder projects — `justrite` and its copy — each deployed the ERP
 * integration into the same Adobe project, in two workspaces, both installed into the
 * same Commerce; Commerce's Orders grid showed the integration's columns twice, both
 * labelled with the Adobe project's title (owner's machine, 2026-10-08). The owner's
 * rule: deploying into an Adobe project that already has that deployment REPLACES it.
 *
 * The unit of uniqueness is the pair's ERP SYSTEM's name within the Adobe project
 * (owner, 2026-10-08 16:05): an SC talks about the ERP ("orders go to Justrite ERP"),
 * and the integration's name is a default nobody changes. Two pairs whose ERPs are
 * named differently coexist; the copy case, where both ERPs are "Justrite ERP", is the
 * one that replaces, and what goes is the other project's INTEGRATION, which takes its
 * bound systems with it (the runner's own rule). An integration that brings no system
 * (the starter kit, a custom app) is unique by its own name instead.
 *
 * The name compared is the one each project shows for the system
 * (`displayNameInProject`: the recorded name, else what its inputs make it), trimmed and
 * case-insensitive. Pure: the handler that calls this loads the other projects (ADR-015).
 *
 * @module features/app-builder/services/pairWithSameErpElsewhere
 */

import { catalogEntryFor, pairedEntry } from './componentEntry';
import { displayNameInProject } from './deployInputs';
import {
    integrationUsing,
    isAddedSystem,
    systemBoundTo,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

/** The deployment another project holds, and what to remove to replace it. */
interface DeploymentElsewhere {
    /** The other local project. */
    project: Project;
    /** What to remove there: the pair's integration, or an ERP added on its own. */
    componentId: string;
    /** The ERP's name (or the integration's, for one with no system) as that project shows it. */
    name: string;
}

/** Deployed in Runtime, or installed into Commerce (an upgrade leaves it installed). */
function isDeployed(state: AppBuilderComponentState | undefined): boolean {
    if (!state) return false;
    const installed = state.installation?.status;
    return state.status === 'deployed' || installed === 'installed' || installed === 'upgraded';
}

/** The name as compared: trimmed, case-insensitive. */
function key(name: string): string {
    return name.trim().toLowerCase();
}

/**
 * The system entry whose name the pair is unique by: the entry itself when it is one, the
 * one bound to it (numbered with it for a copy) when it is an integration, else none.
 */
function systemOf(
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): AppBuilderComponentCatalogEntry | undefined {
    if (entry.kind === 'system') return entry;
    const system = systemBoundTo(entry.catalogId ?? entry.id, catalog);
    return system && pairedEntry(entry, system);
}

/** Whether `state` under `id` in `other` is a deployed instance of the system kind, by this name. */
function sameErp(
    other: Project,
    id: string,
    systemKind: string,
    name: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): boolean {
    const state = other.appBuilderComponents?.[id];
    if (state?.kind !== 'system' || !isDeployed(state)) return false;
    const entry = catalogEntryFor(other, id, catalog);
    if (!entry || (entry.catalogId ?? entry.id) !== systemKind) return false;
    return key(displayNameInProject(other, entry)) === name;
}

/** The other project's hit for a pair: its same-named ERP, and the component to remove. */
function pairHit(
    other: Project,
    system: AppBuilderComponentCatalogEntry,
    name: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): DeploymentElsewhere | undefined {
    const systemKind = system.catalogId ?? system.id;
    const systemId = Object.keys(other.appBuilderComponents ?? {}).find((id) =>
        sameErp(other, id, systemKind, name, catalog),
    );
    if (!systemId) return undefined;
    // The pair goes through its integration; an ERP added from the card goes on its own.
    const integrationId = integrationUsing(other, systemId, catalog);
    const componentId =
        integrationId && !isAddedSystem(other, systemId, integrationId) ? integrationId : systemId;
    return { project: other, componentId, name: displayNameInProject(other, catalogEntryFor(other, systemId, catalog) ?? system) };
}

/** The other project's hit for an integration with no system: the same id, by this name. */
function soloHit(
    other: Project,
    entry: AppBuilderComponentCatalogEntry,
    name: string,
): DeploymentElsewhere | undefined {
    const state = other.appBuilderComponents?.[entry.id];
    if (!isDeployed(state) || key(displayNameInProject(other, entry)) !== name) return undefined;
    return { project: other, componentId: entry.id, name: displayNameInProject(other, entry) };
}

/**
 * Another local project that deployed, into the same Adobe project, a pair whose ERP has
 * the name this project's would — the deployment the add must replace.
 *
 * @param project - the project about to deploy `entry`
 * @param entry - the catalog entry being added (an integration, or an ERP added on its own)
 * @param catalog - the catalog, for the pair's bound system
 * @param others - every other local project, loaded
 * @returns the other project, and what to remove there, else undefined
 */
export function pairWithSameErpElsewhere(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    others: Project[],
): DeploymentElsewhere | undefined {
    const adobeProjectId = project.adobe?.projectId;
    if (!adobeProjectId) return undefined;
    const system = systemOf(entry, catalog);
    const name = key(displayNameInProject(project, system ?? entry));
    for (const other of others) {
        if (other.path === project.path || other.adobe?.projectId !== adobeProjectId) continue;
        const hit = system ? pairHit(other, system, name, catalog) : soloHit(other, entry, name);
        if (hit) return hit;
    }
    return undefined;
}
