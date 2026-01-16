/**
 * Stack Helpers
 *
 * Utility functions for working with stack configurations.
 * Stack config (stacks.json) is the source of truth for components.
 */

import type { Stack } from '@/types/stacks';

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
