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
     * Submodule IDs to initialize after cloning.
     * Only submodules in this list will be initialized.
     * If undefined/empty, no submodules are initialized.
     */
    selectedSubmodules?: string[];
    /**
     * Custom components directory override.
     * Used in edit mode to install to a temp directory for atomic swap.
     * If not provided, defaults to `<projectPath>/components`.
     */
    componentsDir?: string;
}

/**
 * Result of component installation operation
 */
export interface ComponentInstallResult {
    success: boolean;
    component?: import('@/types').ComponentInstance;
    error?: string;
}
