/**
 * Which system an integration uses, and which integration a system belongs to,
 * in one project. The ONE place those questions are answered.
 *
 * The answer is stored on the project: an integration's record lists its
 * `systems`, a system's record names the integration it is `usedBy`. Both are
 * written when the pair is added ({@link linkBroughtSystem}). A removed id is
 * not scrubbed from the records that named it; every read skips ids that are no
 * longer in the project. The catalog's
 * `boundTo` only says which system an integration BRINGS; it is not how a project
 * knows what it has, because a project may one day hold more than one of a kind
 * (AB-16).
 *
 * A record carrying no link of its own falls back to the catalog pairing, per
 * COMPONENT: projects saved before links existed carry none, and so does a pair
 * whose add failed before its deploy (the link is written after). A STORED link is
 * always the answer, including an empty `systems` list — that says "no system", and
 * the catalog must not overrule it. Pure and webview-safe (the cards read it too).
 *
 * @module features/components/services/appBuilderComponentLinks
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

type Catalog = readonly Pick<AppBuilderComponentCatalogEntry, 'id' | 'kind' | 'boundTo'>[];
/** The part of a project these questions read. */
type Components = Pick<Project, 'appBuilderComponents'>;

/** Whether any record in the project carries a stored link. */
function hasStoredLinks(project: Components): boolean {
    return Object.values(project.appBuilderComponents ?? {}).some(
        (state) => state.systems !== undefined || state.usedBy !== undefined,
    );
}

const present = (project: Components, id: string): boolean => Boolean(project.appBuilderComponents?.[id]);

/**
 * The systems an integration uses, present in the project, in stored order.
 *
 * @param project - the project
 * @param integrationId - the integration's `appBuilderComponents` id
 * @param catalog - consulted only for a project saved before links were stored
 * @returns the systems' ids (empty when it uses none)
 */
export function systemsUsedBy(project: Components, integrationId: string, catalog: Catalog): string[] {
    const state = project.appBuilderComponents?.[integrationId];
    if (!state) return [];
    // Its OWN list first, and a stored empty list is an answer: this integration uses
    // no system. Only a record carrying no list at all falls back to the catalog.
    if (state.systems) {
        return state.systems.filter((id) => present(project, id));
    }
    // Per COMPONENT, not per project (2026-09-22). The link is written after a deploy
    // succeeds, so an add that failed earlier leaves both halves unlinked — and asking
    // "does this PROJECT have links?" answered yes because the FIRST pair had them.
    // Removing either half of the second pair then left the other behind, holding the
    // workspace nothing else could release.
    const entry = catalogEntryOf(state, integrationId);
    return catalog
        .filter((candidate) => candidate.kind === 'system' && candidate.boundTo === entry)
        .map((candidate) => pairedInstanceId(integrationId, state.catalogId, candidate.id))
        .filter((id) => present(project, id));
}

/**
 * The integration a system belongs to, when it is in the project.
 *
 * @param project - the project
 * @param systemId - the system's `appBuilderComponents` id
 * @param catalog - consulted only for a project saved before links were stored
 * @returns the integration's id, or undefined
 */
export function integrationUsing(project: Components, systemId: string, catalog: Catalog): string | undefined {
    const state = project.appBuilderComponents?.[systemId];
    if (state?.kind !== 'system') return undefined;
    const owner = state.usedBy ?? pairedFromCatalog(project, state, systemId, catalog);
    return owner && present(project, owner) ? owner : undefined;
}

/**
 * The catalog entry a record was made from: its `catalogId`, else its own id. Not
 * checked against the catalog — a custom integration is in no catalog and still
 * brings nothing, which the `boundTo` lookup answers by finding no system.
 */
function catalogEntryOf(state: AppBuilderComponentState, id: string): string {
    return state.catalogId ?? id;
}

/**
 * The integration the catalog pairs this system with, for a system carrying no
 * `usedBy` — and only when that integration does not DISCLAIM it. An integration
 * with a stored `systems` list has answered the question already; overruling it
 * from the catalog would re-link a system it was deliberately parted from.
 */
function pairedFromCatalog(
    project: Components,
    state: AppBuilderComponentState,
    systemId: string,
    catalog: Catalog,
): string | undefined {
    const entry = catalogEntryOf(state, systemId);
    const boundTo = catalog.find((candidate) => candidate.id === entry)?.boundTo;
    if (!boundTo) return undefined;
    const owner = pairedInstanceId(systemId, state.catalogId, boundTo);
    const stored = project.appBuilderComponents?.[owner]?.systems;
    if (stored && !stored.includes(systemId)) return undefined;
    return owner;
}

/**
 * Record that an integration uses a system, on both records. Idempotent. A
 * project saved before links were stored gets every catalog pair written too,
 * so it never mixes the two ways of knowing.
 *
 * @param project - the project (mutated)
 * @param integrationId - the integration's id
 * @param systemId - the system's id
 * @param catalog - for the pairs a project saved before links carries
 */
