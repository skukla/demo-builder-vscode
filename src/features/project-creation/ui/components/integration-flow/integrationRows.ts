/**
 * integrationRows — PURE resolver: wizard state → the center column's result rows.
 *
 * One row per configured integration, in a fixed group order: mesh, then
 * catalog, then custom. The mesh row uses the BOTH-key selection check
 * ({@link isMeshSelected}: catalog id in `selectedAppBuilderComponents` OR a
 * mapped legacy dep in `selectedOptionalDependencies`), so a PACKAGE-SEEDED
 * mesh (selected via dependencies only, no destination yet) surfaces as a row
 * with `needsSetup`. `needsSetup` is shared across all rows — the Adobe
 * project + workspace destination is one shared commitment.
 *
 * The reserved `selectedConsoleApis['__existing__']` edit-mode key is a
 * serialization-only bucket: it is NEVER surfaced as a row and never counted.
 *
 * No React, no catalog-loader calls — the caller passes the catalog list and
 * the stack's mesh entry (from `meshComponentForStack`).
 *
 * @module features/project-creation/ui/components/integration-flow/integrationRows
 */

import { isMeshSelected } from '../../steps/tileStatus';
import type { IntegrationKind } from './flowStages';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

/** A collapsed result row for one configured integration. */
export interface IntegrationRow {
    id: string;
    kind: IntegrationKind;
    name: string;
    /** Quiet one-liner under the name (origin/description). */
    sourceLine: string;
    /** True until the shared Adobe project + workspace destination is committed. */
    needsSetup: boolean;
    /** Free Console API picks for this integration (locked codes never stored). */
    apiCount: number;
}

/** Serialization-only edit-mode bucket in `selectedConsoleApis` — never a row. */
const RESERVED_EXISTING_KEY = '__existing__';

const MESH_FALLBACK_NAME = 'API Mesh';
const MESH_FALLBACK_SOURCE_LINE = 'GraphQL bridge · deploys to Adobe I/O';

/** Whether the shared Adobe I/O destination (project + workspace) is committed. */
function destinationCommitted(state: WizardState): boolean {
    return Boolean(state.adobeProject?.id) && Boolean(state.adobeWorkspace?.id);
}

/** Free API picks for one integration id (reserved key excluded by the caller). */
function apiCountFor(state: WizardState, id: string): number {
    return state.selectedConsoleApis?.[id]?.length ?? 0;
}

/**
 * Resolve the configured integrations to result rows (mesh → catalog → custom).
 *
 * @param state - Wizard state (selections, sources, destination, API picks)
 * @param meshComponent - The stack's mesh catalog entry (`meshComponentForStack`),
 *   or undefined when the architecture has no mesh
 * @param catalog - The App Builder component catalog entries
 * @returns One row per configured integration; unknown/mesh-kind ids excluded
 */
export function resolveIntegrationRows(
    state: WizardState,
    meshComponent: AppBuilderComponentCatalogEntry | undefined,
    catalog: AppBuilderComponentCatalogEntry[],
): IntegrationRow[] {
    const needsSetup = !destinationCommitted(state);
    const meshRows: IntegrationRow[] = [];
    const catalogRows: IntegrationRow[] = [];
    const customRows: IntegrationRow[] = [];

    if (meshComponent && isMeshSelected(state, meshComponent.id)) {
        meshRows.push({
            id: meshComponent.id,
            kind: 'mesh',
            name: meshComponent.name || MESH_FALLBACK_NAME,
            sourceLine: meshComponent.description || MESH_FALLBACK_SOURCE_LINE,
            needsSetup,
            apiCount: apiCountFor(state, meshComponent.id),
        });
    }

    const ids = state.selectedAppBuilderComponents ?? [];
    const sources = state.appBuilderComponentSources ?? {};
    for (const id of ids) {
        if (id === RESERVED_EXISTING_KEY || id === meshComponent?.id) continue;
        const source = sources[id];
        if (source) {
            customRows.push({
                id,
                kind: 'custom',
                name: source.repo,
                sourceLine: `App Builder app · ${source.owner}/${source.repo}`,
                needsSetup,
                apiCount: apiCountFor(state, id),
            });
            continue;
        }
        const entry = catalog.find((candidate) => candidate.id === id);
        if (!entry || entry.kind === 'mesh') continue;
        catalogRows.push({
            id,
            kind: 'catalog',
            name: entry.name,
            sourceLine: entry.description || `Catalog · ${entry.name}`,
            needsSetup,
            apiCount: apiCountFor(state, id),
        });
    }

    return [...meshRows, ...catalogRows, ...customRows];
}
