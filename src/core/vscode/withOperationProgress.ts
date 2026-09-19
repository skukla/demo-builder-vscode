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
 *   once for one operation.
 * - **R2, anywhere else:** one notification with the fixed title and the STAGE name as
 *   its message — the short set of words, capped at 25 characters in `operationStages`.
 *   The step is the modal's long set and never reaches a notification.
 * - **R3, under an agent:** `withProgressRegister` opens nothing of its own and the
 *   stages reach the agent's notification.
 *
 * @module core/vscode/withOperationProgress
 */

import { pushOperationProgress } from './operationProgress';
import { withProgressRegister } from './progressRegister';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { detailFor, expectationFor } from '@/core/utils/operationStages';

/** What an operation answers when it ends. */
export interface OperationOutcome {
    success: boolean;
    error?: string;
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
export async function withOperationProgress<T extends OperationOutcome>(
    options: OperationProgressOptions,
    run: (report: (stage: string, step?: string) => void) => Promise<T>,
): Promise<T> {
    if (!options.inModal) {
        const { title, cardLabel, pushCardStatus } = options;
        return withProgressRegister({ title, cardLabel, pushCardStatus }, (report) =>
            run((stage) => report(stage)),
        );
    }
    options.pushCardStatus?.(options.cardLabel ?? '');
    return runInModal(options.id, run);
}

/** R1 and R7: every stage — and every step of anything nested — to the modal. */
async function runInModal<T extends OperationOutcome>(
    id: string,
    run: (report: (stage: string, step?: string) => void) => Promise<T>,
): Promise<T> {
    let current: string | undefined;
    const push = (stage: string, step?: string): void => {
        void pushOperationProgress({
            id,
            state: 'running',
            stage,
            // Row 2 is never blank: a stage that names no step shows its own detail.
            step: step || detailFor(stage),
            expectation: expectationFor(stage),
        });
    };
    const report = (stage: string, step?: string): void => {
        current = stage;
        push(stage, step);
    };
    // Something nested reports a plain line: the step under the stage in progress.
    const nested = (message: string): void => (current ? push(current, message) : report(message));

    const result = await withPhaseSinks([nested], () => run(report));
    await pushOperationProgress(
        result.success
            ? { id, state: 'succeeded' }
            : { id, state: 'failed', error: result.error ?? 'The operation did not finish.' },
    );
    return result;
}
