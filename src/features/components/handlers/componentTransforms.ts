/**
 * Component Transformation Helpers
 *
 * SOP §6: Extracted callback body complexity to named helpers
 *
 * These functions transform component data from registry format
 * to DTO format for webview communication.
 */

/**
 * Component from registry (input type)
 */
interface RegistryComponent {
    id: string;
    name: string;
    description?: string;
    features?: string[];
    dependencies?: {
        required?: string[];
        optional?: string[];
    };
    configuration?: {
        requiredServices?: string[];
        requiresDeployment?: boolean;
        deploymentTarget?: string;
        [key: string]: unknown;
    };
    submodules?: Record<string, { path: string; repository?: string }>;
}

/**
 * Dependency from resolver (input type)
 * Uses generic configuration to support ComponentConfiguration type
 */
interface ResolvedDependency {
    id: string;
    name: string;
    description?: string;
    configuration?: {
        impact?: string;
    };
}

/**
 * Component data DTO (output type for webview)
 */
export interface ComponentDataDTO {
    id: string;
    name: string;
    description?: string;
    features?: string[];
    dependencies?: {
        required?: string[];
        optional?: string[];
    };
    configuration?: Record<string, unknown>;
    recommended?: boolean;
}

/**
 * Dependency data DTO (output type for webview)
 */
export interface DependencyDataDTO {
    id: string;
    name: string;
    description?: string;
    required: boolean;
    impact?: string;
}

/**
 * Transform a registry component to component data DTO
 *
 * @param component - Component from registry
 * @param options - Optional transformation options
 * @returns ComponentDataDTO for webview
 */
export function toComponentData(
    component: RegistryComponent,
    options?: {
        recommendedId?: string;
        includeDependencies?: boolean;
        includeFeatures?: boolean;
    },
): ComponentDataDTO {
    const result: ComponentDataDTO = {
        id: component.id,
        name: component.name,
        description: component.description,
        configuration: component.configuration,
    };

    if (options?.includeFeatures && component.features) {
        result.features = component.features;
    }

    if (options?.includeDependencies && component.dependencies) {
        result.dependencies = component.dependencies;
    }

    if (options?.recommendedId && component.id === options.recommendedId) {
        result.recommended = true;
    }

    return result;
}

/**
 * Transform a resolved dependency to dependency data DTO
 *
 * @param dependency - Resolved dependency from DependencyResolver
 * @param required - Whether this dependency is required
 * @returns DependencyDataDTO for webview
 */
export function toDependencyData(
    dependency: ResolvedDependency,
    required: boolean,
): DependencyDataDTO {
    return {
        id: dependency.id,
        name: dependency.name,
        description: dependency.description,
        required,
        impact: dependency.configuration?.impact,
    };
}

/**
 * Transform an array of components to component data DTOs
 *
 * @param components - Array of components from registry
 * @param options - Optional transformation options
 * @returns Array of ComponentDataDTO for webview
 */
export function toComponentDataArray(
    components: RegistryComponent[],
    options?: {
        recommendedId?: string;
        includeDependencies?: boolean;
        includeFeatures?: boolean;
    },
): ComponentDataDTO[] {
    return components.map(c => toComponentData(c, options));
}
