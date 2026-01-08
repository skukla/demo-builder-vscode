/**
 * ProjectSetupContext
 * 
 * Unified context object for project creation/editing workflow.
 * Composes HandlerContext (following established codebase pattern) with domain-specific data.
 * 
 * Benefits:
 * - Follows established HandlerContext pattern (used 168 times in codebase)
 * - No parameter duplication (logger, extensionPath delegated to HandlerContext)
 * - Cleaner intermediate function signatures
 * - Single source of truth for project setup state
 * - Easier to test and mock
 */

import type { ComponentRegistry, EnvVarDefinition, TransformedComponentDefinition } from '@/types/components';
import type { Project } from '@/types';
import type { HandlerContext } from '@/types/handlers';

/**
 * Unified context for project setup operations
 * 
 * This context is created once at the start of project creation/edit
 * and passed through all phases, eliminating the need to thread
 * individual parameters through multiple function layers.
 * 
 * Composes HandlerContext to avoid duplicating common dependencies like logger.
 */
export class ProjectSetupContext {
    constructor(
        private readonly handlerContext: HandlerContext,
        public readonly registry: ComponentRegistry,
        public readonly project: Project,
        public readonly config: Record<string, unknown>,
    ) {}

    // ============= HandlerContext Delegation =============
    
    /**
     * Get logger from HandlerContext
     * 
     * Delegates to HandlerContext to avoid duplication of logger property.
     */
    get logger() {
        return this.handlerContext.logger;
    }
    
    /**
     * Get extension path from HandlerContext
     * 
     * Delegates to HandlerContext for accessing VS Code extension context.
     */
    get extensionPath(): string {
        return this.handlerContext.context.extensionPath;
    }

    // ============= Domain-Specific Accessors =============

    /**
     * Get shared environment variable definitions from registry
     * 
     * Replaces the sharedEnvVars parameter that was being threaded everywhere.
     * This is just registry.envVars, but as an accessor method for clarity.
     */
    getEnvVarDefinitions(): Record<string, Omit<EnvVarDefinition, 'key'>> {
        return this.registry.envVars || {};
    }

    /**
     * Get backend component ID from wizard config
     */
    getBackendId(): string | undefined {
        return (this.config.components as { backend?: string })?.backend;
    }

    /**
     * Get mesh endpoint from project state (single source of truth)
     * 
     * Prioritizes meshState.endpoint (authoritative) with fallback to
     * componentInstances for backward compatibility.
     */
    getMeshEndpoint(): string | undefined {
        return this.project.meshState?.endpoint || this.project.componentInstances?.['commerce-mesh']?.endpoint;
    }

    /**
     * Get component configs from wizard state
     */
    getComponentConfigs(): Record<string, Record<string, string | number | boolean | undefined>> | undefined {
        return this.config.componentConfigs as Record<string, Record<string, string | number | boolean | undefined>> | undefined;
    }

    /**
     * Get specific component definition by ID
     */
    getComponentDefinition(componentId: string): TransformedComponentDefinition | undefined {
        const allComponents = [
            ...(this.registry.components.frontends || []),
            ...(this.registry.components.backends || []),
            ...(this.registry.components.dependencies || []),
            ...(this.registry.components.mesh || []),
            ...(this.registry.components.integrations || []),
            ...(this.registry.components.appBuilder || []),
        ];
        return allComponents.find(c => c.id === componentId) as TransformedComponentDefinition | undefined;
    }

    /**
     * Create a child context with updated project state
     * 
     * Useful when project state changes during the workflow
     * (e.g., after mesh deployment updates meshState).
     * 
     * Preserves handlerContext reference to maintain delegation.
     */
    withProject(project: Project): ProjectSetupContext {
        return new ProjectSetupContext(
            this.handlerContext,
            this.registry,
            project,
            this.config,
        );
    }
}
