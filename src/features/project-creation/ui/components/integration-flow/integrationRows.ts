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

import type { AppBuilderComponentRequirement } from '../../../services/appBuilderComponentSelection';
import { isMeshSelected } from '../../steps/tileStatus';
import { BASELINE_CODE } from './apiAccessConstants';
import { RESERVED_EXISTING_KEY, type IntegrationKind } from './flowStages';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeAuthSessionState } from '@/types/webview';

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
     * The integration's provisioned API sdk codes, deduped in a stable order:
     * the always-provided baseline (I/O Management), then the integration's
     * deterministic `requiredApis` (e.g. a mesh's API Mesh SDK), then the user's
     * free picks. Every row carries at least the baseline, so this is never empty —
     * its LENGTH is what the card's subline reports ("· 2 APIs") for every kind.
     */
    apis: string[];
    /**
     * True only for AI-built instance rows (shell-template source with a source
     * record to carry the display name) — enables the wizard Rename affordance.
     * Absent on mesh/catalog/import rows and on the legacy fixed-id blank row
     * (which has no source record to rename).
     */
    renamable?: boolean;
    /**
     * True when the package's resolved mesh requirement locks this row in the
     * build (mesh rows only; `requiresMesh` with the storefront override
     * honoured). The card layer withholds Remove and says why.
     */
    required?: boolean;
}

const MESH_FALLBACK_NAME = 'API Mesh';
const MESH_FALLBACK_SOURCE_LINE = 'GraphQL bridge · deploys to Adobe I/O';

/**
 * Source line for an AI-built instance (shell instancing). An instance is a
 * shell-template clone with its own identity — the row must read as the
 * user's integration, never as the template repo ("app-builder-shell").
 */
const AI_INSTANCE_SOURCE_LINE = 'Custom integration · built with AI';

/**
 * The shell TEMPLATE's {owner, repo} — the AI-built instance discriminator.
 * Derived from the blank catalog entry ("Build custom") so the template
 * coordinates are never hardcoded here. Undefined when the caller's list omits
 * the blank entry (shell-sourced rows then degrade to plain imports).
 */
function shellTemplateSource(
    components: AppBuilderComponentCatalogEntry[],
): { owner: string; repo: string } | undefined {
    return components.find((entry) => entry.blank)?.source;
}

/**
 * Whether a source record clones the shell template (owner AND repo match).
 * Name presence is NOT the discriminator: the keyed runner writes `name` for
 * every integration (imports get name = repo), so after the edit-mode
 * round-trip a plain import also carries a name.
 */
function isShellInstanceSource(
    source: { owner: string; repo: string },
    template: { owner: string; repo: string } | undefined,
): boolean {
    return (
        template !== undefined && source.owner === template.owner && source.repo === template.repo
    );
}

/** Whether the shared Adobe I/O destination (project + workspace) is committed. */
function destinationCommitted(state: AdobeAuthSessionState): boolean {
    return Boolean(state.adobeProject?.id) && Boolean(state.adobeWorkspace?.id);
}

/**
 * The integration's provisioned API sdk codes, deduped: the always-provided
 * baseline, then the integration's deterministic `requiredApis`, then the user's
 * free picks. Every App Builder app gets the baseline, so this is never empty —
 * matching the picker, which shows the baseline (and requiredApis) checked.
 *
 * @param state - wizard state (for the id's free picks)
 * @param id - the integration id
 * @param requiredApis - the integration's deterministic required APIs (mesh/catalog
 *   entry `requiredApis`; empty for custom/import apps that carry only picks)
 */
function apiCodesFor(
    state: AdobeAuthSessionState,
    id: string,
    requiredApis: string[] = [],
): string[] {
    const picks = state.selectedConsoleApis?.[id] ?? [];
    return [...new Set<string>([BASELINE_CODE, ...requiredApis, ...picks])];
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
    state: AdobeAuthSessionState,
    meshComponent:
        | (AppBuilderComponentCatalogEntry & { requirement?: AppBuilderComponentRequirement })
        | undefined,
    components: Array<
        AppBuilderComponentCatalogEntry & { requirement?: AppBuilderComponentRequirement }
    >,
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
            apis: apiCodesFor(state, meshComponent.id, meshComponent.requiredApis),
            required: meshComponent.requirement === 'required',
        });
    }

    const ids = state.selectedAppBuilderComponents ?? [];
    const sources = state.appBuilderComponentSources ?? {};
    const template = shellTemplateSource(components);
    for (const id of ids) {
        if (id === RESERVED_EXISTING_KEY || id === meshComponent?.id) continue;
        const source = sources[id];
        if (source) {
            // A source cloning the shell TEMPLATE repo is an AI-built instance
            // (its own identity): render the user's name, never the template
            // repo. Any other source is an import; it may still carry a display
            // name (edit round-trip writes name = repo) but keeps its repo line.
            const isInstance = isShellInstanceSource(source, template);
            customRows.push({
                id,
                kind: isInstance ? 'blank' : 'custom',
                name: source.name ?? source.repo,
                sourceLine: isInstance
                    ? AI_INSTANCE_SOURCE_LINE
                    : `Custom integration · ${source.owner}/${source.repo}`,
                needsSetup,
                apis: apiCodesFor(state, id),
                ...(isInstance ? { renamable: true } : {}),
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
                sourceLine: entry.description || 'Custom integration',
                needsSetup,
                apis: apiCodesFor(state, id, entry.requiredApis),
            });
            continue;
        }
        catalogRows.push({
            id,
            kind: 'catalog',
            name: entry.name,
            sourceLine: entry.description || `Catalog · ${entry.name}`,
            needsSetup,
            apis: apiCodesFor(state, id, entry.requiredApis),
            // Generic, not mesh-only: a nativeForPackages entry resolves
            // requirement:'required' in the selection model and gets the same
            // row/card lock the required mesh does.
            required: entry.requirement === 'required',
        });
    }

    return [...meshRows, ...catalogRows, ...customRows];
}
