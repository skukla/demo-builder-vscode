/**
 * Prerequisite Handlers - Node version requirements
 *
 * Which Node major versions the selected components need, read from the
 * component registry, and the pure helpers that narrow those mappings to the
 * majors a single prerequisite (or its plugins) actually requires.
 */

import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import { ComponentSelection } from '@/types/components';
import { HandlerContext } from '@/types/handlers';

/**
 * Type alias for Node version mapping (major version → component name)
 */
export type NodeVersionMapping = Record<string, string>;

/**
 * Type alias for Node version ID mapping (major version → component ID)
 * Used for programmatic filtering (e.g., matching against plugin requiredFor arrays)
 */
export type NodeVersionIdMapping = Record<string, string>;

/**
 * Check if node version mapping has any entries
 *
 * Extracts the common pattern `Object.keys(nodeVersionMapping).length > 0`
 * to a semantic helper for better readability and consistency.
 *
 * @param mapping - Node version mapping object
 * @returns true if the mapping has at least one entry
 */
export function hasNodeVersions(mapping: NodeVersionMapping): boolean {
    return Object.keys(mapping).length > 0;
}

/**
 * Get sorted array of Node major versions from mapping
 *
 * @param mapping - Node version mapping object
 * @returns Array of major version strings, sorted ascending (e.g., ['18', '20', '24'])
 */
