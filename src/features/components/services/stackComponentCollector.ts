/**
 * stackComponentCollector — which components a stack puts on the Configure screen.
 *
 * A stack contributes its frontend, its backend, and dependencies drawn from three
 * places: each component's `required` deps, each component's `optional` deps that
 * the stack actually selected, and the stack's own `dependencies` list.
 *
 * All three apply the SAME rule — take the dependency only if it resolves, is not
 * already collected, and has env vars worth configuring — which had been written
 * out three times inside `useComponentConfig` (duplication scan, 2026-07-31).
 * Extracted here as PURE functions: the logic never needed React, and inside the
 * hook it was unreachable by tests (`selectedComponents` is internal, feeding
 * `serviceGroups`).
 *
 * @module features/components/services/stackComponentCollector
 */

import { findComponentById } from '@/core/ui/utils/componentDataHelpers';

/** The shape this module needs from a component definition. */
interface CollectableComponent {
    id: string;
    dependencies?: { required?: string[]; optional?: string[] };
    configuration?: { requiredEnvVars?: string[]; optionalEnvVars?: string[] };
}

/** The shape this module needs from a stack definition. */
interface CollectableStack {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
}

/** One collected entry, as the Configure screen consumes it. */
export interface CollectedComponent<T> {
    id: string;
    data: T;
    type: string;
}

/**
 * Whether a component has anything for the user to configure.
 *
 * A dependency with no env vars would render as an empty section, so it is not
 * collected at all.
 *
 * @param component - the component definition to test
 * @returns true when it declares at least one required or optional env var
 */
export function hasConfigurableEnvVars(component: CollectableComponent | undefined): boolean {
    if (!component) return false;
    const required = component.configuration?.requiredEnvVars?.length ?? 0;
    const optional = component.configuration?.optionalEnvVars?.length ?? 0;
    return required + optional > 0;
}

/**
 * Collect every component a stack contributes, in Configure-screen order:
 * frontend, backend, then the stack's own dependencies — each followed by its
 * qualifying dependencies.
 *
 * @param stack - the resolved stack definition, or undefined when none is selected
 * @param componentsData - the full components registry (searched by id)
 * @returns the collected entries; empty when there is no stack
 */
export function collectStackComponents<T extends CollectableComponent>(
    stack: CollectableStack | undefined,
    componentsData: unknown,
): Array<CollectedComponent<T>> {
    const collected: Array<CollectedComponent<T>> = [];
    if (!stack) return collected;

    /** The ONE dependency rule, applied by all three sources. */
    const addDependency = (depId: string): void => {
        if (collected.some((entry) => entry.id === depId)) return;
        const dep = findComponentById(componentsData as never, depId) as T | undefined;
        if (!hasConfigurableEnvVars(dep)) return;
        collected.push({ id: (dep as T).id, data: dep as T, type: 'Dependency' });
    };

    const addWithDeps = (component: T, type: string): void => {
        collected.push({ id: component.id, data: component, type });
        component.dependencies?.required?.forEach(addDependency);
        // An optional dep is taken ONLY when the stack selected it — the single
        // asymmetry between the three sources, and it belongs to the caller rather
        // than to the shared rule.
        component.dependencies?.optional?.forEach((depId) => {
            if (stack.dependencies?.includes(depId)) addDependency(depId);
        });
    };

    const sections = componentsData as { frontends?: T[]; backends?: T[] } | undefined;

    if (stack.frontend) {
        const frontend = sections?.frontends?.find((entry) => entry.id === stack.frontend);
        if (frontend) addWithDeps(frontend, 'Frontend');
    }
    if (stack.backend) {
        const backend = sections?.backends?.find((entry) => entry.id === stack.backend);
        if (backend) addWithDeps(backend, 'Backend');
    }
    // Searched across ALL registry sections, not just `dependencies`, so mesh
    // components (eds-accs-mesh, eds-commerce-mesh) are included.
    stack.dependencies?.forEach(addDependency);

    return collected;
}
