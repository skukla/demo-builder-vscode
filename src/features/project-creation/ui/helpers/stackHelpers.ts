/**
 * Stack Helpers
 *
 * Utility functions for deriving component selections from stacks.
 */

import type { Stack } from '@/types/stacks';
import type { ComponentSelection } from '@/types/webview';

/**
 * Derive component selection from a stack definition
 *
 * Takes a stack definition and returns a ComponentSelection object
 * with the frontend, backend, and dependencies pre-populated.
 *
 * @param stack - The stack definition to derive components from
 * @returns ComponentSelection with frontend, backend, dependencies, and empty arrays for others
 */
export function deriveComponentsFromStack(stack: Stack): ComponentSelection {
    return {
        frontend: stack.frontend,
        backend: stack.backend,
        dependencies: stack.dependencies,
        integrations: [],
        appBuilder: [],
    };
}

/**
 * Get all component IDs from a stack definition
 *
 * Extracts frontend, backend, dependencies, and optional addons into a flat array.
 *
 * @param stack - The stack definition
 * @returns Array of all component IDs in the stack
 */
export function getStackComponentIds(stack: Stack): string[] {
    return [
        stack.frontend,
        stack.backend,
        ...stack.dependencies,
        ...(stack.optionalAddons || []).map(addon => addon.id),
    ];
}

/**
 * Filter component configs when switching between stacks
 *
 * Retains configs for components that exist in BOTH old and new stacks,
 * clears configs for components that are removed in the new stack.
 * This preserves user's work when switching between architectures that
 * share common components (e.g., switching backends but keeping frontend).
 *
 * @param oldStack - The previous stack definition (or undefined if first selection)
 * @param newStack - The new stack definition being selected
 * @param currentConfigs - Current component configurations
 * @returns Filtered configs containing only components that remain in new stack
 *
 * @example
 * // Switching from headless-paas to headless-accs
 * // - frontend: "headless" → "headless" → KEEP config
 * // - backend: "adobe-commerce-paas" → "adobe-commerce-accs" → CLEAR config
 * // - dependencies: ["commerce-mesh", "demo-inspector"] → same → KEEP configs
 */
export function filterComponentConfigsForStackChange<T extends Record<string, unknown>>(
    oldStack: Stack | undefined,
    newStack: Stack,
    currentConfigs: T,
): T {
    // If no previous stack or no configs, nothing to filter
    if (!oldStack || !currentConfigs || Object.keys(currentConfigs).length === 0) {
        return {} as T;
    }

    // Get component IDs from both stacks
    const oldComponentIds = new Set(getStackComponentIds(oldStack));
    const newComponentIds = new Set(getStackComponentIds(newStack));

    // Find components that exist in BOTH stacks
    const retainedComponentIds = [...oldComponentIds].filter(id => newComponentIds.has(id));

    // Filter configs to only keep retained components
    const filteredConfigs: Record<string, unknown> = {};
    for (const componentId of retainedComponentIds) {
        if (componentId in currentConfigs) {
            filteredConfigs[componentId] = currentConfigs[componentId];
        }
    }

    return filteredConfigs as T;
}
