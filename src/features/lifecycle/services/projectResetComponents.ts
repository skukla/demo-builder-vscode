/**
 * What a reset rebuilds, read from the saved project: the stack's frontend and the saved
 * dependencies, each resolved to its catalog entry, the frontend's source restored from its saved
 * instance. Split out of `projectResetService` (step-05 S6, 2026-11-13) when the reset took on the
 * datapack step and passed the service limit; the reset itself is its only caller.
 *
 * @module features/lifecycle/services/projectResetComponents
 */

import { getComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { toComponentDefinitionEntry } from '@/features/project-creation/services/componentDefinitionEntry';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { Project } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { HandlerContext } from '@/types/handlers';
import type { Stack } from '@/types/stacks';

/** Result of loading component definitions, includes registry for reuse */
export interface LoadResult {
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    registry: ComponentRegistry;
    stack: Stack;
}

/** Look up a component definition by type from the registry manager */
async function findComponentByType(
    registryManager: {
        getFrontends: () => Promise<TransformedComponentDefinition[]>;
        getDependencies: () => Promise<TransformedComponentDefinition[]>;
        getComponentById: (id: string) => Promise<TransformedComponentDefinition | undefined>;
    },
    comp: { id: string; type: string },
): Promise<TransformedComponentDefinition | undefined> {
    if (comp.type === 'frontend') {
        const frontends = await registryManager.getFrontends();
        return frontends.find((f: { id: string }) => f.id === comp.id);
    }
    if (comp.type === 'dependency') {
        const deps = await registryManager.getDependencies();
        return deps.find((d: { id: string }) => d.id === comp.id);
    }
    return undefined;
}

/** Build the flat component list from stack + saved selections */
export function buildComponentList(stack: Stack, project: Project): { id: string; type: string }[] {
    const frontend = stack.frontend;
    // Use project's saved dependencies (includes user-selected optional deps like mesh) or fall back to stack defaults
    const dependencies = project.componentSelections?.dependencies ?? stack.dependencies ?? [];
    // No integrations: reset leaves them alone (see `integrationIds` in `projectResetService`).
    return [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...dependencies.map((id: string) => ({ id, type: 'dependency' })),
    ];
}

/**
 * Reconstruct component definitions from saved project state.
 *
 * Uses the same logic as executor.ts loadComponentDefinitions() but reads
 * from the saved project (selectedStack, selectedAddons, componentInstances)
 * instead of the wizard's ProjectCreationConfig.
 *
 * Returns the registry alongside definitions so callers can reuse it
 * (avoids duplicate file I/O).
 */
export async function loadComponentDefinitionsFromProject(
    project: Project,
    context: HandlerContext,
): Promise<LoadResult> {
    const registryManager = getComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    const stack = project.selectedStack ? getStackById(project.selectedStack) : undefined;

    if (!stack) {
        throw new Error(`Stack "${project.selectedStack}" not found in stacks.json. Cannot reset.`);
    }

    const allComponents = buildComponentList(stack, project);

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef = await findComponentByType(registryManager, comp);

        // Fallback: search all sections (e.g., mesh in "mesh" section)
        if (!componentDef) {
            componentDef = await registryManager.getComponentById(comp.id);
        }

        if (!componentDef) {
            context.logger.warn(`[ProjectReset] Component ${comp.id} not found in registry`);
            continue;
        }

        // For frontend, restore source URL from saved componentInstance
        if (comp.type === 'frontend') {
            const savedInstance = project.componentInstances?.[comp.id];
            if (savedInstance?.repoUrl) {
                componentDef = {
                    ...componentDef,
                    source: {
                        type: 'git' as const,
                        url: savedInstance.repoUrl,
                        branch: savedInstance.branch || 'main',
                    },
                };
            }
        }

        if (!componentDef.source) {
            context.logger.warn(`[ProjectReset] Component ${comp.id} has no source, skipping`);
            continue;
        }

        componentDefinitions.set(comp.id, toComponentDefinitionEntry(componentDef, comp.type));
    }

    return { componentDefinitions, registry, stack };
}
