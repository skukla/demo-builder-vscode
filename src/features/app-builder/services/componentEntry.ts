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

import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import type { RepoNodeChoice } from '@/core/shell/nodeRangeRule';
import {
    buildCustomIntegrationEntry,
    getAppBuilderComponentCatalog,
    isSameRepo,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
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
        ...(state.nodeVersion ? { nodeVersion: state.nodeVersion } : {}),
        kind: state.kind,
        providesEnvVars: state.providesEnvVars ? Object.keys(state.providesEnvVars) : undefined,
    };
}

/** A component's Node, from core: re-exported so the runner reads it beside its entry. */
export { nodeForAppBuilderEntry } from '@/core/shell/demoBuilderNode';

/** Reads an SC's own repo's Node range and picks its Node (`ownRepoNode.ts` builds it). */
export type OwnRepoNodeResolver = (source: { owner: string; repo: string; branch?: string }) => Promise<RepoNodeChoice>;

/** A repo the bundled catalog ships: its range is already part of Demo Builder's Node. */
function isCatalogRepo(source: { owner: string; repo: string }): boolean {
    return getAppBuilderComponentCatalog().some((entry) => isSameRepo(entry.source, source));
}

/**
 * The entry to add, carrying the Node its repo needs when that is not Demo Builder's
 * own (PR-1a step 8). Only an SC's own repo is read: every catalog repo's range is
 * already part of the generated Node. An entry that already carries one (a redeploy
 * from its record) keeps it.
 *
 * @returns the entry, or the reason the repo's range cannot be met
 */
export async function withOwnRepoNode(
    entry: AppBuilderComponentCatalogEntry,
    resolve: OwnRepoNodeResolver | undefined,
): Promise<{ entry: AppBuilderComponentCatalogEntry } | { error: string }> {
    if (!resolve || entry.nodeVersion || isCatalogRepo(entry.source)) return { entry };
    const choice = await resolve(entry.source);
    if (!choice.ok) {
        return {
            error: `${entry.source.owner}/${entry.source.repo} asks for Node ${choice.range}, and no Node release `
                + 'satisfies it. Fix "engines.node" in its package.json, then add it again.',
        };
    }
    return { entry: choice.major === demoBuilderNode() ? entry : { ...entry, nodeVersion: choice.major } };
}

