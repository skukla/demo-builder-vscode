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
import { BASELINE_API } from '@/features/app-builder/services/apiSubscriber';
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
    /**
     * Count of the integration's provisioned APIs: the always-provided baseline
     * (I/O Management) plus the user's free picks, deduped — matching the picker's
     * checked rows.
     */
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

/**
 * The integration's provisioned API count: the always-provided baseline plus the
 * user's free picks, deduped (the reserved key is excluded by the caller). Every
 * App Builder app gets the baseline, so this is ≥ 1 — matching the picker, which
 * shows the baseline checked.
 */
function apiCountFor(state: WizardState, id: string): number {
    const picks = state.selectedConsoleApis?.[id] ?? [];
    return new Set<string>([BASELINE_API, ...picks]).size;
}

/**
 * Resolve the configured integrations to result rows (mesh → catalog → custom).
 *
 * @param state - Wizard state (selections, sources, destination, API picks)
 * @param meshComponent - The stack's mesh catalog entry (`meshComponentForStack`),
 *   or undefined when the architecture has no mesh
 * @param components - The App Builder component entries — the FULL list including
 *   the blank starter ("Build custom"), so a committed blank shell resolves to a
 *   row (it has no source and isn't a pre-built catalog entry)
 * @returns One row per configured integration; unknown/mesh-kind ids excluded
 */
export function resolveIntegrationRows(
    state: WizardState,
    meshComponent: AppBuilderComponentCatalogEntry | undefined,
    components: AppBuilderComponentCatalogEntry[],
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
        const entry = components.find((candidate) => candidate.id === id);
        if (!entry || entry.kind === 'mesh') continue;
        if (entry.blank) {
            // The blank starter ("Build custom") — a custom app (built out with AI),
            // not a pre-built catalog integration. Unlike an imported repo it has no
            // source, but it IS a real configured integration and gets its own row.
            customRows.push({
                id,
                kind: 'blank',
                name: entry.name,
                sourceLine: entry.description || 'Custom App Builder app',
                needsSetup,
                apiCount: apiCountFor(state, id),
            });
            continue;
        }
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
