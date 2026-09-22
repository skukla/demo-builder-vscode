/**
 * Which catalog entry a component instance is (AB-23, two ERPs in one project).
 *
 * A component's id doubled as its catalog id. That holds for every component added
 * before a project could hold two of the same kind, and still holds for the first of
 * each kind. A second copy is minted a fresh id (`demo-erp-2`) and records the entry
 * it was made from as `catalogId`, so it keeps what only the catalog knows — its
 * screen, its records wipe, the env var that names it — which a record alone cannot
 * rebuild.
 *
 * @module features/app-builder/services/componentEntry
 */

import { buildCustomIntegrationEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';

/**
 * The catalog entry behind a component: the catalog's own when the id is a catalog id;
 * else the entry the instance was made from, under the instance's id; else one rebuilt
 * from its record.
 *
 * @param project - the project holding the component
 * @param id - the component id
 * @param catalog - the catalog
 * @returns the entry, or undefined when neither the project nor the catalog has the id
 */
export function catalogEntryFor(
    project: Pick<Project, 'appBuilderComponents'>,
    id: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): AppBuilderComponentCatalogEntry | undefined {
    const own = catalog.find((entry) => entry.id === id);
    if (own) return own;
    const state = project.appBuilderComponents?.[id];
    if (!state) return undefined;
    const template = state.catalogId ? catalog.find((entry) => entry.id === state.catalogId) : undefined;
    return template ? { ...template, id, catalogId: template.id } : entryFromState(id, state);
}

/**
 * A partner's catalog entry as the instance THIS entry pairs with: the catalog's own
 * for the first of a kind, a copy numbered with it for a second — `erp-integration-2`
 * pairs with `demo-erp-2`, named "ERP 2".
 *
 * @param entry - this entry
 * @param partner - the partner's catalog entry
 * @returns the partner as this entry's pair
 */
export function pairedEntry(
    entry: AppBuilderComponentCatalogEntry,
    partner: AppBuilderComponentCatalogEntry,
): AppBuilderComponentCatalogEntry {
    if (!entry.catalogId) return partner;
    const id = pairedInstanceId(entry.id, entry.catalogId, partner.id);
    const number = id.slice(partner.id.length).replace(/^-/, ' ');
    return { ...partner, id, catalogId: partner.id, name: `${partner.name}${number}` };
}

/**
 * Reconstruct a catalog entry from persisted state (redeploy fallback). Also how an
 * imported integration's Settings find its entry (`componentSettingsHandlers.ts`).
 *
 * Routed through {@link buildCustomIntegrationEntry} so a SEEDED instance —
 * a kit clone under a user-chosen id — recovers its capability fields
 * (layout/lifecycle/nodeVersion) via source recognition. Hand-building the
 * entry here lost them, and a redeploy of such an instance ran the standalone
 * path against an extension-layout app.
 *
 * @param id - the component id
 * @param state - its record
 * @returns an entry built from what the record holds
 */
export function entryFromState(
    id: string,
    state: AppBuilderComponentState,
): AppBuilderComponentCatalogEntry {
    const entry = buildCustomIntegrationEntry(
        {
            owner: state.source.owner,
            repo: state.source.repo,
            branch: state.source.branch,
            // Prefer the persisted display name (shell instances carry it) so a
            // redeploy does not clobber it with the id.
            name: state.name ?? id,
        },
        id,
    );
    return {
        ...entry,
        kind: state.kind,
        providesEnvVars: state.providesEnvVars ? Object.keys(state.providesEnvVars) : undefined,
    };
}
