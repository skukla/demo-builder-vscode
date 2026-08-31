/**
 * Detects changes that require API Mesh redeployment
 *
 * Tracks:
 * - Environment variables used in mesh.json
 * - Source file hashes (resolvers, schemas, config)
 *
 * One public surface: the module-level function exports. Logger-dependent
 * internals take an injected logger; the public exports default it lazily.
 * (A parallel StalenessDetectorService class existed until 2026-08-23 with
 * zero production callers — deleted, per the no-dual-surface cleanup.)
 */

import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import { getLogger } from '@/core/logging/debugLogger';
import type { CommandExecutor } from '@/core/shell';
import { getFrontendEnvVars } from '@/core/state/projectStateSync';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { applyBackendOwnedScope } from '@/core/config/backendOwnedScope';
import {
    PAAS_URL,
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_ENVIRONMENT_ID,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
    CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
} from '@/core/config/envVarKeys';
import type { MeshState, MeshChanges } from '@/features/mesh/services/types';
import { Project } from '@/types';
import type { Logger } from '@/types/logger';
import {
    getMeshComponentInstance,
    parseJSON,
    hasEntries,
    getComponentInstancesByType,
} from '@/types/typeGuards';

export type { MeshState, MeshChanges };

/**
 * PaaS-specific mesh env vars (matches eds-commerce-mesh in components.json)
 */
const PAAS_MESH_ENV_VARS = [
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_URL,
    CATALOG_SERVICE_ENDPOINT,
    CATALOG_API_KEY,
    PAAS_ENVIRONMENT_ID,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
];

/**
 * ACCS-specific mesh env vars (matches eds-accs-mesh in components.json)
 */
const ACCS_MESH_ENV_VARS = [
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
];

/**
 * All environment variables that affect mesh deployment (union of PaaS + ACCS).
 * Used for extraction and .env file parsing where we need to handle both types.
 */
const MESH_ENV_VARS = [...PAAS_MESH_ENV_VARS, ...ACCS_MESH_ENV_VARS];

/**
 * Get the relevant mesh env vars for a specific mesh component type.
 * ACCS mesh only uses ACCS vars; PaaS mesh only uses PaaS vars.
 */
function getRelevantMeshEnvVars(meshComponentId: string): string[] {
    if (meshComponentId === COMPONENT_IDS.EDS_ACCS_MESH) {
        return ACCS_MESH_ENV_VARS;
    }
    return PAAS_MESH_ENV_VARS;
}

/**
 * Lazy-loaded default logger for the module-level function exports, which
 * delegate to the logger-injected *Impl variants. Lazy to avoid module-level
 * instantiation issues during testing.
 */
let _defaultLogger: Logger | null = null;
function getDefaultLogger(): Logger {
    if (!_defaultLogger) {
        _defaultLogger = getLogger();
    }
    return _defaultLogger;
}

// ============================================================================
// Logger-injected implementations (public exports below default the logger)
// ============================================================================

/**
 * Get current mesh-related environment variables from component config
 */
function getMeshEnvVarsImpl(componentConfig: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};

    // Extract only mesh-related env vars from component config
    for (const key of MESH_ENV_VARS) {
        if (key in componentConfig) {
            const value = componentConfig[key];
            // Convert to string, filtering out undefined/null
            if (value !== undefined && value !== null) {
                result[key] = String(value);
            }
        }
    }

    return result;
}

/**
 * Module-level function export:Get current mesh-related environment variables
 */
export function getMeshEnvVars(componentConfig: Record<string, unknown>): Record<string, string> {
    return getMeshEnvVarsImpl(componentConfig);
}

/**
 * Read mesh-related environment variables from the .env file in a mesh component directory.
 * Returns only the MESH_ENV_VARS keys, filtering out all other variables.
 *
 * @param meshComponentPath - Path to the mesh component directory
 * @returns Record of mesh env var key-value pairs (empty object if file doesn't exist)
 */
export async function readMeshEnvVarsFromFile(
    meshComponentPath: string,
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    try {
        const envFilePath = path.join(meshComponentPath, '.env');
        const content = await fsPromises.readFile(envFilePath, 'utf-8');

        // Parse each line of the .env file
        for (const line of content.split('\n')) {
            const trimmedLine = line.trim();

            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // Find the first equals sign (value may contain additional equals signs)
            const equalsIndex = trimmedLine.indexOf('=');
            if (equalsIndex <= 0) {
                continue; // Skip lines without key=value format
            }

            const key = trimmedLine.substring(0, equalsIndex).trim();
            let value = trimmedLine.substring(equalsIndex + 1).trim();

            // Remove surrounding quotes if present
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            // Only include mesh-related env vars
            if (MESH_ENV_VARS.includes(key)) {
                result[key] = value;
            }
        }
    } catch (_error) {
        // Return empty object if file doesn't exist or can't be read
        // This is expected for new projects or projects without mesh
    }

    return result;
}

