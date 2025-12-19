/**
 * Brand and Stack Loader
 *
 * Utility for loading brands and stacks from JSON configuration files.
 * Filters stacks based on component compatibility matrix from components.json.
 * Used by WelcomeStep to populate the brand and stack selectors.
 */

import brandsConfig from '../../../../../templates/brands.json';
import stacksConfig from '../../../../../templates/stacks.json';
import componentsConfig from '../../../../../templates/components.json';
import type { Brand, BrandsConfig } from '@/types/brands';
import type { Stack, StacksConfig } from '@/types/stacks';

interface ComponentDefinition {
    compatibleBackends?: string[];
    [key: string]: unknown;
}

interface ComponentsConfig {
    components: Record<string, ComponentDefinition>;
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
 * Load brands from brands.json
 *
 * @returns Promise resolving to array of brands
 */
export async function loadBrands(): Promise<Brand[]> {
    const config = brandsConfig as BrandsConfig;
    return config.brands;
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
    const components = (componentsConfig as ComponentsConfig).components;

    return stacks.filter((stack) => isStackCompatible(stack, components));
}
