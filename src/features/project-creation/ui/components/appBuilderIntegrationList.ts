/**
 * appBuilderIntegrationList — resolve the selected App Builder integrations for rendering.
 *
 * Turns the wizard's `selectedAppBuilderComponents` ids into render descriptors for the
 * Integrations "Services" screen. A catalog integration (`kind: 'integration'`) resolves
 * from its config entry; a custom-URL add resolves from the persisted
 * `appBuilderComponentSources` map (its display name is the repo). Mesh ids (special-cased
 * by {@link MeshIntegrationCard}) and unknown ids are excluded.
 *
 * Pure + side-effect-free — a single source for the added-integration card list.
 *
 * @module features/project-creation/ui/components/appBuilderIntegrationList
 */

import { getAppBuilderComponentEntry } from '../../services/appBuilderComponentCatalogLoader';
import type { WizardState } from '@/types/webview';

/** A render descriptor for one added App Builder integration. */
export interface SelectedIntegration {
    id: string;
    name: string;
    owner: string;
    repo: string;
}

/** Stable empty default (avoids re-render churn from an inline fallback). */
const EMPTY_IDS: string[] = [];

/**
 * Resolve the selected App Builder integrations to render descriptors.
 *
 * @param state - Wizard state (selected component ids + custom source map)
 * @returns One descriptor per catalog/custom integration; mesh + unknown ids excluded
 */
export function resolveSelectedIntegrations(state: WizardState): SelectedIntegration[] {
    const ids = state.selectedAppBuilderComponents ?? EMPTY_IDS;
    const sources = state.appBuilderComponentSources ?? {};
    const result: SelectedIntegration[] = [];
    for (const id of ids) {
        const entry = getAppBuilderComponentEntry(id);
        if (entry?.kind === 'integration') {
            result.push({ id, name: entry.name, owner: entry.source.owner, repo: entry.source.repo });
        } else if (sources[id]) {
            const source = sources[id];
            result.push({ id, name: source.repo, owner: source.owner, repo: source.repo });
        }
    }
    return result;
}
