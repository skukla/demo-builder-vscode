/**
 * Stack Loader
 *
 * Utility for loading stacks from JSON configuration files.
 * Filters stacks based on component compatibility matrix from components.json.
 * Used by WelcomeStep to populate the stack selectors.
 *
 * NOTE: loadBrands was replaced by loadDemoPackages in demoPackageLoader.ts
 */

import stacksConfig from '../../../../../templates/stacks.json';
import componentsConfig from '../../../../../templates/components.json';
import type { Stack, StacksConfig } from '@/types/stacks';

interface ComponentDefinition {
    compatibleBackends?: string[];
    [key: string]: unknown;
}

interface ComponentsConfig {
    frontends: Record<string, ComponentDefinition>;
}

/**
 * Check if a stack's frontend is compatible with its backend
 * based on the compatibleBackends array in components.json
 */
function isStackCompatible(stack: Stack, components: Record<string, ComponentDefinition>): boolean {
    const frontendComponent = components[stack.frontend];
    if (!frontendComponent) {
        // Frontend not found in components - allow it (might be external)
        return true;
    }

    const compatibleBackends = frontendComponent.compatibleBackends;
    if (!compatibleBackends || compatibleBackends.length === 0) {
        // No compatibility restrictions defined - allow any backend
        return true;
    }

    return compatibleBackends.includes(stack.backend);
}

/**
 * Load stacks from stacks.json, filtered by component compatibility
 *
 * Only returns stacks where the frontend component is compatible
 * with the backend according to the compatibleBackends matrix
 * defined in components.json.
 *
 * @returns Promise resolving to array of valid stacks
 */
export async function loadStacks(): Promise<Stack[]> {
    const stacks = (stacksConfig as StacksConfig).stacks;
    const frontends = (componentsConfig as ComponentsConfig).frontends;

    return stacks.filter((stack) => isStackCompatible(stack, frontends));
}
