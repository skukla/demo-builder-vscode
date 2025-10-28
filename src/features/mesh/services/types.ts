/**
 * Shared types for mesh module
 *
 * This is the canonical source for mesh-related types.
 * Now uses canonical OperationResult types for consistency.
 */

import { DataResult } from '@/types/results';

/**
 * Result of mesh deployment operation
 *
 * BREAKING CHANGE: Now uses canonical DataResult<T> type.
 * - On success: data contains { meshId, endpoint }
 * - On failure: error field contains error message
 *
 * @example Success
 * { success: true, data: { meshId: 'abc', endpoint: 'https://...' } }
 *
 * @example Failure
 * { success: false, error: 'Deployment failed' }
 */
export type MeshDeploymentResult = DataResult<{
    meshId: string;
    endpoint: string;
}>;

/**
 * Result of mesh verification check
 *
 * BREAKING CHANGE: Now uses canonical DataResult<T> type.
 * - On success: data contains { exists, meshId?, endpoint? }
 * - On failure: error field contains error message
 *
 * @example Mesh exists
 * { success: true, data: { exists: true, meshId: 'abc', endpoint: 'https://...' } }
 *
 * @example Mesh doesn't exist
 * { success: true, data: { exists: false } }
 */
export type MeshVerificationResult = DataResult<{
    exists: boolean;
    meshId?: string;
    endpoint?: string;
}>;


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
