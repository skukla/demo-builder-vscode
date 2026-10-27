/**
 * Where a long operation reports while it runs — decided once, here (PL-59 phase 2).
 *
 * `.rptc/plans/operation-progress/extension-wide.md` routes every operation by how it
 * was started. This is that routing, so a handler cannot pick the wrong surface:
 *
 * - **R1, a button on a screen** (`inModal`): each stage goes to the screen's progress
 *   modal with its detail and expectation line, then a terminal state. No notification.
 * - **R7, while a modal narrates:** everything the operation runs inside itself — a
 *   command using `BaseCommand.withProgress`, a helper using `withProgressRegister` —
 *   reports into the same modal. They stand down on the same channel an agent's
 *   notifier uses (`agentPhaseChannel`), so a modal and a notification never show at
 *   once for one operation. Their plain lines are the line under the current step;
 *   a step they report AS a step (`reportStep`, `operationStepChannel`) is line 1.
 * - **R2, anywhere else:** one notification with the fixed title and the STAGE name as
 *   its message — the short set of words, capped at 25 characters in `operationStages`.
 *   The step is the modal's long set and never reaches a notification. A pair's
 *   position rides after the stage in both: "Deploying the app (1 of 2)".
 * - **R3, under an agent:** `withProgressRegister` opens nothing of its own and the
 *   stages reach the agent's notification.
 *
 * @module core/vscode/withOperationProgress
 */

import { pushOperationProgress } from './operationProgress';
import { withModalAsking } from './operationPrompt';
import { withProgressRegister } from './progressRegister';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { detailFor, expectationFor } from '@/core/utils/operationStages';
import { withStepSink } from '@/core/utils/operationStepChannel';
import { stageLine, stepUnder } from '@/core/utils/stageLine';
import type { OperationChange, OperationOffer, OperationPosition, OperationProgressPayload } from '@/types/webviewPayloads';

/** What an operation answers when it ends. */
export interface OperationOutcome {
    success: boolean;
    error?: string;
    /** What a run that succeeded could not do, for the SC to act on; the modal's success view says it. */
    warning?: string;
    /** What a run that succeeded leaves the SC to know, nothing to act on; said as a plain success. */
    note?: string;
    /** What a run that succeeded leaves to know, one line each; the modal's success view lists them. */
    details?: string[];
    /** The parts of a run that succeeded that changed something; the success view shows a row each. */
    changes?: OperationChange[];
    /** A next step its success view offers (AB-74). */
    offer?: OperationOffer;
}

export interface OperationProgressOptions {
    /** The operation's id: what its modal and its held state are keyed by. */
    id: string;
    /** "-ing verb + object", fixed for the whole run: "Deploying ERP integration". */
    title: string;
    /** Started from a button on a screen that shows the progress modal (R1). */
    inModal: boolean;
    /** The card's one static line while it runs, when the operation has a card. */
    cardLabel?: string;
    pushCardStatus?: (label: string) => void;
}

/**
 * Run `run`, reporting its stages wherever `options` says the SC is looking.
 *
 * @param run - the work; call `report(stage, step?)` as it moves on
 * @returns whatever `run` resolves to
 */
/** Report a stage as it starts, with the step under it and a pair's position. */
export type ReportStage = (stage: string, step?: string, position?: OperationPosition) => void;

export async function withOperationProgress<T extends OperationOutcome>(
    options: OperationProgressOptions,
    run: (report: ReportStage) => Promise<T>,
): Promise<T> {
    if (!options.inModal) {
        const { title, cardLabel, pushCardStatus } = options;
        return withProgressRegister({ title, cardLabel, pushCardStatus }, (report) =>
            run((stage, _step, position) => report(stageLine(stage, position))),
        );
    }
    options.pushCardStatus?.(options.cardLabel ?? '');
    return runInModal(options.id, run);
}

/** The modal's last word: the reason on failure, a success's warning, note and changes when it has them. */
function endOf(id: string, result: OperationOutcome): OperationProgressPayload {
    if (!result.success) {
        return { id, state: 'failed', error: result.error ?? 'The operation did not finish.' };
    }
    return {
        id,
        state: 'succeeded',
        ...(result.warning ? { warning: result.warning } : {}),
        ...(result.note ? { note: result.note } : {}),
        ...(result.details?.length ? { details: result.details } : {}),
        ...(result.changes?.length ? { changes: result.changes } : {}),
        ...(result.offer ? { offer: result.offer } : {}),
    };
}

/** R1 and R7: every stage — and every step of anything nested — to the modal. */
async function runInModal<T extends OperationOutcome>(
    id: string,
    run: (report: ReportStage) => Promise<T>,
): Promise<T> {
    let current: string | undefined;
    let position: OperationPosition | undefined;
    const push = (stage: string, step?: string): void => {
        void pushOperationProgress({
            id,
            state: 'running',
            stage,
            position,
            // Row 2 is never blank: a stage that names no step shows its own detail.
            step: stepUnder(stage, step) ?? detailFor(stage),
            expectation: expectationFor(stage),
        });
    };
    const report: ReportStage = (stage, step, at) => {
        current = stage;
        position = at;
        push(stage, step);
    };
    // Something nested reports a plain line: the step under the stage in progress.
    const nested = (message: string): void => (current ? push(current, message) : report(message));
    // Something nested reports a STEP (`reportStep`): line 1, with its line under it.
    const nestedStep = (stage: string, step?: string): void => report(stage, step);

    // The id goes where a guard deep inside the work can find it, so a question it
    // must ask reaches this modal instead of a notification beside it.
    const result = await withModalAsking(id, () =>
        withPhaseSinks([nested], () => withStepSink(nestedStep, () => run(report))),
    );
    await pushOperationProgress(endOf(id, result));
    return result;
}
