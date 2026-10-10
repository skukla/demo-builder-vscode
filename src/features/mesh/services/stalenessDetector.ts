/**
 * Decides whether the deployed API Mesh is stale: would a redeploy right now ship
 * something different from what was deployed?
 *
 * Two things are compared against the deploy baseline (`meshDeployBaseline.ts`):
 * - the mesh env vars the generator would write now (`meshEnvVars.ts`)
 * - the hash of the mesh source files (`meshSourceHash.ts`)
 *
 * A baseline with no env vars is filled from the deployed mesh on Adobe I/O
 * (`deployedMeshConfig.ts`). The answer drives the dashboard's redeploy prompt.
 */

import { applyBackendOwnedScope } from '@/core/config/backendOwnedScope';
import { getLogger } from '@/core/logging/debugLogger';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import {
    fetchDeployedMeshConfig,
    type MeshStalenessDeps,
} from '@/features/mesh/services/deployedMeshConfig';
import { getCurrentMeshState } from '@/features/mesh/services/meshDeployBaseline';
import { getMeshEnvVars, getRelevantMeshEnvVars } from '@/features/mesh/services/meshEnvVars';
import { calculateMeshSourceHash } from '@/features/mesh/services/meshSourceHash';
import type { MeshChanges } from '@/features/mesh/services/types';
import { Project } from '@/types/base';
import { getMeshComponentInstance, hasEntries } from '@/types/typeGuards';

/**
 * Flatten every component's config into one record, FIRST definition winning.
 *
 * Mirrors `envVarResolution.resolveFromComponentConfigs`, which walks
 * `componentConfigs` and returns the first component that defines a key. The
 * detector must agree with it: whatever that generator writes into the mesh
 * `.env` is what the next deploy ships, so any other tiebreak here means
 * comparing the deployed baseline against a value that will never be written.
 *
 * @param componentConfigs - the project's component configs
 * @returns one flat record, first-definition-wins
 */
function flattenFirstWins(componentConfigs: Record<string, unknown>): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    for (const config of Object.values(componentConfigs)) {
        if (!config || typeof config !== 'object') continue;
        for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
            if (!(key in flat)) flat[key] = value;
        }
    }
    return flat;
}

/**
 * Detect if mesh has changes requiring redeployment
 */
