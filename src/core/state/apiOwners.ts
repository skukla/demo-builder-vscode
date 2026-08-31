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

/**
 * Reads one App Builder catalog entry by id.
 *
 * Declared here and HANDED IN, rather than imported: this module lives in
 * `core/`, and the catalog loader lives in a feature. Core is what features are
 * built on, so core naming a feature is the direction that closes the dependency
 * graph into a cycle.
 *
 * Both callers are dashboard handlers — boundary files, which the dependency
 * rules explicitly allow to fetch — so passing `getAppBuilderComponentEntry` in
 * costs them one argument and costs this module its only feature import.
 *
 * Structural rather than a reference to the loader's own type, so a caller can
 * hand in a lookup without importing the loader either.
 */
export type CatalogEntryLookup = (
    id: string,
) => { name?: string; requiredApis?: string[] } | undefined;
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
export function resolveApiOwners(
    project: Project,
    lookupCatalogEntry: CatalogEntryLookup,
): ApiOwner[] {
    return Object.entries(project.appBuilderComponents ?? {}).map(([id, component]) => {
        const entry = lookupCatalogEntry(id);
        return {
            id,
            name: component.name || entry?.name || id,
            requiredApis: entry?.requiredApis ?? [],
        };
    });
}
