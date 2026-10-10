/**
 * The API Mesh deploy baseline: what was deployed, recorded on the keyed mesh
 * entry in `appBuilderComponents` so the next staleness check has something to
 * compare against.
 *
 * `updateMeshState` WRITES it after every mesh deploy; `getCurrentMeshState`
 * READS it back. See docs/architecture/state-ownership.md.
 */

import { getLogger } from '@/core/logging/debugLogger';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { readMeshEnvVarsFromFile } from '@/features/mesh/services/meshEnvVars';
import { calculateMeshSourceHash } from '@/features/mesh/services/meshSourceHash';
import type { MeshState } from '@/features/mesh/services/types';
import { Project } from '@/types/base';
import { getMeshComponentInstance } from '@/types/typeGuards';

/**
 * Get current mesh state from project
 */
export function getCurrentMeshState(project: Project): MeshState | null {
    // Return the stored mesh state (from last deployment) — the DEPLOYED
    // configuration, not the current config. The keyed mesh
    // appBuilderComponents entry is the only carrier (PL-1 phase 2: legacy
    // manifests fold their baseline into the keyed entry at load).
    const keyed = getMeshAppBuilderComponent(project);

    const envVars = keyed?.envVars;
    const sourceHash = keyed?.sourceHash;
    const lastDeployed = keyed?.lastDeployed;

    // No deployment evidence on the keyed entry (e.g. an undeployed entry with
    // no runtime fields) → null, preserving the "fresh deployment needed" path.
    if (envVars === undefined && sourceHash == null && !lastDeployed) {
        return null;
    }

    return {
        envVars: envVars || {},
        sourceHash: sourceHash || null,
        lastDeployed: lastDeployed ? new Date(lastDeployed) : null,
    };
}

/**
 * Update mesh state after deployment
 *
 * Records env vars, source hash, and endpoint on the keyed mesh entry (single
 * source of truth). See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to update
 * @param endpoint - The deployed mesh endpoint URL (authoritative)
 */
export async function updateMeshState(project: Project, endpoint?: string): Promise<void> {
    const logger = getLogger();
    const meshInstance = getMeshComponentInstance(project);
    if (!meshInstance?.path) {
        logger.debug('[Mesh State] No mesh component path, skipping state update');
        return;
    }

    // Read env vars from the mesh component's .env file (not componentConfigs)
    // This is the actual deployed state since .env file is used during mesh deployment
    const envVars = await readMeshEnvVarsFromFile(meshInstance.path);
    const sourceHash = await calculateMeshSourceHash(meshInstance.path, logger);
    const lastDeployed = new Date().toISOString();

    // Writer chokepoint (ADR-011 D3 Steps 07+09): every mesh deploy path
    // (creation, EDS reset, project reset, headless deploy) persists its state
    // through this function — landing the outcome on the KEYED mesh entry here
    // covers all of them at once. The keyed entry is the single durable model;
    // the singular meshState write-side is retired (Step 07).
    recordDeployOutcome(project, 'mesh', meshInstance.id, {
        status: 'deployed',
        endpoint,
        envVars,
        sourceHash,
        lastDeployed,
        // Clear any previous "Later" decline — the mesh is now deployed.
        userDeclinedUpdate: undefined,
        declinedAt: undefined,
    });
}
