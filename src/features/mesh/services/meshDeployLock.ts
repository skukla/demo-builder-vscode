/**
 * One mesh deploy at a time, whichever door started it — the palette command or a
 * screen's button (PL-59 phase 2). The command used to hold this lock privately, so a
 * deploy started from a screen could run beside one started from the palette.
 *
 * @module features/mesh/services/meshDeployLock
 */

import { ExecutionLock } from '@/core/utils/executionLock';

export const meshDeployLock = new ExecutionLock('DeployMesh');
