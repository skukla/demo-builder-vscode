/**
 * DependencyResolver
 *
 * Resolves prerequisite dependencies using topological sort.
 */

import type { PrerequisiteDefinition } from '../types';

/**
 * Resolve prerequisites in dependency order using topological sort
 * @param prerequisites - Array of prerequisite definitions
 * @returns Array of prerequisites sorted by dependency order
 * @throws Error if circular dependency detected
 */
export function resolveDependencies(
    prerequisites: PrerequisiteDefinition[],
): PrerequisiteDefinition[] {
    const resolved: PrerequisiteDefinition[] = [];
    const resolving = new Set<string>();
    const allPrereqs = new Map(prerequisites.map(p => [p.id, p]));

    const resolve = (prereq: PrerequisiteDefinition) => {
        if (resolved.some(p => p.id === prereq.id)) return;
        if (resolving.has(prereq.id)) {
            throw new Error(`Circular dependency detected: ${prereq.id}`);
        }

        resolving.add(prereq.id);

        if (prereq.depends) {
            for (const depId of prereq.depends) {
                const dep = allPrereqs.get(depId);
                if (dep) {
                    resolve(dep);
                }
            }
        }

        resolved.push(prereq);
        resolving.delete(prereq.id);
    };

    for (const prereq of prerequisites) {
        resolve(prereq);
    }

    return resolved;
}
