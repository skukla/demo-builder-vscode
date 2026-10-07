/**
 * Prerequisite Handlers - Node version requirements
 *
 * Which Node major versions the selected components need, read from the
 * component registry, and the one set a per-Node tool is installed under.
 */

import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import { adobeCliNodeVersion } from '@/features/components/services/nodeRequirements';
import { ComponentSelection } from '@/types/components';
import { HandlerContext } from '@/types/handlers';

/**
 * Type alias for Node version mapping (major version → component name)
 */
export type NodeVersionMapping = Record<string, string>;

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
 * The Node majors a per-Node tool (the Adobe CLI and its plugins) must be installed
 * under: the Adobe CLI's own (PR-1a). Every check, install, post-install check and
 * plugin install reads this one set. Before, there were three: the check narrowed by
 * plugin `requiredFor` ids, the install post-check took every major, and the plugin
 * install compared those ids to display NAMES, so it never matched and fell back to
 * the first version. An App Builder component that declares its own Node gets the
 * CLI under it at its add door (`nodeEnsure.ts`), not here.
 */
export function perNodeToolMajors(): string[] {
    return [adobeCliNodeVersion()];
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
