/**
 * ReviewStep Helpers
 *
 * Utility functions for the ReviewStep component, extracted to improve
 * testability and reduce inline complexity in useMemo hooks.
 */

import React from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { COMPONENT_IDS } from '@/core/constants';
import { cn } from '@/core/ui/utils/classNames';
import type { ComponentData, ComponentsData } from './ReviewStep';

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
 */
interface ComponentsState {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    integrations?: string[];
    appBuilder?: string[];
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
    services: Record<string, { name: string; description?: string }> | undefined
): string[] {
    if (!backendId || !backends || !services) {
        return [];
    }

    const backend = backends.find((b) => b.id === backendId);
    if (!backend) {
        return [];
    }

    // Check if backend PROVIDES services (e.g., ACCS has them built-in)
    const providesServices = (backend.configuration?.providesServices as string[] | undefined) || [];
    if (providesServices.length > 0) {
        return providesServices
            .map((id) => services[id]?.name ? `${services[id].name} (built-in)` : null)
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
 * @param hasDemoInspector - Whether demo inspector is enabled
 * @returns Array of component info items for display
 */
export function buildComponentInfoList(
    components: ComponentsState | undefined,
    meshStatus: string | undefined,
    componentsData: ComponentsData | undefined,
    hasDemoInspector: boolean,
    backendServiceNames?: string[]
): ComponentInfoItem[] {
    if (!components || !componentsData) {
        return [];
    }

    const info: ComponentInfoItem[] = [];

    // Frontend with Demo Inspector indicator
    if (components.frontend && componentsData.frontends) {
        const frontend = componentsData.frontends.find((f) => f.id === components.frontend);
        if (frontend) {
            info.push({
                label: 'Frontend',
                value: frontend.name,
                subItems: hasDemoInspector ? ['Demo Inspector'] : undefined,
            });
        }
    }

    // Middleware (API Mesh)
    if (components.dependencies?.includes(COMPONENT_IDS.COMMERCE_MESH) && componentsData.dependencies) {
        const mesh = componentsData.dependencies.find((d) => d.id === COMPONENT_IDS.COMMERCE_MESH);
        if (mesh) {
            const isDeployed = meshStatus === 'deployed';
            info.push({
                label: 'Middleware',
                value: isDeployed ? (
                    <Flex gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-md">{mesh.name}</Text>
                        <Text UNSAFE_className={cn('text-md', 'text-gray-500')}>·</Text>
                        <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
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

    // Other dependencies (not mesh, not demo-inspector which is frontend-associated)
    if (components.dependencies && componentsData.dependencies) {
        const otherDeps = components.dependencies
            .filter((id) => id !== COMPONENT_IDS.COMMERCE_MESH && id !== COMPONENT_IDS.DEMO_INSPECTOR)
            .map((id) => componentsData.dependencies?.find((d) => d.id === id))
            .filter(Boolean);

        if (otherDeps.length > 0) {
            info.push({
                label: 'Dependencies',
                value: otherDeps.map((d) => d!.name).join(', '),
            });
        }
    }

    // Integrations
    if (components.integrations && componentsData.integrations) {
        const integrations = components.integrations
            .map((id) => componentsData.integrations?.find((i) => i.id === id))
            .filter(Boolean);

        if (integrations.length > 0) {
            info.push({
                label: 'Integrations',
                value: integrations.map((i) => i!.name).join(', '),
            });
        }
    }

    // App Builder
    if (components.appBuilder && componentsData.appBuilder) {
        const apps = components.appBuilder
            .map((id) => componentsData.appBuilder?.find((a) => a.id === id))
            .filter(Boolean);

        if (apps.length > 0) {
            info.push({
                label: 'App Builder',
                value: apps.map((a) => a!.name).join(', '),
            });
        }
    }

    return info;
}