/** ADR-015: the collaborators mesh staleness detection needs. */
export interface MeshStalenessDeps {
    commandManager: CommandExecutor;
    authManager: AuthenticationService;
}

/**
 * Fetch deployed mesh configuration from Adobe I/O.
 *
 * This IS the exported function now. Until 2026-08-28 there was also a no-argument
 * `fetchDeployedMeshConfig()` wrapper around it; that wrapper had ZERO production
 * callers — only tests and one mock — so the suite was exercising a signature
 * nothing shipped. The wrapper is deleted rather than deprecated, and the tests
 * call this.
 */
export async function fetchDeployedMeshConfig(
    logger: Logger,
    deps: MeshStalenessDeps,
): Promise<Record<string, string> | null> {
    try {
        const { TIMEOUTS } = await import('@/core/utils/timeoutConfig');
        const { getMeshNodeVersion } = await import('@/core/utils/meshConfig');
        const commandManager = deps.commandManager;

        logger.debug('[Mesh Staleness] Fetching deployed mesh config from Adobe I/O...');

        // Pre-check: Verify authentication status without triggering browser auth
        // Use getTokenStatus() which reads token file directly (no CLI call, no browser popup)
        try {
            const authService = deps.authManager;
            const tokenStatus = await authService.getTokenStatus();

            if (!tokenStatus.isAuthenticated) {
                logger.debug('[Mesh Staleness] Token expired or invalid, skipping mesh fetch');
                return null;
            }
        } catch (authError) {
            logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
            return null;
        }

        // Query the deployed mesh configuration
        const result = await commandManager.execute('aio api-mesh:get --active --json', {
            timeout: TIMEOUTS.NORMAL,
            useNodeVersion: getMeshNodeVersion(),
        });

        // Parse the JSON response
        const meshData = parseJSON<{
            meshConfig?: {
                sources?: {
                    name?: string;
                    handler?: {
                        graphql?: { endpoint?: string; operationHeaders?: Record<string, string> };
                    };
                }[];
            };
        }>(result.stdout);
        if (!meshData) {
            logger.debug('[Mesh Staleness] Failed to parse mesh data');
            return null;
        }

        // Extract environment variables from the mesh configuration
        // Match the structure we generate in meshDeployer.ts
        const deployedEnvVars: Record<string, string> = {};

        if (meshData.meshConfig?.sources) {
            for (const source of meshData.meshConfig.sources) {
                // Commerce GraphQL endpoint (source name: 'magento')
                if (source.name === 'magento' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_COMMERCE_GRAPHQL_ENDPOINT =
                        source.handler.graphql.endpoint;
                }

                // Catalog Service endpoint (source name: 'catalog')
                if (source.name === 'catalog' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_CATALOG_SERVICE_ENDPOINT =
                        source.handler.graphql.endpoint;
                }

                // Extract API key from catalog source headers
                if (source.name === 'catalog' && source.handler?.graphql?.operationHeaders) {
                    const headers = source.handler.graphql.operationHeaders;
                    // The key might be a placeholder like {context.headers['x-api-key']}
                    // Or an actual value - we want the actual value
                    if (headers['x-api-key'] && !headers['x-api-key'].includes('context.headers')) {
                        deployedEnvVars.ADOBE_CATALOG_API_KEY = headers['x-api-key'];
                    }
                }
            }
        }

        logger.debug('[Mesh Staleness] Successfully fetched deployed mesh config', {
            keyCount: Object.keys(deployedEnvVars).length,
        });

        return deployedEnvVars;
    } catch (error) {
        logger.trace('[Mesh Staleness] Failed to fetch deployed mesh config:', error);
        return null;
    }
}

/**
 * Implementation: Calculate hash of mesh source files
 */
