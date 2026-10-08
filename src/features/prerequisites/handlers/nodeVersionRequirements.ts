/**
 * Prerequisite Handlers - Node version requirements
 *
 * Which Node major versions the selected components need, read from the
 * component registry, and the one set a per-Node tool is installed under.
 */

import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
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
    return [demoBuilderNode()];
}

/**
 * The Node a project's prerequisites prepare, labelled for the prerequisites screen:
 * one entry, Demo Builder's own Node, which every component it ships runs on (PR-1a).
 * Empty before a stack is chosen, as before.
 */
export async function getNodeVersionMapping(
    context: HandlerContext,
): Promise<Record<string, string>> {
    if (!context.sharedState.currentComponentSelection) {
        return {};
    }
    return { [demoBuilderNode()]: 'Demo Builder' };
}
