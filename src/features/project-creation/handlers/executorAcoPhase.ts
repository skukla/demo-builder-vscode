/**
 * Creation's ACO step (PL-60, owner 2026-10-31 P2): a project created with the ACO add-on gets
 * its ingestion credential in its Adobe workspace before its files are written, the same steps
 * Configure runs when ACO is turned on (`setUpAcoCredential` through `credentialDeps`), behind the
 * same guard chain. A project without ACO skips it.
 *
 * It stops creation when the credential cannot be made: a project that says it uses ACO but cannot
 * load an ACO pack would fail later, further from the cause.
 *
 * @module features/project-creation/handlers/executorAcoPhase
 */

import type { ProgressTracker } from './shared';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { setUpAcoCredential } from '@/features/app-builder/services/acoCredential';
import { usesAco } from '@/features/components/services/acoSettings';
import { credentialDeps } from '@/features/dashboard/handlers/acoCredentialHandlers';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** Where the step sits on the creation bar: after the integrations, before the files. */
const ACO_PROGRESS = 71;

/**
 * Set up the ACO credential when the project has the ACO add-on.
 *
 * @throws Error naming why, when the guards refuse or the credential cannot be made
 */
export async function executeAcoCredentialPhase(context: HandlerContext, project: Project, progressTracker: ProgressTracker): Promise<void> {
    if (!usesAco(project)) return;
    progressTracker(OPERATION_STAGES.subscribingApis.label, ACO_PROGRESS, 'Setting up the Adobe Commerce Optimizer credential');
    const guard = await runGuards(context, project);
    if (guard) throw new Error(guard.error);
    const deps = credentialDeps(context, project);
    if (typeof deps === 'string') throw new Error(deps);
    const result = await setUpAcoCredential(deps);
    if (!result.success) throw new Error(result.error);
}
