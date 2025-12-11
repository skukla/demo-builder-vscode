/**
 * Component Summary Utilities
 *
 * Utility functions for generating human-readable component summaries
 * for display on project cards and rows.
 */

import type { Project } from '@/types/base';
import { getComponentInstanceValues } from '@/types/typeGuards';

/**
 * Component display name mappings
 *
 * Maps component IDs to short, human-readable display names.
 * Falls back to the component's name field if not in this map.
 */
const COMPONENT_DISPLAY_NAMES: Record<string, string> = {
    // Frontends
    'citisignal-nextjs': 'CitiSignal',
    'carvelo-nextjs': 'Carvelo',
    'lagunitas-nextjs': 'Lagunitas',
    // App Builder
    'commerce-mesh': 'API Mesh',
    'demo-inspector': 'Inspector',
    // Add more as needed
};

/**
 * Gets a short display name for a component
 *
 * @param id - Component ID
 * @param name - Component's original name
 * @returns Short display name
 */
function getDisplayName(id: string, name: string): string {
    return COMPONENT_DISPLAY_NAMES[id] || name;
}

/**
 * Generates a summary string of installed components for a project
 *
 * Returns component names joined with " · " (e.g., "CitiSignal · API Mesh")
 * Returns undefined if no components are installed.
 *
 * @param project - The project to summarize
 * @param maxComponents - Maximum number of components to show (default: 3)
 * @returns Summary string or undefined
 */
export function getComponentSummary(
    project: Project,
    maxComponents = 3
): string | undefined {
    if (!project.componentInstances) {
        return undefined;
    }

    const instances = getComponentInstanceValues(project);
    if (instances.length === 0) {
        return undefined;
    }

    // Get display names for components
    const names = instances
        .map((c) => getDisplayName(c.id, c.name))
        .slice(0, maxComponents);

    // If there are more components than we're showing, indicate that
    const remaining = instances.length - maxComponents;
    if (remaining > 0) {
        return `${names.join(' · ')} +${remaining}`;
    }

    return names.join(' · ');
}

/**
 * Gets the count of installed components
 *
 * @param project - The project to count components for
 * @returns Number of installed components
 */
export function getComponentCount(project: Project): number {
    if (!project.componentInstances) {
        return 0;
    }
    return getComponentInstanceValues(project).length;
}
