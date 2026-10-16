/**
 * Project creation's progress: the steps a creation will report, and the one reporter
 * every phase calls, which tells the wizard's creation screen and an agent the same
 * thing (progress vocabulary slice 4, owner 2026-10-16).
 *
 * WHY a step list: the screen shows "(n of N)" beside each step, and N has to be known
 * before the run starts. It is: every step creation runs follows from what Finish was
 * given (the stack, the mesh, the integrations, the datapack). A step with nothing to do
 * when it comes (no product pages to warm, no catalog-menu block) is skipped and the
 * count moves on, as Reset's does. Steps outside the list show without a number: the
 * folder cleanup before a run, and the content copy that runs only when the storefront
 * has none. Each integration's own steps are not steps of the run: they show on line 2
 * of 'Deploying integrations', under its name (`integrationProgress`).
 *
 * Split out of `executor.ts`, which sat at its size limit.
 *
 * @module features/project-creation/handlers/creationProgress
 */

import { deployableAppIntegrationEntries } from './executorAppBuilderPhase';
import type { ProgressTracker } from './shared';
import { isMeshComponentId } from '@/core/constants';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { stepPosition } from '@/core/utils/numberedSteps';
import { OPERATION_STAGES as S, detailFor } from '@/core/utils/operationStages';
import { stageLine, stepUnder } from '@/core/utils/stageLine';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { isEdsStackId } from '@/types/typeGuards';
import type { CreationProgressPayload } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Every step a creation (or an Edit's rebuild) from `config` will report, in order.
 *
 * ORDER IS LOAD-BEARING: a step's number is its index here, so the list follows
 * `executeProjectCreation`.
 *
 * @param config - what Finish was given
 * @param existing - on an Edit, the project as it was: its datapack is kept
 * @returns the step names
 */
export function creationSteps(config: ProjectCreationConfig, existing?: Project): string[] {
    const isEds = isEdsStackId(config.selectedStack);
    const hasMesh = (config.components?.dependencies ?? []).some(isMeshComponentId);
    const hasDatapack = Boolean(config.datapack ?? existing?.datapack);
    const hasIntegrations = deployableAppIntegrationEntries(config).length > 0;
    return [
        S.settingUpProject.label,
        S.loadingComponents.label,
        S.downloadingComponents.label,
        S.installingComponents.label,
        ...(config.editProjectPath ? [S.applyingChanges.label] : []),
        ...(hasMesh ? [S.deployingMesh.label] : []),
        ...(hasIntegrations ? [S.deployingIntegrations.label] : []),
        S.writingConfigFiles.label,
        ...(isEds && config.edsConfig?.preflightComplete ? [S.publishingSettings.label] : []),
        ...(hasDatapack ? [S.installingDatapack.label] : []),
        ...(isEds ? [S.warmingProductPages.label, S.addingCatalogMenu.label] : []),
        S.finishingProject.label,
    ];
}

/** The reporter a creation runs with, and how it learns its steps. */
export interface CreationReporter {
    /** What every phase calls: the step, a percentage, what it is doing, its position. */
    report: ProgressTracker;
    /** Number each step from now on by its place in `steps`. */
    numberFrom: (steps: readonly string[]) => void;
}

/**
 * The reporter for one creation run.
 *
 * Line 2 says the step once: a line that repeats the step's name keeps only what
 * follows it, and a step that names nothing shows its detail from the stage table.
 * A position the caller passes wins: an Edit that resets the storefront shows Reset's
 * own steps, counted Reset's way.
 *
 * @param sendMessage - the wizard's channel
 * @param startedAt - when the run began, for the screen's clock
 * @returns the reporter
 */
export function creationReporter(
    sendMessage: HandlerContext['sendMessage'],
    startedAt: number = Date.now(),
): CreationReporter {
    let steps: readonly string[] = [];
    const report: ProgressTracker = (stage, progress, message, position) => {
        const line = stepUnder(stage, message) ?? detailFor(stage) ?? '';
        const at = position ?? stepPosition(steps, stage);
        const payload: CreationProgressPayload = {
            currentOperation: stage,
            progress,
            message: line,
            logs: [],
            ...(at ? { position: at } : {}),
            startedAt,
        };
        void sendMessage('creationProgress', payload);
        // ...and to an AGENT, which has no wizard screen to send to. A `create_project`
        // used to announce itself and then say nothing for two minutes (PL-59 R3).
        reportPhase(line ? `${stageLine(stage, at)} — ${line}` : stageLine(stage, at));
    };
    return {
        report,
        numberFrom: (list) => {
            steps = list;
        },
    };
}
