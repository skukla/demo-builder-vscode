/**
 * Project-level predicate: does this demo include any App Builder components?
 *
 * A demo can include a Commerce backend, an EDS storefront, an AEM Sites
 * connection, an API Mesh, a custom App Builder app (Firefly services,
 * integration services, etc.), and other components. Some of those involve
 * App Builder; most don't. The Adobe IMS Developer/System-Admin role is only
 * needed when the project has at least one App Builder component.
 *
 * This predicate is the single source of truth for that question. Callers
 * gate Developer-role checks on it. The mesh deployment and project
 * creation paths use it today; any future App Builder operation entry point
 * (an integration-service deployment handler, a Firefly bridge installer,
 * etc.) uses the same predicate before invoking
 * `testDeveloperPermissions()`.
 *
 * What counts as "an App Builder component" is defined by the component
 * registry — specifically, anything in the `mesh` or `appBuilderApps`
 * sections of `components.json`. Adding a new App Builder component type
 * to that registry automatically extends this predicate; no changes to
 * the gating logic are needed.
 *
 * @module features/components/services/projectAppBuilderPredicate
 */

import type { Project } from '@/types/base';
import type { ComponentRegistry } from '@/types/components';

/**
 * Returns true when the project has at least one installed component that
 * runs on Adobe App Builder. Returns false for projects that include only
 * storefront, backend, and integration components that don't require App
 * Builder.
 *
 * Inspects `project.componentInstances` (the post-install component set)
 * against the registry's `mesh` and `appBuilder` categories. Returns false
 * if `componentInstances` isn't populated yet — callers using this before
 * install should query the registry directly from `componentSelections`.
 */
export function projectRequiresAppBuilder(
    project: Project | null | undefined,
    registry: ComponentRegistry,
): boolean {
    if (!project?.componentInstances) return false;

    const appBuilderIds = new Set<string>([
        ...(registry.components.mesh ?? []).map((c) => c.id),
        ...(registry.components.appBuilder ?? []).map((c) => c.id),
    ]);

    return Object.values(project.componentInstances).some(
        (instance) => appBuilderIds.has(instance.id),
    );
}
