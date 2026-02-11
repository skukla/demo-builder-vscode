/**
 * Shared helper for searching component data across all registry sections.
 *
 * Extracted from duplicate implementations in useComponentConfig and
 * useSelectedComponents (Rule of Three).
 */

/**
 * Searches all component sections (frontends, backends, dependencies, mesh,
 * integrations, appBuilder) for a component matching the given ID.
 *
 * Generic so callers retain their specific ComponentData type in the return.
 */
export function findComponentById<T extends { id: string }>(
    data: {
        frontends?: T[];
        backends?: T[];
        dependencies?: T[];
        mesh?: T[];
        integrations?: T[];
        appBuilder?: T[];
    },
    componentId: string,
): T | undefined {
    return data.frontends?.find(c => c.id === componentId) ||
           data.backends?.find(c => c.id === componentId) ||
           data.dependencies?.find(c => c.id === componentId) ||
           data.mesh?.find(c => c.id === componentId) ||
           data.integrations?.find(c => c.id === componentId) ||
           data.appBuilder?.find(c => c.id === componentId);
}
