/**
 * Build the owner list {@link resolveApiRowStates} needs from a project.
 *
 * Step 03 shipped the four-state resolver with no production consumer, because
 * nothing turned `project.appBuilderComponents` into `ApiOwner[]`. This is that
 * bridge, and it is deliberately its own module: both handler surfaces (dashboard
 * and wizard) need it, and neither should own it.
 *
 * @module core/state/apiOwners
 */

import type { ApiOwner } from './apiRowState';
import { getAppBuilderComponentEntry } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types/base';

/**
 * Every integration in the project, named, with its catalog-declared requiredApis.
 *
 * Name precedence is persisted → catalog → id. The id fallback is not cosmetic: a
 * locked row states WHO holds the code, so an owner with no name renders a lock with
 * no reason — worse than no lock, because the user cannot act on it. Custom and
 * imported integrations have no catalog entry and would otherwise be nameless.
 *
 * Not filtered by status. A not-yet-deployed integration still declares requiredApis,
 * and that claim is exactly why another integration's row is locked; dropping it would
 * silently offer removal of a code someone needs.
 *
 * @param project - the project to read
 * @returns one owner per keyed integration; empty when there are none
 */
export function resolveApiOwners(project: Project): ApiOwner[] {
    return Object.entries(project.appBuilderComponents ?? {}).map(([id, component]) => {
        const entry = getAppBuilderComponentEntry(id);
        return {
            id,
            name: component.name || entry?.name || id,
            requiredApis: entry?.requiredApis ?? [],
        };
    });
}