export function linkComponents(
    project: Project,
    integrationId: string,
    systemId: string,
    catalog: Catalog,
): void {
    const pairs: Array<[string, string]> = [[integrationId, systemId]];
    if (!hasStoredLinks(project)) {
        for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
            if (state.kind !== 'integration') continue;
            for (const system of systemsUsedBy(project, id, catalog)) pairs.push([id, system]);
        }
    }
    for (const [integration, system] of pairs) {
        const integrationState = project.appBuilderComponents?.[integration];
        const systemState = project.appBuilderComponents?.[system];
        if (!integrationState || !systemState) continue;
        const systems = integrationState.systems ?? [];
        if (!systems.includes(system)) integrationState.systems = [...systems, system];
        systemState.usedBy = integration;
    }
}

/**
 * After an integration is added: link the system its catalog entry brings,
 * when that system is in the project.
 *
 * @param project - the project (mutated)
 * @param integrationId - the integration just added
 * @param catalog - where the integration's system is declared (`boundTo`)
 * @returns whether a link was written (the caller saves)
 */
export function linkBroughtSystem(project: Project, integrationId: string, catalog: Catalog): boolean {
    const catalogId = project.appBuilderComponents?.[integrationId]?.catalogId;
    const kind = catalogId ?? integrationId;
    const system = catalog.find((entry) => entry.kind === 'system' && entry.boundTo === kind);
    if (!system) return false;
    const systemId = pairedInstanceId(integrationId, catalogId, system.id);
    if (!present(project, systemId) || !present(project, integrationId)) return false;
    linkComponents(project, integrationId, systemId, catalog);
    return true;
}

/**
 * The id of the partner a component pairs with, given the partner's catalog id.
 *
 * A second copy of a kind is numbered as a pair: `erp-integration-2` brings
 * `demo-erp-2`. So the partner's id is its catalog id plus this instance's number,
 * which answers before any link is stored — the ERP deploys first, before its
 * integration exists (AB-23).
 *
 * @param id - this component's id
 * @param catalogId - the catalog entry it was made from, when its id is not that entry's
 * @param partnerCatalogId - the partner's catalog id (`boundTo`, `providedBy`)
 * @returns the partner's component id
 */
export function pairedInstanceId(id: string, catalogId: string | undefined, partnerCatalogId: string): string {
    const number = catalogId && id.startsWith(catalogId) ? id.slice(catalogId.length) : '';
    return partnerCatalogId + number;
}

/**
 * The next copy of a catalog entry the project already holds: `erp-integration-2`,
 * named "ERP Integration 2", remembering the entry it was made from. The number is one
 * neither the entry nor the systems it brings use yet, so the pair can share it — or
 * the number of a copy whose add failed, so adding again retries it rather than
 * starting a third (AB-23).
 *
 * Here, rather than beside the add handler, because the Add Integration screen names
 * the copy too: it opens the progress modal under the copy's id before the add runs.
 *
 * @param project - the project
 * @param entry - the catalog entry being added again
 * @param catalog - the catalog, for the systems the entry brings
 * @returns the copy to add
 */
export function nextCopyOf<T extends { id: string; name: string }>(
    project: Components,
    entry: T,
    catalog: Catalog,
): T & { catalogId: string } {
    const family = [entry.id, ...catalog.filter((c) => c.boundTo === entry.id).map((c) => c.id)];
    const components = project.appBuilderComponents ?? {};
    for (let number = 2; ; number++) {
        const copy = components[`${entry.id}-${number}`];
        // A record with no status is a failed add as well: one that stopped after its
        // workspace was recorded and before its deploy began (measured live
        // 2026-09-22). Counting it as taken started a THIRD copy while the second's
        // workspace sat there unused.
        const failedCopy = copy !== undefined && (copy.status === 'error' || copy.status === undefined);
        const free = family.every((id) => !components[`${id}-${number}`]);
        if (failedCopy || free) {
            return { ...entry, id: `${entry.id}-${number}`, catalogId: entry.id, name: `${entry.name} ${number}` };
        }
    }
}

/**
 * The copy an add of this entry makes, or undefined when the add is of the entry
 * itself: the project does not hold it, or holds it from an add that failed (adding
 * again retries it). A mesh is never copied — a project has one — so a second mesh
 * meets the add door's same-id refusal instead.
 *
 * One rule for the add handler and the Add Integration screen, so the id the screen
 * opens its progress modal under is the id the handler adds.
 *
 * @param project - the project
 * @param entry - the catalog entry being added
 * @param catalog - the catalog, for the systems the entry brings
 * @returns the copy, or undefined
 */
export function copyForAdd<T extends { id: string; name: string; kind: string }>(
    project: Components,
    entry: T,
    catalog: Catalog,
): (T & { catalogId: string }) | undefined {
    if (entry.kind === 'mesh') return undefined;
    const existing = project.appBuilderComponents?.[entry.id];
    if (!existing || existing.status === 'error') return undefined;
    return nextCopyOf(project, entry, catalog);
}
