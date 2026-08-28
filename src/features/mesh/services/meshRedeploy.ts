/**
 * Create-or-update mesh deploy, sourced from REMOTE truth.
 *
 * The ONE place that encodes the redeploy rule all three redeploy surfaces
 * (EDS reset, non-EDS reset, headless dashboard/MCP deploy) used to carry as
 * copies: ask Adobe I/O whether a mesh already exists and pass its id to
 * {@link deployMeshComponent} so an existing mesh takes the update path.
 * Local metadata can be stale in BOTH directions — a mesh created or deleted
 * out-of-band — and untargeted, a stale answer once sent a live mesh down the
 * create path. Callers run this inside their own org-context targeting
 * (`withOrgContext`), keep their own auth preflight, progress surface, state
 * persistence (`updateMeshState`/`saveProject` policies differ per flow), and
 * failure-result shapes.
 *
 * Extracted 2026-08-22 (the post-reset-wrappers backlog item): the two reset
 * flows each held this sequence plus the same explanatory comment; the
 * headless deploy held a third copy.
 *
 * @module features/mesh/services/meshRedeploy
 */

import { deployMeshComponent, type MeshDeploymentResult } from './meshDeployment';
import { fetchMeshInfoFromAdobeIO } from './meshVerifier';
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

/**
 * Deploy the mesh at `meshPath`, updating the existing remote mesh when Adobe
 * I/O reports one and creating otherwise.
 *
 * @param meshPath - the installed mesh component's path
 * @param commandManager - the executor the deploy runs through (ADR-015: this
 *   module is logic, so its dependencies arrive; the boundary caller supplies)
 * @param logger - flow logger (also used for the remote-truth probe)
 * @param onProgress - the caller's progress surface, passed to the spine
 * @returns the spine's deployment result (callers map failures themselves)
 */
export async function deployMeshCreateOrUpdate(
    meshPath: string,
    commandManager: CommandExecutor,
    logger: Logger,
    onProgress?: (message: string, subMessage?: string) => void,
): Promise<MeshDeploymentResult> {
    const meshInfo = await fetchMeshInfoFromAdobeIO(commandManager, logger);
    const existingMeshId = meshInfo?.meshId || '';
    return deployMeshComponent(meshPath, commandManager, logger, onProgress, existingMeshId);
}
