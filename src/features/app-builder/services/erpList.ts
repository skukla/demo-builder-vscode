/**
 * The ERP list as Demo Builder keeps it (AB-16, design v1 "Adding an ERP in Demo Builder"):
 * the ERP integration serves a list of ERPs keyed by id (its `erp/erps`), and each ERP added
 * from the integration's card ("Add another ERP") is a demo-erp system of its own, in its own
 * workspace, linked to the integration and registered in that list.
 *
 * Pure: which id the next ERP gets, whether a name is free, the list an integration is sent,
 * and one ERP's rows merged into the key map. The calls live in `erpListSync.ts`.
 *
 * @module features/app-builder/services/erpList
 */

import { catalogEntryFor } from './componentEntry';
import { deriveWebBase, listIdOf } from './deployInputs';
import type { ErpKeyMapEntry } from './erpFill';
import { pairedInstanceId, systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** One ERP as the integration's `erp/erps` holds it. */
export interface ErpListEntry {
    id: string;
    name: string;
    adapter: string;
    connection: { baseUrl: string | null };
    /** Its own settings (the Admin page's ERP switcher); carried over, never made here. */
    settings?: unknown;
}

/** The longest ERP name: it heads a card, a workspace title and the integration's Admin page. */
export const MAX_ERP_NAME = 40;

type Components = Pick<Project, 'appBuilderComponents'>;

/**
 * The component id for the next ERP added from the card: `demo-erp-2`, `demo-erp-3`, … The
 * number must be free for the numbered integration as well (`erp-integration-2`), or the new
 * ERP would read as that integration's own (`listIdOf`) and join its workspace. A number whose
 * ERP add failed, with no such integration, is reused, so adding again retries it.
 *
 * @param project - the project
 * @param system - the listed system's catalog entry (`demo-erp`)
 * @returns the id to add
 */
export function nextListedSystemId(project: Components, system: AppBuilderComponentCatalogEntry): string {
    const components = project.appBuilderComponents ?? {};
    for (let number = 2; ; number++) {
        const id = `${system.id}-${number}`;
        const partner = system.boundTo ? pairedInstanceId(id, system.id, system.boundTo) : undefined;
        if (partner && components[partner]) continue;
        const existing = components[id];
        if (!existing || existing.status === 'error' || existing.status === undefined) return id;
    }
}

/**
 * Why a name cannot name a new ERP, or undefined when it can: blank, too long, or already
 * the name of a system in the project, compared without case (the integration refuses two
 * ERPs of one name in its list, `erpsProblem`).
 *
 * @param project - the project
 * @param name - the name the SC typed
 * @param retryId - the id being retried, whose own name does not count as taken
 * @returns the problem in words
 */
export function erpNameProblem(project: Components, name: string | undefined, retryId?: string): string | undefined {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return 'Name the ERP, e.g. "Brand B ERP".';
    if (trimmed.length > MAX_ERP_NAME) return `An ERP name is at most ${MAX_ERP_NAME} characters.`;
    const taken = Object.entries(project.appBuilderComponents ?? {}).some(
        ([id, state]) => id !== retryId && state.kind === 'system' && state.name?.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    return taken ? `An ERP named "${trimmed}" is already in this project. Pick another name.` : undefined;
}

/**
 * The id the integration's list knows one of its ERPs by (`listIdOf`): `erp` for the
 * integration's own, the component id for one added from the card.
 *
 * @param project - the project
 * @param componentId - the ERP's component id
 * @param catalog - the catalog
 * @returns the list id, or undefined when the component is not a listed system
 */
export function erpListIdOf(
    project: Components,
    componentId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): string | undefined {
    const entry = catalogEntryFor(project, componentId, catalog);
    return entry?.listedAs ? listIdOf(project, entry) : undefined;
}

/**
 * The ERP list an integration is sent: every deployed, listed system it uses, in link order,
 * each with its own id (`listIdOf`), name, adapter and address. An ERP already in the list
 * the integration answered keeps the settings it holds there, so a PUT, which replaces the
 * whole list, never loses what the SC set on the Admin page.
 *
 * @param project - the project
 * @param integrationId - the integration
 * @param catalog - the catalog
 * @param current - the list the integration serves now (`GET erp/erps`)
 * @param leaving - a system being removed, left out
 * @returns the list to PUT
 */
export function erpListFor(
    project: Project,
    integrationId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    current: readonly ErpListEntry[],
    leaving?: string,
): ErpListEntry[] {
    return systemsUsedBy(project, integrationId, catalog).flatMap((id): ErpListEntry[] => {
        const state = project.appBuilderComponents?.[id];
        const entry = catalogEntryFor(project, id, catalog);
        const baseUrl = deriveWebBase(state?.deployedUrls);
        const listId = erpListIdOf(project, id, catalog);
        if (id === leaving || !state || !entry?.listedAs || !listId || state.status !== 'deployed' || !baseUrl) return [];
        const settings = current.find((known) => known.id === listId)?.settings;
        return [
            {
                id: listId,
                name: state.name ?? entry.name,
                adapter: entry.listedAs.adapter,
                connection: { baseUrl },
                ...(settings !== undefined ? { settings } : {}),
            },
        ];
    });
}

/**
 * The key map with one ERP's rows replaced: the integration keeps one map for every ERP
 * (`PUT erp/keymap` replaces it whole), so a fill of one ERP must keep the others' pairs. A
 * row naming no ERP is the first ERP's (`firstId`), as the integration reads it.
 *
 * @param current - the map the integration holds
 * @param erpId - the ERP just filled, by its list id
 * @param rows - its pairs
 * @param firstId - the id a row naming no ERP belongs to
 * @returns the whole map to PUT
 */
export function mergeKeyMap(
    current: readonly ErpKeyMapEntry[],
    erpId: string,
    rows: readonly ErpKeyMapEntry[],
    firstId: string,
): ErpKeyMapEntry[] {
    const others = current.filter((row) => (row.erpId ?? firstId) !== erpId);
    return [...others, ...rows.map((row) => ({ ...row, erpId }))];
}
