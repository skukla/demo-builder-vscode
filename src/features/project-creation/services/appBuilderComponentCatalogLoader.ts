/**
 * AppBuilderComponent Catalog Loader
 *
 * Loads and filters the pre-built appBuilderComponent catalog (app-builder-components.json) — the
 * 6th declarative config, mirroring blockLibraryLoader. Filters by the user's
 * chosen backend/frontend and resolves entry source + env schema for the
 * selection/deploy paths.
 *
 * @module features/project-creation/services/appBuilderComponentCatalogLoader
 */

import appBuilderComponentsConfig from '../config/app-builder-components.json';
import type {
    AppBuilderComponentsCatalog,
    AppBuilderComponentCatalogEntry,
    AppBuilderComponentEnvVar,
} from '@/types/appBuilderComponents';
import type { AddonSource } from '@/types/demoPackages';

const config = appBuilderComponentsConfig as unknown as AppBuilderComponentsCatalog;

/** An App Builder component fits an axis if it is unconstrained on it OR lists the id. */
function fitsAxis(constraint: string[] | undefined, id: string): boolean {
    if (!constraint || constraint.length === 0) return true;
    return constraint.includes(id);
}

/**
 * Get all pre-built appBuilderComponents compatible with the given backend + frontend.
 *
 * An entry matches when it is unconstrained on (or lists) BOTH the backend and
 * the frontend. Unconstrained axes match any id.
 *
 * @param backendId - Selected backend id (e.g. "adobe-commerce-paas")
 * @param frontendId - Selected frontend id (e.g. "eds-storefront", "headless")
 * @returns Array of compatible catalog entries (empty if none match)
 */
export function getAvailableAppBuilderComponents(
    backendId: string,
    frontendId: string,
): AppBuilderComponentCatalogEntry[] {
    return config.appBuilderComponents.filter(
        entry =>
            fitsAxis(entry.compatibleBackends, backendId) &&
            fitsAxis(entry.compatibleFrontends, frontendId),
    );
}

/**
 * Resolve a catalog entry by id.
 *
 * @param id - The appBuilderComponent id (e.g. "commerce-paas-mesh")
 * @returns The entry, or undefined if unknown
 */
export function getAppBuilderComponentEntry(id: string): AppBuilderComponentCatalogEntry | undefined {
    return config.appBuilderComponents.find(entry => entry.id === id);
}

/**
 * Resolve an App Builder component id to its GitHub source.
 *
 * @param id - The appBuilderComponent id
 * @returns The {owner, repo, branch} source, or undefined if unknown
 */
export function getAppBuilderComponentSource(id: string): AddonSource | undefined {
    return getAppBuilderComponentEntry(id)?.source;
}

/**
 * Get an App Builder component's own env-var schema.
 *
 * @param id - The appBuilderComponent id
 * @returns The env schema array (empty if unknown or none declared)
 */
export function getAppBuilderComponentEnvSchema(id: string): AppBuilderComponentEnvVar[] {
    return getAppBuilderComponentEntry(id)?.envSchema ?? [];
}

/**
 * Get the display name for an App Builder component.
 *
 * @param id - The appBuilderComponent id
 * @returns The name, or the id as fallback
 */
export function getAppBuilderComponentName(id: string): string {
    return getAppBuilderComponentEntry(id)?.name ?? id;
}
