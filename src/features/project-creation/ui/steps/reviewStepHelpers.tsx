/**
 * ReviewStep Helpers
 *
 * Utility functions for the ReviewStep component, extracted to improve
 * testability and reduce inline complexity in useMemo hooks.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import type { ComponentData, ComponentsData } from './ReviewStep';
import { meshComponentForStack } from './tileStatus';
import { hasMeshInDependencies, isMeshComponentId } from '@/core/constants';
import { cn } from '@/core/ui/utils/classNames';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { resolveIntegrationRows } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/**
 * Component info item structure for the review list.
 */
export interface ComponentInfoItem {
    label: string;
    value: React.ReactNode;
    subItems?: string[];
}

/**
 * Components state shape from wizard state.
 *
 * Deliberately WITHOUT `integrations`/`appBuilder` id lists: those fields exist
 * on the persisted config only as a legacy fallback (`selectedAppBuilderIds` in
 * executor.ts), and the wizard hardcodes them empty — the Review screen renders
 * integrations from the resolved names instead (resolveReviewIntegrationNames).
 */
interface ComponentsState {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
}

/**
 * Resolves service IDs to their display names.
 *
 * Finds the backend by ID, extracts its required service IDs, and maps them
 * to human-readable names from the services registry.
 *
 * @param backendId - ID of the selected backend
 * @param backends - Array of available backend components
 * @param services - Map of service ID to service metadata
 * @returns Array of resolved service names (empty if any input is missing)
 */
export function resolveServiceNames(
    backendId: string | undefined,
    backends: ComponentData[] | undefined,
    services: Record<string, { name: string; description?: string }> | undefined,
): string[] {
    if (!backendId || !backends || !services) {
        return [];
    }

    const backend = backends.find((b) => b.id === backendId);
    if (!backend) {
        return [];
    }

    // Check if backend PROVIDES services (e.g., ACCS has them built-in)
    const providesServices =
        (backend.configuration?.providesServices as string[] | undefined) || [];
    if (providesServices.length > 0) {
        return providesServices
            .map((id) => (services[id]?.name ? `${services[id].name} (built-in)` : null))
            .filter((name): name is string => Boolean(name));
    }

    // Otherwise, check REQUIRED services (e.g., PaaS needs them)
    const serviceIds = (backend.configuration?.requiredServices as string[] | undefined) || [];
    return serviceIds
        .map((id) => services[id]?.name)
        .filter((name): name is string => Boolean(name));
}

/**
 * Builds the component info list for the review step.
 *
 * Aggregates all selected components (frontend, middleware, backend,
 * dependencies, integrations, app builder) into a list of display items.
 *
 * @param components - Selected components from wizard state
 * @param meshStatus - Current API mesh deployment status
 * @param componentsData - Full components registry data
 * @returns Array of component info items for display
 */
export function buildComponentInfoList(
    components: ComponentsState | undefined,
    meshStatus: string | undefined,
    componentsData: ComponentsData | undefined,
    backendServiceNames?: string[],
    integrationNames?: string[],
): ComponentInfoItem[] {
    if (!components || !componentsData) {
        return [];
    }

    const info: ComponentInfoItem[] = [];

    // Frontend
    if (components.frontend && componentsData.frontends) {
        const frontend = componentsData.frontends.find((f) => f.id === components.frontend);
        if (frontend) {
            info.push({
                label: 'Frontend',
                value: frontend.name,
            });
        }
    }

    // Middleware (API Mesh) - check if any mesh component is selected
    // Search componentsData.mesh (not dependencies) since mesh components live there
    if (hasMeshInDependencies(components.dependencies) && componentsData.mesh) {
        const mesh = componentsData.mesh.find((d) => isMeshComponentId(d.id));
        if (mesh) {
            const isDeployed = meshStatus === 'deployed';
            info.push({
                label: 'Middleware',
                value: isDeployed ? (
                    <Flex gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-md">{mesh.name}</Text>
                        <Text UNSAFE_className={cn('text-md', 'text-gray-500')}>·</Text>
                        <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                        <Text UNSAFE_className="text-md">Deployed</Text>
                    </Flex>
                ) : (
                    mesh.name
                ),
            });
        }
    }

    // Backend with features
    if (components.backend && componentsData.backends) {
        const backend = componentsData.backends.find((b) => b.id === components.backend);
        if (backend) {
            const features = backendServiceNames || [];
            info.push({
                label: 'Backend',
                value: backend.name,
                subItems: features.length > 0 ? features : undefined,
            });
        }
    }

    // Other dependencies (not mesh)
    if (components.dependencies && componentsData.dependencies) {
        const otherDeps = components.dependencies
            .filter((id) => !isMeshComponentId(id))
            .map((id) => componentsData.dependencies?.find((d) => d.id === id))
            .filter((d): d is NonNullable<typeof d> => Boolean(d));

        if (otherDeps.length > 0) {
            info.push({
                label: 'Dependencies',
                value: otherDeps.map((d) => d.name).join(', '),
            });
        }
    }

    // Integrations — the resolved display names (mesh excluded; it renders as
    // Middleware above). Fed by resolveReviewIntegrationNames, NOT by the
    // legacy `components.integrations`/`components.appBuilder` id lists: the
    // only caller never populated those (buildProjectConfig hardcodes both to
    // []), so this section rendered nothing for every hand-picked integration
    // while its unit tests — which passed the fields directly — stayed green.
    if (integrationNames && integrationNames.length > 0) {
        info.push({
            label: 'Integrations',
            value: integrationNames.join(', '),
        });
    }

    return info;
}

/**
 * Resolve the wizard's selected integrations to display names for Review.
 *
 * Rides the SAME resolver the builder summary and IntegrationsStep render from
 * (`resolveIntegrationRows`), so a custom import shows its user-facing name
 * (falling back to the repo), a shell instance shows its given name, and a
 * catalog entry shows its catalog name. Mesh rows are excluded — the mesh
 * renders as Middleware in the component list already.
 *
 * @param state - Wizard state (selection ids + custom sources + API picks)
 * @param packages - Demo package catalog (for the stack's mesh entry)
 * @param stacks - Stack catalog (for the stack's mesh entry)
 * @returns One display name per configured non-mesh integration
 */
export function resolveReviewIntegrationNames(
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): string[] {
    const stack = state.selectedStack
        ? stacks.find((s) => s.id === state.selectedStack)
        : undefined;
    const catalog = getAvailableAppBuilderComponents(
        stack?.backend ?? '',
        stack?.frontend ?? '',
    ).filter((entry) => entry.kind === 'integration');
    return resolveIntegrationRows(state, meshComponentForStack(state, packages, stacks), catalog)
        .filter((row) => row.kind !== 'mesh')
        .map((row) => row.name);
}
