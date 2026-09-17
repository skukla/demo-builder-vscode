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
 * Projects saved before links were stored carry neither field. For those the
 * catalog pairing stands in, once, on read: {@link hasStoredLinks} tells the two
 * apart. Pure and webview-safe (the integration cards read it too).
 *
 * @module features/components/services/appBuilderComponentLinks
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

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
    if (hasStoredLinks(project)) {
        return (state.systems ?? []).filter((id) => present(project, id));
    }
    return catalog
        .filter((entry) => entry.kind === 'system' && entry.boundTo === integrationId)
        .map((entry) => entry.id)
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
    const owner = hasStoredLinks(project)
        ? state.usedBy
        : catalog.find((entry) => entry.id === systemId)?.boundTo;
    return owner && present(project, owner) ? owner : undefined;
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
    const system = catalog.find((entry) => entry.kind === 'system' && entry.boundTo === integrationId);
    if (!system || !present(project, system.id) || !present(project, integrationId)) return false;
    linkComponents(project, integrationId, system.id, catalog);
    return true;
}
