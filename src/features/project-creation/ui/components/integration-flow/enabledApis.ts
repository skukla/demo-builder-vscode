/**
 * enabledApis — the project-level "already enabled" API derivation.
 *
 * API access is PROJECT-LEVEL: the deploy subscribes the UNION of every
 * integration's `requiredApis` plus the shared baseline. So the APIs already
 * covered by the integrations ALREADY in the project = the baseline (once any
 * integration exists) + each existing integration's `requiredApis`. The Add
 * Integration flow uses this so a NEW integration's api-access step shows
 * already-covered APIs as ✓ instead of asking the user to add them again.
 *
 * Pure (no React/Spectrum) so it is directly unit-testable.
 *
 * @module features/project-creation/ui/components/integration-flow/enabledApis
 */

import { getAvailableAppBuilderComponents } from '../../../services/appBuilderComponentCatalogLoader';
import { BASELINE_CODE } from './apiAccessConstants';

/** Stable empty result (avoids churning a new array reference each render). */
const NONE: string[] = [];

/**
 * The API codes already enabled on the workspace by the integrations ALREADY in
 * the project (the ones being added aren't committed yet).
 *
 * @param selectedIds - the committed integration ids (`selectedAppBuilderComponents`)
 * @param backendId - the selected stack's backend id (for the catalog lookup)
 * @param frontendId - the selected stack's frontend id
 * @returns the deduped union of covered API codes (empty when nothing is added yet)
 */
export function enabledApisFromSelection(
    selectedIds: string[],
    backendId: string | undefined,
    frontendId: string | undefined,
): string[] {
    if (selectedIds.length === 0) return NONE;
    const selected = new Set(selectedIds);
    // Any integration enables the baseline, so it is covered once the project has one.
    const enabled = new Set<string>([BASELINE_CODE]);
    for (const entry of getAvailableAppBuilderComponents(backendId ?? '', frontendId ?? '')) {
        if (selected.has(entry.id)) {
            for (const api of entry.requiredApis ?? []) enabled.add(api);
        }
    }
    return [...enabled];
}
