/**
 * Status Enums
 *
 * Type-safe enums for status values used across the extension.
 */

/**
 * API Mesh deployment status
 */
export enum MeshStatus {
    Deployed = 'deployed',
    NotDeployed = 'not_deployed',
    Stale = 'stale',
    Checking = 'checking',
    Error = 'error',
}

/**
 * Component installation status (simplified enum version)
 * Note: The existing ComponentStatus type in base.ts has more granular values.
 * This enum provides a simplified high-level status for UI purposes.
 */
export enum ComponentStatusEnum {
    Installed = 'installed',
    NotInstalled = 'not_installed',
    Updating = 'updating',
    Error = 'error',
}
