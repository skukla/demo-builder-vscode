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
}

/**
 * Result of component installation operation
 */
export interface ComponentInstallResult {
    success: boolean;
    component?: import('@/types').ComponentInstance;
    error?: string;
}
