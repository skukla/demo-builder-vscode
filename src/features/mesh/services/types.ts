/**
 * Shared types for mesh module
 */

/**
 * Result of mesh deployment operation
 */
export interface MeshDeploymentResult {
    success: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
}

/**
 * Result of mesh verification check
 */
export interface MeshVerificationResult {
    exists: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
}

/**
 * Mesh state tracking (deployed configuration)
 */
export interface MeshState {
    envVars: Record<string, string>;
    sourceHash: string | null;
    lastDeployed: Date | null;
}

/**
 * Detected changes requiring mesh redeployment
 */
export interface MeshChanges {
    hasChanges: boolean;
    envVarsChanged: boolean;
    sourceFilesChanged: boolean;
    changedEnvVars: string[];
    unknownDeployedState?: boolean;  // True if meshState.envVars was empty and couldn't fetch deployed config
    shouldSaveProject?: boolean;  // True if we populated meshState.envVars and caller should save
}