export async function detectMeshChanges(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
    deps: MeshStalenessDeps,
): Promise<MeshChanges> {
    const logger = getLogger();
    const meshInstance = getMeshComponentInstance(project);
    if (!meshInstance?.path) {
        return {
            hasChanges: false,
            envVarsChanged: false,
            sourceFilesChanged: false,
            changedEnvVars: [],
        };
    }

    // Get current deployed state
    const currentState = getCurrentMeshState(project);

    // Determine which env vars are relevant for this mesh type
    const relevantEnvVars = getRelevantMeshEnvVars(meshInstance.id);

    if (!currentState) {
        // No previous state, assume fresh deployment needed
        return {
            hasChanges: true,
            envVarsChanged: true,
            sourceFilesChanged: true,
            changedEnvVars: relevantEnvVars,
        };
    }

    // If envVars is empty, it means meshState exists but env vars were never captured
    // Try to fetch the deployed config from Adobe I/O to establish baseline
    const envVarsExist = hasEntries(currentState.envVars);
    let didPopulateFromDeployedConfig = false;

    if (!envVarsExist) {
        logger.debug(
            '[Mesh Staleness] meshState.envVars is empty, attempting to fetch deployed config from Adobe I/O',
        );

        const deployedConfig = await fetchDeployedMeshConfig(logger, deps);

        if (deployedConfig) {
            // Successfully fetched deployed config - use it as baseline
            logger.debug(
                '[Mesh Staleness] Successfully fetched deployed config, populating the keyed baseline',
            );

            // The fetched baseline lands on the keyed mesh entry — the single
            // durable model (ADR-011 D3 Step 07; the legacy meshState write-side
            // is retired, readers are keyed-first).
            const keyedMesh = getMeshAppBuilderComponent(project);
            if (keyedMesh) {
                keyedMesh.envVars = deployedConfig;
            }
            didPopulateFromDeployedConfig = true;

            // Now continue with normal comparison using the fetched baseline
            currentState.envVars = deployedConfig;
            // Fall through to regular comparison logic below
        } else {
            // Failed to fetch - can't verify deployed state
            // Conservative approach: Don't force redeployment, flag as unknown
            logger.warn(
                '[Mesh Staleness] Failed to fetch deployed config, unable to verify deployment status',
            );
            return {
                hasChanges: false, // Don't force redeployment
                envVarsChanged: false, // No changes detected
                sourceFilesChanged: false,
                changedEnvVars: [],
                unknownDeployedState: true, // Flag as unknown
            };
        }
    }

    // What the mesh `.env` WOULD hold if regenerated right now.
    //
    // The baseline this is compared against was read FROM that `.env`, so the
    // only correct question is "would the generator write something different?".
    // That makes `envVarResolution.resolveFromComponentConfigs` the spec, and
    // this must resolve values exactly as it does:
    //
    //   1. flatten across ALL components, FIRST definition wins — cross-boundary
    //      vars the mesh needs (the Commerce endpoint) live on the backend, and
    //      the generator takes the first component that defines a key;
    //   2. then the BACKEND's copy for the store scope, which every other
    //      component only carries as a duplicate.
    //
    // It used to flatten LAST-wins — the opposite of the generator — so for the
    // six duplicated non-scope keys the detector could compare against a value
    // the generator would never write. 12 of the 13 watched keys are declared by
    // more than one component, so this is most of the watch list.
    const allConfigs = flattenFirstWins(newComponentConfigs);

    const backendId = project.componentSelections?.backend;
    const backendConfig = backendId
        ? (newComponentConfigs[backendId] as Record<string, unknown> | undefined)
        : undefined;
    applyBackendOwnedScope(allConfigs, backendConfig);

    const newEnvVars = getMeshEnvVars(allConfigs);

    // Compare only the env vars relevant to this mesh type (PaaS or ACCS)
    // This prevents false mismatches from cross-backend vars in componentConfigs
    const changedEnvVars: string[] = [];
    relevantEnvVars.forEach((key) => {
        // Normalize: treat missing keys as empty strings for robust comparison
        const oldValue = currentState.envVars[key] || '';
        const newValue = newEnvVars[key] || '';

        if (oldValue !== newValue) {
            changedEnvVars.push(key);
            logger.debug(`[Mesh Staleness]   ${key} changed: "${oldValue}" -> "${newValue}"`);
        }
    });

    const envVarsChanged = changedEnvVars.length > 0;

    if (envVarsChanged) {
        logger.debug(
            `[Mesh Staleness] Detected ${changedEnvVars.length} changed env vars:`,
            changedEnvVars,
        );
    }

    // Check source files changes
    const newSourceHash = await calculateMeshSourceHash(meshInstance.path, logger);

    // If old hash is null, it means meshState was never captured after deployment
    // In this case, DON'T flag as changed (assume deployed = current state)
    let sourceFilesChanged = false;
    if (currentState.sourceHash === null) {
        sourceFilesChanged = false;
    } else {
        sourceFilesChanged = newSourceHash !== null && newSourceHash !== currentState.sourceHash;
    }

    if (sourceFilesChanged) {
        logger.debug(
            `[Mesh Staleness] Source hash changed: "${currentState.sourceHash}" -> "${newSourceHash}"`,
        );
    }

    logger.debug('[Mesh Staleness] Result:', {
        envVarsChanged,
        sourceFilesChanged,
        hasChanges: envVarsChanged || sourceFilesChanged,
    });

    return {
        hasChanges: envVarsChanged || sourceFilesChanged,
        envVarsChanged,
        sourceFilesChanged,
        changedEnvVars,
        shouldSaveProject: didPopulateFromDeployedConfig, // Save if we fetched and populated config
    };
}
