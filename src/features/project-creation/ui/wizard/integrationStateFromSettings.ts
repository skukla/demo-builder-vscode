/**
 * The App Builder half of a project's settings, as creation reads it.
 *
 * ONE function for every door that starts from saved settings: the wizard's edit
 * mode, its import and copy mode, and the agent's `create_project_from_file`.
 * It was edit-only until 2026-10-03 (PL-56d), which is why an imported project
 * was created with no integrations and no mesh whatever its file said.
 *
 * @module features/project-creation/ui/wizard/integrationStateFromSettings
 */

import { isMeshComponentId } from '@/core/constants';
import { RESERVED_EXISTING_KEY } from '@/features/project-creation/ui/components/integration-flow/flowStages';
import type { WizardState } from '@/types/webview';
import type { ImportedSettings } from '@/types/wizard';

/** The settings fields this reads. An exported project file has the same four. */
type IntegrationSettings = Pick<
    ImportedSettings,
    'selections' | 'appBuilderComponentSources' | 'componentApiPicks' | 'additionalConsoleApis'
>;

/** The creation inputs those fields become. */
type IntegrationState = Pick<
    WizardState,
    'selectedAppBuilderComponents' | 'appBuilderComponentSources' | 'selectedConsoleApis'
>;

/**
 * Seed the App Builder integration state from a project's saved settings, so
 * integration rows survive an edit rebuild, an import and a copy:
 * - `selections.appBuilder` ∪ mesh ids from `selections.dependencies` →
 *   `selectedAppBuilderComponents` (the row ids). The executor deliberately
 *   excludes mesh-kind from `appBuilder` and persists the mesh as a dep id
 *   (ADR-011), while the wizard's single mesh authority is
 *   `selectedAppBuilderComponents` (D3) — without the union the mesh row
 *   vanishes in edit mode AND an edit Finish (which derives the wire's
 *   dependencies from the mesh ids in selectedAppBuilderComponents) silently
 *   drops the mesh. Non-mesh base deps are filtered — seeding them would
 *   falsely trip anyDeployableSelected and force the destination gate.
 * - `appBuilderComponentSources` → custom-URL sources (else custom rows vanish)
 * - `componentApiPicks` → `selectedConsoleApis` per integration, PREFERRED: it is
 *   the attributed form, and the only one that survives step 07. Seeding from the
 *   flat field instead collapsed every pick into one anonymous bucket, so reopening
 *   a project forgot which integration wanted what.
 * - flat `additionalConsoleApis` → `selectedConsoleApis['__existing__']`, the
 *   fallback for a settings file written before the keyed form existed
 *   (reserved key: joins the serialization union, never shown per-row)
 *
 * @param settings - the saved settings, or an exported project file
 * @returns the three creation inputs; each is undefined when the settings name none
 */
export function integrationStateFromSettings(settings: IntegrationSettings): IntegrationState {
    const keyedPicks = settings.componentApiPicks;
    const hasKeyedPicks = keyedPicks && Object.keys(keyedPicks).length > 0;
    const existingApis = settings.additionalConsoleApis;
    const meshDeps = settings.selections?.dependencies?.filter(isMeshComponentId);
    const appBuilderWithMesh = [
        ...new Set([...(settings.selections?.appBuilder ?? []), ...(meshDeps ?? [])]),
    ];
    return {
        selectedAppBuilderComponents: appBuilderWithMesh.length ? appBuilderWithMesh : undefined,
        appBuilderComponentSources: settings.appBuilderComponentSources,
        selectedConsoleApis: hasKeyedPicks
            ? keyedPicks
            : existingApis?.length
              ? { [RESERVED_EXISTING_KEY]: existingApis }
              : undefined,
    };
}
