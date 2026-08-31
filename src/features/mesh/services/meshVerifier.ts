/**
 * Verifies API Mesh deployment status with Adobe I/O
 * Checks if mesh actually exists, not just if we think it's deployed
 *
 * DI Pattern: MeshVerifierService uses constructor injection for logger.
 * Backward-compatible function exports use a lazy-loaded default logger.
 */

import { getLogger } from '@/core/logging/debugLogger';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { MeshVerificationResult } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import type { AppBuilderComponentState } from '@/types/base';
import type { Logger } from '@/types/logger';
import { getMeshComponentInstance, parseJSON } from '@/types/typeGuards';
import type { CommandExecutor } from '@/core/shell';

export type { MeshVerificationResult };

/**
 * Lazy-loaded default logger for backward-compatible function exports.
 * Avoids module-level instantiation issues during testing.
 */
let _defaultLogger: Logger | null = null;
function getDefaultLogger(): Logger {
    if (!_defaultLogger) {
        _defaultLogger = getLogger();
    }
    return _defaultLogger;
}

/**
 * MeshVerifierService - Verifies API Mesh deployment status with Adobe I/O
 *
 * Uses constructor injection for the logger dependency (DI pattern).
 * Provides instance methods that use the injected logger.
 */
export class MeshVerifierService {
    private logger: Logger;
    private commandManager: CommandExecutor;

    /**
     * ADR-015: the executor joins the logger as an injected dependency — the
     * class already used constructor injection, so this completes the pattern
     * rather than introducing one.
     */
    constructor(logger: Logger, commandManager: CommandExecutor) {
        this.logger = logger;
        this.commandManager = commandManager;
    }

    /**
     * Verify that a mesh actually exists in Adobe I/O
     */
    async verifyMeshDeployment(project: Project): Promise<MeshVerificationResult> {
        return verifyMeshDeploymentImpl(project, this.commandManager, this.logger);
    }

    /**
     * Update project with verified mesh status
     */
    async syncMeshStatus(
        project: Project,
        verificationResult: MeshVerificationResult,
    ): Promise<void> {
        return syncMeshStatusImpl(project, verificationResult);
    }
}

// ============================================================================
// Implementation Functions (shared between service and backward-compatible exports)
// ============================================================================

/**
 * Implementation: Fetch mesh info from Adobe I/O via aio api-mesh:describe
 */