async function calculateMeshSourceHashImpl(
    meshComponentPath: string,
    logger: Logger,
): Promise<string | null> {
    try {
        const resolversDir = path.join(meshComponentPath, 'build', 'resolvers');
        const schemasDir = path.join(meshComponentPath, 'schema');
        const meshConfigPath = path.join(meshComponentPath, 'mesh.config.js');

        let combinedContent = '';

        // Include mesh config - changes to this ALWAYS require deployment
        try {
            const meshConfig = await fsPromises.readFile(meshConfigPath, 'utf-8');
            combinedContent += meshConfig;
        } catch {
            // mesh.config.js might not exist yet
        }

        // Include all resolver files
        try {
            const resolverFiles = (await fsPromises.readdir(resolversDir))
                .filter((f) => f.endsWith('.js'))
                .sort(); // Sort for consistent hash

            for (const file of resolverFiles) {
                const filePath = path.join(resolversDir, file);
                const content = await fsPromises.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // build/resolvers might not exist yet
        }

        // Include all schema files
        try {
            const schemaFiles = (await fsPromises.readdir(schemasDir))
                .filter((f) => f.endsWith('.graphql'))
                .sort();

            for (const file of schemaFiles) {
                const filePath = path.join(schemasDir, file);
                const content = await fsPromises.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // schema directory might not exist yet
        }

        if (!combinedContent) {
            return null;
        }

        return crypto.createHash('md5').update(combinedContent).digest('hex');
    } catch (error) {
        logger.error('Error calculating source hash', error instanceof Error ? error : undefined);
        return null;
    }
}

/**
 * Module-level function export:Calculate hash of mesh source files
 */
export async function calculateMeshSourceHash(meshComponentPath: string): Promise<string | null> {
    return calculateMeshSourceHashImpl(meshComponentPath, getDefaultLogger());
}

/**
 * Implementation: Get current mesh state from project
 */
function getCurrentMeshStateImpl(project: Project): MeshState | null {
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
 * Module-level function export:Get current mesh state from project
 */
export function getCurrentMeshState(project: Project): MeshState | null {
    return getCurrentMeshStateImpl(project);
}

/**
 * Flatten every component's config into one record, FIRST definition winning.
 *
 * Mirrors `envFileGenerator.resolveFromComponentConfigs`, which walks
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
 * Implementation: Detect if mesh has changes requiring redeployment
 */
async function detectMeshChangesImpl(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
    logger: Logger,
    deps: MeshStalenessDeps,
): Promise<MeshChanges> {
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
    const currentState = getCurrentMeshStateImpl(project);

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
    // That makes `envFileGenerator.resolveFromComponentConfigs` the spec, and
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

    const newEnvVars = getMeshEnvVarsImpl(allConfigs);

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
    const newSourceHash = await calculateMeshSourceHashImpl(meshInstance.path, logger);

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

/**
 * Module-level function export:Detect if mesh has changes requiring redeployment
 */
export async function detectMeshChanges(
    project: Project,
    newComponentConfigs: Record<string, unknown>,
    deps: MeshStalenessDeps,
): Promise<MeshChanges> {
    return detectMeshChangesImpl(project, newComponentConfigs, getDefaultLogger(), deps);
}

/**
 * Implementation: Update mesh state after deployment
 *
 * Sets meshState with env vars, source hash, and endpoint (single source of truth).
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to update
 * @param endpoint - The deployed mesh endpoint URL (authoritative)
 * @param logger - Logger instance
 */
async function updateMeshStateImpl(
    project: Project,
    endpoint: string | undefined,
    logger: Logger,
): Promise<void> {
    const meshInstance = getMeshComponentInstance(project);
    if (!meshInstance?.path) {
        logger.debug('[Mesh State] No mesh component path, skipping state update');
        return;
    }

    // Read env vars from the mesh component's .env file (not componentConfigs)
    // This is the actual deployed state since .env file is used during mesh deployment
    const envVars = await readMeshEnvVarsFromFile(meshInstance.path);
    const sourceHash = await calculateMeshSourceHashImpl(meshInstance.path, logger);
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

/**
 * Update mesh state after deployment
 *
 * Sets meshState.endpoint as the single source of truth for mesh endpoint.
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to update
 * @param endpoint - The deployed mesh endpoint URL (optional, for backward compatibility)
 */
export async function updateMeshState(project: Project, endpoint?: string): Promise<void> {
    return updateMeshStateImpl(project, endpoint, getDefaultLogger());
}

/**
 * Implementation: Detect if frontend env vars have changed since demo started
 */
function detectFrontendChangesImpl(project: Project): boolean {
    const frontendInstance = getComponentInstancesByType(project, 'frontend')[0];
    if (!frontendInstance || !project.frontendEnvState) {
        return false;
    }

    const currentConfig = project.componentConfigs?.[frontendInstance.id] || {};
    const currentEnvVars = getFrontendEnvVars(currentConfig);
    const deployedEnvVars = project.frontendEnvState.envVars;

    for (const key of Object.keys(currentEnvVars)) {
        const oldValue = deployedEnvVars[key];
        const newValue = currentEnvVars[key];

        if (oldValue !== newValue) {
            return true;
        }
    }

    return false;
}

/**
 * Module-level function export:Detect if frontend env vars have changed since demo started
 */
export function detectFrontendChanges(project: Project): boolean {
    return detectFrontendChangesImpl(project);
}
