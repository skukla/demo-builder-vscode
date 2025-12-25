/**
 * useSelectedComponents Hook
 *
 * Extracts the selected components logic from ConfigureScreen.
 * Handles component selection resolution including dependencies.
 */

import { useMemo } from 'react';
import { getAllComponentDefinitions, discoverComponentsFromInstances, hasComponentEnvVars } from '../configureHelpers';
import type { ComponentsData, ComponentData } from '../configureTypes';
import type { Project } from '@/types/base';

export interface SelectedComponent {
    id: string;
    data: ComponentData;
    type: string;
}

interface UseSelectedComponentsProps {
    project: Project;
    componentsData: ComponentsData;
}

/**
 * Hook to compute selected components with their dependencies
 */
export function useSelectedComponents({
    project,
    componentsData,
}: UseSelectedComponentsProps): SelectedComponent[] {
    return useMemo(() => {
        const components: SelectedComponent[] = [];

        const findComponent = (componentId: string): ComponentData | undefined => {
            return componentsData.frontends?.find(c => c.id === componentId) ||
                   componentsData.backends?.find(c => c.id === componentId) ||
                   componentsData.dependencies?.find(c => c.id === componentId) ||
                   componentsData.integrations?.find(c => c.id === componentId) ||
                   componentsData.appBuilder?.find(c => c.id === componentId);
        };

        const addComponentWithDeps = (comp: ComponentData, type: string) => {
            components.push({ id: comp.id, data: comp, type });

            comp.dependencies?.required?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId) && hasComponentEnvVars(dep)) {
                    components.push({ id: dep.id, data: dep, type: 'Dependency' });
                }
            });

            comp.dependencies?.optional?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId)) {
                    const isSelected = project.componentSelections?.dependencies?.includes(depId);
                    if (isSelected && hasComponentEnvVars(dep)) {
                        components.push({ id: dep.id, data: dep, type: 'Dependency' });
                    }
                }
            });
        };

        if (project.componentSelections?.frontend) {
            const frontend = componentsData.frontends?.find((f: ComponentData) => f.id === project.componentSelections?.frontend);
            if (frontend) addComponentWithDeps(frontend, 'Frontend');
        }

        if (project.componentSelections?.backend) {
            const backend = componentsData.backends?.find((b: ComponentData) => b.id === project.componentSelections?.backend);
            if (backend) addComponentWithDeps(backend, 'Backend');
        }

        project.componentSelections?.dependencies?.forEach((depId: string) => {
            if (!components.some(c => c.id === depId)) {
                const dep = componentsData.dependencies?.find((d: ComponentData) => d.id === depId);
                if (dep && hasComponentEnvVars(dep)) {
                    components.push({ id: dep.id, data: dep, type: 'Dependency' });
                }
            }
        });

        project.componentSelections?.integrations?.forEach((sysId: string) => {
            const sys = componentsData.integrations?.find((s: ComponentData) => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });

        project.componentSelections?.appBuilder?.forEach((appId: string) => {
            const app = componentsData.appBuilder?.find((a: ComponentData) => a.id === appId);
            if (app) addComponentWithDeps(app, 'App Builder');
        });

        // Fallback: discover components from componentInstances if no selections
        if (components.length === 0 && project.componentInstances) {
            const discovered = discoverComponentsFromInstances(
                project.componentInstances,
                getAllComponentDefinitions(componentsData),
            );
            components.push(...discovered);
        }

        return components;
    }, [project.componentSelections, project.componentInstances, componentsData]);
}
