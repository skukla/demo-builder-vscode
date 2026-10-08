/**
 * Shared types for components module
 */

/**
 * Options for component installation
 */
export interface ComponentInstallOptions {
    branch?: string;
    version?: string;
    skipDependencies?: boolean;
    /**
     * Custom components directory override.
     * Used in edit mode to install to a temp directory for atomic swap.
     * If not provided, defaults to `<projectPath>/components`.
     */
    componentsDir?: string;
    /**
     * The Node to install under when it is not Demo Builder's own: only an integration
     * a custom integration that needs another Node (PR-1a). Omitted = `demoBuilderNode()`.
     */
    nodeVersion?: string;
}

/**
 * Result of component installation operation
 */
export interface ComponentInstallResult {
    success: boolean;
    component?: import('@/types/base').ComponentInstance;
    error?: string;
}
