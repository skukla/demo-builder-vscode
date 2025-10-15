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
}

/**
 * Result of component installation operation
 */
export interface ComponentInstallResult {
    success: boolean;
    component?: import('@/types').ComponentInstance;
    error?: string;
}
