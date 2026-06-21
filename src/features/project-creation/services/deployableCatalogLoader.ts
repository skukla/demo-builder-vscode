/**
 * Deployable Catalog Loader
 *
 * Loads and filters the pre-built deployable catalog (deployables.json) — the
 * 6th declarative config, mirroring blockLibraryLoader. Filters by the user's
 * chosen backend/frontend and resolves entry source + env schema for the
 * selection/deploy paths.
 *
 * @module features/project-creation/services/deployableCatalogLoader
 */

import deployablesConfig from '../config/deployables.json';
import type { AddonSource } from '@/types/demoPackages';
import type {
    DeployablesCatalog,
    DeployableCatalogEntry,
    DeployableEnvVar,
} from '@/types/deployables';

const config = deployablesConfig as unknown as DeployablesCatalog;

/** A deployable fits an axis if it is unconstrained on it OR lists the id. */
function fitsAxis(constraint: string[] | undefined, id: string): boolean {
    if (!constraint || constraint.length === 0) return true;
    return constraint.includes(id);
}

/**
 * Get all pre-built deployables compatible with the given backend + frontend.
 *
 * An entry matches when it is unconstrained on (or lists) BOTH the backend and
 * the frontend. Unconstrained axes match any id.
 *
 * @param backendId - Selected backend id (e.g. "adobe-commerce-paas")
 * @param frontendId - Selected frontend id (e.g. "eds-storefront", "headless")
 * @returns Array of compatible catalog entries (empty if none match)
 */
export function getAvailableDeployables(
    backendId: string,
    frontendId: string,
): DeployableCatalogEntry[] {
    return config.deployables.filter(
        entry =>
            fitsAxis(entry.compatibleBackends, backendId) &&
            fitsAxis(entry.compatibleFrontends, frontendId),
    );
}

/**
 * Resolve a catalog entry by id.
 *
 * @param id - The deployable id (e.g. "commerce-paas-mesh")
 * @returns The entry, or undefined if unknown
 */
export function getDeployableEntry(id: string): DeployableCatalogEntry | undefined {
    return config.deployables.find(entry => entry.id === id);
}

/**
 * Resolve a deployable id to its GitHub source.
 *
 * @param id - The deployable id
 * @returns The {owner, repo, branch} source, or undefined if unknown
 */
export function getDeployableSource(id: string): AddonSource | undefined {
    return getDeployableEntry(id)?.source;
}

/**
 * Get a deployable's own env-var schema.
 *
 * @param id - The deployable id
 * @returns The env schema array (empty if unknown or none declared)
 */
export function getDeployableEnvSchema(id: string): DeployableEnvVar[] {
    return getDeployableEntry(id)?.envSchema ?? [];
}

/**
 * Get the display name for a deployable.
 *
 * @param id - The deployable id
 * @returns The name, or the id as fallback
 */
export function getDeployableName(id: string): string {
    return getDeployableEntry(id)?.name ?? id;
}
