/**
 * Shared types for mesh module
 *
 * This is the canonical source for mesh-related types.
 * Uses canonical DataResult types from @/types/results for consistency.
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
 * - On success: data contains { exists, meshId?, endpoint?, meshIdRecovered? }
 * - On failure: error field contains error message
 *
 * @example Mesh exists
 * { success: true, data: { exists: true, meshId: 'abc', endpoint: 'https://...' } }
 *
 * @example Mesh doesn't exist
 * { success: true, data: { exists: false } }
 *
 * @example Mesh ID was recovered from Adobe I/O (caller should save project)
 * { success: true, data: { exists: true, meshId: 'abc', meshIdRecovered: true } }
 */
export type MeshVerificationResult = DataResult<{
    exists: boolean;
    meshId?: string;
    endpoint?: string;
    /** True if mesh ID was missing and recovered from Adobe I/O. Caller should save project. */
    meshIdRecovered?: boolean;
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
    shouldSaveProject?: boolean;  // True if meshState.envVars was populated from deployed config (caller should call markDirty)
}

/**
 * Status messages for mesh deployment states
 */
export const MESH_STATUS_MESSAGES = {
    CHECKING: 'Verifying deployment status...',
    UNKNOWN: 'Unable to verify deployment status',
    NOT_DEPLOYED: 'No mesh deployed',
    DEPLOYED: 'Mesh deployed successfully',
    CONFIG_CHANGED: 'Configuration changes detected',
} as const;