async function fetchMeshInfoFromAdobeIOImpl(
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<{ meshId?: string; endpoint?: string } | null> {

    try {
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        logger.debug(`[Mesh Verifier] describe command: code=${result.code}, stdout=${result.stdout?.length || 0} chars, stderr=${result.stderr?.length || 0} chars`);

        if (result.code !== 0) {
            logger.debug(`[Mesh Verifier] describe command failed: ${result.stderr?.substring(0, 200)}`);
            return null;
        }

        const output = result.stdout;

        if (!output || output.trim().length === 0) {
            logger.debug('[Mesh Verifier] describe command returned empty output');
            return null;
        }

        logger.trace(`[Mesh Verifier] Raw output (first 500 chars): ${output.substring(0, 500)}`);


        // Try JSON parsing first
        try {
            const meshData = parseJSON<{ meshId?: string; mesh_id?: string; meshEndpoint?: string; endpoint?: string }>(output);
            if (meshData) {
                return {
                    meshId: meshData.meshId || meshData.mesh_id,
                    endpoint: meshData.meshEndpoint || meshData.endpoint,
                };
            }
        } catch {
            // Not JSON, try regex
        }

        // Try regex patterns - handle formats like "Mesh ID:", "mesh_id:", "meshId:"
        const meshIdMatch = /mesh[\s_-]?id[:\s]+([a-f0-9-]+)/i.exec(output);
        const endpointMatch = /(?:mesh\s+)?endpoint[:\s]+([^\s\n]+)/i.exec(output);

        if (meshIdMatch || endpointMatch) {
            return {
                meshId: meshIdMatch ? meshIdMatch[1] : undefined,
                endpoint: endpointMatch ? endpointMatch[1] : undefined,
            };
        }

        // Log parsing failure (output already logged above)
        logger.debug('[Mesh Verifier] Could not parse mesh info from describe output');
        return null;
    } catch (_error) {
        return null;
    }
}

/**
 * Implementation: Attempt to recover missing mesh ID by fetching from Adobe I/O
 */
async function tryRecoverMeshIdImpl(
    meshComponent: ComponentInstance,
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<string | null> {
    logger.debug('[Mesh Verifier] Attempting to recover missing mesh ID from Adobe I/O...');

    const meshInfo = await fetchMeshInfoFromAdobeIOImpl(commandManager, logger);

    if (meshInfo?.meshId) {
        logger.debug('[Mesh Verifier] Successfully recovered mesh ID from Adobe I/O');

        // Update the component metadata with recovered mesh ID
        meshComponent.metadata = {
            ...meshComponent.metadata,
            meshId: meshInfo.meshId,
            meshStatus: 'deployed',
        };

        // Note: Endpoint is NOT written here - that's handled by deployMesh.ts
        // meshState.endpoint is the single source of truth, written only during actual deployment

        return meshInfo.meshId;
    }

    logger.debug('[Mesh Verifier] Could not recover mesh ID from Adobe I/O');
    return null;
}

/**
 * Implementation: Verify that a mesh actually exists in Adobe I/O
 */
async function verifyMeshDeploymentImpl(
    project: Project,
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<MeshVerificationResult> {
    const meshComponent = getMeshComponentInstance(project);

    // No mesh component = no mesh
    if (!meshComponent) {
        return { success: true, data: { exists: false } };
    }

    // Get mesh ID from metadata, or try to recover it
    let meshId = meshComponent.metadata?.meshId;
    let meshIdRecovered = false;

    if (!meshId) {
        // Attempt to recover mesh ID from Adobe I/O (self-healing for older projects)
        meshId = await tryRecoverMeshIdImpl(meshComponent, commandManager, logger);
        if (meshId) {
            meshIdRecovered = true;
        } else {
            return {
                success: false,
                error: 'No mesh ID found in project metadata',
            };
        }
    }

    try {
        // Call aio api-mesh:describe to verify mesh exists
        // Uses Node version defined in commerce-mesh component configuration
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        logger.debug(`[Mesh Verifier] verify describe: code=${result.code}`);

        if (result.code !== 0) {
            // Mesh doesn't exist or command failed
            logger.debug(`[Mesh Verifier] verify failed: ${result.stderr?.substring(0, 200)}`);
            return {
                success: false,
                error: result.stderr || 'Failed to verify mesh deployment',
            };
        }

        // Parse output to extract mesh info
        const output = result.stdout;

        // Try to find mesh ID in output - handle formats like "Mesh ID:", "mesh_id:", "meshId:"
        const meshIdMatch = /mesh[\s_-]?id[:\s]+([a-f0-9-]+)/i.exec(output);
        const foundMeshId = meshIdMatch ? meshIdMatch[1] : null;

        // Try to find endpoint
        const endpointMatch = /endpoint[:\s]+([^\s\n]+)/i.exec(output);
        const endpoint = endpointMatch ? endpointMatch[1] : undefined;

        // Try JSON parsing as fallback
        if (!foundMeshId || !endpoint) {
            try {
                const meshData = parseJSON<{ meshId?: string; endpoint?: string }>(output);
                if (meshData) {
                    return {
                        success: true,
                        data: {
                            exists: true,
                            meshId: (meshData.meshId || foundMeshId || meshId) as string,
                            endpoint: meshData.endpoint || endpoint,
                            meshIdRecovered,
                        },
                    };
                }
            } catch {
                // Not JSON, use regex matches
            }
        }

        // Verify the mesh ID matches what we expect
        if (foundMeshId && foundMeshId !== meshId) {
            return {
                success: false,
                error: `Mesh ID mismatch: expected ${meshId}, found ${foundMeshId}`,
            };
        }

        return {
            success: true,
            data: {
                exists: true,
                meshId: foundMeshId ?? (meshId as string),
                endpoint,
                meshIdRecovered,
            },
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error verifying mesh',
        };
    }
}

/**
 * Whether a mesh record evidences a past deployment. False only for the
 * cleared `not-deployed` shell that syncMeshStatus leaves behind when the
 * remote mesh is gone (identity fields kept, volatile fields cleared).
 */
function hasDeploymentEvidence(record: AppBuilderComponentState): boolean {
    return (
        record.status !== 'not-deployed' ||
        record.lastDeployed !== undefined ||
        record.sourceHash != null ||
        record.envVars !== undefined
    );
}

/**
 * Implementation: Update project with verified mesh status
 */
function syncMeshStatusImpl(
    project: Project,
    verificationResult: MeshVerificationResult,
): void {
    const meshComponent = getMeshComponentInstance(project);
    if (!meshComponent) {
        return;
    }

    // Handle failure case
    if (!verificationResult.success || !verificationResult.data) {
        return;
    }

    if (!verificationResult.data.exists) {
        // Mesh doesn't exist in Adobe I/O — clear the VOLATILE deploy record on
        // the keyed mesh entry (status/endpoint/envVars/lastDeployed/sourceHash)
        // while PRESERVING its identity fields (kind/source/name/providesEnvVars),
        // so a later redeploy re-lands on the SAME entry via recordDeployOutcome
        // (ADR-011 D3; integration siblings are untouched). Also clear the
        // in-memory legacy meshState, so the accessors' legacy synthesis can't
        // resurrect the cleared record.
        const keyedComponents = project.appBuilderComponents ?? {};
        for (const state of Object.values(keyedComponents)) {
            if (state.kind === 'mesh') {
                state.status = 'not-deployed';
                state.endpoint = undefined;
                state.envVars = undefined;
                state.lastDeployed = undefined;
                state.sourceHash = undefined;
            }
        }
        meshComponent.status = 'ready'; // Mesh component exists but not deployed
        // Note: Endpoint is NOT cleared here - that's managed by deployMesh.ts
        // The single source of truth for endpoint writes is the deployment command
    } else {
        // Mesh exists - status reflects deployment state
        // Note: Endpoint is NOT updated here - that's managed by deployMesh.ts
        // The single source of truth for endpoint writes is the deployment command

        // Ensure status reflects reality (keyed-first deployment record). A
        // surviving cleared `not-deployed` shell (sync-gone above) is NOT a
        // deployment record — entry existence alone must not promote the
        // component. Legacy-synthesized records without an endpoint still
        // count (they carry lastDeployed/sourceHash/envVars evidence).
        const meshRecord = getMeshAppBuilderComponent(project);
        if (
            meshComponent.status !== 'deployed' &&
            meshRecord &&
            hasDeploymentEvidence(meshRecord)
        ) {
            meshComponent.status = 'deployed';
        }
    }
}

// ============================================================================
// Backward-compatible Function Exports
// ============================================================================

/**
 * Backward-compatible export: Verify that a mesh actually exists in Adobe I/O
 */
export async function verifyMeshDeployment(
    project: Project,
    commandManager: CommandExecutor,
): Promise<MeshVerificationResult> {
    return verifyMeshDeploymentImpl(project, commandManager, getDefaultLogger());
}

/**
 * Fetch mesh info (meshId, endpoint) from Adobe I/O via aio api-mesh:describe.
 * Used by reset flows to recover mesh ID when not stored in project metadata.
 */
export async function fetchMeshInfoFromAdobeIO(
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<{ meshId?: string; endpoint?: string } | null> {
    return fetchMeshInfoFromAdobeIOImpl(commandManager, logger);
}

/**
 * Backward-compatible export: Update project with verified mesh status
 */
export async function syncMeshStatus(
    project: Project,
    verificationResult: MeshVerificationResult,
): Promise<void> {
    syncMeshStatusImpl(project, verificationResult);
}
