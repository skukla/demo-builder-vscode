/**
 * Components Feature
 *
 * Manages component definitions, dependencies, and lifecycle.
 * Provides registry access, dependency resolution, and component operations.
 *
 * Public API:
 * - ComponentRegistryManager: Load and query component definitions
 * - DependencyResolver: Resolve component dependencies
 * - ComponentManager: Component installation and lifecycle
 * - ComponentTreeProvider: VS Code tree view for component browser
 * - Handler functions for wizard message handling
 * - Transforms for service group display
 */

// Services
export {
    ComponentRegistryManager,
    DependencyResolver,
} from './services/ComponentRegistryManager';
export { ComponentManager } from './services/componentManager';
export type { ComponentInstallOptions, ComponentInstallResult } from './services/componentManager';

// Service Group Transforms (used by dashboard configure UI)
export { toServiceGroupWithSortedFields } from './services/serviceGroupTransforms';
export type {
    ServiceGroupDef,
    FieldWithKey,
    ServiceGroup,
    ServiceGroupResult,
} from './services/serviceGroupTransforms';

// Providers
export { ComponentTreeProvider } from './providers/componentTreeProvider';

// Handler functions for HandlerRegistry use
export {
    handleLoadComponents,
    handleUpdateComponentSelection,
    handleLoadDependencies,
    handleGetComponentsData,
    handleCheckCompatibility,
    handleLoadPreset,
    handleValidateSelection,
    handleUpdateComponentsData,
} from './handlers/componentHandlers';

// Note: Internal transforms (toComponentDataArray, toDependencyData) are NOT exported.
// They are internal helpers for handler implementations.
