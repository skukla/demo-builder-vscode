/**
 * ComponentHandler
 *
 * Provides component registry access and project configuration generation.
 * Message handling has been migrated to componentHandlers.ts using the modern
 * MessageHandler pattern.
 *
 * @deprecated Message handling - Use handlers in @/features/components/handlers/componentHandlers.ts
 * @see src/features/components/handlers/componentHandlers.ts
 */

import * as vscode from 'vscode';
import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';

/**
 * ComponentHandler class
 *
 * Lightweight service for component operations.
 * All message handlers have been extracted to componentHandlers.ts.
 */
export class ComponentHandler {
    private registryManager: ComponentRegistryManager;
    private dependencyResolver: DependencyResolver;

    constructor(private context: vscode.ExtensionContext) {
        this.registryManager = new ComponentRegistryManager(context.extensionPath);
        this.dependencyResolver = new DependencyResolver(this.registryManager);
    }

    /**
     * Generate project configuration from component selection
     *
     * This is the primary remaining responsibility of ComponentHandler.
     * Used during project creation to build environment configuration.
     *
     * @param frontend - Frontend component ID
     * @param backend - Backend component ID
     * @param dependencies - Array of dependency component IDs
     * @returns Project configuration object
     */
    async generateProjectConfig(
        frontend: string,
        backend: string,
        dependencies: string[],
    ) {
        const frontendComponent = await this.registryManager.getComponentById(frontend);
        const backendComponent = await this.registryManager.getComponentById(backend);
        const resolved = await this.dependencyResolver.resolveDependencies(
            frontend,
            backend,
            dependencies,
        );

        if (!frontendComponent || !backendComponent) {
            throw new Error('Invalid component selection');
        }

        return this.dependencyResolver.generateConfiguration(
            frontendComponent,
            backendComponent,
            resolved.all,
        );
    }
}
