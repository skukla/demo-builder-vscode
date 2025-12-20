/**
 * Stack Helpers
 *
 * Utility functions for deriving component selections from stacks
 * and getting content sources based on brand and stack combination.
 */

import type { Brand } from '@/types/brands';
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
        appBuilderApps: [],
    };
}

/**
 * Get the content source URL for a brand based on stack type
 *
 * Currently only Edge Delivery stacks use content sources (DA.live).
 * Returns undefined for other stack types.
 *
 * @param brand - The brand definition containing content sources
 * @param stackId - The stack ID to get content source for
 * @returns The content source URL or undefined if not applicable
 */
export function getContentSourceForBrand(brand: Brand, stackId: string): string | undefined {
    if (stackId === 'edge-delivery') {
        return brand.contentSources?.eds;
    }
    return undefined;
}
