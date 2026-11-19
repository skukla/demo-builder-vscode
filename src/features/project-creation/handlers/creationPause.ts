/**
 * A creation step that fails pauses the run until the SC has fixed the problem (F307).
 *
 * Owner, 2026-11-19: "if something fails (such as expected datapack installation), the
 * process should be interrupted and the SC should be guided to a solution. Once the issue
 * is solved, the process should pick up again where it left off and finish correctly."
 * Until then the steps a project can live without (the datapack, warming product pages,
 * the catalog menu, the AI files) showed their failure for a moment on line 2 and the run
 * ended on a clean "Project Created".
 *
 * Now such a step waits on its failure. The steps already done stay done. The buttons
 * follow the rule for retrying (`fixWithAi.ts`): Retry while a retry can help, otherwise
 * Fix with AI, which opens the SC's AI on the problem, and Check Again. Retry and Check
 * Again run the step again; once it passes, the run carries on from the next step. Skip
 * This Step goes on without it. Cancel is the run's own stop, which ends this wait and
 * cleans up as before. The run's time limit does not count while it waits
 * (`creationLimit.ts`).
 *
 * In the wizard the question is on the creation screen. Under an agent there is no
 * screen, so it is asked as a VS Code modal, as the agent's other questions are, and the
 * agent's phase line says what the run is waiting for.
 *
 * @module features/project-creation/handlers/creationPause
 */

import * as vscode from 'vscode';
import { creationLimitOf } from './creationLimit';
import type { CreationReporter } from './creationProgress';
import { creationCancelledError } from './creationStop';
import { FIX_WITH_AI, failedButtonLabel } from '@/core/utils/fixWithAi';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import type { StepFailure } from '@/features/project-creation/services/stepFailure';
import type { HandlerContext } from '@/types/handlers';
import type { CreationPause } from '@/types/webview';

/** Runs the failed step again. */
export const RETRY = 'Retry';
/** Runs the failed step again, after a fix. */
export const CHECK_AGAIN = 'Check Again';
/** Goes on without the failed step. */
export const SKIP_STEP = 'Skip This Step';

/** What a pause needs from the run. */
export interface PauseDeps {
    context: HandlerContext;
    reporter: Pick<CreationReporter, 'pause'>;
    signal?: AbortSignal;
    /** The project's name and the step, for the AI's prompt. */
    projectName: string;
    step: string;
}

/**
 * Run a step until it passes, or the SC skips it.
 *
 * @param deps - the run
 * @param attempt - the step: resolves its failure, or undefined when it passed
 * @throws the cancelled error when the run is stopped while it waits
 */
export async function untilDone(
    deps: PauseDeps,
    attempt: () => Promise<StepFailure | undefined>,
): Promise<void> {
    for (let retries = 0; ; retries += 1) {
        const failure = await attempt();
        if (!failure) return;
        deps.context.logger.warn(
            `[Project Creation] ${deps.step} failed, waiting for the SC: ${failure.reason}`,
        );
        const answer = await waitForAnswer(deps, failure, retries);
        if (answer === SKIP_STEP) {
            deps.context.logger.info(`[Project Creation] ${deps.step} skipped`);
            return;
        }
    }
}

/** The main buttons for this failure. */
function actionsFor(failure: StepFailure, retries: number): string[] {
    return failedButtonLabel(retries, failure.retryable ?? false) === RETRY
        ? [RETRY]
        : [FIX_WITH_AI, CHECK_AGAIN];
}

/** Wait for Retry, Check Again or Skip This Step, the limit held meanwhile. */
async function waitForAnswer(
    deps: PauseDeps,
    failure: StepFailure,
    retries: number,
): Promise<string> {
    const limit = creationLimitOf(deps.signal);
    limit?.hold();
    try {
        return deps.context.panel
            ? await askInWizard(deps, {
                  reason: failure.reason,
                  actions: actionsFor(failure, retries),
                  canSkip: true,
              })
            : await askAgentsUser(deps, failure, retries);
    } finally {
        limit?.release();
    }
}

/** The wizard's creation screen asks; Fix with AI opens the AI and keeps waiting. */
async function askInWizard(deps: PauseDeps, pause: CreationPause): Promise<string> {
    deps.reporter.pause(pause);
    try {
        for (;;) {
            const answer = await nextWizardAnswer(deps);
            if (answer !== FIX_WITH_AI) return answer;
            await openFixWithAi(deps, pause.reason);
        }
    } finally {
        deps.context.sharedState.creationPauseAnswer = undefined;
        deps.reporter.pause(undefined);
    }
}

/** The next button the SC presses, or the cancelled error when the run is stopped. */
function nextWizardAnswer({ context, signal }: PauseDeps): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
            reject(creationCancelledError());
            return;
        }
        signal?.addEventListener('abort', () => reject(creationCancelledError()), { once: true });
        context.sharedState.creationPauseAnswer = resolve;
    });
}

/**
 * Under an agent: a VS Code modal. Closing it skips the step, which never removes
 * anything; the agent's cancel_project_creation still stops the run.
 */
async function askAgentsUser(
    deps: PauseDeps,
    failure: StepFailure,
    retries: number,
): Promise<string> {
    const again = actionsFor(failure, retries)[0] === RETRY ? RETRY : CHECK_AGAIN;
    const answer = await askDuringOperation(
        {
            title: `${deps.step} Failed`,
            message: `${failure.reason} Fix it, then ${again}. The project is created without this step if you skip it.`,
            dismiss: SKIP_STEP,
        },
        again,
        SKIP_STEP,
    );
    if (deps.signal?.aborted) throw creationCancelledError();
    return answer === again ? again : SKIP_STEP;
}

/**
 * The prompt Fix with AI opens the SC's AI with: the project, the step and the reason.
 *
 * @param projectName - the project being created
 * @param step - the step that failed
 * @param reason - why
 * @returns the prompt
 */
export function creationFixPrompt(projectName: string, step: string, reason: string): string {
    return [
        `Creating the Demo Builder project ${projectName} is paused because a step failed.`,
        `Step: ${step}`,
        `Reason: ${reason}`,
        '',
        'Find the cause and fix it where it lives, using the Demo Builder tools (for a Commerce ' +
            'problem, read with run_commerce_rest and fix with write_commerce_rest). Do not create, ' +
            'delete or cancel the project. Tell me what you found and what you changed, so I can ' +
            'press Check Again in the wizard.',
    ].join('\n');
}

async function openFixWithAi(deps: PauseDeps, reason: string): Promise<void> {
    const prompt = creationFixPrompt(deps.projectName, deps.step, reason);
    await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt, fresh: true });
    deps.context.logger.info(`[Project Creation] Opened Fix with AI on ${deps.step}`);
}

/**
 * Handler: `creation-pause-answer` — the button the SC pressed on a paused creation.
 *
 * @param context - the wizard's context, whose shared state holds the waiting run
 * @param payload - the button's label
 * @returns whether a paused run took it
 */
export async function handleCreationPauseAnswer(
    context: HandlerContext,
    payload?: { answer?: unknown },
): Promise<{ success: boolean; error?: string }> {
    const answer = typeof payload?.answer === 'string' ? payload.answer : undefined;
    const waiting = context.sharedState.creationPauseAnswer;
    if (!answer || !waiting)
        return { success: false, error: 'No creation is waiting for an answer.' };
    if (answer !== FIX_WITH_AI) context.sharedState.creationPauseAnswer = undefined;
    waiting(answer);
    return { success: true };
}
