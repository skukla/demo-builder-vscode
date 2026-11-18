/**
 * One mesh deploy at a time, whichever door started it — the palette command, a screen's
 * button or the agent's `deploy_mesh` (PL-59 phase 2, PL-104 fix 4). The command used to hold
 * this lock privately, so a deploy started from a screen could run beside one started from the
 * palette; then each door took it for itself, and the agent's did not. It is taken in one place
 * now, `deployMeshWithFeedback`. The agent's `delete_mesh` takes it too, so no delete runs in
 * the middle of a deploy.
 *
 * @module features/mesh/services/meshDeployLock
 */

import { ExecutionLock } from '@/core/utils/executionLock';

export const meshDeployLock = new ExecutionLock('DeployMesh');

/** The answer when another deploy is still running. */
export const MESH_DEPLOY_ALREADY_RUNNING = 'A mesh deploy is already running.';
