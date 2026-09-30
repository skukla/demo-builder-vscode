/**
 * The ERP list as Demo Builder keeps it (AB-16, design v1 "Adding an ERP in Demo Builder"):
 * the ERP integration serves a list of ERPs keyed by id (its `erp/erps`), and each ERP added
 * from the integration's card ("Add another ERP") is a demo-erp system of its own, in its own
 * workspace, linked to the integration and registered in that list.
 *
 * Pure: which id the next ERP gets, whether a name is free, the list an integration is sent
 * (with the credential each added ERP answers, AB-16a), and one ERP's rows merged into the key
 * map. The calls, and the credential reads, live in `erpListSync.ts`.
 *
 * @module features/app-builder/services/erpList
 */

import { catalogEntryFor } from './componentEntry';
import { deriveWebBase } from './deployInputs';
import type { ErpKeyMapEntry } from './erpFill';
import { broughtByItsIntegration, listIdOf } from './erpListId';
import {
    pairedInstanceId,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

/**
 * The server-to-server credential an ERP in a workspace of its own answers (AB-16a): each
 * mock ERP accepts machine calls only from its own workspace's technical account. Sent on a
 * `PUT erp/erps` entry; the integration keeps it and never answers the secret back. Holds a
 * live secret: never persisted, logged, or returned to a webview or an agent.
 */
export interface ErpAuth {
    clientId: string;
    clientSecret: string;
    orgId: string;
    scopes: string[];
    technicalAccountId?: string;
    technicalAccountEmail?: string;
}

/** One ERP as the integration's `erp/erps` holds it. */
export interface ErpListEntry {
    id: string;
    name: string;
    adapter: string;
    /**
     * `auth` only on a PUT, only for an ERP outside the integration's workspace. Omitted, the
     * integration keeps the credential it holds; `null` clears it. A GET never carries the
     * secret, and this module never reads what a GET answered for it.
     */
    connection: { baseUrl: string | null; auth?: ErpAuth | null };
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
export function nextListedSystemId(
    project: Components,
    system: AppBuilderComponentCatalogEntry,
): string {
    const components = project.appBuilderComponents ?? {};
    for (let number = 2; ; number++) {
        const id = `${system.id}-${number}`;
        const partner = system.boundTo
            ? pairedInstanceId(id, system.id, system.boundTo)
            : undefined;
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
export function erpNameProblem(
    project: Components,
    name: string | undefined,
    retryId?: string,
): string | undefined {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return 'Name the ERP, e.g. "Brand B ERP".';
    if (trimmed.length > MAX_ERP_NAME) return `An ERP name is at most ${MAX_ERP_NAME} characters.`;
    const taken = Object.entries(project.appBuilderComponents ?? {}).some(
        ([id, state]) =>
            id !== retryId &&
            state.kind === 'system' &&
            state.name?.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    return taken
        ? `An ERP named "${trimmed}" is already in this project. Pick another name.`
        : undefined;
}

/**
 * The id the integration's list knows one of its ERPs by (`listIdOf`): the id its name
 * derived when it was added, recorded on the component (AB-51).
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

/** One ERP the list will carry, as `erpListFor` and `erpsWithOwnCredential` read it. */
interface ListedErp {
    componentId: string;
    listId: string;
    /** The ERP its integration brings, in the integration's own workspace (`broughtByItsIntegration`). */
    own: boolean;
    name: string;
    adapter: string;
    baseUrl: string;
    state: AppBuilderComponentState;
}

/** Every deployed, listed system the integration uses, in link order, less the one leaving. */
function listedErps(
    project: Project,
    integrationId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    leaving?: string,
): ListedErp[] {
    return systemsUsedBy(project, integrationId, catalog).flatMap((id): ListedErp[] => {
        const state = project.appBuilderComponents?.[id];
        const entry = catalogEntryFor(project, id, catalog);
        const baseUrl = deriveWebBase(state?.deployedUrls);
        const listId = erpListIdOf(project, id, catalog);
        if (
            id === leaving ||
            !state ||
            !entry?.listedAs ||
            !listId ||
            state.status !== 'deployed' ||
            !baseUrl
        )
            return [];
        const { adapter } = entry.listedAs;
        return [
            {
                componentId: id,
                listId,
                own: broughtByItsIntegration(project, entry),
                name: state.name ?? entry.name,
                adapter,
                baseUrl,
                state,
            },
        ];
    });
}

/** An ERP added from the card, in a workspace of its own, whose credential the list must carry. */
interface ErpWithOwnCredential {
    componentId: string;
    name: string;
    /** Its own workspace, where the credential is read; absent only for a malformed record. */
    workspace?: AppBuilderComponentState['workspace'];
}

/**
 * The ERPs the list carries that are NOT in the integration's workspace (AB-16a): every one
 * added from the card, since each is deployed into a workspace of its own. The first ERP
 * shares the integration's workspace and answers its credential.
 *
 * @param project - the project
 * @param integrationId - the integration
 * @param catalog - the catalog
 * @param leaving - a system being removed, left out
 * @returns each such ERP by component id, with its name and workspace
 */
export function erpsWithOwnCredential(
    project: Project,
    integrationId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    leaving?: string,
): ErpWithOwnCredential[] {
    return listedErps(project, integrationId, catalog, leaving)
        .filter((erp) => !erp.own)
        .map(({ componentId, name, state }) => ({
            componentId,
            name,
            ...(state.workspace ? { workspace: state.workspace } : {}),
        }));
}

/**
 * The ERP list an integration is sent: every deployed, listed system it uses, in link order,
 * each with its own id (`listIdOf`), name, adapter and address. An ERP already in the list
 * the integration answered keeps the settings it holds there, so a PUT, which replaces the
 * whole list, never loses what the SC set on the Admin page. An added ERP whose credential
 * was read carries it (`connection.auth`); the first ERP never does, and one with none read
 * carries no `auth` key, so the integration keeps whatever it holds.
 *
 * @param project - the project
 * @param integrationId - the integration
 * @param catalog - the catalog
 * @param current - the list the integration serves now (`GET erp/erps`)
 * @param leaving - a system being removed, left out
 * @param auths - each added ERP's own credential, by component id
 * @returns the list to PUT
 */
export function erpListFor(
    project: Project,
    integrationId: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    current: readonly ErpListEntry[],
    leaving?: string,
    auths: Readonly<Record<string, ErpAuth>> = {},
): ErpListEntry[] {
    return listedErps(project, integrationId, catalog, leaving).map((erp): ErpListEntry => {
        const settings = current.find((known) => known.id === erp.listId)?.settings;
        const auth = erp.own ? undefined : auths[erp.componentId];
        return {
            id: erp.listId,
            name: erp.name,
            adapter: erp.adapter,
            connection: { baseUrl: erp.baseUrl, ...(auth ? { auth } : {}) },
            ...(settings !== undefined ? { settings } : {}),
        };
    });
}

/**
 * The key map with one ERP's rows replaced: the integration keeps one map for every ERP
 * (`PUT erp/keymap` replaces it whole), so a fill of one ERP must keep the others' pairs. A
 * row naming no ERP belongs to no listed ERP (every fill names one) and is kept as it is.
 *
 * @param current - the map the integration holds
 * @param erpId - the ERP just filled, by its list id
 * @param rows - its pairs
 * @returns the whole map to PUT
 */
export function mergeKeyMap(
    current: readonly ErpKeyMapEntry[],
    erpId: string,
    rows: readonly ErpKeyMapEntry[],
): ErpKeyMapEntry[] {
    const others = current.filter((row) => row.erpId !== erpId);
    return [...others, ...rows.map((row) => ({ ...row, erpId }))];
}