export function getNodeVersionKeys(mapping: NodeVersionMapping): string[] {
    return Object.keys(mapping).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * Resolve the required Node major versions for a per-node-version prerequisite.
 * Checks the prereq's requiredFor, falls back to plugin requiredFor, then all
 * Node versions.
 *
 * SHARED between checkHandler and continueHandler (moved here 2026-08-27):
 * continue used to demand the variant on EVERY major, so on stacks whose
 * components span Node majors (headless: frontend 24, mesh 20) a green check
 * flipped to a blocking 'error' on Continue for a major nothing required.
 */
export function resolveRequiredMajors(
    prereq: { requiredFor?: string[]; plugins?: { requiredFor?: string[] }[] },
    nodeVersionMapping: Record<string, string>,
    nodeVersionIdMapping: Record<string, string>,
): string[] {
    let requiredForComponents: string[] | undefined = prereq.requiredFor;
    if ((!requiredForComponents || requiredForComponents.length === 0) && prereq.plugins) {
        // No filter: flatMap's `?? []` already drops a plugin that declares no
        // requiredFor, and one declaring an empty list contributes nothing either.
        // A mutation run showed the guard could not change the result.
        const allPluginRequired = prereq.plugins.flatMap((p) => p.requiredFor ?? []);
        if (allPluginRequired.length > 0) {
            requiredForComponents = [...new Set(allPluginRequired)];
        }
    }

    return requiredForComponents && requiredForComponents.length > 0
        ? getPluginNodeVersions(nodeVersionIdMapping, requiredForComponents)
        : getNodeVersionKeys(nodeVersionMapping);
}

/**
 * Get Node versions that require a specific plugin
 *
 * Filters the nodeVersionIdMapping to find which Node versions are used by
 * components that require this plugin (via requiredFor array).
 *
 * Note: Uses nodeVersionIdMapping (component IDs) for filtering, NOT
 * nodeVersionMapping (display names). This distinction is critical because
 * requiredForComponents contains component IDs like 'commerce-mesh', not
 * display names like 'Adobe Commerce API Mesh'.
 *
 * @param nodeVersionIdMapping - Mapping of Node major version to component IDs (comma-separated if multiple)
 * @param requiredForComponents - Array of component IDs that require this plugin
 * @returns Array of Node major versions that need this plugin installed
 *
 * @example
 * // Plugin required by 'commerce-mesh' component, which uses Node 20
 * const versions = getPluginNodeVersions(
 *     { '20': 'commerce-mesh', '24': 'headless' },  // ID mapping
 *     ['commerce-mesh']                              // plugin's requiredFor
 * );
 * // Returns: ['20']
 */
export function getPluginNodeVersions(
    nodeVersionIdMapping: NodeVersionIdMapping,
    requiredForComponents: string[],
): string[] {
    const pluginNodeVersions: string[] = [];

    // Check component ID matches in nodeVersionIdMapping
    // Value may contain multiple IDs comma-separated (e.g., "eds,commerce-mesh")
    for (const [nodeVersion, componentIds] of Object.entries(nodeVersionIdMapping)) {
        const ids = componentIds.split(',');
        if (ids.some((id) => requiredForComponents.includes(id))) {
            pluginNodeVersions.push(nodeVersion);
        }
    }

    return pluginNodeVersions;
}

/**
 * Helper to extract component selection parameters for registry manager calls
 */
function getComponentSelectionParams(
    selection: ComponentSelection,
): [string | undefined, string | undefined, string[] | undefined, string[] | undefined] {
    return [selection.frontend, selection.backend, selection.dependencies, selection.integrations];
}

/**
 * Get Node version mapping from component selection
 *
 * Returns a map of Node major versions to component names that require them.
 * Component-driven approach: versions are determined by what components need.
 *
 * @param context - Handler context with component selection
 * @returns Mapping of Node major version to component name (e.g., {'18': 'frontend', '20': 'backend'})
 *
 * @example
 * // User selected:
 * // - frontend: headless (requires Node 18)
 * // - backend: adobe-commerce-paas (requires Node 20)
 * const mapping = await getNodeVersionMapping(context);
 * // Returns: { '18': 'headless', '20': 'adobe-commerce-paas' }
 */
export async function getNodeVersionMapping(
    context: HandlerContext,
): Promise<Record<string, string>> {
    if (!context.sharedState.currentComponentSelection) {
        return {};
    }

    try {
        const registryManager = componentRegistryFrom(context);
        const params = getComponentSelectionParams(context.sharedState.currentComponentSelection);
        const mapping = await registryManager.getNodeVersionToComponentMapping(...params);

        return mapping;
    } catch (error) {
        // INTENTIONALLY RETURNS EMPTY: If component registry fails to load,
        // prerequisites check proceeds without Node version mapping. This is
        // acceptable because Node versions will still be detected via system
        // check - we just lose the component-to-version association display.
        context.logger.warn('Failed to get Node version mapping:', error as Error);
        return {};
    }
}

/**
 * Get Node version to component ID mapping from component selection
 *
 * Returns a map of Node major versions to component IDs that require them.
 * Unlike getNodeVersionMapping which returns display names for UI,
 * this returns component IDs for programmatic filtering (e.g., matching
 * against plugin requiredFor arrays).
 *
 * @param context - Handler context with component selection
 * @returns Mapping of Node major version to component IDs (e.g., {'20': 'commerce-mesh', '24': 'headless'})
 *
 * @example
 * // User selected:
 * // - frontend: headless (requires Node 24)
 * // - dependencies: commerce-mesh (requires Node 20)
 * const mapping = await getNodeVersionIdMapping(context);
 * // Returns: { '20': 'commerce-mesh', '24': 'headless' }
 */
export async function getNodeVersionIdMapping(
    context: HandlerContext,
): Promise<NodeVersionIdMapping> {
    if (!context.sharedState.currentComponentSelection) {
        return {};
    }

    try {
        const registryManager = componentRegistryFrom(context);
        const params = getComponentSelectionParams(context.sharedState.currentComponentSelection);
        const mapping = await registryManager.getNodeVersionToComponentIdMapping(...params);

        return mapping;
    } catch (error) {
        // INTENTIONALLY RETURNS EMPTY: Same graceful degradation as getNodeVersionMapping.
        context.logger.warn('Failed to get Node version ID mapping:', error as Error);
        return {};
    }
}

/**
 * Get required Node versions from component selection
 *
 * Returns array of Node major versions required by selected components.
 * Component-driven approach: versions determined by what components need.
 */
export async function getRequiredNodeVersions(context: HandlerContext): Promise<string[]> {
    if (!context.sharedState.currentComponentSelection) {
        context.debugLogger.debug(
            '[Prerequisites] No component selection - no Node versions required',
            {
                hasSelection: false,
            },
        );
        return [];
    }

    try {
        const registryManager = componentRegistryFrom(context);
        const params = getComponentSelectionParams(context.sharedState.currentComponentSelection);
        const mapping = await registryManager.getRequiredNodeVersions(...params);
        // Sort versions in ascending order (18, 20, 24) for predictable installation order
        const sortedVersions = Array.from(mapping).sort(
            (a, b) => parseInt(a, 10) - parseInt(b, 10),
        );

        context.debugLogger.debug('[Prerequisites] Detected component Node requirements', {
            frontend: context.sharedState.currentComponentSelection.frontend,
            backend: context.sharedState.currentComponentSelection.backend,
            dependencies: context.sharedState.currentComponentSelection.dependencies,
            integrations: context.sharedState.currentComponentSelection.integrations,
            totalVersions: sortedVersions.length,
            versions: sortedVersions,
        });

        return sortedVersions;
    } catch {
        // INTENTIONALLY RETURNS EMPTY: Same graceful degradation as getNodeVersionMapping.
        // If we can't determine required versions, prerequisites check falls back to
        // default behavior (checking system Node only).
        return [];
    }
}
