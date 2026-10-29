/**
 * One component definition entry: the unit `cloneAllComponents` and
 * `installAllComponents` take.
 *
 * Project creation (`executorComponentLoading`) and project reset
 * (`lifecycle/services/projectResetService`) each build the same entry from a
 * resolved definition: stamp the definition with the type the stack lists it
 * under, and install it without dependencies, because every component is listed
 * on its own. A reset must hand the orchestrator exactly what creation did, so
 * both build it here (PL-69 pair 22).
 *
 * Not in `core/`: core cannot import a feature's types, and the entry type is
 * project-creation's. Not inside `componentInstallationOrchestrator` either: the
 * suites that drive both callers replace that module with a two-function mock
 * (`projectResetService-resetWithUI.test.ts`, `executor-orchestrationSeams.test.ts`),
 * and a helper living there would be `undefined` under them.
 *
 * @module features/project-creation/services/componentDefinitionEntry
 */

import type { ComponentDefinitionEntry } from './componentInstallationOrchestrator';
import type { TransformedComponentDefinition } from '@/types/components';

/**
 * Build the entry for one resolved component.
 *
 * @param definition - the registry definition, with its source already resolved
 * @param type - the type the stack lists the component under (frontend, dependency, app-builder)
 * @returns the entry, with the definition stamped by `type` and dependencies skipped
 */
export function toComponentDefinitionEntry(
    definition: TransformedComponentDefinition,
    type: string,
): ComponentDefinitionEntry {
    return {
        definition: { ...definition, type: type as TransformedComponentDefinition['type'] },
        type,
        installOptions: { skipDependencies: true },
    };
}
