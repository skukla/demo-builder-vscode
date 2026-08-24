/**
 * Project Creation — component-definition loading.
 *
 * Resolves the stack's component list (frontend + dependencies + App Builder
 * selections) into registry definitions, with the frontend's source swapped
 * for the EDS repo / template source where the stack calls for it. Extracted
 * from `executor.ts` (2026-08-23 god-file decomposition).
 *
 * @module features/project-creation/handlers/executorComponentLoading
 */

import type { ComponentDefinitionEntry } from '../services';
import type { HandlerContext } from '@/types/handlers';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Look up a component definition by type from the registry.
 */
async function lookupComponentDef(
    compId: string,
    compType: string,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
): Promise<TransformedComponentDefinition | undefined> {
    let componentDef: TransformedComponentDefinition | undefined;

    if (compType === 'frontend') {
        const frontends = await registryManager.getFrontends();
        componentDef = frontends.find((f: { id: string }) => f.id === compId);
    } else if (compType === 'dependency') {
        const deps = await registryManager.getDependencies();
        componentDef = deps.find((d: { id: string }) => d.id === compId);
    } else if (compType === 'app-builder') {
        const apps = await registryManager.getAppBuilder();
        componentDef = apps.find((a: { id: string }) => a.id === compId);
    }

    // Fallback: search all sections (e.g., mesh components in "mesh" section)
    if (!componentDef) {
        componentDef = await registryManager.getComponentById(compId);
    }

    // Tag app components so installed instances are distinguishable by
    // getAppBuilderInstance (subType: 'app').
    if (componentDef && compType === 'app-builder') {
        componentDef = { ...componentDef, subType: 'app' };
    }

    return componentDef;
}

/**
 * Resolve the source for a frontend component based on stack type.
 */
function resolveFrontendSource(
    componentDef: TransformedComponentDefinition,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    logger: Logger,
): TransformedComponentDefinition {
    if (isEdsStack && typedConfig.edsConfig?.repoUrl) {
        logger.debug(
            `[Project Creation] Using EDS repo source for ${componentDef.name}: ${typedConfig.edsConfig.repoUrl}`,
        );
        return {
            ...componentDef,
            source: { type: 'git' as const, url: typedConfig.edsConfig.repoUrl, branch: 'main' },
        };
    }

    if (typedConfig.frontendSource) {
        logger.debug(
            `[Project Creation] Using template source for ${componentDef.name}: ${typedConfig.frontendSource.url}`,
        );
        return {
            ...componentDef,
            source: {
                type: typedConfig.frontendSource.type as 'git' | 'npm' | 'local',
                url: typedConfig.frontendSource.url,
                branch: typedConfig.frontendSource.branch,
                gitOptions: typedConfig.frontendSource.gitOptions,
            },
        };
    }

    return componentDef;
}

export async function loadComponentDefinitions(
    typedConfig: ProjectCreationConfig,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
    context: HandlerContext,
    isEdsStack: boolean = false,
): Promise<Map<string, ComponentDefinitionEntry>> {
    const stack = typedConfig.selectedStack ? getStackById(typedConfig.selectedStack) : undefined;

    if (!stack) {
        context.logger.error(
            `[Project Creation] Stack "${typedConfig.selectedStack}" not found in stacks.json`,
        );
        throw new Error(
            `Stack "${typedConfig.selectedStack}" not found. Please check stacks.json configuration.`,
        );
    }

    const frontend = stack.frontend;
    // Use config dependencies (includes user-selected optional deps like mesh) or fall back to stack defaults
    const dependencies = typedConfig.components?.dependencies ?? stack.dependencies ?? [];
    // App Builder components come from the explicit user selection, NOT from
    // selectedAddons (addons feed the ADDONS path, not app components).
    const appBuilder = typedConfig.components?.appBuilder ?? [];

    context.logger.info(
        `[Project Creation] Stack "${stack.id}" components: frontend=${frontend}, dependencies=[${dependencies.join(', ')}]`,
    );

    const allComponents = [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...dependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...appBuilder.map((id: string) => ({ id, type: 'app-builder' })),
    ];

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef = await lookupComponentDef(comp.id, comp.type, registryManager);

        if (!componentDef) {
            context.logger.warn(`[Project Creation] Component ${comp.id} not found in registry`);
            continue;
        }

        // Resolve frontend source based on stack type
        if (comp.type === 'frontend') {
            componentDef = resolveFrontendSource(
                componentDef,
                typedConfig,
                isEdsStack,
                context.logger,
            );
        }

        // Validate source is defined for installable components
        if (!componentDef.source) {
            const errorMsg =
                comp.type === 'frontend'
                    ? `No storefront found for stack "${typedConfig.selectedStack}" and package "${typedConfig.selectedPackage}". ` +
                      `Please ensure a matching storefront exists in demo-packages.json.`
                    : `Component "${componentDef.name}" (${comp.id}) has no installation source defined. ` +
                      `This is a configuration error in components.json - installable components must have a "source" property.`;
            context.logger.error(`[Project Creation] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const installOptions: { skipDependencies?: boolean } = { skipDependencies: true };

        componentDef = {
            ...componentDef,
            type: comp.type as TransformedComponentDefinition['type'],
        };
        componentDefinitions.set(comp.id, {
            definition: componentDef,
            type: comp.type,
            installOptions,
        });
    }

    return componentDefinitions;
}
